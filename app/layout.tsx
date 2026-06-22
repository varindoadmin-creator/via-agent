import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'VIA — Varindo Intelligence Agent',
  description: 'Internal operations assistant for Varindo, connected to Zoho Books.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
