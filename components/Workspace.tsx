'use client';
import { useEffect, useMemo, useState } from 'react';
import { definitions, resourcesBySection, translations, type Field, type Language, type Resource, type Section } from '@/lib/workspace-config';
import RequestsAdmin from './RequestsAdmin';
import { dateInput, dateInputToISO } from '@/lib/date-input';

type Row = Record<string, any>;
type User = { id: string; name: string; role: string };
type FormState = { resource: Resource; values: Row; editId?: string };
const allResources = Object.keys(definitions) as Resource[];
const icons: Record<Section,string> = { overview:'◈', college:'◇', events:'✧', salon:'✦', requests:'☷', admin:'⚙' };
const day = 86400000;
const moneyKeys = new Set(['amount','fee','price','paidAmount','agreedAmount','studentBalance','customerBalance','eventBalance','enrollmentBalance','enrollmentPaid']);
const numericKeys = new Set(['amount','fee','price','paidAmount','agreedAmount','durationMinutes','sessionsTotal']);
const optionalRelationKeys = new Set(['staffId','serviceId','eventId','packageId']);
const dateText = (value: unknown, lang: Language) => value ? new Intl.DateTimeFormat(lang==='ar'?'ar-IL':lang==='he'?'he-IL':'en-IL',{dateStyle:'medium'}).format(new Date(String(value))) : '—';
const moneyText = (value: unknown, lang: Language) => new Intl.NumberFormat(lang==='ar'?'ar-IL':lang==='he'?'he-IL':'en-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(Number(value)||0);
const balance = (amount: unknown, paid: unknown) => Math.max(0, Number(amount||0)-Number(paid||0));
const enrollmentPaid = (row: Row) => (row.payments??[]).reduce((n:number,p:Row)=>n+Number(p.amount),0);
const studentBalance = (row: Row) => (row.enrollments??[]).reduce((n:number,e:Row)=>n+balance(e.fee,enrollmentPaid(e)),0);
const customerBalance = (customerId: string, data: Record<string,Row[]>) => (data.invoices??[]).filter(i=>i.customerId===customerId&&i.status!=='VOID').reduce((n,i)=>n+balance(i.amount,i.paidAmount),0);

export default function Workspace({ user }: { user: User }) {
  const [lang,setLang] = useState<Language>('ar');
  const [section,setSection] = useState<Section>('overview');
  const [resource,setResource] = useState<Resource>('students');
  const [data,setData] = useState<Record<string,Row[]>>({});
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('ALL');
  const [form,setForm] = useState<FormState|null>(null);
  const [profile,setProfile] = useState<{ resource: Resource; id: string }|null>(null);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const [uploading,setUploading] = useState<string|null>(null);
  const t = (key: string) => translations[lang][key] ?? translations.en[key] ?? key;
  const dir = lang==='en'?'ltr':'rtl';
  const isAdmin = ['GOD','ADMIN'].includes(user.role);
  const visibleResources = allResources.filter(r=>r!=='users'||isAdmin);
  const canEdit = (r: Resource) => ['GOD','ADMIN'].includes(user.role) || (user.role==='MANAGER' && r!=='users') || (user.role==='STAFF' && ['customers','appointments','invoices','laserPlans','laserSessions'].includes(r));

  async function reload() {
    setLoading(true);
    try {
      const loaded = await Promise.all(visibleResources.map(async r=>{
        const response = await fetch('/api/data/'+r,{cache:'no-store'});
        if (!response.ok) throw new Error('Load failed');
        return [r,await response.json()] as const;
      }));
      setData(Object.fromEntries(loaded));
      setError('');
    } catch { setError(t('error')); }
    finally { setLoading(false); }
  }
  useEffect(()=>{
    const saved = localStorage.getItem('salon_lang');
    if (saved==='ar'||saved==='he'||saved==='en') setLang(saved);
    reload();
  },[]);
  function language(value: Language) { setLang(value); localStorage.setItem('salon_lang',value); document.documentElement.lang=value; document.documentElement.dir=value==='en'?'ltr':'rtl'; }
  function navigate(next: Section) { setSection(next); setResource(next==='college'?'students':next==='events'?'eventLeads':next==='salon'?'customers':'users'); setSearch(''); setFilter('ALL'); setProfile(null); }
  function choose(r: Resource) { setResource(r); setSearch(''); setFilter('ALL'); setProfile(null); }
  function begin(r: Resource, row?: Row, preset: Row = {}) {
    const values: Row = { ...row, ...preset };
    for (const field of definitions[r].fields) {
      if (field.type==='date') values[field.key] = dateInput(values[field.key]);
      if (values[field.key]===null || values[field.key]===undefined) values[field.key]='';
      if (!row && field.type==='select' && !values[field.key]) values[field.key]=field.options?.[0]??'';
      if (!row && field.type==='checkbox') values[field.key]=true;
      if (!row && field.type==='number' && !values[field.key]) values[field.key]=field.key==='sessionsTotal'?1:field.key==='durationMinutes'?60:0;
    }
    if (r==='users' && !row) values.role='STAFF';
    setForm({ resource:r, values, editId: row?.id });
    setError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form) return;
    setSaving(true); setError('');
    const payload: Row = { ...form.values };
    const original = form.editId ? data[form.resource]?.find(row => row.id === form.editId) : undefined;
    if (form.editId) payload.id=form.editId;
    for (const field of definitions[form.resource].fields) {
      const key=field.key;
      if (field.type==='date') payload[key]=dateInputToISO(payload[key],original?.[key]);
      if (field.type==='number') payload[key]=Number(payload[key]||0);
      if (field.type==='relation' && !payload[key] && optionalRelationKeys.has(key)) payload[key]=null;
    }
    if (form.resource==='users' && !payload.password) delete payload.password;
    if (form.resource==='invoices') payload.status=Number(payload.paidAmount)>=Number(payload.amount)?'PAID':Number(payload.paidAmount)>0?'PARTIAL':'UNPAID';
    if (form.resource==='expenses') payload.status=payload.paidAt?'PAID':'DUE';
    try {
      const response=await fetch('/api/data/'+form.resource,{method:form.editId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if (!response.ok) { setError(result.error??t('error')); return; }
      setForm(null); await reload();
    } catch { setError(t('error')); }
    finally { setSaving(false); }
  }
  async function upload(planId: string, file: File) {
    setUploading(planId); setError('');
    try {
      const body=new FormData(); body.set('planId',planId); body.set('file',file);
      const response=await fetch('/api/laser-documents',{method:'POST',body});
      const result=await response.json();
      if (!response.ok) { setError(result.error??t('error')); return; }
      await reload();
    } catch { setError(t('error')); }
    finally { setUploading(null); }
  }
  async function unlockUser(id:string) {
    setError('');
    const response=await fetch(`/api/users/${id}/unlock`,{method:'POST'});
    const result=await response.json();
    if(!response.ok){setError(result.error??t('error'));return;}
    await reload();
  }
  async function deleteRow(targetResource:Resource,id:string) {
    if(!window.confirm(t('confirmDelete')))return;
    setError('');
    const response=await fetch('/api/data/'+targetResource,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    const result=await response.json();
    if(!response.ok){setError(result.error??t('error'));return;}
    if(profile?.id===id)setProfile(null);
    await reload();
  }

  const rows = useMemo(()=>{
    const source=data[resource]??[];
    return source.filter(row=>{
      if (search && !JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) return false;
      if (filter==='ALL') return true;
      if (resource==='eventLeads') return row.region===filter || row.stage===filter;
      if (resource==='students') return row.status===filter || filter==='DUE' && row.followUpAt && new Date(row.followUpAt)<=new Date();
      if (resource==='customers') return row.relationshipStatus===filter || filter==='DUE' && row.followUpAt && new Date(row.followUpAt)<=new Date() || filter==='ABSENT_60' && row.lastVisitAt && Date.now()-new Date(row.lastVisitAt).getTime()>60*day;
      return true;
    });
  },[data,resource,search,filter]);
  const selected = profile ? (data[profile.resource]??[]).find(r=>r.id===profile.id) : null;
  const dueStudents=(data.students??[]).filter(s=>s.followUpAt&&new Date(s.followUpAt)<=new Date()&&s.status!=='INACTIVE');
  const dueCustomers=(data.customers??[]).filter(c=>c.followUpAt&&new Date(c.followUpAt)<=new Date()&&c.relationshipStatus!=='INACTIVE');
  const dueLeads=(data.eventLeads??[]).filter(l=>l.followUpAt&&new Date(l.followUpAt)<=new Date()&&!['CLOSED','LOST'].includes(l.stage));

  function value(row: Row, key: string, r: Resource): React.ReactNode {
    if (key==='studentBalance') return moneyText(studentBalance(row),lang);
    if (key==='customerBalance') return moneyText(customerBalance(row.id,data),lang);
    if (key==='eventBalance') return moneyText(balance(row.agreedAmount,row.paidAmount),lang);
    if (key==='enrollmentPaid') return moneyText(enrollmentPaid(row),lang);
    if (key==='enrollmentBalance') return moneyText(balance(row.fee,enrollmentPaid(row)),lang);
    if (key==='courseSummary') return (row.enrollments??[]).map((e:Row)=>e.course?.title).filter(Boolean).join(', ')||'—';
    if (key==='sessionsCompleted') return `${row.sessions?.length??0} / ${row.sessionsTotal}`;
    if (key==='requiresGodUnlock') return row[key]?'⚠ '+t('requiresGodUnlock'):'—';
    if (key.endsWith('Id')) {
      const source=definitions[r].fields.find(f=>f.key===key)?.source;
      const related=source ? (data[source]??[]).find(x=>x.id===row[key]) : null;
      if (key==='enrollmentId' && related) return `${related.student?.name??'—'} · ${related.course?.title??'—'}`;
      if (key==='planId' && related) return `${related.customer?.name??'—'} · ${related.area}`;
      return related?.name??related?.title??'—';
    }
    if (moneyKeys.has(key)) return moneyText(row[key],lang);
    if (key.endsWith('At')) return dateText(row[key],lang);
    if (key==='active') return row[key]?'✓':'—';
    if (['status','stage','region','category','relationshipStatus'].includes(key)) return <span className={'badge '+String(row[key]).toLowerCase()}>{t(String(row[key]))}</span>;
    return String(row[key]??'—');
  }
  function relationName(r: Resource, row: Row) {
    if (r==='enrollments') return `${row.student?.name??'—'} · ${row.course?.title??'—'}`;
    if (r==='laserPlans') return `${row.customer?.name??'—'} · ${row.area}`;
    return row.name??row.title??'—';
  }
  function input(field: Field) {
    if (!form) return null;
    const v=form.values[field.key]??'';
    const update=(next: unknown)=>setForm({ ...form, values: { ...form.values, [field.key]:next } });
    if (field.type==='relation') return <select value={v} required={field.required} onChange={e=>{
      const next=e.target.value;
      const related=(data[field.source!]??[]).find(row=>row.id===next);
      if (!form.editId && field.key==='courseId' && related) setForm({ ...form, values: { ...form.values, courseId: next, fee: Number(related.fee) } });
      else if (!form.editId && field.key==='packageId' && related) setForm({ ...form, values: { ...form.values, packageId: next, agreedAmount: Number(related.price) } });
      else update(next);
    }}><option value="">—</option>{(data[field.source!]??[]).map(row=><option key={row.id} value={row.id}>{relationName(field.source!,row)}</option>)}</select>;
    if (field.type==='select') return <select value={v} onChange={e=>update(e.target.value)}>{field.options?.filter(o=>field.key!=='role'||o!=='GOD'||user.role==='GOD').map(o=><option key={o} value={o}>{t(o)}</option>)}</select>;
    if (field.type==='checkbox') return <input type="checkbox" checked={Boolean(v)} onChange={e=>update(e.target.checked)} />;
    if (field.type==='textarea') return <textarea value={v} onChange={e=>update(e.target.value)} />;
    return <input type={field.type==='date'?'datetime-local':field.type==='number'?'number':field.type==='email'?'email':'text'} min={field.type==='number'?'0':undefined} step={field.type==='number'?'0.01':undefined} required={field.required || field.key==='password'&&!form.editId} value={v} onChange={e=>update(e.target.value)} />;
  }
  const filterOptions = resource==='eventLeads'?['ALL','DUBAI','LOCAL','NEW','CONTACTED','FOLLOW_UP','CLOSED','LOST']:resource==='students'?['ALL','DUE','NEW','CONTACTED','AWAITING_DETAILS','ENROLLED']:resource==='customers'?['ALL','DUE','ABSENT_60','NEW','ACTIVE','FOLLOW_UP','INACTIVE','RETURNING']:[];

  return <div className="workspace" dir={dir}>
    <aside className="workspaceSide">
      <div className="workspaceBrand"><span className="brandFlower">✦</span><div><strong>Sii Bello Saloon</strong><small>WORKSPACE</small></div></div>
      <nav>{(['overview','college','events','salon','requests',...(isAdmin?['admin']:[])] as Section[]).map(s=><button key={s} className={section===s?'on':''} onClick={()=>navigate(s)}><span>{icons[s]}</span>{t(s)}</button>)}</nav>
      <div className="workspaceUser"><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>{t(user.role)}</small></div></div>
    </aside>
    <main className="workspaceMain">
      <header className="workspaceTop"><div className="workspaceBreadcrumb">Sii Bello Saloon <span>/</span> {t(section)}</div><div className="workspaceActions"><div className="languages">{(['ar','he','en'] as Language[]).map(l=><button key={l} className={lang===l?'active':''} onClick={()=>language(l)}>{l.toUpperCase()}</button>)}</div><button className="logout" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login';}}>{t('logout')}</button></div></header>
      <div className="workspaceContent">
        {section==='requests' ? <><div className="workspaceHeading"><div><span className="eyebrow">SII BELLO SALOON</span><h1>{t('requests')}</h1><p>Approve or decline customer appointment requests.</p></div></div><RequestsAdmin isGod={user.role==="GOD"} canDelete={isAdmin}/></> : section==='overview' ? <><div className="workspaceHeading"><div><span className="eyebrow">SII BELLO SALOON</span><h1>{t('welcome')}</h1><p>{t('intro')}</p></div></div><div className="sectionCards">{(['college','events','salon'] as Section[]).map(s=><button key={s} className="sectionCard" onClick={()=>navigate(s)}><span className="sectionIcon">{icons[s]}</span><strong>{t(s)}</strong><small>{s==='college'?`${(data.students??[]).length} ${t('students')}`:s==='events'?`${(data.eventLeads??[]).length} ${t('eventLeads')}`:`${(data.customers??[]).length} ${t('customers')}`}</small><span className="sectionArrow">↗</span></button>)}</div><div className="workspaceMetrics"><Metric label={t('dueNow')+' · '+t('students')} value={dueStudents.length} /><Metric label={t('dueNow')+' · '+t('eventLeads')} value={dueLeads.length} /><Metric label={t('dueNow')+' · '+t('customers')} value={dueCustomers.length} /><Metric label={t('customerBalance')} value={moneyText((data.customers??[]).reduce((n,c)=>n+customerBalance(c.id,data),0),lang)} /></div><div className="workspaceGrid"><Queue title={t('studentContacts')} rows={dueStudents} dateKey="followUpAt" t={t} lang={lang} onOpen={row=>{navigate('college');setProfile({resource:'students',id:row.id});}} /><Queue title={t('eventContacts')} rows={dueLeads} dateKey="followUpAt" t={t} lang={lang} onOpen={row=>{navigate('events');setProfile({resource:'eventLeads',id:row.id});}} /><Queue title={t('customers')} rows={dueCustomers} dateKey="followUpAt" t={t} lang={lang} onOpen={row=>{navigate('salon');setProfile({resource:'customers',id:row.id});}} /></div></> : <>
          <div className="workspaceHeading"><div><span className="eyebrow">SII BELLO SALOON / {t(section).toUpperCase()}</span><h1>{t(section)}</h1><p>{section==='college'?t('students')+' · '+t('collegeCourses')+' · '+t('studentPayments'):section==='events'?t('eventLeads')+' · '+t('eventPackages'):section==='salon'?t('customers')+' · '+t('laserPlans'):t('users')}</p></div></div>
          <div className="workspaceTabs">{resourcesBySection[section].map(r=><button key={r} className={resource===r?'on':''} onClick={()=>choose(r)}>{t(r)}</button>)}</div>
          {selected && profile ? <Profile resource={profile.resource} row={selected} data={data} t={t} lang={lang} canEdit={canEdit(profile.resource)} onBack={()=>setProfile(null)} onEdit={(r,row,preset)=>begin(r,row,preset)} onUpload={upload} uploading={uploading} /> : <>
            <div className="workspaceListHeading"><div><h2>{t(resource)}</h2><span>{rows.length} {t('total')}</span></div>{canEdit(resource)&&<button className="primary" onClick={()=>begin(resource)}>＋ {t('add')}</button>}</div>
            <div className="workspaceToolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search')} />{filterOptions.length>0&&<div className="filterPills">{filterOptions.map(option=><button key={option} className={filter===option?'on':''} onClick={()=>setFilter(option)}>{t(option)}</button>)}</div>}</div>
            <div className="workspaceTable"><table><thead><tr>{definitions[resource].columns.map(c=><th key={c}>{t(c)}</th>)}<th>{t('activity')}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>{definitions[resource].columns.map(c=><td key={c}>{value(row,c,resource)}</td>)}<td className="tableActions">{definitions[resource].profile&&<button onClick={()=>setProfile({resource,id:row.id})}>{t('profile')}</button>}{canEdit(resource)&&!(resource==='users'&&row.role==='GOD'&&user.role!=='GOD')&&<button onClick={()=>begin(resource,row)}>{t('edit')}</button>}{resource==='users'&&user.role==='GOD'&&(row.requiresGodUnlock||row.lockedUntil)&&<button onClick={()=>unlockUser(row.id)}>{t('unlock')}</button>}{['GOD','ADMIN'].includes(user.role)&&!(resource==='users'&&(row.id===user.id||row.role==='GOD'))&&<button className="dangerButton" onClick={()=>deleteRow(resource,row.id)}>{t('delete')}</button>}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty">{loading?'...':t('empty')}</div>}</div>
          </>}
        </>}
        {error&&!form&&<div className="error">{error}</div>}
      </div>
    </main>
    {form&&<div className="modalBackdrop" onMouseDown={()=>setForm(null)}><div className="modal workspaceModal" dir={dir} onMouseDown={e=>e.stopPropagation()}><div className="modalHeader"><h2>{form.editId?t('edit'):t('add')} · {t(form.resource)}</h2><button onClick={()=>setForm(null)}>×</button></div><form onSubmit={save}><div className="formGrid">{definitions[form.resource].fields.map(field=><label key={field.key}>{t(field.key)}{input(field)}</label>)}</div>{error&&<div className="error">{error}</div>}<div className="modalActions"><button type="button" className="secondary" onClick={()=>setForm(null)}>{t('cancel')}</button><button type="submit" className="primary" disabled={saving}>{saving?'...':t('save')}</button></div></form></div></div>}
  </div>;
}

function Metric({label,value}:{label:string;value:string|number}) { return <div className="workspaceMetric"><small>{label}</small><strong>{value}</strong></div>; }
function Queue({title,rows,dateKey,t,lang,onOpen}:{title:string;rows:Row[];dateKey:string;t:(key:string)=>string;lang:Language;onOpen:(row:Row)=>void}) { return <section className="queueCard"><h2>{title}</h2>{rows.slice(0,5).map(row=><button key={row.id} onClick={()=>onOpen(row)}><strong>{row.name}</strong><small>{dateText(row[dateKey],lang)}</small></button>)}{!rows.length&&<p>{t('noData')}</p>}</section>; }

function Profile({resource,row,data,t,lang,canEdit,onBack,onEdit,onUpload,uploading}:{resource:Resource;row:Row;data:Record<string,Row[]>;t:(key:string)=>string;lang:Language;canEdit:boolean;onBack:()=>void;onEdit:(resource:Resource,row?:Row,preset?:Row)=>void;onUpload:(planId:string,file:File)=>void;uploading:string|null}) {
  const related = (resourceName: Resource, key: string) => (data[resourceName]??[]).filter(item=>item[key]===row.id);
  const balanceValue=resource==='students'?studentBalance(row):resource==='eventLeads'?balance(row.agreedAmount,row.paidAmount):customerBalance(row.id,data);
  return <div className="profileView"><button className="backButton" onClick={onBack}>← {t('back')}</button><div className="profileHero"><div className="profileAvatar">{row.name?.charAt(0).toUpperCase()}</div><div><span className="eyebrow">{t(resource)} / {t('profile')}</span><h2>{row.name}</h2><p>{row.phone} {row.email&&`· ${row.email}`}</p></div><div className="profileBalance"><small>{resource==='customers'?t('customerBalance'):t('balance')}</small><strong>{moneyText(balanceValue,lang)}</strong></div>{canEdit&&<button className="secondary" onClick={()=>onEdit(resource,row)}>{t('edit')}</button>}</div>
    {resource==='students'&&<><div className="profileActionBar">{canEdit&&<><button onClick={()=>onEdit('enrollments',undefined,{studentId:row.id})}>＋ {t('newEnrollment')}</button><button onClick={()=>onEdit('studentContacts',undefined,{studentId:row.id})}>＋ {t('newContact')}</button></>}</div><div className="profileColumns"><section className="detailCard"><h3>{t('enrollmentHistory')}</h3>{related('enrollments','studentId').map(e=><div className="detailLine" key={e.id}><div><strong>{e.course?.title}</strong><small>{t('fee')}: {moneyText(e.fee,lang)} · {t('paid')}: {moneyText(enrollmentPaid(e),lang)}</small><small>{t('balance')}: {moneyText(balance(e.fee,enrollmentPaid(e)),lang)}</small></div>{canEdit&&<button onClick={()=>onEdit('studentPayments',undefined,{enrollmentId:e.id})}>＋ {t('newPayment')}</button>}</div>)}{!related('enrollments','studentId').length&&<p>{t('empty')}</p>}</section><section className="detailCard"><h3>{t('contactHistory')}</h3>{related('studentContacts','studentId').map(c=><div className="detailLine" key={c.id}><div><strong>{c.outcome}</strong><small>{t(c.channel)} · {dateText(c.contactedAt,lang)}</small><small>{c.notes}</small></div></div>)}{!related('studentContacts','studentId').length&&<p>{t('empty')}</p>}</section></div></>}
    {resource==='eventLeads'&&<><div className="profileFacts"><span>{t('region')}: <strong>{t(row.region)}</strong></span><span>{t('stage')}: <strong>{t(row.stage)}</strong></span><span>{t('packageId')}: <strong>{row.package?.name??'—'}</strong></span><span>{t('agreedAmount')}: <strong>{moneyText(row.agreedAmount,lang)}</strong></span><span>{t('paidAmount')}: <strong>{moneyText(row.paidAmount,lang)}</strong></span></div><div className="profileActionBar">{canEdit&&<button onClick={()=>onEdit('eventContacts',undefined,{leadId:row.id})}>＋ {t('newContact')}</button>}</div><section className="detailCard"><h3>{t('contactHistory')}</h3>{related('eventContacts','leadId').map(c=><div className="detailLine" key={c.id}><div><strong>{c.outcome}</strong><small>{t(c.channel)} · {dateText(c.contactedAt,lang)}</small><small>{c.notes}</small></div><span>{dateText(c.nextFollowUpAt,lang)}</span></div>)}{!related('eventContacts','leadId').length&&<p>{t('empty')}</p>}</section></>}
    {resource==='customers'&&<><div className="profileFacts"><span>{t('relationshipStatus')}: <strong>{t(row.relationshipStatus)}</strong></span><span>{t('lastVisitAt')}: <strong>{dateText(row.lastVisitAt,lang)}</strong></span><span>{t('followUpAt')}: <strong>{dateText(row.followUpAt,lang)}</strong></span></div><div className="profileActionBar">{canEdit&&<><button onClick={()=>onEdit('appointments',undefined,{customerId:row.id})}>＋ {t('appointments')}</button><button onClick={()=>onEdit('invoices',undefined,{customerId:row.id})}>＋ {t('invoices')}</button><button onClick={()=>onEdit('laserPlans',undefined,{customerId:row.id})}>＋ {t('newPlan')}</button></>}</div><div className="profileColumns"><section className="detailCard"><h3>{t('invoicesHistory')}</h3>{related('invoices','customerId').map(i=><div className="detailLine" key={i.id}><div><strong>{i.description}</strong><small>{dateText(i.createdAt,lang)} · {t(i.status)}</small></div><strong>{moneyText(balance(i.amount,i.paidAmount),lang)}</strong></div>)}{!related('invoices','customerId').length&&<p>{t('empty')}</p>}</section><section className="detailCard"><h3>{t('appointmentsHistory')}</h3>{related('appointments','customerId').map(a=><div className="detailLine" key={a.id}><div><strong>{a.service?.name}</strong><small>{dateText(a.startsAt,lang)} · {t(a.status)}</small></div></div>)}{!related('appointments','customerId').length&&<p>{t('empty')}</p>}</section></div><section className="detailCard laserCard"><h3>{t('laserPlans')}</h3>{related('laserPlans','customerId').map(plan=><div className="laserPlan" key={plan.id}><div className="laserPlanHead"><div><strong>{plan.area}</strong><small>{t('laserProgress')}: {plan.sessions?.length??0} / {plan.sessionsTotal}</small><small>{t('consentNotes')}: {plan.consentNotes||'—'}</small></div>{canEdit&&<button onClick={()=>onEdit('laserSessions',undefined,{planId:plan.id})}>＋ {t('newSession')}</button>}</div><div className="laserSessions">{(plan.sessions??[]).map((s:Row)=><span key={s.id}>{dateText(s.performedAt,lang)} · {s.staff?.name??'—'}</span>)}</div><div className="laserDocs"><strong>{t('documents')}</strong>{(plan.documents??[]).map((d:Row)=><a key={d.id} href={'/api/laser-documents/'+d.id} target="_blank" rel="noreferrer">{d.filename}</a>)}{canEdit&&<label className="uploadButton">{uploading===plan.id?'...':t('upload')}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(plan.id,file);e.currentTarget.value='';}} /></label>}</div></div>)}{!related('laserPlans','customerId').length&&<p>{t('empty')}</p>}</section></>}
  </div>;
}
