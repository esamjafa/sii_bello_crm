import Login from '@/components/Login';
import { redirect } from 'next/navigation';
import { bookingCustomerId } from '@/lib/booking-auth';
export default async function LoginPage() { if (await bookingCustomerId()) redirect('/book'); return <Login />; }
