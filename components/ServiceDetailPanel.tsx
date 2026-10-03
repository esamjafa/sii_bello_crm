'use client';
import {useEffect,useRef,useState} from 'react';
import {label} from '@/lib/crm-config';

/** Read-only entry point. Opening a card never creates or changes a record. */
export default function ServiceDetailPanel({service,onClose,onBook,onEdit}:{service:Record<string,any>;onClose:()=>void;onBook?:()=>void;onEdit?:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{const element=dialog.current;const trigger=document.activeElement as HTMLElement|null;element?.showModal();return()=>{element?.close();trigger?.focus();};},[]);
 return <dialog ref={dialog} className={`service-detail-panel ${expanded?'is-expanded':''}`} aria-labelledby="service-detail-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <header><div><small>الصالون / الخدمات والأسعار / {label(service.department)}</small><h2 id="service-detail-title">{service.name}</h2></div><div className="service-detail-controls"><button type="button" aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'تصغير التفاصيل':'تكبير التفاصيل'}</button><button type="button" onClick={onClose}>إغلاق</button></div></header>
  <div className="service-detail-content">
   {service.imageUrl&&<img className="service-detail-image" src={service.imageUrl} alt={service.name}/>}
   <dl className="service-detail-facts"><div><dt>السعر</dt><dd>{service.price==null?'لم يحدد بعد':`${Number(service.price).toFixed(2)} ₪`}</dd></div><div><dt>المدة</dt><dd>{service.durationMinutes>0?`${service.durationMinutes} دقيقة`:'لم تحدد بعد'}</dd></div><div><dt>الحالة</dt><dd>{service.active===false?'غير فعالة':'فعالة'}</dd></div></dl>
   {service.configuration?.areas?.length>0&&<details><summary>المناطق وأسعارها</summary><ul>{service.configuration.areas.map((area:any)=><li key={area.id}>{area.name}<strong>{Number(area.price).toFixed(2)} ₪</strong></li>)}</ul></details>}
   {service.configuration?.offers?.length>0&&<details><summary>العروض المسجلة وشروطها</summary><ul>{service.configuration.offers.map((offer:any)=><li key={offer.id}><span>{offer.name}{offer.endsAt&&<small>ينتهي {new Date(offer.endsAt).toLocaleDateString('ar')}</small>}</span><strong>{Number(offer.price).toFixed(2)} ₪</strong></li>)}</ul><p>يُتحقق من صلاحية العرض والمناطق المشمولة عند اختيار الخدمة للحجز.</p></details>}
   <p className="service-detail-hint">يُختار ملف العميل الموجود عند إضافة موعد، وتظهر تفاصيل هذه الخدمة وحدها. فتح التفاصيل لا يحفظ حجزًا أو دفعة.</p>
  </div>
  <footer>{onBook&&service.active!==false&&<button type="button" className="crm-primary" onClick={onBook}>حجز موعد لهذه الخدمة</button>}{onEdit&&<button type="button" onClick={onEdit}>تعديل إعدادات الخدمة</button>}</footer>
 </dialog>;
}
