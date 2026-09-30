import Link from 'next/link';
export const metadata = { title: 'الحجز · Sii Bello Saloon' };
export default function BookPage() {
 return <main dir="rtl" style={{maxWidth:600,margin:'4rem auto',padding:'1.5rem'}}>
 <h1>الحجز الإلكتروني غير متاح حاليًا</h1>
 <p>يرجى التواصل مع الصالون مباشرة لتحديد موعد.</p>
 <Link href="/login">تسجيل الدخول</Link></main>;
}
