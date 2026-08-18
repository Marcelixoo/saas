import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ibmPlexSans, jetbrainsMono } from './fonts';
import { Toaster } from '../components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin UI',
  description: 'Multi-tenant search SaaS admin console',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
