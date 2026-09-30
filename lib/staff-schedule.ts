export type Shift={start:string;end:string};
export type WeeklySchedule=Record<string,Shift[]>;
export const weekdays=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export function parseSchedule(value?:string|null):WeeklySchedule|null {
 if(!value?.trim())return null;
 let data:any;try{data=JSON.parse(value);}catch{throw new Error('أعيدي إدخال الدوام باستخدام فترات الأيام');}
 if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['0','1','2','3','4','5','6'].includes(k)))throw new Error('جدول الدوام غير صالح');
 const out:WeeklySchedule={};
 for(let day=0;day<7;day++){
  const periods=data[day]??[];
  if(!Array.isArray(periods)||periods.length>8)throw new Error('الحد الأقصى ثماني فترات لليوم');
  out[day]=periods.map((p:any)=>{if(!p||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)||p.start>=p.end)throw new Error('بداية الفترة يجب أن تسبق نهايتها');return {start:p.start,end:p.end};}).sort((a:Shift,b:Shift)=>a.start.localeCompare(b.start));
  if(out[day].some((p,i)=>i>0&&p.start<out[day][i-1].end))throw new Error(`فترات ${weekdays[day]} متداخلة`);
 }
 return out;
}
export const shiftMinutes=(p:Shift)=>{const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));return minutes(p.end)-minutes(p.start);};
export function withinSchedule(schedule:WeeklySchedule,at:Date,duration:number){
 const parts=(d:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
 const a=parts(at),b=parts(new Date(+at+duration*60000));
 if(a.year!==b.year||a.month!==b.month||a.day!==b.day)return false;
 const day=new Date(`${a.year}-${a.month}-${a.day}T12:00:00Z`).getUTCDay();
 return (schedule[day]??[]).some(p=>`${a.hour}:${a.minute}`>=p.start&&`${b.hour}:${b.minute}`<=p.end);
}
