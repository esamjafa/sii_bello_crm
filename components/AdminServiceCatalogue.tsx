'use client';
import {label} from '@/lib/crm-config';
import type {ServiceConfiguration} from '@/lib/service-selection';

type Service={id:string;name:string;department:string;price:unknown;durationMinutes:number;active:boolean;onlineBookable:boolean;configuration?:ServiceConfiguration};
const money=(value:unknown)=>new Intl.NumberFormat('ar',{style:'currency',currency:'ILS'}).format(Number(value));
export default function AdminServiceCatalogue({rows,onSelect,onEdit}:{rows:Service[];onSelect:(row:Service)=>void;onEdit?:(row:Service)=>void}){
 return <div className="admin-service-catalogue" aria-label="كتالوج الخدمات والأسعار">
  {!rows.length&&<p>لا توجد خدمات مطابقة. أضيفي خدمة وحددي القسم والأسعار من كتالوج الخدمات.</p>}
  {rows.map(service=><article className="crm-panel" key={service.id}>
   <header className="crm-page-heading"><div><small>{label(service.department)} · {service.active?'فعالة':'غير فعالة'}{service.onlineBookable?' · متاحة للعميلات':''}</small><h3>{service.name}</h3><p>السعر الأساسي: {money(service.price)} · {service.durationMinutes} دقيقة</p></div><div className="crm-inline"><button type="button" aria-label={`تفاصيل الخدمة ${service.name}`} onClick={()=>onSelect(service)}>تفاصيل الخدمة</button>{onEdit&&<button type="button" aria-label={`تعديل الخدمة والأسعار ${service.name}`} onClick={()=>onEdit(service)}>تعديل الخدمة والأسعار</button>}</div></header>
   {!!service.configuration?.variants?.length&&<div className="crm-table-wrap"><table className="crm-table"><caption>خيارات الخدمة وأسعارها</caption><thead><tr><th>الخيار</th><th>السعر</th></tr></thead><tbody>{service.configuration.variants.map(option=><tr key={option.id}><td>{option.name}</td><td>{money(option.price)}</td></tr>)}</tbody></table></div>}
   {!!service.configuration?.areas?.length&&<div className="crm-table-wrap"><table className="crm-table"><caption>مناطق الليزر وأسعارها</caption><thead><tr><th>الخيار</th><th>الجنس</th><th>السعر</th></tr></thead><tbody>{service.configuration.areas.map(area=><tr key={area.id}><td>{area.name}</td><td>{area.audience==='FEMALE'?'أنثى':area.audience==='MALE'?'ذكر':'للجميع'}</td><td>{money(area.price)}</td></tr>)}</tbody></table></div>}
   {!!service.configuration?.offers?.length&&<details><summary>العروض والباقات ({service.configuration.offers.length})</summary>{service.configuration.offers.map(offer=><p key={offer.id}>{offer.name} · {offer.sessionsTotal??1} جلسة · {money(offer.price)}</p>)}</details>}
  </article>)}
 </div>;
}
