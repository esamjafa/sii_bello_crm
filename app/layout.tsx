import './globals.css';
import './workspace.css';
import './crm.css';
import './crm-theme.css';
import './crm-reference.css';
import './service-catalogue.css';
import './october-reference.css';
import './pearl-theme.css';
export const metadata = { title: 'Sii Bello Saloon CRM', description: 'Sii Bello Saloon operations, customers and finance' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
