'use client';
import { useEffect, useState } from 'react';

export default function CrmThemeToggle(){
 const [legacy,setLegacy]=useState(false);
 useEffect(()=>{
  try { const saved=localStorage.getItem('crm-color-theme')==='legacy';setLegacy(saved);document.querySelector('.crm-app')?.setAttribute('data-theme',saved?'legacy':'new'); } catch {}
 },[]);
 function toggle(){
  const next=!legacy;setLegacy(next);
  document.querySelector('.crm-app')?.setAttribute('data-theme',next?'legacy':'new');
  try { localStorage.setItem('crm-color-theme',next?'legacy':'new'); } catch {}
 }
 return <button type="button" className="crm-theme-toggle" role="switch" aria-checked={legacy} aria-label="الألوان القديمة" title={legacy?'التبديل إلى الألوان الجديدة':'التبديل إلى الألوان القديمة'} onClick={toggle}><span aria-hidden="true">{legacy?'☀':'◐'}</span><span className="crm-theme-label">{legacy?'الألوان القديمة':'الألوان الجديدة'}</span></button>;
}
