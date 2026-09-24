import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { canWrite, currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { assertNoOverlap, schedulingTransaction, SchedulingConflict } from '@/lib/scheduling';

const text = z.string().trim().min(1).max(250);
const optional = z.string().trim().max(1000).optional().nullable();
const money = z.coerce.number().finite().nonnegative().max(100000000);
const date = z.string().datetime();
const optionalDate = date.optional().nullable();
const schemas = {
  customers: z.object({ name: text, phone: text, email: z.email().optional().or(z.literal('')), notes: optional, followUpAt: optionalDate, lastVisitAt: optionalDate, relationshipStatus: z.enum(['NEW','ACTIVE','FOLLOW_UP','INACTIVE','RETURNING']).optional() }),
  services: z.object({ name: text, price: money, durationMinutes: z.coerce.number().int().positive().max(1440), active: z.boolean().optional() }),
  staff: z.object({ name: text, phone: optional, email: z.email().optional().or(z.literal('')), title: optional, active: z.boolean().optional() }),
  appointments: z.object({ customerId: text, serviceId: text, staffId: z.string().optional().nullable(), startsAt: date, status: z.enum(['SCHEDULED','COMPLETED','CANCELLED','NO_SHOW']).optional(), notes: optional }),
  invoices: z.object({ customerId: text, serviceId: z.string().optional().nullable(), description: text, amount: money, paidAmount: money, dueAt: date.optional().nullable(), status: z.enum(['UNPAID','PARTIAL','PAID','VOID']).optional() }).refine(v => v.paidAmount <= v.amount, 'Paid amount exceeds total'),
  expenses: z.object({ payee: text, category: text, description: text, amount: money, dueAt: date, paidAt: date.optional().nullable(), status: z.enum(['DUE','PAID']).optional() }),
  users: z.object({ name: text, username: text, email: z.email().optional().or(z.literal('')), password: z.string().min(6).optional(), role: z.enum(['GOD','ADMIN','MANAGER','STAFF','VIEWER']), active: z.boolean().optional() }),
  collegeCourses: z.object({ title: text, category: z.enum(['COSMETIC','NON_COSMETIC']), fee: money, description: optional, active: z.boolean().optional() }),
  students: z.object({ name: text, phone: text, email: z.email().optional().or(z.literal('')), status: z.enum(['NEW','CONTACTED','AWAITING_DETAILS','ENROLLED','INACTIVE']).optional(), followUpAt: optionalDate, notes: optional }),
  enrollments: z.object({ studentId: text, courseId: text, fee: money, enrolledAt: optionalDate, notes: optional }),
  studentPayments: z.object({ enrollmentId: text, amount: money.positive(), paidAt: optionalDate, method: z.enum(['CASH','CARD','BANK','OTHER']).optional(), notes: optional }),
  studentContacts: z.object({ studentId: text, contactedAt: optionalDate, channel: z.enum(['PHONE','WHATSAPP','EMAIL','IN_PERSON']).optional(), outcome: text, notes: optional, nextFollowUpAt: optionalDate }),
  events: z.object({ name: text, location: optional, startsAt: optionalDate, notes: optional }),
  eventPackages: z.object({ eventId: z.string().optional().nullable(), name: text, price: money, description: optional, active: z.boolean().optional() }),
  eventLeads: z.object({ eventId: z.string().optional().nullable(), packageId: z.string().optional().nullable(), name: text, phone: text, region: z.enum(['DUBAI','LOCAL']), stage: z.enum(['NEW','CONTACTED','FOLLOW_UP','CLOSED','LOST']).optional(), agreedAmount: money, paidAmount: money, followUpAt: optionalDate, notes: optional }).refine(v => v.paidAmount <= v.agreedAmount, 'Paid amount exceeds agreed amount'),
  eventContacts: z.object({ leadId: text, contactedAt: optionalDate, channel: z.enum(['PHONE','WHATSAPP','EMAIL','IN_PERSON']).optional(), outcome: text, notes: optional, nextFollowUpAt: optionalDate }),
  laserPlans: z.object({ customerId: text, area: text, sessionsTotal: z.coerce.number().int().positive().max(100), consentNotes: optional, followUpAt: optionalDate, startedAt: optionalDate }),
  laserSessions: z.object({ planId: text, staffId: z.string().optional().nullable(), performedAt: optionalDate, notes: optional })
  ,workingHours: z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), active: z.boolean() }).refine(v=>!v.active||v.openTime<v.closeTime,'Closing time must be after opening time')
};
type Resource = keyof typeof schemas;
function validResource(value: string): value is Resource { return Object.prototype.hasOwnProperty.call(schemas, value); }
function dateFields(_resource: Resource, data: Record<string, unknown>) {
  for (const field of Object.keys(data)) {
    if (field.endsWith('At') && data[field]) data[field] = new Date(data[field] as string);
  }
  if ('email' in data && data.email === '') data.email = null;
  for (const field of ['staffId','serviceId','eventId','packageId']) if (field in data && data[field] === '') data[field] = null;
  return data;
}
async function list(resource: Resource) {
  switch(resource) {
    case 'customers': return prisma.customer.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    case 'services': return prisma.service.findMany({ orderBy: { name: 'asc' }, take: 500 });
    case 'staff': return prisma.staff.findMany({ orderBy: { name: 'asc' }, take: 500 });
    case 'appointments': return prisma.appointment.findMany({ include: { customer: true, service: true, staff: true }, orderBy: { startsAt: 'desc' }, take: 500 });
    case 'invoices': return prisma.invoice.findMany({ include: { customer: true, service: true }, orderBy: { createdAt: 'desc' }, take: 500 });
    case 'expenses': return prisma.expense.findMany({ orderBy: { dueAt: 'asc' }, take: 500 });
    case 'users': return prisma.user.findMany({ where: { role: { not: 'CUSTOMER' } }, select: { id: true, name: true, username: true, email: true, role: true, active: true, failedLoginAttempts: true, lockedUntil: true, dailyLockCount: true, lockCountDate: true, requiresGodUnlock: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 });
    case 'collegeCourses': return prisma.collegeCourse.findMany({ orderBy: { title: 'asc' }, take: 500 });
    case 'students': return prisma.student.findMany({ include: { enrollments: { include: { course: true, payments: true } }, contacts: { orderBy: { contactedAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    case 'enrollments': return prisma.studentEnrollment.findMany({ include: { student: true, course: true, payments: true }, orderBy: { enrolledAt: 'desc' }, take: 500 });
    case 'studentPayments': return prisma.studentPayment.findMany({ include: { enrollment: { include: { student: true, course: true } } }, orderBy: { paidAt: 'desc' }, take: 500 });
    case 'studentContacts': return prisma.studentContact.findMany({ include: { student: true }, orderBy: { contactedAt: 'desc' }, take: 500 });
    case 'events': return prisma.event.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    case 'eventPackages': return prisma.eventPackage.findMany({ include: { event: true }, orderBy: { name: 'asc' }, take: 500 });
    case 'eventLeads': return prisma.eventLead.findMany({ include: { event: true, package: true, contacts: { orderBy: { contactedAt: 'desc' } } }, orderBy: { createdAt: 'desc' }, take: 500 });
    case 'eventContacts': return prisma.eventContact.findMany({ include: { lead: true }, orderBy: { contactedAt: 'desc' }, take: 500 });
    case 'laserPlans': return prisma.laserPlan.findMany({ include: { customer: true, sessions: { include: { staff: true }, orderBy: { performedAt: 'desc' } }, documents: { select: { id: true, filename: true, mimeType: true, createdAt: true } } }, orderBy: { startedAt: 'desc' }, take: 500 });
    case 'laserSessions': return prisma.laserSession.findMany({ include: { plan: { include: { customer: true } }, staff: true }, orderBy: { performedAt: 'desc' }, take: 500 });
    case 'workingHours': return prisma.workingHour.findMany({ orderBy: { dayOfWeek: 'asc' } });
  }
}
export async function GET(_request: Request, context: { params: Promise<{ resource: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { resource } = await context.params;
  if (!validResource(resource)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role === 'CUSTOMER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (resource === 'users' && !['GOD','ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await list(resource));
}
export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  return mutate(request, context, 'create');
}
export async function PATCH(request: Request, context: { params: Promise<{ resource: string }> }) {
  return mutate(request, context, 'update');
}
export async function DELETE(request: Request, context: { params: Promise<{ resource: string }> }) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!['GOD','ADMIN'].includes(user.role))return NextResponse.json({error:'Only Admin or God Mode can delete records'},{status:403});
  const {resource}=await context.params;
  if(!validResource(resource))return NextResponse.json({error:'Not found'},{status:404});
  const body=await request.json().catch(()=>({}));
  if(typeof body.id!=='string'||!body.id)return NextResponse.json({error:'Missing id'},{status:400});
  const id=body.id;
  try{
    if(resource==='users'){
      const target=await prisma.user.findUnique({where:{id},select:{role:true,username:true}});
      if(!target)return NextResponse.json({error:'Record not found'},{status:404});
      if(target.role==='GOD')return NextResponse.json({error:'God Mode accounts cannot be deleted'},{status:403});
      if(id===user.id)return NextResponse.json({error:'You cannot delete your own account'},{status:400});
    }
    await prisma.$transaction(async tx=>{
      switch(resource){
        case 'customers': {
          const plans=await tx.laserPlan.findMany({where:{customerId:id},select:{id:true}});const planIds=plans.map(p=>p.id);
          if(planIds.length){await tx.laserDocument.deleteMany({where:{planId:{in:planIds}}});await tx.laserSession.deleteMany({where:{planId:{in:planIds}}});await tx.laserPlan.deleteMany({where:{id:{in:planIds}}});}
          const requests=await tx.serviceRequest.findMany({where:{customerId:id},select:{id:true}});if(requests.length)await tx.notificationLog.deleteMany({where:{serviceRequestId:{in:requests.map(r=>r.id)}}});
          await tx.serviceRequest.deleteMany({where:{customerId:id}});await tx.appointment.deleteMany({where:{customerId:id}});await tx.invoice.deleteMany({where:{customerId:id}});await tx.user.updateMany({where:{customerId:id},data:{customerId:null}});await tx.customer.delete({where:{id}});break;
        }
        case 'services': {const requests=await tx.serviceRequest.findMany({where:{serviceId:id},select:{id:true}});if(requests.length)await tx.notificationLog.deleteMany({where:{serviceRequestId:{in:requests.map(r=>r.id)}}});await tx.serviceRequest.deleteMany({where:{serviceId:id}});await tx.appointment.deleteMany({where:{serviceId:id}});await tx.invoice.updateMany({where:{serviceId:id},data:{serviceId:null}});await tx.service.delete({where:{id}});break;}
        case 'staff': await tx.appointment.updateMany({where:{staffId:id},data:{staffId:null}});await tx.laserSession.updateMany({where:{staffId:id},data:{staffId:null}});await tx.staff.delete({where:{id}});break;
        case 'appointments': await tx.serviceRequest.updateMany({where:{appointmentId:id},data:{appointmentId:null}});await tx.appointment.delete({where:{id}});break;
        case 'invoices': await tx.serviceRequest.updateMany({where:{invoiceId:id},data:{invoiceId:null}});await tx.invoice.delete({where:{id}});break;
        case 'expenses': await tx.expense.delete({where:{id}});break;
        case 'collegeCourses': {const es=await tx.studentEnrollment.findMany({where:{courseId:id},select:{id:true}});if(es.length)await tx.studentPayment.deleteMany({where:{enrollmentId:{in:es.map(e=>e.id)}}});await tx.studentEnrollment.deleteMany({where:{courseId:id}});await tx.collegeCourse.delete({where:{id}});break;}
        case 'students': {const es=await tx.studentEnrollment.findMany({where:{studentId:id},select:{id:true}});if(es.length)await tx.studentPayment.deleteMany({where:{enrollmentId:{in:es.map(e=>e.id)}}});await tx.studentEnrollment.deleteMany({where:{studentId:id}});await tx.studentContact.deleteMany({where:{studentId:id}});await tx.student.delete({where:{id}});break;}
        case 'enrollments': await tx.studentPayment.deleteMany({where:{enrollmentId:id}});await tx.studentEnrollment.delete({where:{id}});break;
        case 'studentPayments': await tx.studentPayment.delete({where:{id}});break;
        case 'studentContacts': await tx.studentContact.delete({where:{id}});break;
        case 'events': await tx.eventPackage.updateMany({where:{eventId:id},data:{eventId:null}});await tx.eventLead.updateMany({where:{eventId:id},data:{eventId:null}});await tx.event.delete({where:{id}});break;
        case 'eventPackages': await tx.eventLead.updateMany({where:{packageId:id},data:{packageId:null}});await tx.eventPackage.delete({where:{id}});break;
        case 'eventLeads': await tx.eventContact.deleteMany({where:{leadId:id}});await tx.eventLead.delete({where:{id}});break;
        case 'eventContacts': await tx.eventContact.delete({where:{id}});break;
        case 'laserPlans': await tx.laserDocument.deleteMany({where:{planId:id}});await tx.laserSession.deleteMany({where:{planId:id}});await tx.laserPlan.delete({where:{id}});break;
        case 'laserSessions': await tx.laserSession.delete({where:{id}});break;
        case 'workingHours': await tx.workingHour.delete({where:{id}});break;
        case 'users': await tx.user.delete({where:{id}});break;
      }
    });
    await audit(user,'DELETE',resource,id);
    return NextResponse.json({ok:true});
  }catch(error){console.error('Delete failed',error);return NextResponse.json({error:'Delete failed. The record may still be referenced by other data.'},{status:400});}
}
async function mutate(request: Request, context: { params: Promise<{ resource: string }> }, mode: 'create'|'update') {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { resource } = await context.params;
  if (!validResource(resource)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canWrite(user.role, resource)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await request.json();
    const id = body.id;
    if (mode === 'update' && (typeof id !== 'string' || !id)) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const parsed = schemas[resource].safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid data' }, { status: 400 });
    const data = dateFields(resource, { ...parsed.data });
    for (const field of ['enrolledAt','paidAt','contactedAt','startedAt','performedAt']) if (data[field] === null && !(resource === 'expenses' && field === 'paidAt')) delete data[field];
    if (resource === 'invoices' && data.status !== 'VOID') {
      data.status = Number(data.paidAmount) >= Number(data.amount) ? 'PAID' : Number(data.paidAmount) > 0 ? 'PARTIAL' : 'UNPAID';
    }
    if (resource === 'expenses') data.status = data.paidAt ? 'PAID' : 'DUE';
    if (resource === 'studentPayments') {
      const enrollment = await prisma.studentEnrollment.findUnique({ where: { id: data.enrollmentId as string }, include: { payments: true } });
      if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
      const otherPayments = enrollment.payments.filter(p => p.id !== id).reduce((sum, p) => sum + Number(p.amount), 0);
      if (otherPayments + Number(data.amount) > Number(enrollment.fee)) return NextResponse.json({ error: 'Payment exceeds course balance' }, { status: 400 });
    }
    if (resource === 'eventLeads' && data.packageId && data.eventId) {
      const selectedPackage = await prisma.eventPackage.findUnique({ where: { id: data.packageId as string } });
      if (!selectedPackage || (selectedPackage.eventId && selectedPackage.eventId !== data.eventId)) return NextResponse.json({ error: 'Package does not belong to this event' }, { status: 400 });
    }
    if (resource === 'users') {
      if (user.role !== 'GOD' && data.role === 'GOD') return NextResponse.json({ error: 'Only God Mode can manage this role' }, { status: 403 });
      data.customerId = null;
      if (mode === 'update') {
        const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
        if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
        if (target.role === 'GOD' && user.role !== 'GOD') return NextResponse.json({ error: 'Only God Mode can edit this user' }, { status: 403 });
      }
      const password = data.password as string | undefined;
      delete data.password;
      if (mode === 'create' && !password) return NextResponse.json({ error: 'Password required' }, { status: 400 });
      if (password) data.passwordHash = await hash(password, 12);
      if (data.email) data.email = (data.email as string).toLowerCase();
      if (mode === 'update' && id === user.id && (data.active === false || data.role !== user.role)) return NextResponse.json({ error: 'Cannot remove your own access' }, { status: 400 });
    }
    let result;
    switch(resource) {
      case 'customers': result = mode === 'create' ? await prisma.customer.create({ data: data as never }) : await prisma.customer.update({ where: { id }, data: data as never }); break;
      case 'services': result = mode === 'create' ? await prisma.service.create({ data: data as never }) : await prisma.service.update({ where: { id }, data: data as never }); break;
      case 'staff': result = mode === 'create' ? await prisma.staff.create({ data: data as never }) : await prisma.staff.update({ where: { id }, data: data as never }); break;
      case 'appointments': result = await schedulingTransaction(async tx => {
        const previous = mode === 'update' ? await tx.appointment.findUniqueOrThrow({ where: { id } }) : null;
        const status = data.status ?? previous?.status ?? 'SCHEDULED';
        if (status === 'SCHEDULED' || status === 'COMPLETED') {
          const service = await tx.service.findUniqueOrThrow({ where: { id: data.serviceId as string } });
          await assertNoOverlap(tx, data.startsAt as Date, service.durationMinutes, previous?.id);
        }
        return mode === 'create' ? tx.appointment.create({ data: data as never }) : tx.appointment.update({ where: { id }, data: data as never });
      }); break;
      case 'invoices': result = mode === 'create' ? await prisma.invoice.create({ data: data as never }) : await prisma.invoice.update({ where: { id }, data: data as never }); break;
      case 'expenses': result = mode === 'create' ? await prisma.expense.create({ data: data as never }) : await prisma.expense.update({ where: { id }, data: data as never }); break;
      case 'users': result = mode === 'create' ? await prisma.user.create({ data: data as never, select: { id: true } }) : await prisma.user.update({ where: { id }, data: data as never, select: { id: true } }); break;
      case 'collegeCourses': result = mode === 'create' ? await prisma.collegeCourse.create({ data: data as never }) : await prisma.collegeCourse.update({ where: { id }, data: data as never }); break;
      case 'students': result = mode === 'create' ? await prisma.student.create({ data: data as never }) : await prisma.student.update({ where: { id }, data: data as never }); break;
      case 'enrollments': result = mode === 'create' ? await prisma.studentEnrollment.create({ data: data as never }) : await prisma.studentEnrollment.update({ where: { id }, data: data as never }); break;
      case 'studentPayments': result = mode === 'create' ? await prisma.studentPayment.create({ data: data as never }) : await prisma.studentPayment.update({ where: { id }, data: data as never }); break;
      case 'studentContacts': result = mode === 'create' ? await prisma.studentContact.create({ data: data as never }) : await prisma.studentContact.update({ where: { id }, data: data as never }); break;
      case 'events': result = mode === 'create' ? await prisma.event.create({ data: data as never }) : await prisma.event.update({ where: { id }, data: data as never }); break;
      case 'eventPackages': result = mode === 'create' ? await prisma.eventPackage.create({ data: data as never }) : await prisma.eventPackage.update({ where: { id }, data: data as never }); break;
      case 'eventLeads': result = mode === 'create' ? await prisma.eventLead.create({ data: data as never }) : await prisma.eventLead.update({ where: { id }, data: data as never }); break;
      case 'eventContacts': result = mode === 'create' ? await prisma.eventContact.create({ data: data as never }) : await prisma.eventContact.update({ where: { id }, data: data as never }); break;
      case 'laserPlans': result = mode === 'create' ? await prisma.laserPlan.create({ data: data as never }) : await prisma.laserPlan.update({ where: { id }, data: data as never }); break;
      case 'laserSessions': result = mode === 'create' ? await prisma.laserSession.create({ data: data as never }) : await prisma.laserSession.update({ where: { id }, data: data as never }); break;
      case 'workingHours': result = mode === 'create' ? await prisma.workingHour.create({ data: data as never }) : await prisma.workingHour.update({ where: { id }, data: data as never }); break;
    }
    if (resource === 'studentContacts') {
      const contact = result as unknown as { studentId: string; nextFollowUpAt: Date | null };
      const student = await prisma.student.findUnique({ where: { id: contact.studentId } });
      if (student) await prisma.student.update({ where: { id: student.id }, data: { status: ['ENROLLED','INACTIVE'].includes(student.status) ? student.status : 'CONTACTED', ...(contact.nextFollowUpAt ? { followUpAt: contact.nextFollowUpAt } : {}) } });
    }
    if (resource === 'eventContacts') {
      const contact = result as unknown as { leadId: string; nextFollowUpAt: Date | null };
      const lead = await prisma.eventLead.findUnique({ where: { id: contact.leadId } });
      if (lead) await prisma.eventLead.update({ where: { id: lead.id }, data: { stage: ['CLOSED','LOST'].includes(lead.stage) ? lead.stage : 'CONTACTED', ...(contact.nextFollowUpAt ? { followUpAt: contact.nextFollowUpAt } : {}) } });
    }
    if (resource === 'appointments') {
      const appointment = result as { customerId: string; startsAt: Date; status: string; id: string };
      if (appointment.status === 'COMPLETED') {
        const previousVisits = await prisma.appointment.count({ where: { customerId: appointment.customerId, status: 'COMPLETED', id: { not: appointment.id } } });
        await prisma.customer.update({ where: { id: appointment.customerId }, data: { lastVisitAt: appointment.startsAt, relationshipStatus: previousVisits > 0 ? 'RETURNING' : 'ACTIVE' } });
      }
    }
    const safeDetails = resource === 'users' ? { ...data, passwordHash: undefined } : data;
    await audit(user, mode === 'create' ? 'CREATE' : 'UPDATE', resource, (result as { id?: string })?.id ?? id, safeDetails);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SchedulingConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : 'Save failed';
    return NextResponse.json({ error: message.includes('Unique constraint') ? 'A record with this email or phone already exists' : 'Save failed. Check related records and try again.' }, { status: 400 });
  }
}
