import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from './prisma';
import { crm, type CrmField } from './crm-config';
import { actorDepartments, allowed, customerScope, fieldAllowed, financial, managers, owners, sanitize, scope, type Actor } from './crm-access';
import { parseSchedule } from './staff-schedule';
import { normalizePhone } from './phone';
import { salonDayRange, salonMonthStart } from './business-time';
import { assertNoOverlap, assertStaffAvailable, SchedulingConflict, schedulingTransaction } from './scheduling';

export class CrmError extends Error { constructor(message:string,public status=400){super(message);} }
const fail=(message:string,status=400):never=>{throw new CrmError(message,status);};
const archived = new Set(['customers','tasks','appointments','students','enrollments','events','eventLeads','laserPlans','laserSessions','hairSessions','products']);
const readonly = new Set(['team','audit','documents']);
const decimal=(v:any)=>new Prisma.Decimal(v??0);
const model=(db:any,r:string)=>db[crm[r].model];
const safeUser={id:true,name:true,username:true,email:true,role:true,active:true,staffId:true,lockedUntil:true,requiresGodUnlock:true};
// A relation picker never needs the full customer profile or financial data.
export async function customerOptions(u:Actor,url:URL) {
 if(!allowed(u,'customers'))fail('لا تملكين صلاحية اختيار العميلة',403);
 const query=url.searchParams.get('q')?.trim().slice(0,100)??'';
 let phone=query.replace(/\D/g,'');try{phone=normalizePhone(query);}catch{}
 const where:any={AND:[customerScope(u),{archivedAt:null}]};
 if(query)where.AND.push({OR:[{name:{contains:query,mode:'insensitive'}},...(phone?[{phone:{contains:phone}}]:[])]});
 const rows=await prisma.customer.findMany({where,select:{id:true,name:true,phone:true},orderBy:{name:'asc'},take:100});
 return {rows};
}
export async function bookingOptions(u:Actor,kind:string,url:URL){
 if(!allowed(u,'appointments')&&!financial(u))fail('غير مصرح',403);
 const q=url.searchParams.get('q')?.trim().slice(0,100)??'';
 if(kind==='service-options')return {rows:await prisma.service.findMany({where:{active:true,name:{contains:q,mode:'insensitive'}},select:{id:true,name:true,price:true,durationMinutes:true,department:true},take:100})};
 if(!allowed(u,'appointments'))fail('غير مصرح',403);
 return {rows:await prisma.staff.findMany({where:{AND:[scope(u,'staff'),{active:true,department:'SALON',name:{contains:q,mode:'insensitive'}}]},select:{id:true,name:true},take:100})};
}
export async function appointmentAvailability(u:Actor,url:URL){
 if(!allowed(u,'appointments',true))fail('غير مصرح',403);
 const serviceId=url.searchParams.get('serviceId')??'',staffId=url.searchParams.get('staffId')??'',day=url.searchParams.get('day')??'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(+new Date(day))||new Date(day).toISOString().slice(0,10)!==day)fail('حددي يومًا صحيحًا');
 const staff=await prisma.staff.findFirst({where:{AND:[{id:staffId,active:true},scope(u,'staff')]}});
 const service=await prisma.service.findUnique({where:{id:serviceId}});if(!staff||!service?.active)throw new CrmError('الخدمة أو الموظفة غير متاحة',404);
 const duration=managers(u)?Number(url.searchParams.get('durationMinutes')||service.durationMinutes):service.durationMinutes;
 if(!Number.isInteger(duration)||duration<1||duration>1440)fail('مدة الخدمة غير صالحة');
 const excludeId=url.searchParams.get('excludeId')??undefined;
 if(excludeId&&!await prisma.appointment.findFirst({where:{AND:[{id:excludeId},scope(u,'appointments')]}}))fail('الموعد غير متاح',404);
 const {start,end}=salonDayRange(new Date(`${day}T12:00:00Z`));const slots:string[]=[];
 await prisma.$transaction(async tx=>{for(let at=+start;at+duration*60000<=+end;at+=30*60000){try{await assertStaffAvailable(tx,staffId,new Date(at),duration);await assertNoOverlap(tx,new Date(at),duration,excludeId,staffId);slots.push(new Date(at).toISOString());}catch(e){if(!(e instanceof SchedulingConflict))throw e;}}},{timeout:15000});
 return {slots};
}
export async function recordAudit(tx:any,u:Actor,action:string,r:string,id:string,before?:any,after?:any) {
 const clean=(data:any)=>{if(!data)return null;const v={...data};delete v.password;delete v.passwordHash;delete v.content;delete v.imageBytes;return v;};
 await tx.auditLog.create({data:{actorId:u.id,actorName:u.name,actorRole:u.role,action,entity:r,entityId:id,details:JSON.stringify({before:clean(before),after:clean(after)})}});
}
function schemaFor(r:string,partial=false) {
 const shape:Record<string,z.ZodType>={};
 for(const f of crm[r].fields) {
   let v:z.ZodType;
   if(f.type==='number')v=z.coerce.number().finite().min(f.key==='quantity'?-1000000:0).max(100000000);
   else if(f.type==='checkbox')v=z.boolean();
   else if(['multi','tags'].includes(f.type))v=f.options?z.array(z.enum(f.options as [string,...string[]])).min(1).max(4):z.array(z.string().max(100)).max(40);
   else if(f.type==='date')v=z.union([z.string().datetime(),z.literal(''),z.null()]).transform(x=>x?new Date(x):null);
   else if(f.type==='select')v=z.enum([...f.options!,...(partial&&r==='students'&&f.key==='status'?['NEW','CONTACTED','AWAITING_DETAILS','ENROLLED','INACTIVE']:[]),...(partial&&r==='eventLeads'&&f.key==='stage'?['CLOSED']:[])] as [string,...string[]]);
   else if(f.type==='email')v=z.union([z.email(),z.literal(''),z.null()]);
   else v=z.string().trim().max(['textarea','schedule'].includes(f.type)?10000:f.type==='password'?200:250);
   if(f.required&&['text','tel','relation','textarea'].includes(f.type))v=z.string().trim().min(1).max(f.type==='textarea'?10000:250);
   if(f.required&&f.type==='date')v=z.string().datetime().transform(x=>new Date(x));
   if(!f.required||partial)v=v.optional();
   shape[f.key]=v;
 }
 return z.object({...shape,id:z.string().optional(),idempotencyKey:z.string().min(12).max(120).optional()}).strict();
}
export async function listRecords(u:Actor,r:string,url:URL) {
 if(!allowed(u,r))fail('غير مصرح',403);
 const page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));
 const take=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||30));
 const where:any={AND:[scope(u,r)]};
 if(archived.has(r))where.AND.push({archivedAt:url.searchParams.get('archived')==='true'?{not:null}:null});
 const customerId=url.searchParams.get('customerId');
 if(customerId)where.AND.push(r==='customers'?{id:customerId}:r==='payments'?{invoice:{customerId}}:r==='laserSessions'?{plan:{customerId}}:r==='enrollments'?{student:{customerId}}:r==='attendance'?{enrollment:{student:{customerId}}}:{customerId});
 const eventId=url.searchParams.get('eventId');if(eventId&&['eventLeads','eventPackages'].includes(r))where.AND.push({eventId});
 const courseId=url.searchParams.get('courseId');if(courseId&&['enrollments','courseSessions','attendance'].includes(r))where.AND.push(r==='attendance'?{enrollment:{courseId}}:{courseId});
 const q=url.searchParams.get('q')?.trim().slice(0,100);
 if(q){
   const keys=crm[r].fields.filter(f=>['text','tel','textarea'].includes(f.type)).map(f=>f.key);
   const searches=keys.map(k=>({[k]:{contains:q,mode:'insensitive'}}));
   if(keys.includes('phone')&&/[0-9]/.test(q)){let phone=q.replace(/[^0-9]/g,'');try{phone=normalizePhone(q);}catch{}if(phone)searches.push({phone:{contains:phone,mode:'insensitive'}});}
   if(searches.length)where.AND.push({OR:searches});
 }
 const status=url.searchParams.get('status');
 if(status&&status!=='ALL'){
   if(r==='products'){
     if(status==='LOW'){
       const products=await prisma.product.findMany({select:{id:true,minimum:true}});
       const stocks=await prisma.stockMovement.groupBy({by:['productId'],_sum:{quantity:true}});
       where.AND.push({id:{in:products.filter(p=>(stocks.find(s=>s.productId===p.id)?._sum.quantity??0)<=p.minimum).map(p=>p.id)}});
     }else if(['SALE','KIT','SALON'].includes(status))where.AND.push({purpose:status});
   }else if(r==='appointments'&&status==='LASER_TODAY'){
     const range=salonDayRange();where.AND.push({startsAt:{gte:range.start,lt:range.end},service:{department:'LASER'}});
   }else if(r==='appointments'&&status==='TODAY'){
     const range=salonDayRange(new Date());where.AND.push({startsAt:{gte:range.start,lt:range.end}});
   }else if(r==='tasks'){
     const now=new Date();const range=salonDayRange(now);const start=range.start;const end=new Date(+range.end-1);
     const filters:any={TODAY:{dueAt:{gte:start,lte:end},completedAt:null},OVERDUE:{dueAt:{lt:now},completedAt:null},WEEK:{dueAt:{gte:start,lte:new Date(end.getTime()+6*86400000)},completedAt:null},NO_DATE:{dueAt:null,completedAt:null},MINE:{ownerId:u.id,completedAt:null},PROMISED_PAYMENT:{outcome:'PROMISED_PAYMENT',completedAt:null},NO_ANSWER:{outcome:'NO_ANSWER',completedAt:null},DONE:{completedAt:{not:null}}};
     if(filters[status])where.AND.push(filters[status]);
   }else if(r==='invoices'){
     if(status==='REFUNDED')where.AND.push({payments:{some:{kind:'REFUND',voidedAt:null}}});
     else if(status==='OVERDUE')where.AND.push({dueAt:{lt:new Date()},status:{in:['UNPAID','PARTIAL']}});
     else if(status==='SOON')where.AND.push({dueAt:{gte:new Date(),lte:new Date(Date.now()+7*86400000)},status:{in:['UNPAID','PARTIAL']}});
     else where.AND.push({status});
   }else if(r==='customers'&&status==='NEW_TODAY')where.AND.push({createdAt:{gte:salonDayRange().start}});
   else if(r==='customers'&&['SALON','COLLEGE','EVENT','PRODUCTS'].includes(status))where.AND.push({departments:{has:status}});
   else if(r==='eventLeads')where.AND.push(status==='LEADS'?{stage:{notIn:['DEPOSIT','REGISTERED','ATTENDED','LOST']}}:status==='REGISTRATIONS'?{stage:{in:['DEPOSIT','REGISTERED','ATTENDED']}}:status==='VIP'?{vip:true}:status==='HOTEL'?{hotel:true}:status==='FLIGHT'?{flight:true}:status==='COMPANION'?{companion:{not:null}}:status==='LOCAL'||status==='DUBAI'?{region:status}:{stage:status});
   else if(crm[r].fields.some(f=>f.key==='status'))where.AND.push({status});
 }
 const ownerId=url.searchParams.get('ownerId');if(ownerId&&['tasks','customers'].includes(r))where.AND.push({ownerId});
 const options:any={where,skip:(page-1)*take,take,orderBy:r==='tasks'?{dueAt:'asc'}:r==='appointments'?{startsAt:'asc'}:{id:'desc'}};
 if(r==='users')options.select=safeUser;
 if(r==='team'){options.select={id:true,name:true,role:true,staffId:true};where.AND.push({active:true,role:{not:'CUSTOMER'}});}
 if(r==='documents')options.select={id:true,customerId:true,department:true,invoiceId:true,authorId:true,filename:true,mimeType:true,category:true,createdAt:true};
 if(r==='products')options.select=Object.fromEntries(['id',...crm.products.fields.map(f=>f.key),'archivedAt'].map(key=>[key,true]));
 const [rows,total]=await prisma.$transaction([model(prisma,r).findMany(options),model(prisma,r).count({where})]);
 const enriched=await Promise.all(rows.map(async(row:any)=>{
   if(r==='products'){row.stock=(await prisma.stockMovement.aggregate({where:{productId:row.id},_sum:{quantity:true}}))._sum.quantity??0;row.margin=decimal(row.salePrice).gt(0)?decimal(row.salePrice).minus(row.purchasePrice).div(row.salePrice).mul(100).toFixed(2)+'%':'0%';}
   if(r==='laserPlans')row.sessionsUsed=await prisma.laserSession.count({where:{planId:row.id,archivedAt:null}});
   if(r==='collegeCourses'){row.enrolledCount=await prisma.studentEnrollment.count({where:{courseId:row.id,archivedAt:null,status:{not:'WITHDRAWN'}}});row.remainingSeats=Math.max(0,row.capacity-row.enrolledCount);}
   if(r==='events'){row.reservedSeats=(await prisma.eventLead.aggregate({where:{eventId:row.id,archivedAt:null,stage:{in:['DEPOSIT','REGISTERED','ATTENDED']}},_sum:{partySize:true}}))._sum.partySize??0;row.remainingSeats=row.capacity?Math.max(0,row.capacity-row.reservedSeats):'دون حد';}
   if(r==='students')row.missingDocuments=row.requiredDocuments.filter((name:string)=>!row.receivedDocuments.includes(name));
   if(r==='invoices')row.balance=decimal(row.amount).minus(row.paidAmount).toString();
   const safe=sanitize(u,r,row);safe._labels={};
   for(const f of crm[r].fields.filter(f=>f.type==='relation'))if(safe[f.key]){
     let target=await model(prisma,f.source!).findFirst({where:{AND:[{id:safe[f.key]},...(['team','staff'].includes(f.source!)?[scope(u,f.source!)]:[])]},select:f.source==='enrollments'?{student:{select:{name:true}},course:{select:{title:true}}}:f.source==='team'?{name:true,role:true}:f.source==='invoices'?{description:true}:f.source==='collegeCourses'||f.source==='courseSessions'?{title:true}:['customers','services','staff','students','events','eventPackages','products'].includes(f.source!)?{name:true}:f.source==='documents'?{filename:true}:f.source==='laserPlans'?{area:true}: {id:true}});
     if(f.source==='team'&&u.role!=='GOD'&&target?.role==='GOD')target=null;
     safe._labels[f.key]=target?.name??target?.title??target?.description??target?.filename??target?.area??(target?.student?`${target.student.name} · ${target.course.title}`:f.source==='team'?'غير معروضة':'سجل مرتبط');
   }
   return safe;
 }));
 return {rows:enriched,total,page,pages:Math.ceil(total/take)};
}
async function checkRelations(tx:any,u:Actor,r:string,data:any){
 for(const field of crm[r].fields.filter(f=>f.type==='relation')){
   const id=data[field.key];if(!id)continue;
   const target=field.source!;const targetScope=target==='team'?{AND:[{active:true,role:{not:'CUSTOMER'}},scope(u,'team')]}:scope(u,target);
   if(target==='team'&&u.role!=='GOD'&&(await tx.user.findUnique({where:{id},select:{role:true}}))?.role==='GOD')fail('السجل المرتبط غير متاح',403);
   if(!await model(tx,target).findFirst({where:{AND:[{id},targetScope,...(archived.has(target)?[{archivedAt:null}]:[])]},select:{id:true}}))fail('السجل المرتبط غير متاح',403);
 }
}
async function refreshInvoice(tx:any,id:string){
 const inv=await tx.invoice.findUniqueOrThrow({where:{id}});
 const payments=await tx.payment.findMany({where:{invoiceId:id,voidedAt:null}});
 const paid=payments.reduce((sum:Prisma.Decimal,p:any)=>p.kind==='REFUND'?sum.minus(p.amount):sum.plus(p.amount),decimal(0));
 if(paid.lt(0)||paid.gt(inv.amount))fail('الدفعة تتجاوز الرصيد المتاح');
 const status=inv.status==='VOID'?'VOID':paid.gte(inv.amount)?'PAID':paid.gt(0)?'PARTIAL':'UNPAID';
 await tx.invoice.update({where:{id},data:{paidAmount:paid,status}});
 await tx.eventLead.updateMany({where:{invoiceId:id},data:{paidAmount:paid}});
 const lead=await tx.eventLead.findFirst({where:{invoiceId:id},include:{event:true}});
 if(lead&&['DEPOSIT','REGISTERED'].includes(lead.stage)&&(!paid.gt(0)||paid.lt(lead.event?.depositRequired??0)))await tx.eventLead.update({where:{id:lead.id},data:{stage:'INCOMPLETE'}});
 return paid;
}
export async function mutateRecord(u:Actor,r:string,body:any,method:string){
 if(!allowed(u,r,true)||readonly.has(r))fail('غير مصرح',403);
 if(!body||typeof body!=='object'||Array.isArray(body))fail('بيانات غير صالحة');
 const operation=body.operation;
 const updating=method==='PATCH';
 if(updating&&typeof body.id!=='string')fail('رقم السجل مطلوب');
 if(operation&& !['archive','restore','void'].includes(operation))fail('إجراء غير صالح');
 const parsed=operation?null:schemaFor(r,updating).safeParse(body);
 if(parsed&&!parsed.success){const key=String(parsed.error.issues[0]?.path[0]??'');const field=crm[r].fields.find(f=>f.key===key);fail(field?`تحققي من حقل «${field.label}»؛ القيمة مطلوبة أو غير صالحة`:'البيانات غير صالحة أو تحتوي حقولًا غير مسموحة');}
 const data:any=parsed?.success?{...parsed.data}:{};delete data.id;
 for(const key of Object.keys(data))if(!fieldAllowed(u,r,key))fail('هذا الحقل خارج صلاحيتك',403);
 const initialPayment=data.initialPayment??0,paymentMethod=data.paymentMethod??'CASH',paymentNote=data.paymentNote;
 delete data.initialPayment;delete data.paymentMethod;delete data.paymentNote;
 if(r==='invoices'&&method==='PATCH'&&initialPayment>0)fail('أضيفي الدفعة إلى الفاتورة القائمة من تسجيل دفعة');
 const key=data.idempotencyKey;delete data.idempotencyKey;
 return schedulingTransaction(async tx=>{
  const db=tx as any;
  const previous=updating?await model(db,r).findFirst({where:{AND:[{id:body.id},scope(u,r)]}}):null;
  if(updating&&!previous)fail('السجل غير موجود',404);
  if(operation){
   if(!owners(u))fail('الإلغاء والأرشفة للإدارة فقط',403);
   if(typeof body.reason!=='string'||body.reason.trim().length<3)fail('سبب الإلغاء أو الأرشفة مطلوب');
   let result;
   if(operation==='restore'&&r==='eventLeads'&&['DEPOSIT','REGISTERED','ATTENDED'].includes(previous.stage)){
    const event=await db.event.findUniqueOrThrow({where:{id:previous.eventId}});
    const occupied=(await db.eventLead.aggregate({where:{eventId:event.id,id:{not:previous.id},archivedAt:null,stage:{in:['DEPOSIT','REGISTERED','ATTENDED']}},_sum:{partySize:true}}))._sum.partySize??0;
    if(event.capacity>0&&occupied+previous.partySize>event.capacity)fail('لا توجد مقاعد كافية لاستعادة التسجيل',409);
   }
   if(operation==='restore'&&r==='appointments'&&['SCHEDULED','CONFIRMED','PENDING_REPLY','COMPLETED'].includes(previous.status)){
    const service=await db.service.findUniqueOrThrow({where:{id:previous.serviceId}});const duration=previous.durationMinutes??service.durationMinutes;
    await assertNoOverlap(tx,previous.startsAt,duration,previous.id,previous.staffId);
    if(previous.staffId)await assertStaffAvailable(tx,previous.staffId,previous.startsAt,duration);
   }
   if(operation==='restore'&&r==='enrollments'){const course=await db.collegeCourse.findUniqueOrThrow({where:{id:previous.courseId}});if(await db.studentEnrollment.count({where:{courseId:course.id,archivedAt:null,status:{not:'WITHDRAWN'}}})>=course.capacity)fail('المجموعة مكتملة',409);}
   if(operation==='void'&&r==='payments'){
     if(previous.voidedAt)fail('الدفعة ملغاة بالفعل',409);
     result=await db.payment.update({where:{id:body.id},data:{voidedAt:new Date(),voidedById:u.id,voidReason:body.reason}});
     await refreshInvoice(db,previous.invoiceId);
   }else if(operation==='void'&&r==='invoices'){
     if(decimal(previous.paidAmount).gt(0))fail('سجلي الاسترداد قبل إلغاء الفاتورة');
     result=await db.invoice.update({where:{id:body.id},data:{status:'VOID',cancelledAt:new Date(),cancelReason:body.reason}});
   }else if(archived.has(r)&&operation!=='void')result=await model(db,r).update({where:{id:body.id},data:{archivedAt:operation==='restore'?null:new Date()}});
   else if(['staff','services','collegeCourses','eventPackages','templates'].includes(r)&&operation!=='void')result=await model(db,r).update({where:{id:body.id},data:{active:operation==='restore'}});
   else fail('لا يمكن حذف هذا السجل؛ استخدمي حركة تصحيح');
   if(r==='tasks'){const next=await db.task.findFirst({where:{customerId:previous.customerId,completedAt:null,archivedAt:null,dueAt:{not:null}},orderBy:{dueAt:'asc'}});await db.customer.update({where:{id:previous.customerId},data:{followUpAt:next?.dueAt??null}});}
   await recordAudit(db,u,operation.toUpperCase(),r,body.id,previous,{...result,reason:body.reason});return sanitize(u,r,result);
  }
  if(updating&&crm[r].immutable)fail('الحركات لا تُعدّل؛ سجلي استردادًا أو إلغاءً مسببًا',409);
  if(previous?.archivedAt)fail('السجل مؤرشف',409);
  for(const field of crm[r].fields){
   if(field.type==='relation'&&data[field.key]==='')data[field.key]=null;
   if(field.type==='email'&&data[field.key]==='')data[field.key]=null;
  }
  for(const k of ['contactedAt','enrolledAt','performedAt','startedAt','paidAt'])if(data[k]===null&&!(r==='expenses'&&k==='paidAt'))delete data[k];
  const relationsToCheck={...data};
  if(updating&&previous)for(const field of crm[r].fields.filter(f=>f.source==='team'))if(relationsToCheck[field.key]===previous[field.key])delete relationsToCheck[field.key];
  await checkRelations(db,u,r,relationsToCheck);
  let combined={...previous,...data};
  if(updating&&['students','notes','tasks','laserPlans','hairSessions'].includes(r)&&data.customerId&&data.customerId!==previous.customerId)fail('لا يمكن نقل السجل التاريخي إلى عميلة أخرى');
  for(const key of ['amount','fee','price','originalAmount','originalPrice','discount','quotedPrice','offeredDiscount','purchasePrice','salePrice','cost','depositRequired','commissionRate'])if(data[key]!==undefined&&decimal(data[key]).decimalPlaces()>2)fail('المبالغ تقبل منزلتين عشريتين فقط');
  if(r==='customers'){
    if(data.phone)data.phone=normalizePhone(data.phone);
    if(!managers(u)){
      if(data.ownerId&&data.ownerId!==u.id&&data.ownerId!==previous?.ownerId)fail('لا يمكنك إسناد العميلة لموظفة أخرى',403);
      if(!updating)data.ownerId=u.id;
      else if(data.ownerId&&data.ownerId!==previous.ownerId)fail('تغيير المسؤولة للإدارة فقط',403);
    }
    const department=u.role==='COLLEGE'?'COLLEGE':u.role==='EVENT_MANAGER'?'EVENT':['STAFF','RECEPTIONIST','SALES'].includes(u.role)?'SALON':null;
    if(department&&data.departments){
      if(data.departments.some((value:string)=>value!==department)||!data.departments.includes(department))fail('لا يمكنك تعديل أقسام خارج صلاحيتك',403);
      // Preserve the other departments on a unified profile when editing a scoped view.
      if(updating)data.departments=Array.from(new Set([...(previous.departments??[]),department]));
    }
  }
  if(r==='tasks'){
    if(!managers(u)&&combined.ownerId!==u.id)fail('يمكنك إدارة مهامك فقط',403);
    if(['THINKING','PROMISED_PAYMENT','SCHEDULED','FUTURE','FOLLOW_UP'].includes(combined.outcome)&&!combined.dueAt)fail('موعد المتابعة إلزامي عند العودة للعميلة');
    if(combined.dueAt&&!combined.nextAction?.trim())fail('حددي الخطوة القادمة');
    if(!updating)data.createdById=u.id;
  }
  if(r==='notes'){
    data.department=combined.department??actorDepartments(u)[0];
    if(!actorDepartments(u).includes(data.department))fail('القسم خارج صلاحيتك',403);
    if(updating&&previous.authorId!==u.id&&!managers(u))fail('تعديل ملاحظاتك فقط',403);
    if(!updating){data.authorId=u.id;data.authorName=u.name;}
  }
  if(r==='users'){
    if(!owners(u))fail('غير مصرح',403);
    if(u.role!=='GOD'&&(data.role==='GOD'||previous?.role==='GOD'))fail('صلاحية المالكة مطلوبة',403);
    if(body.id===u.id&&(data.active===false||(data.role&&data.role!==u.role)))fail('لا يمكنك إزالة صلاحيتك');
    if(!updating&&!data.password)fail('كلمة المرور مطلوبة');
    if(data.password){if(data.password.length<10)fail('كلمة المرور 10 أحرف على الأقل');data.passwordHash=await hash(data.password,12);}
    if(updating&&(data.password||data.role&&data.role!==previous.role||data.active===false))data.sessionVersion={increment:1};
    delete data.password;
  }
  if(['staff','collegeCourses'].includes(r)&&!financial(u)&&('cost' in data||'commissionRate' in data))fail('الحقول المالية غير مصرح بها',403);
  if(r==='staff'&&data.schedule!==undefined){try{data.schedule=JSON.stringify(parseSchedule(data.schedule)??{});}catch(e:any){fail(e.message);}}
  if(r==='templates'&&!actorDepartments(u).includes(combined.department))fail('القسم خارج صلاحيتك',403);
  if(r==='events'&&(!Number.isInteger(combined.capacity??0)||(combined.capacity??0)<0))fail('عدد المقاعد عدد صحيح غير سالب');
  if(r==='events'&&updating&&combined.capacity>0){const occupied=(await db.eventLead.aggregate({where:{eventId:body.id,archivedAt:null,stage:{in:['DEPOSIT','REGISTERED','ATTENDED']}},_sum:{partySize:true}}))._sum.partySize??0;if(occupied>combined.capacity)fail('السعة أقل من المقاعد المحجوزة',409);}
  if(r==='staff'&&Number(combined.commissionRate)>100)fail('العمولة بين 0 و100');
  if(r==='services'&&(!Number.isInteger(combined.durationMinutes)||combined.durationMinutes<1||combined.durationMinutes>1440))fail('مدة الخدمة من 1 إلى 1440 دقيقة');
  if(r==='supplierOrders'&&(!Number.isInteger(combined.quantity)||combined.quantity<1))fail('كمية الطلب عدد صحيح موجب');
  if(['leaves','courseSessions'].includes(r)&&new Date(combined.endsAt)<=new Date(combined.startsAt))fail('وقت النهاية يجب أن يلي البداية');
  if(r==='leaves'&&u.role==='STAFF'&&combined.status!=='PENDING')fail('اعتماد الإجازة للإدارة',403);
  if(r==='collegeCourses'&&(!Number.isInteger(combined.capacity)||combined.capacity<1))fail('السعة يجب أن تكون عددًا صحيحًا موجبًا');
  if(r==='students'){
    if((combined.receivedDocuments??[]).some((v:string)=>!(combined.requiredDocuments??[]).includes(v)))fail('أضيفي المستند إلى قائمة المطلوب قبل تحديد استلامه');
    const c=await db.customer.findUniqueOrThrow({where:{id:combined.customerId}});data.name=c.name;data.phone=c.phone;data.email=c.email;
    if(await db.student.findFirst({where:{customerId:c.id,...(updating?{id:{not:body.id}}:{})}}))fail('للعميلة ملف طالبة موجود بالفعل',409);
    if(!c.departments.includes('COLLEGE'))await db.customer.update({where:{id:c.id},data:{departments:{push:'COLLEGE'}}});
  }
  if(r==='collegeCourses'&&!managers(u)&&u.role==='COLLEGE'){
    if(data.coordinatorId&&data.coordinatorId!==u.id)fail('تعيين المنسقة للإدارة',403);
    if(!updating)data.coordinatorId=u.id;
  }
  if(r==='enrollments'){
    if(u.role==='TRAINER'&&!updating)fail('التسجيل لمنسقة الكلية فقط',403);
    if(u.role==='TRAINER'&&Object.keys(data).some(k=>!['trainerNotes','certificateStatus'].includes(k)))fail('المدربة تعدّل ملاحظاتها والشهادة فقط',403);
    if(updating&&['studentId','courseId','fee'].some(k=>k in data&&String(data[k])!==String(previous[k])))fail('لا يمكن تغيير هوية أو سعر تسجيل قائم؛ سجلي إلغاءً مسببًا');
    const course=await db.collegeCourse.findUniqueOrThrow({where:{id:combined.courseId}});
    if(updating&&previous.status==='WITHDRAWN'&&combined.status!=='WITHDRAWN'&&await db.studentEnrollment.count({where:{courseId:course.id,archivedAt:null,status:{not:'WITHDRAWN'}}})>=course.capacity)fail('المجموعة مكتملة',409);
    if(!updating){
      if(await db.studentEnrollment.findFirst({where:{studentId:combined.studentId,courseId:combined.courseId,archivedAt:null}}))fail('الطالبة مسجلة في هذه المجموعة',409);
      const count=await db.studentEnrollment.count({where:{courseId:course.id,archivedAt:null,status:{not:'WITHDRAWN'}}});if(count>=course.capacity)fail('المجموعة مكتملة',409);
      const student=await db.student.findUniqueOrThrow({where:{id:combined.studentId}});
      const invoice=await db.invoice.create({data:{customerId:student.customerId,description:course.title,originalAmount:data.fee??course.fee,amount:data.fee??course.fee,department:'COLLEGE'}});data.invoiceId=invoice.id;
    }
  }
  if(r==='attendance'){
    const session=await db.courseSession.findUniqueOrThrow({where:{id:combined.sessionId}});const enrollment=await db.studentEnrollment.findUniqueOrThrow({where:{id:combined.enrollmentId}});
    if(session.courseId!==enrollment.courseId)fail('الطالبة ليست في مجموعة هذا اللقاء');
    if(combined.grade!=null&&(!Number.isInteger(combined.grade)||combined.grade>100))fail('التقييم من 0 إلى 100');
  }
  if(r==='eventLeads'){
    const event=await db.event.findUniqueOrThrow({where:{id:combined.eventId}});const c=await db.customer.findUniqueOrThrow({where:{id:combined.customerId}});
    if(!Number.isInteger(combined.partySize??1)||(combined.partySize??1)<1)fail('عدد الأشخاص عدد صحيح موجب');
    if(event.capacity>0&&['DEPOSIT','REGISTERED','ATTENDED'].includes(combined.stage)){const occupied=(await db.eventLead.aggregate({where:{eventId:event.id,archivedAt:null,stage:{in:['DEPOSIT','REGISTERED','ATTENDED']},...(updating?{id:{not:body.id}}:{})},_sum:{partySize:true}}))._sum.partySize??0;if(occupied+(combined.partySize??1)>event.capacity)fail('لا توجد مقاعد كافية في الإيفنت',409);}
    if(!updating&&await db.eventLead.findFirst({where:{eventId:event.id,customerId:c.id,archivedAt:null}}))fail('للعميلة تسجيل موجود في هذا الإيفنت',409);
    if(combined.packageId){const pkg=await db.eventPackage.findUniqueOrThrow({where:{id:combined.packageId}});if(pkg.eventId!==event.id)fail('الباقة لا تنتمي لهذا الإيفنت');}
    if(updating&&['customerId','eventId','originalPrice','discount','currency'].some(k=>k in data&&String(data[k])!==String(previous[k])))fail('البيانات المالية للتسجيل القائم ثابتة؛ استخدمي الإلغاء والتسجيل الصحيح');
    if(decimal(combined.discount).gt(combined.originalPrice))fail('الخصم يتجاوز السعر');
    if(decimal(combined.discount).gt(0)&&!combined.discountReason?.trim())fail('سبب الخصم مطلوب');
    if(combined.currency!==event.currency)fail('عملة التسجيل يجب أن تطابق عملة الإيفنت');
    const paid=previous?.invoiceId?(await db.invoice.findUniqueOrThrow({where:{id:previous.invoiceId}})).paidAmount:decimal(0);
    if(['DEPOSIT','REGISTERED','ATTENDED'].includes(combined.stage)&&(!decimal(paid).gt(0)||decimal(paid).lt(event.depositRequired)))fail('التسجيل يتطلب عربونًا فعليًا حسب إعداد الإيفنت');
    if(combined.attended&&combined.stage!=='ATTENDED')fail('اختاري مرحلة حضرت بعد اكتمال التسجيل');
    data.name=c.name;data.phone=c.phone;data.agreedAmount=decimal(combined.originalPrice).minus(combined.discount);
    if(!updating){const inv=await db.invoice.create({data:{customerId:c.id,description:event.name,originalAmount:combined.originalPrice,discount:combined.discount,discountReason:combined.discountReason,amount:data.agreedAmount,currency:combined.currency,department:'EVENT',dueAt:combined.nextPaymentAt}});data.invoiceId=inv.id;}
    if(!c.departments.includes('EVENT'))await db.customer.update({where:{id:c.id},data:{departments:{push:'EVENT'}}});
  }
  if(r==='invoices'){
    if(decimal(initialPayment).decimalPlaces()>2)fail('المبالغ تقبل منزلتين عشريتين فقط');
    if(combined.serviceId&&combined.department!=='SALON')fail('خدمة الصالون يجب أن ترتبط بفاتورة قسم الصالون');
    if(updating&&previous.status==='VOID')fail('الفاتورة ملغاة');
    if(!updating&&(decimal(initialPayment).gt(0)&&!key||decimal(initialPayment).lt(0)))fail('معرّف الفاتورة والدفعة الصحيحة مطلوبان');
    if(!updating){const existingPayment=await db.payment.findUnique({where:{idempotencyKey:`invoice:${key}`}});if(existingPayment)fail('تم تسجيل هذه الدفعة مسبقًا؛ راجعي الفاتورة',409);}
    if(decimal(combined.discount).gt(combined.originalAmount))fail('الخصم يتجاوز المبلغ');
    if(decimal(combined.discount).gt(0)&&!combined.discountReason?.trim())fail('سبب الخصم مطلوب');
    data.amount=decimal(combined.originalAmount).minus(combined.discount);
    if(decimal(initialPayment).gt(data.amount))fail('الدفعة الأولى تتجاوز المبلغ النهائي');
    if(updating&&decimal(previous.paidAmount).gt(data.amount))fail('المبلغ أقل من الدفعات المسجلة');
    if(updating&&['currency','customerId'].some(k=>k in data&&data[k]!==previous[k]))fail('لا يمكن تغيير العميلة أو العملة لفاتورة صادرة');
    if(updating&&(await db.studentEnrollment.findFirst({where:{invoiceId:body.id}})||await db.eventLead.findFirst({where:{invoiceId:body.id}}))&&['currency','customerId','department'].some(k=>k in data&&data[k]!==previous[k]))fail('هوية وعملة فاتورة التسجيل ثابتة');
    data.status=decimal(previous?.paidAmount).gte(data.amount)?'PAID':decimal(previous?.paidAmount).gt(0)?'PARTIAL':'UNPAID';
  }
  if(r==='payments'){
    if(!key)fail('معرّف الحركة مطلوب');
    const existing=await db.payment.findUnique({where:{idempotencyKey:key}});if(existing){if(existing.receivedById!==u.id||existing.invoiceId!==data.invoiceId||!decimal(existing.amount).eq(data.amount)||existing.kind!==data.kind)fail('معرّف حركة مستخدم',409);return existing;}
    const inv=await db.invoice.findUniqueOrThrow({where:{id:data.invoiceId}});if(inv.status==='VOID')fail('الفاتورة ملغاة');
    if(!decimal(data.amount).gt(0))fail('المبلغ يجب أن يكون موجبًا');
    if(data.kind==='REFUND'&&(!owners(u)||!data.notes?.trim()))fail('الاسترداد للإدارة مع تسجيل السبب',403);
    if(data.receiptDocumentId){const doc=await db.customerDocument.findUniqueOrThrow({where:{id:data.receiptDocumentId}});if(doc.customerId!==inv.customerId)fail('الإيصال لا يتبع العميلة');}
    data.idempotencyKey=key;data.receivedById=u.id;
  }
  if(r==='products'&&data.imageUrl&&!/^\/(?!\/)[\w/.-]+$/.test(data.imageUrl))fail('استخدمي مسار صورة محلي آمن');
  if(r==='stockMovements'){
    if(!key)fail('معرّف الحركة مطلوب');
    const existing=await db.stockMovement.findUnique({where:{idempotencyKey:key}});if(existing){if(existing.actorId!==u.id||existing.productId!==data.productId||existing.kind!==data.kind||Math.abs(existing.quantity)!==Math.abs(data.quantity))fail('معرّف حركة مستخدم',409);return existing;}
    if(!Number.isInteger(data.quantity)||data.quantity===0)fail('الكمية عدد صحيح غير صفري');
    if(data.kind!=='ADJUSTMENT'&&data.quantity<0)fail('أدخلي كمية موجبة لهذه الحركة');
    const incoming=['PURCHASE','RETURN'].includes(data.kind);const outgoing=['SALE','SALON_USE','KIT','DAMAGE'].includes(data.kind);
    data.quantity=outgoing?-Math.abs(data.quantity):incoming?Math.abs(data.quantity):data.quantity;
    const balance=(await db.stockMovement.aggregate({where:{productId:data.productId,batch:data.batch},_sum:{quantity:true}}))._sum.quantity??0;
    if(balance+data.quantity<0)fail('الكمية غير كافية في هذه التشغيلة',409);
    if(['SALE','KIT'].includes(data.kind)&&!data.customerId)fail('حددي العميلة أو الطالبة');
    if(['SALE','KIT','SALON_USE'].includes(data.kind)){
      const batch=await db.stockMovement.findFirst({where:{productId:data.productId,batch:data.batch,expiresAt:{not:null}},orderBy:{expiresAt:'asc'}});
      if(batch?.expiresAt&&batch.expiresAt<new Date())fail('التشغيلة منتهية الصلاحية');
    }
    if(data.kind==='SALE'){
      const product=await db.product.findUniqueOrThrow({where:{id:data.productId}});const amount=decimal(product.salePrice).mul(Math.abs(data.quantity));
      const invoice=await db.invoice.create({data:{customerId:data.customerId,description:`${product.name} × ${Math.abs(data.quantity)}`,originalAmount:amount,amount,currency:product.currency,department:'PRODUCTS'}});data.invoiceId=invoice.id;
    }
    data.actorId=u.id;data.idempotencyKey=key;
  }
  if(r==='expenses')data.status=combined.paidAt?'PAID':'DUE';
  if(r==='workingHours'&&(!Number.isInteger(combined.dayOfWeek)||combined.dayOfWeek<0||combined.dayOfWeek>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(combined.openTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(combined.closeTime)||combined.active&&combined.openTime>=combined.closeTime))fail('ساعات العمل غير صالحة');
  if(r==='laserPlans'&&(!Number.isInteger(combined.sessionsTotal)||combined.sessionsTotal<1))fail('عدد الجلسات موجب وصحيح');
  if(r==='laserPlans'&&updating&&await db.laserSession.count({where:{planId:body.id,archivedAt:null}})>combined.sessionsTotal)fail('عدد الجلسات أقل من المنفّذ');
  if(r==='laserSessions'){const plan=await db.laserPlan.findUniqueOrThrow({where:{id:combined.planId}});if(await db.laserSession.count({where:{planId:plan.id,archivedAt:null,...(updating?{id:{not:body.id}}:{})}})>=plan.sessionsTotal)fail('اكتملت جلسات الباقة',409);}
  if(r==='appointments'){
    if(u.role==='STAFF'&&combined.staffId!==u.staffId)fail('يمكنك إدارة مواعيدك فقط',403);
    const service=await db.service.findUniqueOrThrow({where:{id:combined.serviceId}});
    if(!service.active&&!updating)fail('الخدمة غير فعالة');
    const changedService=!updating||data.serviceId&&data.serviceId!==previous.serviceId;
    const duration=data.durationMinutes??(changedService?service.durationMinutes:previous.durationMinutes??service.durationMinutes);
    const price=data.price??(changedService?service.price:previous.price??service.price);
    if(!managers(u)&&(Number(duration)!==Number(changedService?service.durationMinutes:previous.durationMinutes??service.durationMinutes)||!decimal(price).eq(changedService?service.price:previous.price??service.price)))fail('تعديل سعر الخدمة أو مدتها للإدارة',403);
    if(!Number.isInteger(duration)||duration<1||duration>1440)fail('مدة الخدمة من 1 إلى 1440 دقيقة');
    data.durationMinutes=duration;data.price=price;
    if(['SCHEDULED','CONFIRMED','PENDING_REPLY','COMPLETED'].includes(combined.status??'SCHEDULED')){
      await assertNoOverlap(tx,new Date(combined.startsAt),duration,previous?.id,combined.staffId);
      if(combined.staffId)await assertStaffAvailable(tx,combined.staffId,new Date(combined.startsAt),duration);
    }
    if(combined.status==='COMPLETED'&&(!combined.sessionNotes?.trim()||(financial(u)&&!combined.invoiceId)))fail('لإنهاء الخدمة سجلي ملاحظات الجلسة وفاتورتها');
    if(combined.invoiceId){const inv=await db.invoice.findUniqueOrThrow({where:{id:combined.invoiceId}});if(inv.customerId!==combined.customerId)fail('الفاتورة لا تتبع العميلة');}
    if(combined.staffId&&await db.employeeLeave.findFirst({where:{staffId:combined.staffId,status:'APPROVED',startsAt:{lte:combined.startsAt},endsAt:{gte:combined.startsAt}}}))fail('الموظفة في إجازة',409);
  }
  const result=updating?await model(db,r).update({where:{id:body.id},data}):await model(db,r).create({data});
  if(r==='invoices'&&!updating&&decimal(initialPayment).gt(0)){const payment=await db.payment.create({data:{invoiceId:result.id,amount:decimal(initialPayment),method:paymentMethod,kind:'PAYMENT',notes:paymentNote,receivedById:u.id,idempotencyKey:`invoice:${key}`}});await refreshInvoice(db,result.id);await recordAudit(db,u,'CREATE','payments',payment.id,null,payment);result.paidAmount=decimal(initialPayment);result.status=decimal(initialPayment).eq(result.amount)?'PAID':'PARTIAL';}
  if(r==='customers'&&updating){await db.student.updateMany({where:{customerId:result.id},data:{name:result.name,phone:result.phone,email:result.email}});await db.eventLead.updateMany({where:{customerId:result.id},data:{name:result.name,phone:result.phone}});}
  if(r==='payments')await refreshInvoice(db,result.invoiceId);
  if(r==='invoices'&&updating){await db.studentEnrollment.updateMany({where:{invoiceId:result.id},data:{fee:result.amount}});await db.eventLead.updateMany({where:{invoiceId:result.id},data:{agreedAmount:result.amount,originalPrice:result.originalAmount,discount:result.discount,discountReason:result.discountReason}});}
  if(r==='tasks'){
    const next=await db.task.findFirst({where:{customerId:result.customerId,completedAt:null,archivedAt:null,dueAt:{not:null}},orderBy:{dueAt:'asc'}});
    const latest=await db.task.findFirst({where:{customerId:result.customerId,archivedAt:null},orderBy:{contactedAt:'desc'}});
    await db.customer.update({where:{id:result.customerId},data:{lastContactAt:latest?.contactedAt??null,followUpAt:next?.dueAt??null}});
  }
  if(r==='appointments'&&result.status==='COMPLETED')await db.customer.update({where:{id:result.customerId},data:{lastVisitAt:result.startsAt,relationshipStatus:'ACTIVE'}});
  if(r==='appointments'&&result.nextFollowUpAt&&(!previous?.nextFollowUpAt||+previous.nextFollowUpAt!==+result.nextFollowUpAt))await db.task.create({data:{customerId:result.customerId,ownerId:(await db.customer.findUniqueOrThrow({where:{id:result.customerId}})).ownerId??u.id,reason:'متابعة بعد الخدمة',nextAction:'دعوة للعودة',dueAt:result.nextFollowUpAt,outcome:'SCHEDULED',createdById:u.id}});
  await recordAudit(db,u,updating?'UPDATE':'CREATE',r,result.id,previous,result);
  return sanitize(u,r,result);
 });
}

export async function customerProfile(u:Actor,id:string){
 if(!allowed(u,'customers'))fail('غير مصرح',403);
 const customer=await prisma.customer.findFirst({where:{AND:[{id},customerScope(u)]}});if(!customer)fail('غير موجود',404);
 const related:Record<string,any>={};
 for(const r of ['tasks','appointments','laserPlans','laserSessions','hairSessions','invoices','payments','notes','documents','students','enrollments','attendance','eventLeads','stockMovements'])if(allowed(u,r))related[r]=await listRecords(u,r,new URL(`http://local/?customerId=${encodeURIComponent(id)}&limit=100`));
 const totals=financial(u)?await prisma.invoice.groupBy({by:['currency'],where:{customerId:id,status:{not:'VOID'}},_sum:{amount:true,paidAmount:true}}):[];
 await prisma.auditLog.create({data:{actorId:u.id,actorName:u.name,actorRole:u.role,action:'VIEW',entity:'customers',entityId:id}});
 const history=managers(u)?await prisma.auditLog.findMany({where:{AND:[scope(u,'audit'),{OR:[{entity:'customers',entityId:id},...Object.entries(related).map(([entity,v])=>({entity,entityId:{in:v.rows.map((x:any)=>x.id)}}))]}]},orderBy:{createdAt:'desc'},take:100}):[];
 return {customer:sanitize(u,'customers',customer),related,totals,history};
}
export async function dashboard(u:Actor){
 if(u.role==='CUSTOMER')fail('غير مصرح',403);
 const now=new Date();const {start:today,end}=salonDayRange(now);
 const result:any={};
 if(allowed(u,'students'))result.waitingStudents=(await listRecords(u,'students',new URL('http://local/?status=WAITING_DOCUMENTS&limit=12'))).rows;
 if(allowed(u,'eventLeads'))result.waitingEvents=(await listRecords(u,'eventLeads',new URL('http://local/?status=WAITING_REPLY&limit=12'))).rows;
 if(allowed(u,'tasks')){result.overdue=await prisma.task.count({where:{AND:[scope(u,'tasks'),{dueAt:{lt:now},completedAt:null,archivedAt:null}]}});result.tasks=await prisma.task.findMany({where:{AND:[scope(u,'tasks'),{completedAt:null,archivedAt:null,dueAt:{lte:end}}]},orderBy:{dueAt:'asc'},take:12});}
 if(allowed(u,'appointments'))result.appointmentCount=await prisma.appointment.count({where:{AND:[scope(u,'appointments'),{startsAt:{gte:today,lt:end},archivedAt:null}]}});
 if(allowed(u,'appointments'))result.appointments=await prisma.appointment.findMany({where:{AND:[scope(u,'appointments'),{startsAt:{gte:today,lt:end},archivedAt:null}]},orderBy:{startsAt:'asc'},take:30});
 for(const r of ['tasks','appointments'])if(result[r])for(const row of result[r]){
   const customer=await prisma.customer.findUnique({where:{id:row.customerId},select:{name:true}});row._labels={customerId:customer?.name??'—'};
   if(row.serviceId)row._labels.serviceId=(await prisma.service.findUnique({where:{id:row.serviceId},select:{name:true}}))?.name??'—';
   if(row.ownerId)row._labels.ownerId=(await prisma.user.findFirst({where:{AND:[{id:row.ownerId},scope(u,'team')]},select:{name:true}}))?.name??'غير معروضة';
   Object.assign(row,sanitize(u,r,row));if(!financial(u))delete row.invoiceId;
   if(row.staffId)row._labels.staffId=(await prisma.staff.findUnique({where:{id:row.staffId},select:{name:true}}))?.name??'—';
 }
 if(allowed(u,'customers')){result.newCustomers=await prisma.customer.count({where:{AND:[customerScope(u),{createdAt:{gte:today},archivedAt:null}]}});result.totalCustomers=await prisma.customer.count({where:{AND:[customerScope(u),{archivedAt:null}]}});}
 if(financial(u)){
   result.dueInvoices=(await listRecords(u,'invoices',new URL('http://local/?status=SOON&limit=12'))).rows;
   result.finance=await prisma.invoice.groupBy({by:['currency','department'],where:{status:{not:'VOID'}},_sum:{amount:true,paidAmount:true},_count:true});
   result.overdueInvoices=await prisma.invoice.count({where:{dueAt:{lt:now},status:{in:['UNPAID','PARTIAL']}}});
   const month=salonMonthStart(now);
   // Payment totals are grouped by invoice currency, without currency conversion.
   result.receipts=await prisma.$queryRaw`SELECT i.currency, p.kind, SUM(p.amount) AS amount, SUM(CASE WHEN p."paidAt" >= ${today} THEN p.amount ELSE 0 END) AS today FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" WHERE p."voidedAt" IS NULL AND p."paidAt" >= ${month} GROUP BY i.currency,p.kind`;
   result.sales=await prisma.$queryRaw`SELECT currency,department,SUM(amount) AS month,SUM(CASE WHEN "createdAt">=${today} THEN amount ELSE 0 END) AS today FROM "Invoice" WHERE status<>'VOID' AND "createdAt">=${month} GROUP BY currency,department`;
   result.commissions=u.role==='GOD'
    ?await prisma.$queryRaw`SELECT s.id,s.name,i.currency,SUM(CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END) AS sales,SUM((CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END)*s."commissionRate"/100) AS commission FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" JOIN "User" u ON u.id=p."receivedById" JOIN "Staff" s ON s.id=u."staffId" WHERE p."voidedAt" IS NULL AND p."paidAt">=${month} GROUP BY s.id,s.name,i.currency`
    :await prisma.$queryRaw`SELECT s.id,s.name,i.currency,SUM(CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END) AS sales,SUM((CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END)*s."commissionRate"/100) AS commission FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" JOIN "User" u ON u.id=p."receivedById" JOIN "Staff" s ON s.id=u."staffId" WHERE p."voidedAt" IS NULL AND p."paidAt">=${month} AND u.role<>'GOD' GROUP BY s.id,s.name,i.currency`;
 }
 if(allowed(u,'products')){
   const stocks=await prisma.stockMovement.groupBy({by:['productId'],_sum:{quantity:true},_max:{createdAt:true}});const products=await prisma.product.findMany({where:{archivedAt:null}});
   result.lowStock=products.map(p=>({id:p.id,name:p.name,minimum:p.minimum,stock:stocks.find(s=>s.productId===p.id)?._sum.quantity??0})).filter(p=>p.stock<=p.minimum);
   const batches=await prisma.stockMovement.groupBy({by:['productId','batch'],_sum:{quantity:true},_min:{expiresAt:true}});
   result.expiring=batches.filter(b=>(b._sum.quantity??0)>0&&b._min.expiresAt&&b._min.expiresAt<=new Date(Date.now()+30*86400000));
   result.stockActivity=products.map(p=>({id:p.id,name:p.name,lastMovement:stocks.find(s=>s.productId===p.id)?._max.createdAt??null,stagnant:!stocks.find(s=>s.productId===p.id)?._max.createdAt||stocks.find(s=>s.productId===p.id)!._max.createdAt!<new Date(Date.now()-90*86400000)}));
   result.fastMoving=await prisma.stockMovement.groupBy({by:['productId'],where:{kind:'SALE',createdAt:{gte:new Date(Date.now()-30*86400000)}},_sum:{quantity:true},orderBy:{_sum:{quantity:'asc'}},take:10});
   result.pendingOrders=await prisma.supplierOrder.count({where:{status:'PENDING',expectedAt:{lt:now}}});
 }
 if(managers(u)){
   const visibleOwners:any=u.role==='GOD'?{}:{owner:{role:{not:'GOD'}}};
   result.performance=await prisma.task.groupBy({by:['ownerId','outcome'],where:{archivedAt:null,...visibleOwners},_count:true});
   result.closure={closed:await prisma.task.count({where:{outcome:'CLOSED',archivedAt:null,...visibleOwners}}),total:await prisma.task.count({where:{archivedAt:null,...visibleOwners}})};
 }
 return result;
}
