import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import Workspace from '@/components/Workspace';
import CustomerPortal from '@/components/CustomerPortal';
import { bookingCustomerId } from '@/lib/booking-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await currentUser();
  if (!user) {
    if (await bookingCustomerId()) redirect('/book');
    redirect('/login');
  }
  if (user.role === 'CUSTOMER') return <CustomerPortal user={user} />;
  return <Workspace user={user} />;
}
