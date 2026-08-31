'use client';

import { useEffect, useState } from 'react';

interface KnowledgeData {
  company: { legalName: string; headOffice: { lines: string[]; phone: string }; registeredOffice: { lines: string[]; phone: string }; contact: { email: string; website: string } };
  brands: Record<string, { brand: string; dealerStatement: string; website: string }>;
  shipping: { freeShippingJava: string; conditions: string };
  payment: { bank: string; accountName: string; accountNumber: string; branch: string; status: string } | null;
  productScope: { approvedBrands: string[]; unsupportedBrandText: string; unsupportedCategoryText: string };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="via-card overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h2 className="text-[var(--text)] font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-5 text-sm text-[var(--text-2)] space-y-2">{children}</div>
    </div>
  );
}

export default function KnowledgePage() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/knowledge').then(r => r.json()).then(body => {
      if (!body.success) throw new Error(body.error || 'Failed to load.');
      setData(body);
    }).catch(e => setError(String(e)));
  }, []);

  if (error) return <div className="via-page p-6"><div className="text-[var(--danger)] text-sm">{error}</div></div>;
  if (!data) return <div className="via-page p-6"><div className="text-[var(--text-3)] text-sm">Loading…</div></div>;

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="mb-6">
          <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Company &amp; Policy Knowledge</h1>
          <p className="text-[var(--text-4)] text-xs mt-1">Approved static facts served to WATI and internal Jarvis alike. Code-deployed and versioned in source — not live-editable here.</p>
        </div>

        <Section title="Company">
          <p className="font-medium text-[var(--text)]">{data.company.legalName}</p>
          <p><span className="text-[var(--text-4)]">Head office: </span>{data.company.headOffice.lines.join(', ')} — T. {data.company.headOffice.phone}</p>
          <p><span className="text-[var(--text-4)]">Registered office: </span>{data.company.registeredOffice.lines.join(', ')} — T. {data.company.registeredOffice.phone}</p>
          <p><span className="text-[var(--text-4)]">Contact: </span>{data.company.contact.email} · {data.company.contact.website}</p>
        </Section>

        <Section title="Brands">
          {Object.values(data.brands).map(b => (
            <p key={b.brand}><span className="font-medium text-[var(--text)]">{b.brand}: </span>{b.dealerStatement} — {b.website}</p>
          ))}
        </Section>

        <Section title="Shipping">
          <p>{data.shipping.freeShippingJava}</p>
          <p className="text-[var(--text-3)] text-xs">{data.shipping.conditions}</p>
        </Section>

        <Section title="Payment">
          {data.payment ? (
            <p>Bank {data.payment.bank}, a/n {data.payment.accountName}, No. Rek. {data.payment.accountNumber}, {data.payment.branch} — <span className="text-emerald-600 font-medium">{data.payment.status}</span></p>
          ) : <p className="text-[var(--text-3)]">No active payment destination configured.</p>}
        </Section>

        <Section title="Product Scope">
          <p><span className="text-[var(--text-4)]">Approved brands: </span>{data.productScope.approvedBrands.join(', ')}</p>
          <p className="text-[var(--text-3)] text-xs">{data.productScope.unsupportedBrandText}</p>
          <p className="text-[var(--text-3)] text-xs">{data.productScope.unsupportedCategoryText}</p>
        </Section>

        <Section title="Sample / Catalogue">
          <p>Lamitak samples → varindo.co.id. EDL samples → varindohpl.com. Website intake is authoritative; WATI never re-collects form data.</p>
        </Section>
      </div>
    </div>
  );
}
