'use client';
import {useState,type ReactNode} from 'react';
import TreatmentBody from './TreatmentBody';
import {quoteService,bodyRegions,regionLabels,type Selection,type ServiceConfiguration} from '@/lib/service-selection';

export type LaserCatalogueService={id:string;name:string;department:string;price:unknown;configuration?:ServiceConfiguration};
const upper=['BEARD','FACE','NECK','UNDERARMS','CHEST','ARMS','ABDOMEN','BACK','LOWER_BACK'];
const money=(n:number)=>new Intl.NumberFormat('ar',{style:'currency',currency:'ILS'}).format(n);
export default function LaserRegistrationCatalogue({service,customer,value,onChange,onClose,servicePicker,catalogueNotice}:{service:LaserCatalogueService;customer:Record<string,any>;value:Selection;onChange:(v:Selection)=>void;onClose:()=>void;servicePicker?:ReactNode;catalogueNotice?:string}){
 const [group,setGroup]=useState('ALL'),[error,setError]=useState('');
 const gender=customer.gender as 'FEMALE'|'MALE',male=gender==='MALE';
 const config=service.configuration??{areas:[],offers:[]};
 const areas=config.areas.filter(a=>(!a.audience||a.audience==='ALL'||a.audience===gender)&&(male||a.region!=='BEARD'&&!(a.coverage??[a.region]).includes('BEARD')));
 const ids=value.areaIds??[],selected=areas.filter(a=>ids.includes(a.id));
 const update=(next:Selection)=>{setError('');onChange({...next,gender});};
 const select=(id:string)=>{
  const area=areas.find(a=>a.id===id);if(!area)return;
  const removing=ids.includes(id),coverage=area.coverage??[area.region];
  const overlapping=selected.filter(a=>a.id!==id&&(a.coverage??[a.region]).some(r=>coverage.includes(r)));
  if(!removing&&overlapping.length&&!window.confirm('هذه المنطقة تتداخل مع اختيار سابق. استبدال المناطق المتداخلة لتجنب احتسابها مرتين؟'))return;
  const nextIds=removing?ids.filter(x=>x!==id):[...ids.filter(x=>!overlapping.some(a=>a.id===x)),id];
  update({...value,areaIds:nextIds,offerId:undefined,hairAssessments:Object.fromEntries(Object.entries(value.hairAssessments??{}).filter(([id])=>nextIds.includes(id)))});
 };
 const offers=config.offers.filter(o=>o.areaIds.every(id=>areas.some(a=>a.id===id))&&(!o.startsAt||new Date(o.startsAt)<=new Date())&&(!o.endsAt||new Date(o.endsAt)>=new Date()));
 let quote:ReturnType<typeof quoteService>|undefined,quoteError='';try{quote=quoteService(service,{...value,gender});}catch(e){quoteError=e instanceof Error?e.message:'راجعي المناطق المختارة';}
 const assessment=(id:string,key:string,v:string)=>update({...value,hairAssessments:{...value.hairAssessments,[id]:{...value.hairAssessments?.[id],[key]:v}}});
 const choices=(id:string,key:'color'|'texture'|'density',title:string,options:string[][])=><fieldset className="laser-assessment"><legend>{title}</legend>{options.map(([v,text])=><label key={v}><input type="radio" name={`${service.id}-${id}-${key}`} checked={value.hairAssessments?.[id]?.[key]===v} onChange={()=>assessment(id,key,v)}/><span>{text}</span></label>)}</fieldset>;
 return <section className="laser-registration" aria-label="كتالوج تسجيل الليزر" dir="rtl">
  <header className="laser-registration-heading"><div><h2>ليزر · تسجيل أولي</h2><p>{service.name} · اختيار المناطق والباقة — {male?'ذكر':'أنثى'}</p></div><button type="button" onClick={onClose}>العودة لبيانات العميل</button></header>
  {servicePicker}
  {catalogueNotice&&<p className="laser-setup-notice" role="status">{catalogueNotice}</p>}
  <div className="laser-registration-grid">
   <aside className="laser-client-card"><h3>معلومات {male?'الزبون':'الزبونة'}</h3><span className="laser-gender">{male?'♂ ذكر':'♀ أنثى'}</span><dl><dt>الاسم الكامل</dt><dd>{customer.name}</dd><dt>رقم الهاتف</dt><dd dir="ltr">{customer.phone}</dd></dl><TreatmentBody gender={gender} available={[...new Set(areas.map(a=>a.region))]} selected={[...new Set(selected.flatMap(a=>a.coverage??[a.region]))]} onToggle={region=>{const area=areas.find(a=>a.region===region);if(area)select(area.id);}}/><small>الجنس محدد في البيانات الشخصية. اختيار الرسم والقائمة متزامن.</small></aside>
   <section className="laser-area-catalogue"><h3>المناطق المطلوبة</h3><div className="laser-catalogue-tabs">{[['ALL','الكل'],['UPPER','علوي'],['LOWER','سفلي']].map(([v,t])=><button type="button" key={v} aria-pressed={group===v} onClick={()=>setGroup(v)}>{t}</button>)}</div>
    {!areas.length&&<>{!catalogueNotice&&<p role="status">لم تُضبط مناطق وأسعار هذا الكتالوج لهذا الجنس بعد. أضيفيها من إعدادات الخدمة.</p>}{bodyRegions.filter(r=>(male||r!=='BEARD')&&(group==='ALL'||(group==='UPPER'?upper.includes(r):!upper.includes(r)))).map(r=><label className="laser-catalogue-area laser-unconfigured-area" key={r}><input type="checkbox" disabled/><span>{regionLabels[r]}</span><small>السعر غير محدد</small></label>)}</>}
    {areas.filter(a=>group==='ALL'||(group==='UPPER'?upper.includes(a.region):!upper.includes(a.region))).map(a=><label className={`laser-catalogue-area ${ids.includes(a.id)?'selected':''}`} key={a.id}><input type="checkbox" checked={ids.includes(a.id)} onChange={()=>select(a.id)}/><span>{a.name}</span><strong>{money(a.price)}</strong></label>)}
    {offers.length>0&&<details className="laser-offer-list" open><summary>العروض والباقات المتاحة</summary>{offers.map(o=><label className="laser-offer" key={o.id}><input type="radio" name={`${service.id}-offer`} checked={value.offerId===o.id} onChange={()=>{const next={...value,areaIds:o.areaIds,offerId:o.id,hairAssessments:Object.fromEntries(Object.entries(value.hairAssessments??{}).filter(([id])=>o.areaIds.includes(id)))};try{quoteService(service,{...next,gender});update(next);}catch(e){setError(e instanceof Error?e.message:'تعذر اختيار الباقة');}}}/><span><strong>{o.name}</strong><small>{o.areaIds.map(id=>areas.find(a=>a.id===id)?.name).join('، ')}</small><small>{o.sessionsTotal??1} جلسة · {money(o.price)}</small></span></label>)}{value.offerId&&<button type="button" onClick={()=>update({...value,offerId:undefined})}>بدون عرض — أسعار المناطق</button>}</details>}
   </section>
   <section className="laser-area-assessments"><h3>تفاصيل المناطق المختارة</h3>{!selected.length&&<p>اختاري منطقة من الرسم أو القائمة لعرض تفاصيلها.</p>}{selected.map(a=><article className="laser-assessment-card" key={a.id}><header><h4>{a.name}<small>{money(a.price)}</small></h4><button type="button" aria-label={`إزالة ${a.name}`} onClick={()=>select(a.id)}>إزالة</button></header>{choices(a.id,'color','لون الشعر',[['BLACK','أسود'],['WHITE','أبيض'],['BLONDE','أشقر'],['BROWN','بني'],['OTHER','آخر']])}{choices(a.id,'texture','ملمس الشعر',[['COARSE','خشن'],['SOFT','ناعم'],['VELLUS','وبري']])}{choices(a.id,'density','كمية الشعر',[['LIGHT','قليلة'],['MEDIUM','متوسطة'],['THICK','كثيفة']])}<label>ملاحظات المنطقة<textarea value={value.hairAssessments?.[a.id]?.notes??''} maxLength={1000} onChange={e=>assessment(a.id,'notes',e.target.value)} placeholder="مثل: لا يوجد شعر في جزء من المنطقة"/></label></article>)}</section>
  </div>
  {(error||ids.length>0&&quoteError)&&<p className="crm-alert" role="alert">{error||quoteError}</p>}
  <footer className="laser-registration-footer"><div><small>الإجمالي · {selected.length} منطقة · {quote?.offer?.sessionsTotal??1} جلسة</small>{quote?.offer&&<del>{money(quote.originalPrice)}</del>}<strong>{quote?money(quote.finalPrice):'اختاري المناطق'}</strong></div><p>تُربط الباقة بملف العميل عند حفظ النموذج. الحفظ لا يسجل دفعة أو موعدًا.</p><button type="button" className="crm-primary" disabled={!quote} onClick={()=>{if(quote){update(quote.details);onClose();}}}>اعتماد اختيارات الليزر</button></footer>
 </section>;
}
