import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import './workspace.css';
import './crm.css';
import './crm-theme.css';
import './crm-reference.css';
import './service-catalogue.css';
import './october-reference.css';
import './pearl-theme.css';
import './laser-registration.css';
export const metadata: Metadata = {
  title: 'Sii Bello Saloon CRM',
  description: 'Sii Bello Saloon operations, customers and finance',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
