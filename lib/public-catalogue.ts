import {prisma} from './prisma';
import {salonDayRange} from './business-time';
import {assertNoOverlap,assertStaffAvailable,SchedulingConflict} from './scheduling';
import {withinSchedule} from './staff-schedule';

export async function publicSlots(serviceId:string,day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(+new Date(day))||new Date(day).toISOString().slice(0,10)!==day)return [];
 const {start,end}=salonDayRange(new Date(`${day}T12:00:00Z`));
 if(+end<Date.now()||+start>Date.now()+90*86400000)return [];
 const service=await prisma.service.findFirst({where:{id:serviceId,active:true,onlineBookable:true}});if(!service)return [];
 const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
 const hours=await prisma.workingHour.findUnique({where:{dayOfWeek:weekday}});if(!hours?.active)return [];
 const staff=await prisma.staff.findMany({where:{active:true,department:'SALON',services:{has:service.id},OR:[{user:null},{user:{role:{not:'GOD'}}}]},select:{id:true,name:true},take:40});
 const slots:{startsAt:string;staffId:string;staffName:string}[]=[];
 await prisma.$transaction(async tx=>{
  for(let at=+start;at+service.durationMinutes*60000<=+end;at+=30*60000){
   const when=new Date(at);if(at<Date.now()+30*60000||!withinSchedule({[weekday]:[{start:hours.openTime,end:hours.closeTime}]},when,service.durationMinutes))continue;
   for(const employee of staff){try{await assertStaffAvailable(tx,employee.id,when,service.durationMinutes,service.id);await assertNoOverlap(tx,when,service.durationMinutes,undefined,employee.id,service);slots.push({startsAt:when.toISOString(),staffId:employee.id,staffName:employee.name});}catch(e){if(!(e instanceof SchedulingConflict))throw e;}}
  }
 },{timeout:30000});
 return slots;
}
