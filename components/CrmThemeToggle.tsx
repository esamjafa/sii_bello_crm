'use client';
import { useEffect, useState } from 'react';

export default function CrmThemeToggle(){
 const [legacy,setLegacy]=useState(false);
 const [calm,setCalm]=useState(false);
 useEffect(()=>{
  try { const saved=localStorage.getItem('crm-color-theme')==='legacy';setLegacy(saved);document.querySelector('.crm-app')?.setAttribute('data-theme',saved?'legacy':'new'); } catch {}
  try { const saved=localStorage.getItem('crm-calm-background')==='true';setCalm(saved);document.querySelector('.crm-app')?.setAttribute('data-background',saved?'calm':'pearl'); } catch {}
 },[]);
 function toggle(){
  const next=!legacy;setLegacy(next);
  document.querySelector('.crm-app')?.setAttribute('data-theme',next?'legacy':'new');
  try { localStorage.setItem('crm-color-theme',next?'legacy':'new'); } catch {}
 }
 function toggleCalm(){const next=!calm;setCalm(next);document.querySelector('.crm-app')?.setAttribute('data-background',next?'calm':'pearl');try{localStorage.setItem('crm-calm-background',String(next));}catch{}}
 return <><button type="button" className="crm-theme-toggle" role="switch" aria-checked={legacy} aria-label="الألوان القديمة" title={legacy?'التبديل إلى الألوان الجديدة':'التبديل إلى الألوان القديمة'} onClick={toggle}><span className="crm-theme-label">{legacy?'الألوان القديمة':'الألوان الجديدة'}</span></button><button type="button" className="crm-theme-toggle" role="switch" aria-checked={calm} aria-label="خلفية هادئة" onClick={toggleCalm}>خلفية هادئة</button></>;
}
