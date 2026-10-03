import {prisma} from './prisma';
import {allowed,financial,scope,type Actor} from './crm-access';
import {CrmError,listRecords} from './crm-server';
import {salonDayRange} from './business-time';
import {parseSchedule} from './staff-schedule';

export async function departmentScreen(user:Actor,section:string,eventId=''){
 const resource=({salon:'appointments',college:'students',events:'eventLeads'} as Record<string,string>)[section];
 if(!resource||!allowed(user,resource))throw new CrmError('غير مصرح',403);
 const {start,end}=salonDayRange();const department=({salon:'SALON',college:'COLLEGE',events:'EVENT'} as Record<string,string>)[section];
 const where=(r:string,extra:any={})=>({AND:[scope(user,r),extra]});
 const query=new URL('http://local/?limit=8');if(section==='salon')query.searchParams.set('status','TODAY');if(eventId&&section==='events')query.searchParams.set('eventId',eventId);
 const list=await listRecords(user,resource,query);
 const taskWhere=where('tasks',{archivedAt:null,completedAt:null,dueAt:{gte:start,lt:end},customer:{departments:{has:department},...(eventId&&section==='events'?{eventLeads:{some:{eventId}}}:{})}});
 const tasks=allowed(user,'tasks')?await prisma.task.findMany({where:taskWhere,select:{id:true,customerId:true,reason:true,nextAction:true,dueAt:true,customer:{select:{name:true,phone:true}}},orderBy:{dueAt:'asc'},take:6}):[];
 const taskCount=allowed(user,'tasks')?await prisma.task.count({where:taskWhere}):0;
 const rows=await Promise.all(list.rows.map(async(row:any)=>{
  const customer=row.customerId?await prisma.customer.findFirst({where:where('customers',{id:row.customerId}),select:{id:true,name:true,phone:true,email:true,lastContactAt:true,owner:{select:{name:true,role:true}}}}):null;
  const followUp=customer&&allowed(user,'tasks')?await prisma.task.findFirst({where:where('tasks',{customerId:customer.id,archivedAt:null,completedAt:null}),orderBy:{dueAt:'asc'},select:{nextAction:true,reason:true,dueAt:true}}):null;
  return {...row,person:customer?{id:customer.id,name:customer.name,phone:customer.phone,email:customer.email,lastContactAt:customer.lastContactAt,ownerName:customer.owner&&(user.role==='GOD'||customer.owner.role!=='GOD')?customer.owner.name:null}:null,nextAction:followUp?.nextAction??followUp?.reason??null};
 }));
 const cards:any[]=[];const add=(title:string,value:number,icon:string,tone:string,resource:string,filter='ALL')=>cards.push({title,value,icon,tone,resource,filter});
 const data:any={resource,rows,total:list.total,tasks,cards};
 if(section==='salon'){
  const today={archivedAt:null,startsAt:{gte:start,lt:end}};
  add('مواعيد اليوم',list.total,'events','pink','appointments','TODAY');
  add('بحاجة لتأكيد',await prisma.appointment.count({where:where('appointments',{...today,status:'PENDING_REPLY'})}),'message','purple','appointments','PENDING_REPLY');
  add('جلسات ليزر اليوم',await prisma.appointment.count({where:where('appointments',{...today,service:{department:'LASER'}})}),'sun','amber','appointments','LASER_TODAY');
  add('مهام اليوم',taskCount,'tasks','pink','tasks','TODAY');
  if(user.staffId){const staff=await prisma.staff.findFirst({where:{AND:[{id:user.staffId},scope(user,'staff')]},select:{schedule:true}});try{const schedule=parseSchedule(staff?.schedule);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date());const day=new Date(`${date}T12:00:00Z`).getUTCDay();if(schedule)data.shifts=schedule[day]??[];else{const hours=await prisma.workingHour.findUnique({where:{dayOfWeek:day}});data.shifts=hours?.active?[{start:hours.openTime,end:hours.closeTime}]:[];}}catch{data.shiftMessage='حدّثي جدول الدوام من ملف الموظفة';}}
 }else if(section==='college'){
  add('طالبات مسجلات',await prisma.student.count({where:where('students',{archivedAt:null,status:{in:['REGISTERED','STUDYING','COMPLETED','CERTIFIED','ENROLLED']}})}),'staff','pink','students','REGISTERED');
  add('استشارات اليوم',await prisma.student.count({where:where('students',{archivedAt:null,status:'CONSULTATION',followUpAt:{gte:start,lt:end}})}),'message','purple','students','CONSULTATION');
  add('متابعات اليوم',taskCount,'phone','amber','tasks','TODAY');
  add('أوراق ناقصة',await prisma.student.count({where:where('students',{archivedAt:null,status:'WAITING_DOCUMENTS'})}),'note','pink','students','WAITING_DOCUMENTS');
  data.courses=allowed(user,'collegeCourses')?(await listRecords(user,'collegeCourses',new URL('http://local/?limit=100'))).rows.filter((c:any)=>c.active&&['UPCOMING','OPEN'].includes(c.status)).sort((a:any,b:any)=>+new Date(a.startsAt??0)-+new Date(b.startsAt??0)).slice(0,4):[];
 }else{
  data.event=await prisma.event.findFirst({where:where('events',{archivedAt:null,...(eventId?{id:eventId}:{startsAt:{gte:new Date()}})}),select:{id:true,name:true,location:true,startsAt:true,notes:true,currency:true,capacity:true},orderBy:{startsAt:'asc'}});
  const extra={archivedAt:null,...(eventId?{eventId}:{})};
  add('مهتمات جديدات',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:'NEW'})}),'staff','pink','eventLeads','NEW');
  add('اتصالات اليوم',taskCount,'phone','purple','tasks','TODAY');
  add('بانتظار الرد',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:'WAITING_REPLY'})}),'message','amber','eventLeads','WAITING_REPLY');
  add('مسجلات',await prisma.eventLead.count({where:where('eventLeads',{...extra,stage:{in:['DEPOSIT','REGISTERED','ATTENDED']}})}),'tasks','pink','eventLeads','REGISTRATIONS');
 }
 data.canFinance=financial(user);return data;
}
