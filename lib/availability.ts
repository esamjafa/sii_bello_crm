import { prisma } from './prisma';

function zonedDate(date:string,time:string){
  const raw=new Date(`${date}T${time}:00.000Z`);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(raw);
  const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value);
  const represented=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));
  return new Date(raw.getTime()-(represented-raw.getTime()));
}
export async function availableSlots(serviceId:string,date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const calendarDate=new Date(`${date}T12:00:00Z`);
  if(!Number.isFinite(calendarDate.getTime())||calendarDate.toISOString().slice(0,10)!==date)return [];
  const service=await prisma.service.findFirst({where:{id:serviceId,active:true}});if(!service)return [];
  const dayOfWeek=new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours=await prisma.workingHour.findUnique({where:{dayOfWeek}});if(!hours?.active)return [];
  const open=zonedDate(date,hours.openTime),close=zonedDate(date,hours.closeTime);
  const appointments=await prisma.appointment.findMany({where:{startsAt:{lt:close},status:{in:['SCHEDULED','COMPLETED']}},include:{service:true}});
  const duration=service.durationMinutes*60000,slots:string[]=[];
  for(let start=open.getTime();start+duration<=close.getTime();start+=30*60000){
    if(start<Date.now()+30*60000)continue;
    const end=start+duration;
    const conflict=appointments.some(a=>{const aStart=a.startsAt.getTime(),aEnd=aStart+a.service.durationMinutes*60000;return start<aEnd&&end>aStart;});
    if(!conflict)slots.push(new Date(start).toISOString());
  }
  return slots;
}
