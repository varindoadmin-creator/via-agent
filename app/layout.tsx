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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
