// Scopes this whole file to the Node.js runtime. Deliberately dependency-free
// (no node-cron): that package's node:crypto usage broke the Edge-compatible
// bundle Next.js also builds for instrumentation.ts (since middleware.ts runs
// on Edge) — even behind a runtime check, webpack still needs to *compile*
// that bundle. Plain setTimeout/Date needs nothing Edge can't provide, so it
// sidesteps the problem entirely instead of working around it.
export const runtime = 'nodejs';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta is a fixed UTC+7, no DST.
const DAY_MS = 24 * 60 * 60 * 1000;

function next9amJakartaUTC(from: Date): Date {
  const shifted = new Date(from.getTime() + JAKARTA_OFFSET_MS);
  let target = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 9, 0, 0, 0));
  if (target.getTime() <= shifted.getTime()) target = new Date(target.getTime() + DAY_MS);
  return new Date(target.getTime() - JAKARTA_OFFSET_MS);
}

function scheduleDaily(run: () => void) {
  const fire = () => {
    run();
    setTimeout(fire, DAY_MS); // Jakarta has no DST, so a flat 24h step never drifts.
  };
  setTimeout(fire, next9amJakartaUTC(new Date()).getTime() - Date.now());
}

export async function register() {
  // Belt-and-suspenders: `export const runtime = 'nodejs'` above should already
  // keep this from firing under the Edge worker, but register() logging twice
  // in dev suggests it may be invoked per-runtime-context regardless — this
  // guard is what actually prevents scheduling the job twice.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { runAutoRepairForNewCustomers } = await import('./lib/customerCleanup/autoRepair');
  const { runAutoConvertReadyShipments } = await import('./lib/shipments/autoInvoice');

  scheduleDaily(() => {
    runAutoRepairForNewCustomers().catch(err => {
      console.error('[AutoRepair] Scheduled run failed:', err);
    });
    runAutoConvertReadyShipments().catch(err => {
      console.error('[AutoInvoice] Scheduled run failed:', err);
    });
  });

  console.log('[AutoRepair] Daily 09:00 Asia/Jakarta customer auto-repair scheduled.');
  console.log('[AutoInvoice] Daily 09:00 Asia/Jakarta shipment auto-invoice scheduled.');
}
