const zone='Asia/Jerusalem';
function parts(at:Date){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));}
function midnight(year:number,month:number,day:number){
 const wall=Date.UTC(year,month-1,day);let guess=wall;
 for(let i=0;i<3;i++){const p=parts(new Date(guess));const seen=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);guess+=wall-seen;}
 return new Date(guess);
}
export function salonDayRange(now=new Date(),days=1){const p=parts(now);const next=new Date(Date.UTC(p.year,p.month-1,p.day+days));return {start:midnight(p.year,p.month,p.day),end:midnight(next.getUTCFullYear(),next.getUTCMonth()+1,next.getUTCDate())};}
export function salonMonthStart(now=new Date()){const p=parts(now);return midnight(p.year,p.month,1);}
