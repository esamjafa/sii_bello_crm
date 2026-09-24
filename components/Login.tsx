'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Login() {
  const router = useRouter();
  const [lang,setLang] = useState<'en'|'ar'|'he'>('en');
  const words = { en: { sign:'Sign in to your workspace',email:'Username or email',password:'Password',button:'Sign in',error:'Invalid username or password' }, ar: { sign:'تسجيل الدخول إلى مساحة العمل',email:'اسم المستخدم أو البريد الإلكتروني',password:'كلمة المرور',button:'تسجيل الدخول',error:'اسم المستخدم أو كلمة المرور غير صحيحة' }, he: { sign:'כניסה למערכת',email:'שם משתמש או אימייל',password:'סיסמה',button:'כניסה',error:'שם משתמש או סיסמה שגויים' } }[lang];
  const [username,setUsername] = useState(''); const [password,setPassword] = useState(''); const [error,setError] = useState('');
  useEffect(()=>{const saved=localStorage.getItem('salon_lang');if(saved==='ar'||saved==='he')setLang(saved);},[]);
  async function submit(e: React.FormEvent) { e.preventDefault(); setError(''); const response = await fetch('/api/auth/login',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}); const result=await response.json().catch(()=>({})); setPassword(''); if(response.ok){router.push('/');router.refresh();}else setError(result.error||words.error); }
  function change(value:'en'|'ar'|'he'){setLang(value);localStorage.setItem('salon_lang',value);}
  return <main className="login" dir={lang==='en'?'ltr':'rtl'}><form onSubmit={submit} className="loginCard"><div className="languages">{(['en','ar','he'] as const).map(l=><button type="button" key={l} className={lang===l?'active':''} onClick={()=>change(l)}>{l.toUpperCase()}</button>)}</div><div className="brandMark">✦</div><h1>Sii Bello Saloon</h1><p>{words.sign}</p><label>{words.email}<input type="text" value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username" /></label><label>{words.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" /></label>{error && <div className="error">{error}</div>}<button type="submit" className="primary wide">{words.button}</button><a className="bookingLink" href="/book">Book by phone number</a></form></main>;
}
