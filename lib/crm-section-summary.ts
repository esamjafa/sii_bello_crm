import { prisma } from './prisma';
import { allowed, financial, owners, scope, type Actor } from './crm-access';
import { CrmError, listRecords } from './crm-server';
import { salonDayRange, salonMonthStart } from './business-time';

// All cards use the same ownership boundaries as the corresponding lists.
export async function sectionSummary(user:Actor, section:string, eventId:string) {
 const gate:Record<string,string>={salon:'appointments',college:'collegeCourses',events:'eventLeads',inventory:'products',staff:'staff'};
 const resource=gate[section];
 if(!resource||!allowed(user,resource))throw new CrmError('غير مصرح',403);
 const cards:any[]=[];const result:any={cards};const now=new Date();const {start,end}=salonDayRange(now);
 const where=(r:string,extra:any={})=>({AND:[scope(user,r),extra]});
 const add=(title:string,value:any,r:string,filter='ALL')=>cards.push({title,value,resource:r,filter});
 if(['salon','college','events'].includes(section)&&allowed(user,'tasks')){
  const department={salon:'SALON',college:'COLLEGE',events:'EVENT'}[section];
  result.followUps=await prisma.task.findMany({where:where('tasks',{archivedAt:null,completedAt:null,dueAt:{lte:end},customer:{departments:{has:department},...(section==='events'&&eventId?{eventLeads:{some:{eventId}}}:{})}}),select:{id:true,customerId:true,reason:true,nextAction:true,outcome:true,dueAt:true,customer:{select:{name:true,phone:true}}},orderBy:{dueAt:'asc'},take:8});
 }
 if(['salon','inventory'].includes(section)&&financial(user))result.monthSales=await prisma.invoice.groupBy({by:['currency'],where:{status:{not:'VOID'},department:section==='salon'?'SALON':'PRODUCTS',createdAt:{gte:salonMonthStart(now)}},_sum:{amount:true,paidAmount:true}});
 if(section==='salon'){
  add('مواعيد اليوم',await prisma.appointment.count({where:where('appointments',{archivedAt:null,startsAt:{gte:start,lt:end}})}),'appointments','TODAY');
  if(allowed(user,'laserPlans')){
   const plans=await prisma.laserPlan.findMany({where:where('laserPlans',{archivedAt:null}),select:{sessionsTotal:true,_count:{select:{sessions:{where:{archivedAt:null}}}}}});
   add('باقات بقيت لها جلسة واحدة',plans.filter(p=>p.sessionsTotal-p._count.sessions===1).length,'laserPlans');
   add('باقات مكتملة الجلسات',plans.filter(p=>p._count.sessions>=p.sessionsTotal).length,'laserPlans');
  }
  if(allowed(user,'customers'))add('لم تزر الصالون منذ 30 يومًا',await prisma.customer.count({where:where('customers',{archivedAt:null,departments:{has:'SALON'},lastVisitAt:{lte:new Date(+now-30*86400000)}})}),'customers','SALON');
 }
 if(section==='college'){
  for(const [status,title] of [['WAITING_DOCUMENTS','بانتظار أوراق'],['INTERESTED','مهتمات'],['DETAILS_SENT','أُرسلت التفاصيل'],['DEPOSIT','دفعن عربونًا'],['REGISTERED','تسجيل مكتمل']])add(title,await prisma.student.count({where:where('students',{archivedAt:null,status})}),'students',status);
  const url=new URL('http://localhost');url.searchParams.set('limit','100');
  result.courses=(await listRecords(user,'collegeCourses',url)).rows.filter((c:any)=>c.active&&['UPCOMING','OPEN','RUNNING'].includes(c.status));
 }
 if(section==='events'){
  const extra:any={archivedAt:null,...(eventId?{eventId}:{})};
  add('كل المهتمات',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:{notIn:['DEPOSIT','REGISTERED','ATTENDED','LOST']}})}),'eventLeads','LEADS');
  add('بانتظار متابعة',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:{in:['NEW','CONTACTED','DETAILS_SENT','FOLLOW_UP']}})}),'eventLeads');
  add('دفعن عربونًا',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:'DEPOSIT'})}),'eventLeads','DEPOSIT');
  add('تسجيل مكتمل',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:'REGISTERED'})}),'eventLeads','REGISTERED');
  if(financial(user))result.balances=await prisma.eventLead.groupBy({by:['currency'],where:where('eventLeads',extra),_sum:{paidAmount:true,agreedAmount:true}});
 }
 if(section==='inventory'){
  const products=await prisma.product.findMany({where:{archivedAt:null},select:{id:true,minimum:true,purchasePrice:true,currency:true}});
  const stock=await prisma.stockMovement.groupBy({by:['productId'],_sum:{quantity:true}});
  const quantity=(id:string)=>stock.find(s=>s.productId===id)?._sum.quantity??0;
  add('مخزون منخفض',products.filter(p=>quantity(p.id)<=p.minimum).length,'products','LOW');
  add('قطع سُلّمت للطالبات هذا الشهر',Math.abs((await prisma.stockMovement.aggregate({where:{kind:'KIT',createdAt:{gte:salonMonthStart(now)}},_sum:{quantity:true}}))._sum.quantity??0),'stockMovements');
  if(owners(user))result.valuation=Object.entries(products.reduce((acc:Record<string,number>,p)=>{acc[p.currency]=(acc[p.currency]??0)+quantity(p.id)*Number(p.purchasePrice);return acc;},{})).map(([currency,amount])=>({currency,amount}));
 }
 if(section==='staff'){
  const staff=await prisma.staff.findMany({where:scope(user,'staff'),select:{id:true,name:true,title:true}});
  result.team=await Promise.all(staff.map(async s=>{
   const account=await prisma.user.findUnique({where:{staffId:s.id},select:{id:true,role:true}});
   return {...s,accountRole:account?.role,ownerId:account?.id,tasks:account&&allowed(user,'tasks')?await prisma.task.count({where:where('tasks',{ownerId:account.id,archivedAt:null,completedAt:null,dueAt:{gte:start,lt:end}})}):null,appointments:await prisma.appointment.count({where:where('appointments',{staffId:s.id,archivedAt:null,startsAt:{gte:start,lt:end}})})};
  }));
 }
 return result;
}
