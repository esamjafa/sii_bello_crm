import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sendEmail, sendWhatsApp } from '@/lib/notifications';
import { assertNoOverlap, schedulingTransaction, SchedulingConflict } from '@/lib/scheduling';

const createSchema=z.object({serviceId:z.string().min(1),preferredAt:z.string().datetime(),notes:z.string().trim().max(1000).optional().nullable()});
const reviewSchema=z.object({id:z.string().min(1),decision:z.enum(['APPROVED','REJECTED']),adminNote:z.string().trim().max(1000).optional().nullable()});
const managementRoles=['GOD','ADMIN','MANAGER'];

export async function GET() {
  const user=await currentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (user.role==='CUSTOMER') {
    if (!user.customerId) return NextResponse.json({error:'Customer account is not linked'},{status:403});
    return NextResponse.json(await prisma.serviceRequest.findMany({where:{customerId:user.customerId},include:{service:true},orderBy:{createdAt:'desc'}}));
  }
  if (!managementRoles.includes(user.role) && user.role!=='STAFF' && user.role!=='VIEWER') return NextResponse.json({error:'Forbidden'},{status:403});
  return NextResponse.json(await prisma.serviceRequest.findMany({include:{customer:true,service:true,reviewedBy:{select:{name:true}}},orderBy:{createdAt:'desc'},take:500}));
}

export async function POST(request:Request) {
  const user=await currentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (user.role!=='CUSTOMER'||!user.customerId) return NextResponse.json({error:'Forbidden'},{status:403});
  const parsed=createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const service=await prisma.service.findFirst({where:{id:parsed.data.serviceId,active:true}});
  if (!service) return NextResponse.json({error:'Service not available'},{status:400});
  const customer=await prisma.customer.findUnique({where:{id:user.customerId}});
  if (!customer) return NextResponse.json({error:'Customer not found'},{status:404});
  const preferredAt=new Date(parsed.data.preferredAt);
  if (preferredAt.getTime()<Date.now()) return NextResponse.json({error:'Requested time must be in the future'},{status:400});
  const created=await prisma.serviceRequest.create({data:{customerId:customer.id,serviceId:service.id,preferredAt,notes:parsed.data.notes},include:{service:true}});
  await audit(user,'CREATE','serviceRequests',created.id,{serviceId:service.id,preferredAt});
  await sendWhatsApp(created.id,process.env.SALON_WHATSAPP_NUMBER??'','REQUEST_CREATED',process.env.WHATSAPP_NEW_REQUEST_TEMPLATE||'new_service_request',[customer.name,service.name,preferredAt.toLocaleString('en-IL')]);
  return NextResponse.json(created);
}

export async function PATCH(request:Request) {
  const user=await currentUser();
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (!managementRoles.includes(user.role)) return NextResponse.json({error:'Forbidden'},{status:403});
  const parsed=reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const existing=await prisma.serviceRequest.findUnique({where:{id:parsed.data.id},include:{customer:true,service:true}});
  if (!existing) return NextResponse.json({error:'Request not found'},{status:404});
  if (existing.status!=='PENDING') return NextResponse.json({error:'Request was already reviewed'},{status:409});
  let result;
  try {
  result=await schedulingTransaction(async tx=>{
    const existing=await tx.serviceRequest.findUniqueOrThrow({where:{id:parsed.data.id},include:{service:true}});
    const claimed=await tx.serviceRequest.updateMany({where:{id:existing.id,status:'PENDING'},data:{status:parsed.data.decision,adminNote:parsed.data.adminNote,reviewedAt:new Date(),reviewedById:user.id}});
    if(claimed.count!==1)throw new Error('REQUEST_ALREADY_REVIEWED');
    let appointmentId:string|undefined;
    let invoiceId:string|undefined;
    if(parsed.data.decision==='APPROVED') {
      await assertNoOverlap(tx,existing.preferredAt,existing.service.durationMinutes);
      const appointment=await tx.appointment.create({data:{customerId:existing.customerId,serviceId:existing.serviceId,startsAt:existing.preferredAt,status:'SCHEDULED',notes:existing.notes}});
      appointmentId=appointment.id;
      const invoice=await tx.invoice.create({data:{customerId:existing.customerId,serviceId:existing.serviceId,description:`Appointment: ${existing.service.name}`,amount:existing.service.price,paidAmount:0,status:'UNPAID',dueAt:existing.preferredAt}});
      invoiceId=invoice.id;
    }
    return tx.serviceRequest.update({where:{id:existing.id},data:{appointmentId,invoiceId},include:{customer:true,service:true}});
  });
  } catch(error) {
    if(error instanceof SchedulingConflict)return NextResponse.json({error:error.message},{status:409});
    if(error instanceof Error&&error.message==='REQUEST_ALREADY_REVIEWED')return NextResponse.json({error:'Request was already reviewed'},{status:409});
    throw error;
  }
  await audit(user,'REVIEW', 'serviceRequests', result.id,{decision:result.status,adminNote:result.adminNote,appointmentId:result.appointmentId,invoiceId:result.invoiceId});
  const status=result.status==='APPROVED'?'approved':'declined';
  const appointmentDetails=`${result.preferredAt.toLocaleString('en-IL',{timeZone:'Asia/Jerusalem'})} · ${result.service.durationMinutes} minutes · ₪${Number(result.service.price)}`;
  const message=`Your request for ${result.service.name} was ${status}. ${appointmentDetails}.${result.adminNote?` Note: ${result.adminNote}`:''}`;
  await Promise.all([
    sendWhatsApp(result.id,result.customer.phone,'REQUEST_REVIEWED',process.env.WHATSAPP_REQUEST_RESULT_TEMPLATE||'service_request_result',[result.customer.name,result.service.name,status,appointmentDetails]),
    sendEmail(result.id,result.customer.email??'','REQUEST_REVIEWED',`Sii Bello Saloon request ${status}`,message)
  ]);
  return NextResponse.json(result);
}

export async function DELETE(request:Request){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!['GOD','ADMIN'].includes(user.role))return NextResponse.json({error:'Only Admin or God Mode can delete requests'},{status:403});
  const body=await request.json().catch(()=>({}));
  if(typeof body.id!=='string'||!body.id)return NextResponse.json({error:'Missing id'},{status:400});
  const existing=await prisma.serviceRequest.findUnique({where:{id:body.id},select:{id:true}});
  if(!existing)return NextResponse.json({error:'Request not found'},{status:404});
  await prisma.$transaction([prisma.notificationLog.deleteMany({where:{serviceRequestId:body.id}}),prisma.serviceRequest.delete({where:{id:body.id}})]);
  await audit(user,'DELETE','serviceRequests',body.id);
  return NextResponse.json({ok:true});
}
