import {verifyOctoberBrowser} from './crm-october-browser.mjs';
import {verifySecurityProbes} from './crm-security-probes.mjs';
import {verifyOctober} from './crm-october-regression.mjs';
import {verifyReferenceApi,verifyReferenceBrowser} from './crm-reference-regression.mjs';
import {verifyScheduleEditor} from './crm-browser-schedule.mjs';
import {verifyBrowserWorkflows} from './crm-browser-workflows.mjs';
import {verifyNewWorkflows} from './crm-new-workflows.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {hash} from 'bcryptjs';
import {SignJWT} from 'jose';
import {chromium} from '@playwright/test';
const dburl=new URL(process.env.AUDIT_DATABASE_URL??'http://missing');
if(!['postgres:','postgresql:'].includes(dburl.protocol)||!['localhost','127.0.0.1'].includes(dburl.hostname)||!dburl.pathname.startsWith('/audit_'))throw new Error('Disposable local audit database required');
const db=new PrismaClient({datasources:{db:{url:dburl.toString()}}});if(await db.user.count())throw new Error('Fresh empty audit database required');
const output=process.env.CRM_TEST_DIRECTORY??resolve('audit-results/crm');mkdirSync(output,{recursive:true});
const secret=randomBytes(32).toString('hex'),password=randomBytes(15).toString('hex');
const roles=['GOD','ADMIN','MANAGER','ACCOUNTANT','RECEPTIONIST','STAFF','SALES','COLLEGE','TRAINER','EVENT_MANAGER','INVENTORY','VIEWER','CUSTOMER'];
const users={},cookies={};const results=[];let logs='',browser;
function check(name,pass,evidence){results.push({name,passed:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name}${pass?'':': '+JSON.stringify(evidence)}`);}
async function test(name,fn){try{const result=await fn();check(name,result!==false);}catch(e){check(name,false,e.message);}}
const staff=await db.staff.create({data:{name:'موظفة اختبار',commissionRate:10}});
for(const role of roles){const u=await db.user.create({data:{name:`اختبار ${role}`,username:`test_${role}`,role,passwordHash:await hash(password,4),...(role==='STAFF'?{staffId:staff.id}:{})}});users[role]=u;cookies[role]=await new SignJWT({sub:u.id,version:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));}
const customers={};for(const [i,role] of ['STAFF','SALES','ADMIN'].entries())customers[role]=await db.customer.create({data:{name:`عميلة ${role}`,phone:`97250000100${i}`,ownerId:users[role].id}});
const service=await db.service.create({data:{name:'خدمة اختبار',price:100,durationMinutes:60}});
await db.staff.update({where:{id:staff.id},data:{services:[service.id]}});
for(let dayOfWeek=0;dayOfWeek<7;dayOfWeek++)await db.workingHour.create({data:{dayOfWeek,openTime:'09:00',closeTime:'18:00',active:true}});
const env={...process.env,DATABASE_URL:dburl.toString(),DIRECT_URL:dburl.toString(),SESSION_SECRET:secret,NODE_ENV:'production',WHATSAPP_ACCESS_TOKEN:'',WHATSAPP_PHONE_NUMBER_ID:'',RESEND_API_KEY:'',BOOKING_DEV_OTP:'false',CRON_SECRET:'',FORCE_SECURE_COOKIES:'false'};
const port=3297,base=`http://localhost:${port}`;
const servers=[port,port+1].map(p=>spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(p)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']}));
for(const server of servers){server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);}
async function req(path,{role='ADMIN',method='GET',body,headers={},instance=0,cookie}={}){
 const r=await fetch(`http://localhost:${port+instance}${path}`,{method,redirect:'manual',headers:{...(role?{Cookie:`salon_session=${cookies[role]}`}:{ }),...(cookie?{Cookie:cookie}:{}),...(body!==undefined&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:body instanceof FormData?body:typeof body==='string'?body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,headers:r.headers};
}
async function create(r,body,role='ADMIN'){const x=await req(`/api/crm/${r}`,{method:'POST',body,role});if(x.status!==200)throw new Error(`${r}: ${x.status} ${JSON.stringify(x.data)}`);return x.data;}
const customerData=(phone,name='عميلة جديدة')=>({name,phone,departments:['SALON'],source:'WHATSAPP',relationshipStatus:'NEW',ownerId:users.ADMIN.id});
const invoiceData=(c,amount=100)=>({customerId:c,description:'فاتورة اختبار',originalAmount:amount,discount:0,currency:'ILS',department:'SALON'});
const taskData=c=>({customerId:c,ownerId:users.ADMIN.id,channel:'WHATSAPP',reason:'التواصل',summary:'تجربة',outcome:'NEW',priority:'NORMAL'});
const paymentData=(invoiceId,amount=50)=>({invoiceId,amount,method:'CASH',kind:'PAYMENT',idempotencyKey:randomUUID()});
try{
 let ready=false;for(let i=0;i<90;i++){try{if((await req('/login',{role:null})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error('Server startup failed');
 for(const route of ['/login','/book'])check(`Public page ${route}`,(await req(route,{role:null})).status===200);
 check('Anonymous home redirects',(await req('/',{role:null})).status===307);
 for(const route of ['/api/crm/customers','/api/crm/tasks','/api/crm/dashboard','/api/crm/profile?id=x','/api/crm-documents?id=x','/api/data/customers','/api/service-requests','/api/audit-logs','/api/booking/data'])check(`Anonymous blocked ${route}`,(await req(route,{role:null})).status===401);
 const matrix={MANAGER:['customers','tasks','appointments','services','laserPlans','laserSessions','hairSessions','staff','leaves','team','notes','documents','workingHours','templates'],ACCOUNTANT:['customers','invoices','payments','expenses','team','documents'],RECEPTIONIST:['customers','tasks','appointments','services','team','notes'],STAFF:['customers','tasks','appointments','services','laserPlans','laserSessions','hairSessions','notes','documents','team','staff','leaves'],SALES:['customers','tasks','notes','documents','team','templates'],COLLEGE:['customers','tasks','students','collegeCourses','enrollments','courseSessions','attendance','notes','documents','team','templates'],TRAINER:['customers','students','collegeCourses','enrollments','courseSessions','attendance','notes','documents','team'],EVENT_MANAGER:['customers','tasks','events','eventPackages','eventLeads','notes','documents','team','templates'],INVENTORY:['products','stockMovements','supplierOrders','customers','team'],VIEWER:['customers','tasks','appointments','services','team']};
 const resources=['customers','tasks','appointments','services','laserPlans','laserSessions','hairSessions','students','collegeCourses','enrollments','courseSessions','attendance','events','eventPackages','eventLeads','products','stockMovements','supplierOrders','invoices','payments','expenses','staff','leaves','users','workingHours','templates','notes','documents','audit','team'];
 for(const role of roles)for(const r of resources){const permitted=['GOD','ADMIN'].includes(role)||(matrix[role]??[]).includes(r);const x=await req(`/api/crm/${r}`,{role});check(`Read authorization ${role}/${r}`,x.status===(permitted?200:403),{status:x.status,data:x.data?.error});}
 for(const role of ['STAFF','SALES']){const x=await req('/api/crm/customers',{role});check(`${role} sees only assigned customers`,x.data.rows?.length===1&&x.data.rows[0].id===customers[role].id);check(`${role} direct profile IDOR blocked`,(await req(`/api/crm/profile?id=${customers.ADMIN.id}`,{role})).status===404);check(`${role} legacy API uses same scope`,(await req('/api/data/customers',{role})).data.rows?.length===1);}
 for(const role of roles.filter(r=>r!=='GOD'&&r!=='CUSTOMER')){
  const team=await req('/api/crm/team',{role});
  check(`God account hidden in team for ${role}`,team.status===200&&team.data.rows.every(x=>x.role!=='GOD'&&x.id!==users.GOD.id));
 }
 check('Admin user list excludes God account',(await req('/api/crm/users')).data.rows.every(x=>x.id!==users.GOD.id));
 check('Legacy user endpoint excludes God account',(await req('/api/data/users')).data.rows.every(x=>x.id!==users.GOD.id));
 check('God user can see God account',(await req('/api/crm/users',{role:'GOD'})).data.rows.some(x=>x.id===users.GOD.id));
 const godCustomer=await db.customer.create({data:{name:'God owned business customer',phone:'972500001099',ownerId:users.GOD.id}});
 const godCustomerForAdmin=(await req('/api/crm/customers?q='+encodeURIComponent('God owned business customer'))).data.rows.find(x=>x.id===godCustomer.id);
 check('God owner identity hidden on business rows',godCustomerForAdmin&&godCustomerForAdmin._labels.ownerId==='غير معروضة',{row:godCustomerForAdmin});
 const forbiddenGodAssignment=await req('/api/crm/customers',{method:'PATCH',body:{id:customers.ADMIN.id,ownerId:users.GOD.id}});
 check('Non-God cannot assign records to God account',forbiddenGodAssignment.status===403,{status:forbiddenGodAssignment.status,data:forbiddenGodAssignment.data});
 check('Non-God can edit business data while hidden owner remains unchanged',(await req('/api/crm/customers',{method:'PATCH',body:{id:godCustomer.id,ownerId:users.GOD.id,notes:'Business note'}})).status===200);
 const godStaff=await db.staff.create({data:{name:'Restricted account staff'}});await db.user.update({where:{id:users.GOD.id},data:{staffId:godStaff.id}});
 check('Admin staff list excludes God-linked staff',!(await req('/api/crm/staff')).data.rows.some(x=>x.id===godStaff.id));
 check('Admin staff cards exclude God role',!(await req('/api/crm/section-summary?section=staff')).data.team.some(x=>x.accountRole==='GOD'));
 check('God staff cards include own role',(await req('/api/crm/section-summary?section=staff',{role:'GOD'})).data.team.some(x=>x.accountRole==='GOD'));
 const hiddenAudit=await db.auditLog.create({data:{actorId:users.GOD.id,actorName:users.GOD.name,actorRole:'GOD',action:'VIEW',entity:'customers',entityId:customers.ADMIN.id}});
 check('Admin audit list hides God activity',!(await req('/api/crm/audit')).data.rows.some(x=>x.id===hiddenAudit.id));
 check('Customer history hides God activity',!(await req(`/api/crm/profile?id=${customers.ADMIN.id}`)).data.history.some(x=>x.id===hiddenAudit.id));
 check('God audit includes own activity',(await req('/api/crm/audit',{role:'GOD'})).data.rows.some(x=>x.id===hiddenAudit.id));
 check('Unknown and prototype resource safe',(await req('/api/crm/toString')).status===404);
 check('Malformed JSON returns 400',(await req('/api/crm/customers',{method:'POST',body:'{'})).status===400);
 check('Cross-site mutation blocked',(await req('/api/crm/customers',{method:'POST',body:customerData('972500009001'),headers:{Origin:'https://evil.example'}})).status===403);
 check('Fetch-site CSRF blocked',(await req('/api/crm/customers',{method:'POST',body:customerData('972500009001'),headers:{'Sec-Fetch-Site':'cross-site'}})).status===403);
 check('Customer mass assignment rejected',(await req('/api/crm/customers',{method:'POST',body:{...customerData('972500009001'),admin:true}})).status===400);
 let main=await create('customers',customerData('050-123-4567','عميلة موحدة'));
 check('Canonical local phone normalized',main.phone==='972501234567');
 check('Equivalent international phone rejected',(await req('/api/crm/customers',{method:'POST',body:customerData('+972 50 123 4567')})).status===409);
 check('Viewer cannot write',(await req('/api/crm/customers',{role:'VIEWER',method:'POST',body:customerData('972500009002')})).status===403);
 check('Sales cannot reassign ownership',(await req('/api/crm/customers',{role:'SALES',method:'PATCH',body:{id:customers.SALES.id,ownerId:users.ADMIN.id}})).status===403);
 check('Assigned staff cannot mutate another profile',(await req('/api/crm/customers',{role:'STAFF',method:'PATCH',body:{id:main.id,name:'forbidden'}})).status===404);
 check('Follow-up date mandatory',(await req('/api/crm/tasks',{method:'POST',body:{...taskData(main.id),outcome:'FUTURE'}})).status===400);
 check('Follow-up next action mandatory',(await req('/api/crm/tasks',{method:'POST',body:{...taskData(main.id),outcome:'FUTURE',dueAt:new Date().toISOString()}})).status===400);
 const task=await create('tasks',{...taskData(main.id),outcome:'PROMISED_PAYMENT',nextAction:'تحصيل العربون',dueAt:new Date(Date.now()-60000).toISOString(),priority:'HIGH'});
 check('Overdue task filter',(await req('/api/crm/tasks?status=OVERDUE')).data.rows.some(x=>x.id===task.id));
 check('Promise-to-pay filter',(await req('/api/crm/tasks?status=PROMISED_PAYMENT')).data.rows.some(x=>x.id===task.id));
 check('No automated reminders queued',await db.reminder.count({where:{taskId:task.id}})===0);
 check('Removed scheduler unavailable',(await req('/api/crm-reminders',{method:'POST'})).status===404);
 const invoice=await create('invoices',invoiceData(main.id));
 const concurrent=await Promise.all([0,1].map(instance=>req('/api/crm/payments',{method:'POST',body:paymentData(invoice.id,70),instance})));
 check('Concurrent payments cannot exceed balance',concurrent.filter(x=>x.status===200).length===1,concurrent.map(x=>x.status));
 check('Failed payment transaction rolls back',Number((await db.invoice.findUnique({where:{id:invoice.id}})).paidAmount)===70&&await db.payment.count({where:{invoiceId:invoice.id}})===1);
 const p=await create('payments',paymentData(invoice.id,30));
 check('Fully paid state',(await db.invoice.findUnique({where:{id:invoice.id}})).status==='PAID');
 check('Payment cannot be edited',(await req('/api/crm/payments',{method:'PATCH',body:{id:p.id,amount:3}})).status===409);
 check('Payment cannot be deleted',(await req('/api/crm/payments',{method:'DELETE',body:{id:p.id}})).status===405);
 check('Accountant cannot void payment',(await req('/api/crm/payments',{role:'ACCOUNTANT',method:'PATCH',body:{id:p.id,operation:'void',reason:'سبب الاختبار'}})).status===403);
 check('Void requires reason',(await req('/api/crm/payments',{method:'PATCH',body:{id:p.id,operation:'void'}})).status===400);
 check('Admin void retains row',(await req('/api/crm/payments',{method:'PATCH',body:{id:p.id,operation:'void',reason:'خطأ في التسجيل'}})).status===200&&(await db.payment.findUnique({where:{id:p.id}})).voidedAt!==null);
 check('Balance restored after void',Number((await db.invoice.findUnique({where:{id:invoice.id}})).paidAmount)===70);
 const ip=paymentData(invoice.id,10);await create('payments',ip);await create('payments',ip);check('Idempotent payment retry',await db.payment.count({where:{idempotencyKey:ip.idempotencyKey}})===1);
 check('Refund cannot exceed received amount',(await req('/api/crm/payments',{method:'POST',body:{...paymentData(invoice.id,90),kind:'REFUND',notes:'استرداد'}})).status===400);
 await create('payments',{...paymentData(invoice.id,10),kind:'REFUND',notes:'استرداد جزئي'});check('Refund reduces paid amount',Number((await db.invoice.findUnique({where:{id:invoice.id}})).paidAmount)===70);
 const product=await create('products',{name:'منتج اختبار',category:'شعر',purchasePrice:10,salePrice:20,currency:'ILS',minimum:1,purpose:'SALE'});
 const move=(kind,quantity,batch='B1')=>({productId:product.id,kind,quantity,batch,reason:'اختبار حركة مخزون',idempotencyKey:randomUUID()});
 check('Negative initial stock blocked',(await req('/api/crm/stockMovements',{method:'POST',body:move('SALE',1)})).status===409);
 await create('stockMovements',move('PURCHASE',5));
 const stock=await Promise.all([0,1].map(instance=>req('/api/crm/stockMovements',{method:'POST',body:{...move('SALE',4),customerId:main.id},instance})));
 check('Concurrent stock sales cannot oversell',stock.filter(x=>x.status===200).length===1,stock.map(x=>x.status));
 check('Product quantity derived from movements',(await req('/api/crm/products')).data.rows.find(x=>x.id===product.id).stock===1);
 check('Sale creates linked invoice',await db.stockMovement.count({where:{productId:product.id,invoiceId:{not:null}}})===1);
 check('Direct stock overwrite rejected',(await req('/api/crm/products',{method:'PATCH',body:{id:product.id,stock:999}})).status===400);
 await create('stockMovements',{...move('PURCHASE',2,'EXPIRED'),expiresAt:new Date(Date.now()-86400000).toISOString()});
 check('Expired batch cannot be sold',(await req('/api/crm/stockMovements',{method:'POST',body:{...move('SALE',1,'EXPIRED'),customerId:main.id}})).status===400);
 const course=await create('collegeCourses',{title:'كورس اختبار',fee:200,capacity:1,status:'OPEN',trainerId:users.TRAINER.id});
 const student=await create('students',{customerId:main.id,status:'INTERESTED',interest:'HIGH'});
 check('Student links canonical customer',student.customerId===main.id&&await db.customer.count({where:{phone:main.phone}})===1);
 const enrollment=await create('enrollments',{studentId:student.id,courseId:course.id,fee:200,status:'REGISTERED',certificateStatus:'PENDING'});
 const otherStudent=await create('students',{customerId:customers.ADMIN.id,status:'INTERESTED',interest:'HIGH'});
 check('Course capacity enforced',(await req('/api/crm/enrollments',{method:'POST',body:{studentId:otherStudent.id,courseId:course.id,fee:200,status:'REGISTERED',certificateStatus:'PENDING'}})).status===409);
 const session=await create('courseSessions',{courseId:course.id,title:'لقاء أول',startsAt:'2027-02-01T09:00:00.000Z',endsAt:'2027-02-01T11:00:00.000Z'});
 await create('attendance',{sessionId:session.id,enrollmentId:enrollment.id,status:'PRESENT',grade:90},'TRAINER');
 check('Trainer can access assigned group',(await req('/api/crm/collegeCourses',{role:'TRAINER'})).data.rows.some(x=>x.id===course.id));
 check('Trainer cannot change tuition',(await req('/api/crm/enrollments',{role:'TRAINER',method:'PATCH',body:{id:enrollment.id,fee:1}})).status===403);
 const event=await create('events',{name:'دبي',currency:'AED',depositRequired:50,managerId:users.EVENT_MANAGER.id});const otherEvent=await create('events',{name:'آخر',currency:'ILS'});
 const pkg=await create('eventPackages',{eventId:event.id,name:'VIP',price:300});
 const eventBody={customerId:main.id,eventId:event.id,packageId:pkg.id,stage:'NEW',region:'DUBAI',originalPrice:300,discount:0,currency:'AED',certificateStatus:'PENDING'};
 check('Event package must match event',(await req('/api/crm/eventLeads',{method:'POST',body:{...eventBody,eventId:otherEvent.id}})).status===400);
 check('Unpaid registration prohibited',(await req('/api/crm/eventLeads',{method:'POST',body:{...eventBody,stage:'REGISTERED'}})).status===400);
 const lead=await create('eventLeads',eventBody);await create('payments',paymentData(lead.invoiceId,50));
 check('Paid deposit permits registration',(await req('/api/crm/eventLeads',{method:'PATCH',body:{id:lead.id,stage:'REGISTERED'}})).status===200);
 check('Event manager sees only assigned events',(await req('/api/crm/events',{role:'EVENT_MANAGER'})).data.rows.every(x=>x.id===event.id));
 const future='2027-01-12T10:00:00.000Z';const appointmentBody={customerId:main.id,serviceId:service.id,staffId:staff.id,startsAt:future,status:'SCHEDULED'};
 const bookings=await Promise.all([0,1].map(instance=>req('/api/crm/appointments',{method:'POST',body:appointmentBody,instance})));
 check('Concurrent bookings admit exactly one',bookings.filter(x=>x.status===200).length===1,bookings.map(x=>x.status));
 const appointment=bookings.find(x=>x.status===200).data;
 check('Appointment list displays the service name',(await req('/api/crm/appointments')).data.rows.find(x=>x.id===appointment.id)?._labels.serviceId===service.name);
 check('Completion requires invoice and session notes',(await req('/api/crm/appointments',{method:'PATCH',body:{id:appointment.id,status:'COMPLETED'}})).status===400);
 check('Service completion records visit',(await req('/api/crm/appointments',{method:'PATCH',body:{id:appointment.id,status:'COMPLETED',invoiceId:invoice.id,sessionNotes:'تمت الخدمة',nextFollowUpAt:'2027-02-12T10:00:00.000Z'}})).status===200&&(await db.customer.findUnique({where:{id:main.id}})).lastVisitAt!==null);
 const plan=await create('laserPlans',{customerId:main.id,category:'LASER',area:'وجه',sessionsTotal:1,price:100});await create('laserSessions',{planId:plan.id,staffId:staff.id,device:'جهاز',settings:'اختبار'});
 check('Laser package session limit',(await req('/api/crm/laserSessions',{method:'POST',body:{planId:plan.id}})).status===409);
 const upload=async(customerId,type,bytes,category='DOCUMENT',role='ADMIN')=>{const f=new FormData();f.set('customerId',customerId);f.set('category',category);f.set('file',new Blob([bytes],{type}),'وثيقة.pdf');return req('/api/crm-documents',{method:'POST',body:f,role});};
 check('Disguised HTML upload rejected',(await upload(main.id,'image/png','<script>alert(1)</script>')).status===400);
 check('Session photo requires session and image',(await upload(main.id,'application/pdf','%PDF-1.4 sample','BEFORE')).status===400);
 const doc=await upload(main.id,'application/pdf','%PDF-1.4 sample');check('Valid document upload',doc.status===200,doc.data);
 check('Document IDOR blocked',(await req(`/api/crm-documents?id=${doc.data.id}`,{role:'SALES'})).status===404);
 const downloaded=await req(`/api/crm-documents?id=${doc.data.id}`);check('Unicode download and safe headers',downloaded.status===200&&downloaded.headers.get('content-disposition').includes("filename*=UTF-8''")&&downloaded.headers.get('x-content-type-options')==='nosniff');
 await create('notes',{customerId:main.id,body:'ملاحظة آمنة <script>window.hacked=true</script>'});
 const profile=await req(`/api/crm/profile?id=${main.id}`);check('Unified customer profile contains college event products payments',profile.status===200&&profile.data.related.students.total===1&&profile.data.related.eventLeads.total===1&&profile.data.related.payments.total>0&&profile.data.related.stockMovements.total===1);
 check('Profile view audited',await db.auditLog.count({where:{entity:'customers',entityId:main.id,action:'VIEW'}})>0);
 const dashboard=await req('/api/crm/dashboard');check('Currency-separated financial reporting',dashboard.data.finance.some(x=>x.currency==='ILS')&&dashboard.data.finance.some(x=>x.currency==='AED'));
 check('Staff dashboard excludes financial reports',!Object.hasOwn((await req('/api/crm/dashboard',{role:'STAFF'})).data,'finance'));
 check('User password hashes never exposed',!(JSON.stringify((await req('/api/crm/users')).data)).includes('passwordHash'));
 check('Admin cannot escalate to GOD',(await req('/api/crm/users',{method:'POST',body:{name:'forbidden',username:'forbidden',role:'GOD',password,active:true}})).status===403);
 check('Self-lockout prevented',(await req('/api/crm/users',{method:'PATCH',body:{id:users.ADMIN.id,active:false}})).status===400);
 const sessionUser=await create('users',{name:'الجلسة',username:'session_test',role:'SALES',password,active:true});const token=await new SignJWT({sub:sessionUser.id,version:0}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
 await req('/api/crm/users',{method:'PATCH',body:{id:sessionUser.id,password:password+'new'}});
 check('Password change revokes old sessions',(await req('/api/crm/customers',{role:null,cookie:`salon_session=${token}`})).status===401);
 check('Archive preserves customer history',(await req('/api/crm/customers',{method:'PATCH',body:{id:main.id,operation:'archive',reason:'اختبار الأرشفة'}})).status===200&&await db.invoice.count({where:{customerId:main.id}})>0);
 check('Archived customers omitted by default',!(await req('/api/crm/customers')).data.rows.some(x=>x.id===main.id));
 check('Archive filter retrieves record',(await req('/api/crm/customers?archived=true')).data.rows.some(x=>x.id===main.id));
 await req('/api/crm/customers',{method:'PATCH',body:{id:main.id,operation:'restore',reason:'استعادة الاختبار'}});
 check('Pagination independent of totals',(await req('/api/crm/customers?limit=1')).data.rows.length===1&&(await req('/api/crm/customers?limit=1')).data.total>1);
 for(const endpoint of ['/api/auth/login','/api/booking/verify-code'])check(`Malformed JSON ${endpoint}`,(await req(endpoint,{role:null,method:'POST',body:'{'})).status===400);
 const otpPhone='972500009777';const otpCode='123456';await db.bookingVerification.create({data:{phone:otpPhone,codeHash:await hash(otpCode,4),expiresAt:new Date(Date.now()+60000)}});
 const otp=await Promise.all([0,1].map(instance=>req('/api/booking/verify-code',{role:null,method:'POST',body:{phone:otpPhone,code:otpCode,name:'اختبار الحجز'},instance})));
 check('Concurrent OTP consumption admits once',otp.filter(x=>x.status===200).length===1,otp.map(x=>x.status));
 check('Removed OTP delivery returns 410',(await req('/api/booking/request-code',{role:null,method:'POST',body:{phone:'972500009778'}})).status===410);
 const login=await req('/api/auth/login',{role:null,method:'POST',body:{username:'test_ADMIN',password}});check('Real login succeeds with secure HttpOnly cookie',login.status===200&&/HttpOnly/i.test(login.headers.get('set-cookie')??'')&&/Secure/i.test(login.headers.get('set-cookie')??''));


 const expense=await create('expenses',{payee:'اختبار',category:'اختبار',description:'حذف تاريخ الدفع',amount:20,dueAt:'2027-01-01T10:00:00.000Z',paidAt:'2027-01-01T10:00:00.000Z'});
 const unpaidExpense=await req('/api/crm/expenses',{method:'PATCH',body:{id:expense.id,paidAt:null}});check('Clearing expense paid date persists null',unpaidExpense.status===200&&unpaidExpense.data.paidAt===null&&unpaidExpense.data.status==='DUE');
 check('Unchanged appointment edit excludes self',(await req('/api/crm/appointments',{method:'PATCH',body:{id:appointment.id,sessionNotes:'تمت الخدمة'}})).status===200);
 const adjacent=await create('appointments',{...appointmentBody,startsAt:'2027-01-12T11:00:00.000Z'});check('Adjacent appointment allowed',!!adjacent.id);
 check('Moving onto occupied slot rejected',(await req('/api/crm/appointments',{method:'PATCH',body:{id:adjacent.id,startsAt:future}})).status===409);
 const cancelled=await create('appointments',{...appointmentBody,status:'CANCELLED'});check('Cancelled appointment may overlap',cancelled.status==='CANCELLED');
 check('Reactivating cancelled appointment checks conflict',(await req('/api/crm/appointments',{method:'PATCH',body:{id:cancelled.id,status:'SCHEDULED'}})).status===409);
 for(const TZ of ['Asia/Jerusalem','UTC','America/New_York']){const dateCases=['2026-01-15T09:00:00.000Z','2026-07-15T09:00:00.000Z','2026-10-24T22:30:12.345Z','2026-10-24T23:30:12.345Z'];const code=`import {dateInput,dateInputToISO} from './lib/date-input.ts';const dates=${JSON.stringify(dateCases)};console.log(JSON.stringify(dates.map(d=>({original:d,saved:dateInputToISO(dateInput(d),d)}))))`;const run=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,TZ},encoding:'utf8',windowsHide:true});check(`Preserve dates including repeated DST hour ${TZ}`,run.status===0&&JSON.parse(run.stdout).every(x=>x.original===x.saved));}
 const slotToken=await new SignJWT({sub:main.id,scope:'customer_booking'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));const slotCookie=`customer_booking_session=${slotToken}`;
 const slots=await req(`/api/booking/slots?serviceId=${service.id}&date=2027-06-20`,{role:null,cookie:slotCookie});check('Future booking availability',slots.status===200&&slots.data.length>0);
 if(slots.data.length){const first=slots.data[0];await create('appointments',{...appointmentBody,staffId:'',startsAt:new Date(new Date(first).getTime()-30*60000).toISOString()});const updated=await req(`/api/booking/slots?serviceId=${service.id}&date=2027-06-20`,{role:null,cookie:slotCookie});check('Pre-opening appointment blocks first slot',!updated.data.includes(first));const publicRequest=await req('/api/booking/requests',{role:null,cookie:slotCookie,method:'POST',body:{serviceId:service.id,preferredAt:updated.data[0]}});check('Verified phone customer creates pending request',publicRequest.status===200&&publicRequest.data.status==='PENDING');if(publicRequest.status===200){const approved=await req('/api/service-requests',{method:'PATCH',body:{id:publicRequest.data.id,decision:'APPROVED'}});check('Approval creates linked invoice and appointment',approved.status===200&&approved.data.appointmentId&&approved.data.invoiceId);check('Request cannot be approved twice',(await req('/api/service-requests',{method:'PATCH',body:{id:publicRequest.data.id,decision:'APPROVED'}})).status===409);}}
 const noDelivery=await db.bookingVerification.findFirst({where:{phone:'972500009778'},orderBy:{createdAt:'desc'}});check('No OTP created without delivery',noDelivery===null);
 check('Used OTP cannot be reused',(await req('/api/booking/verify-code',{role:null,method:'POST',body:{phone:otpPhone,code:otpCode,name:'اختبار'}})).status===400);
 const hebrew=new FormData();hebrew.set('customerId',main.id);hebrew.set('file',new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),'מסמך.pdf');const hebrewDoc=await req('/api/crm-documents',{method:'POST',body:hebrew});check('Hebrew document download supported',hebrewDoc.status===200&&(await req(`/api/crm-documents?id=${hebrewDoc.data.id}`)).status===200);
 const lockedUser=await db.user.create({data:{name:'قفل اختبار',username:'lock_test',role:'SALES',passwordHash:await hash(password,4)}});
 const failures=await Promise.all(Array.from({length:6},(_,i)=>req('/api/auth/login',{role:null,method:'POST',instance:i%2,body:{username:'lock_test',password:'wrong'}})));
 check('Concurrent login failures lock account exactly once without disclosing existence',(await db.user.findUnique({where:{id:lockedUser.id}})).dailyLockCount===1&&failures.every(x=>x.status===401&&JSON.stringify(x.data)===JSON.stringify({error:'Invalid credentials'})));
 check('Locked account denies correct password',(await req('/api/auth/login',{role:null,method:'POST',body:{username:'lock_test',password}})).status===423);
 check('Cross-site origin cannot be spoofed with forwarded host',(await req('/api/crm/customers',{method:'POST',body:customerData('972500008888'),headers:{Origin:'https://evil.example','X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'https'}})).status===403);
 check('Customer role cannot read operations dashboard',(await req('/api/crm/dashboard',{role:'CUSTOMER'})).status===403);
 check('Money rejects fractional cents',(await req('/api/crm/payments',{method:'POST',body:paymentData(invoice.id,0.001)})).status===400);
 check('Refund invoice filter',(await req('/api/crm/invoices?status=REFUNDED')).data.rows.some(x=>x.id===invoice.id));
 check('Manager cannot set commission',(await req('/api/crm/staff',{role:'MANAGER',method:'PATCH',body:{id:staff.id,commissionRate:99}})).status===403);
 check('Trainer cannot create enrollment',(await req('/api/crm/enrollments',{role:'TRAINER',method:'POST',body:{studentId:student.id,courseId:course.id,fee:0,status:'REGISTERED',certificateStatus:'NONE'}})).status===403);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCFEAAAAASUVORK5CYII=','base64');const imageForm=new FormData();imageForm.set('file',new Blob([png],{type:'image/png'}),'product.png');
 check('Product photo uploaded',(await req(`/api/crm-product-image/${product.id}`,{method:'POST',body:imageForm})).status===200);
 check('Product photo requires authorization',(await req(`/api/crm-product-image/${product.id}`,{role:'STAFF'})).status===403);
 check('Product list excludes image binary',!(JSON.stringify((await req('/api/crm/products')).data)).includes('imageBytes'));
 const returned=await create('stockMovements',move('RETURN',1));check('Stock return is a new immutable movement',returned.quantity===1);
 check('Full course cannot be bypassed through duplicate enrollment',(await req('/api/crm/enrollments',{method:'POST',body:{studentId:student.id,courseId:course.id,fee:200,status:'REGISTERED',certificateStatus:'NONE'}})).status===409);
 const salesProfile=await req(`/api/crm/profile?id=${customers.SALES.id}`,{role:'SALES'});check('Sales profile has no unauthorized departments',!salesProfile.data.related.students&&!salesProfile.data.related.eventLeads&&!salesProfile.data.related.invoices);
 const publicToken=await new SignJWT({sub:main.id,scope:'customer_booking'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode(secret));
 const invalidDate=await req(`/api/booking/slots?serviceId=${service.id}&date=2027-99-99`,{role:null,cookie:`customer_booking_session=${publicToken}`});check('Invalid booking calendar date is safe',invalidDate.status<500);
 const requestRows=await Promise.all([1,2].map(()=>db.serviceRequest.create({data:{customerId:main.id,serviceId:service.id,preferredAt:new Date('2027-03-01T10:00:00.000Z')}})));
 const approvals=await Promise.all(requestRows.map((row,i)=>req('/api/service-requests',{method:'PATCH',instance:i,body:{id:row.id,decision:'APPROVED'}})));
 check('Concurrent booking-request approval prevents overlap',approvals.filter(x=>x.status===200).length===1&&approvals.filter(x=>x.status===409).length===1);
 check('Booking requests cannot be deleted',(await req('/api/service-requests',{method:'DELETE',body:{id:requestRows[0].id}})).status===405);
 const futurePayment=await req('/api/crm/payments',{method:'POST',body:{...paymentData(invoice.id,1),kind:'REFUND',notes:'test'},role:'STAFF'});check('Salon staff cannot create refunds',futurePayment.status===403);


 for(const section of ['salon','college','events','inventory','staff']){
  const summary=await req(`/api/crm/section-summary?section=${section}`);
  check(`Reference screen summary ${section}`,summary.status===200&&Array.isArray(summary.data.cards));
  check(`Sales cannot read unauthorized summary ${section}`,(await req(`/api/crm/section-summary?section=${section}`,{role:'SALES'})).status===403);
 }
 check('Anonymous cannot read screen summary',(await req('/api/crm/section-summary?section=staff',{role:null})).status===401);
 const staffSummary=await req('/api/crm/section-summary?section=staff',{role:'STAFF'});
 check('Staff summary excludes other employees',staffSummary.status===200&&staffSummary.data.team.every(x=>x.id===staff.id));
 const scopedEvent=await req('/api/crm/section-summary?section=events&eventId=missing',{role:'EVENT_MANAGER'});
 check('Event summary cannot cross event scope',scopedEvent.status===200&&scopedEvent.data.cards.every(x=>x.value===0)&&!scopedEvent.data.balances);
 const lowProducts=await req('/api/crm/products?status=LOW');
 check('Low stock filter uses movement totals',lowProducts.status===200&&lowProducts.data.rows.every(x=>x.stock<=x.minimum));
 const kitProducts=await req('/api/crm/products?status=KIT');
 check('Kit filter excludes retail products',kitProducts.status===200&&kitProducts.data.rows.every(x=>x.purpose==='KIT'));
 const todayAppointments=await req('/api/crm/appointments?status=TODAY');
 check('Today appointment filter is accepted',todayAppointments.status===200);
 const timeCode="import {salonDayRange} from './lib/business-time.ts';console.log(JSON.stringify(['2026-03-27T12:00:00Z','2026-10-25T12:00:00Z'].map(x=>{const r=salonDayRange(new Date(x));return (+r.end-+r.start)/3600000})))";const timeRun=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',timeCode],{encoding:'utf8',windowsHide:true});check('Business day handles 23-hour and 25-hour DST days',timeRun.status===0&&JSON.stringify(JSON.parse(timeRun.stdout))==='[23,25]');
 check('Global phone search normalizes formatting',(await req('/api/crm/customers?q='+encodeURIComponent('+972 50 123 4567'))).data.rows.some(x=>x.id===main.id));
 await db.student.update({where:{id:student.id},data:{status:'ENROLLED'}});check('Legacy student status remains editable',(await req('/api/crm/students',{method:'PATCH',body:{id:student.id,status:'ENROLLED',notes:'تعديل سجل سابق'}})).status===200);
 const security=await req('/login');check('Security headers on pages',security.headers.get('x-frame-options')==='DENY'&&security.headers.get('content-security-policy').includes("object-src 'none'"));
 await verifyNewWorkflows({db,req,create,check,users,customers,service,invoiceData});
 await verifyReferenceApi({req,check,db,users,customers,service,create});
 await verifyOctober({req,check,db,users,customers,create});
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:1440,height:1000},{width:820,height:1180},{width:390,height:844}]){
   const context=await browser.newContext({viewport});await context.addCookies([{name:'salon_session',value:cookies.ADMIN,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.getByRole('heading',{name:'نظرة عامة',exact:true}).waitFor();await page.waitForTimeout(600);
   check(`RTL document ${viewport.width}`,await page.locator('html').getAttribute('dir')==='rtl');
   check(`No viewport overflow ${viewport.width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:resolve(output,`dashboard-${viewport.width}.png`),fullPage:true});
   if(viewport.width<760)await page.getByRole('button',{name:'فتح القائمة'}).click();
   await page.getByRole('navigation').getByRole('button',{name:'العملاء',exact:false}).click();await page.getByRole('heading',{name:'العملاء',exact:true}).waitFor();await page.getByRole('button',{name:'إضافة العملاء'}).click();
   await page.getByRole('dialog').waitFor();check(`Minimal customer form ${viewport.width}`,await page.getByRole('dialog').getByText('إضافة تفاصيل اختيارية').isVisible()&&!await page.getByRole('dialog').getByLabel('المدينة',{exact:true}).count());
   await page.screenshot({path:resolve(output,`customer-form-${viewport.width}.png`),fullPage:true});await page.getByRole('button',{name:'إغلاق النموذج'}).click();
   const search=page.getByRole('textbox',{name:'البحث العام'});await search.fill('عميلة موحدة');await page.locator('.crm-search-results button').first().click();await page.getByRole('heading',{name:'عميلة موحدة',exact:true}).waitFor();
   await page.getByRole('tab',{name:'الملاحظات',exact:true}).click();await page.getByRole('textbox',{name:'ملاحظة جديدة',exact:true}).fill(`ملاحظة تلقائية ${viewport.width}`);await page.getByText('تم الحفظ تلقائيًا',{exact:true}).waitFor({timeout:12000});
   check(`Autosaved note persisted ${viewport.width}`,await db.customerNote.count({where:{customerId:main.id,body:`ملاحظة تلقائية ${viewport.width}`}})===1);
   check(`Stored script remains inert ${viewport.width}`,!(await page.evaluate(()=>window.hacked)));
   await page.getByRole('tab',{name:'الملخص',exact:true}).click();await page.screenshot({path:resolve(output,`profile-${viewport.width}.png`),fullPage:true});
   for(const [section,title] of [['salon','الصالون'],['college','الكلية'],['events','الإيفنتات'],['inventory','المنتجات والمخزون'],['staff','الموظفون']]){
    if(viewport.width<760)await page.getByRole('button',{name:'فتح القائمة'}).click();
    await page.getByRole('navigation').getByRole('button',{name:title,exact:false}).click();
    await page.locator('.crm-section-summary').waitFor();await page.waitForTimeout(500);
    check(`Reference screen ${section} no overflow ${viewport.width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check(`Reference palette ${section} ${viewport.width}`,await page.locator('.crm-app').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(248, 246, 250)');
    if(await page.locator('.crm-table td').count())check(`Readable table contrast ${section} ${viewport.width}`,await page.locator('.crm-table td').first().evaluate(el=>{
     const rgb=v=>v.match(/[\d.]+/g).slice(0,3).map(Number);const lum=c=>c.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
     const foreground=lum(rgb(getComputedStyle(el).color));let parent=el;while(parent&&getComputedStyle(parent).backgroundColor==='rgba(0, 0, 0, 0)')parent=parent.parentElement;
     const background=lum(rgb(getComputedStyle(parent).backgroundColor));return (Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05)>=4.5;
    }));
    await page.screenshot({path:resolve(output,`${section}-${viewport.width}.png`),fullPage:true});
   }
   check(`No browser runtime errors ${viewport.width}`,errors.length===0,errors);await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([{name:'salon_session',value:cookies.ADMIN,domain:'localhost',path:'/'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 for(const section of ['المتابعات والمهام','الصالون','الكلية','الإيفنتات','المنتجات والمخزون','الدفعات والفواتير','الموظفون','التقارير','الإعدادات والصلاحيات']){await page.getByRole('navigation').getByRole('button',{name:section,exact:false}).click();await page.getByRole('heading',{name:section,exact:true}).waitFor();await page.waitForTimeout(350);check(`Browser navigation ${section}`,!(await page.locator('.crm-alert').count()));}

 await page.getByRole('navigation').getByRole('button',{name:'العملاء',exact:false}).click();await page.getByRole('button',{name:'إضافة العملاء'}).click();const modal=page.getByRole('dialog');await modal.getByLabel('الاسم الكامل',{exact:false}).fill('عميلة من المتصفح');await modal.getByLabel('الهاتف الدولي',{exact:false}).fill('972500008881');await modal.getByRole('button',{name:'حفظ',exact:true}).click();await page.getByRole('heading',{name:'عميلة من المتصفح',exact:true}).waitFor();check('Browser customer create flow persists',await db.customer.count({where:{phone:'972500008881'}})===1);
 await page.getByRole('button',{name:'تعديل الملف والمسؤولة'}).click();await page.getByRole('dialog').getByLabel('المدينة',{exact:true}).fill('حيفا');await page.getByRole('dialog').getByRole('button',{name:'حفظ',exact:true}).click();await page.waitForTimeout(500);check('Browser customer edit persists', (await db.customer.findUnique({where:{phone:'972500008881'}})).city==='حيفا');
 const guest=await browser.newContext();const guestPage=await guest.newPage();await guestPage.goto(base+'/book');check('Public storefront explains checkout is not active',await guestPage.getByText('استعرضي الخدمات والمنتجات؛ إتمام الحجز والدفع الإلكتروني غير مفعّل بعد.').isVisible());await guest.close();
 for(const role of ['STAFF','SALES','TRAINER','EVENT_MANAGER','INVENTORY','ACCOUNTANT']){const ctx=await browser.newContext();await ctx.addCookies([{name:'salon_session',value:cookies[role],domain:'localhost',path:'/'}]);const p=await ctx.newPage();await p.goto(base);await p.getByRole('heading',{name:'نظرة عامة',exact:true}).waitFor();check(`Browser role navigation ${role}`,!(await p.getByRole('navigation').getByRole('button',{name:'الإعدادات والصلاحيات',exact:false}).count()));if(['STAFF','SALES','TRAINER','EVENT_MANAGER','INVENTORY'].includes(role))check(`Browser financial isolation ${role}`,!(await p.getByRole('navigation').getByRole('button',{name:'الدفعات والفواتير',exact:false}).count()));await ctx.close();}
 check('All-section browser runtime errors absent',errors.length===0,errors);await context.close();
 await verifyBrowserWorkflows({browser,base,cookies,db,check,main,output});
 await verifyScheduleEditor({browser,base,cookies,db,check,output});
 await verifyReferenceBrowser({browser,base,cookies,db,check,output});
 await verifyOctoberBrowser({browser,base,db,check,output,cookies});
 await verifySecurityProbes({req,check,db,users,customers,cookies,secret,output});
 const failed=results.filter(x=>!x.passed);console.log(JSON.stringify({passed:results.length-failed.length,failed:failed.length,total:results.length}));if(failed.length)process.exitCode=1;
}catch(e){check('Harness completion',false,e.stack);process.exitCode=1;}
finally{await browser?.close();for(const server of servers)server.kill();await db.$disconnect();writeFileSync(resolve(output,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));writeFileSync(resolve(output,'server.log'),logs.replaceAll(secret,'[redacted]').replaceAll(password,'[redacted]'));}
