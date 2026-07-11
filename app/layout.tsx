import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import AppShell from '@/components/AppShell';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'VIA — Varindo Intelligence Agent',
  description: 'Internal operations assistant for Varindo, connected to Zoho Books.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const role = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        {/* Silently reload when a stale JS chunk 404s after a new deployment */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function isChunkErr(msg){ return msg && (msg.indexOf('Loading chunk')!==-1||msg.indexOf('ChunkLoadError')!==-1||msg.indexOf('Failed to fetch dynamically imported module')!==-1); }
            window.addEventListener('error',function(e){ if(isChunkErr(e.message)){ e.preventDefault(); window.location.reload(); } },true);
            window.addEventListener('unhandledrejection',function(e){ if(e.reason&&isChunkErr(e.reason.message||String(e.reason))){ e.preventDefault(); window.location.reload(); } });
          })();
        ` }} />
      </head>
      <body className="antialiased" data-v={process.env.NEXT_PUBLIC_BUILD_TIME}>
        <AppShell role={role}>{children}</AppShell>
      </body>
    </html>
  );
}
