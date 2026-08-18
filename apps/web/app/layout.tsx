import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Admin UI',
  description: 'Multi-tenant search SaaS admin console',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          padding: '1.5rem',
          background: '#f7f7f8',
          color: '#1a1a1a',
        }}
      >
        {children}
      </body>
    </html>
  );
}
