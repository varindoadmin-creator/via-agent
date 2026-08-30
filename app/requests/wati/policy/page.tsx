import { POLICY_MATRIX } from '@/lib/security/disclosure/classification';

const CLASSIFICATION_STYLE: Record<string, string> = {
  PUBLIC: 'bg-emerald-100 text-emerald-700',
  CUSTOMER_SHAREABLE: 'bg-emerald-100 text-emerald-700',
  CUSTOMER_SCOPED: 'bg-amber-100 text-amber-700',
  INTERNAL: 'bg-red-100 text-red-700',
  CONFIDENTIAL: 'bg-red-100 text-red-700',
  RESTRICTED: 'bg-red-100 text-red-700',
};

const SUMMARY_STYLE: Record<string, string> = {
  Allow: 'text-emerald-700',
  Deny: 'text-red-700',
  'Conditional Allow': 'text-amber-700',
};

/** Read-only (brief section 42) — policy changes require code/admin governance, never edited through this page or through chat. */
export default function CustomerDataPolicyPage() {
  return <div className="min-h-full bg-[var(--surface-secondary)] p-6 lg:p-8"><div className="mx-auto max-w-[1100px] space-y-5">
    <header><h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Customer Data Policy</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">What external WhatsApp customers may and may not receive from VIA. Read-only — see <code>lib/security/disclosure/classification.ts</code> to change it.</p>
    </header>
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[var(--surface-secondary)] text-xs uppercase tracking-wide text-[var(--text-secondary)]"><tr>
          <th className="px-4 py-3">Data / Capability</th><th className="px-4 py-3">Classification</th><th className="px-4 py-3">External Customer</th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{POLICY_MATRIX.map(entry => <tr key={entry.category} className="hover:bg-[var(--surface-secondary)]">
          <td className="px-4 py-3 font-medium text-[var(--text)]">{entry.label}</td>
          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CLASSIFICATION_STYLE[entry.classification]}`}>{entry.classification}</span></td>
          <td className={`px-4 py-3 font-medium ${SUMMARY_STYLE[entry.externalSummary]}`}>{entry.externalSummary}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div></div>;
}
