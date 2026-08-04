'use client';

import { PurchasingRecommendations } from '../page';

export default function MirpoPage() {
  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div className="mb-5">
          <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">MIRPO</h1>
          <p className="text-[var(--text-3)] text-sm mt-1">
            Monthly LAMITAK replenishment planning, retail-demand analysis, and Zoho Draft PO creation.
          </p>
        </div>
        <PurchasingRecommendations />
      </div>
    </div>
  );
}
