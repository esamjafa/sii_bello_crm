'use client';
import {useEffect,useState} from 'react';
import {dateInput} from '@/lib/date-input';
export default function AppointmentAvailability({values,id,onSelect}:{values:Record<string,any>;id?:string;onSelect:(value:string)=>void}){
 const [slots,setSlots]=useState<string[]>([]),[message,setMessage]=useState('');const day=values.startsAt?.slice(0,10);
 useEffect(()=>{let active=true;if(!day||!values.serviceId||!values.staffId){setSlots([]);setMessage('اختاري الخدمة والموظفة واليوم لعرض التوفر');return;}
 setMessage('جارٍ فحص التوفر…');const p=new URLSearchParams({day,serviceId:values.serviceId,staffId:values.staffId,...(id?{excludeId:id}:{}),...(values.durationMinutes?{durationMinutes:String(values.durationMinutes)}:{})});
 fetch(`/api/crm/availability?${p}`,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setSlots(d.slots);setMessage(d.slots.length?'اختاري وقتًا متاحًا — بتوقيت القدس':'لا توجد فترات متاحة لهذا اليوم');}}).catch(e=>{if(active){setSlots([]);setMessage(e.message);}});return()=>{active=false;};},[day,values.serviceId,values.staffId,values.durationMinutes,id]);
 return <section className="crm-panel"><p>{message}</p><div className="crm-slots">{slots.map(s=><button type="button" key={s} onClick={()=>onSelect(dateInput(s))}>{new Intl.DateTimeFormat('ar',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'}).format(new Date(s))}</button>)}</div></section>;
}
