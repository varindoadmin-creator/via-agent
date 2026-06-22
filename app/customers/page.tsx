'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  contact_id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string;
  mobile: string;
  status: string;
  created_time: string;
  outstanding_receivable_amount: number;
  cf_tier: string;
  cf_customer_type: string;
  cf_region: string;
  last_so_date: string;
  last_so_number: string;
  so_count_90d: number;
  total_90d: number;
  days_since_last_order: number;
  category: 'new' | 'active' | 'inactive';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' };
const formatRp = (n: number) => n > 0 ? 'Rp ' + Number(n).toLocaleString('id-ID') : '—';

function agingColor(days: number) {
  if (days >= 60) return 'var(--danger)';
  if (days >= 30) return 'var(--warning)';
  if (days >= 14) return 'var(--accent-text)';
  return 'var(--text-3)';
}

function DaysBadge({ days, suffix }: { days: number; suffix: string }) {
  if (days >= 999) return <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>;
  return (
    <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: agingColor(days) }}>
      {days}d {suffix}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  if (!tier) return null;
  const colors: Record<string, string> = {
    'Gold':     'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
    'Silver':   'bg-[var(--surface-3)] text-[var(--text-2)] border-[var(--border)]',
    'Bronze':   'bg-[var(--accent-light)] text-[var(--accent-text)] border-[var(--accent-border)]',
    'Platinum': 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]',
  };
  const cls = colors[tier] || 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)]';
  return <span className={`via-badge border text-xs ${cls}`}>{tier}</span>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CF_TIER_OPTIONS = ['No Discount', 'Bronze', 'Silver', 'Gold', 'Platinum'];
const CF_TYPE_OPTIONS = ['End User', 'Sub-Dealer'];
const CF_REGION_OPTIONS = ['HEAD OFFICE', 'BDG-HUB', 'MDN-HUB', 'SMG-HUB'];
const PAYMENT_TERMS = [
  { value: 0, label: 'Due on Receipt' },
  { value: 7, label: 'Net 7' },
  { value: 14, label: 'Net 14' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
];

// ─── Add Customer Modal ───────────────────────────────────────────────────────

function AddCustomerModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [form, setForm] = useState({
    contact_name: '',
    company_name: '',
    email: '',
    phone: '',
    mobile: '',
    npwp: '',
    payment_terms: 0,
    cf_tier: 'No Discount',
    cf_customer_type: 'End User',
    cf_region: 'HEAD OFFICE',
    tax_id: '8607767000000093294', // PPN 11% default
    billing_street1: '',
    billing_street2: '',
    billing_city: '',
    billing_state: '',
    billing_zip: '',
  });
  const [copyBilling, setCopyBilling] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'basic' | 'address' | 'settings'>('basic');

  function set(k: string, v: string | number) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit() {
    if (!form.contact_name.trim()) { setError('Customer name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        contact_name: form.contact_name,
        company_name: form.company_name,
        email: form.email,
        phone: form.phone,
        mobile: form.mobile,
        npwp: form.npwp,
        payment_terms: form.payment_terms,
        cf_tier: form.cf_tier,
        cf_customer_type: form.cf_customer_type,
        cf_region: form.cf_region,
        tax_id: form.tax_id,
        copy_billing_to_shipping: copyBilling,
        billing_address: {
          address: form.billing_street1,
          street2: form.billing_street2,
          city: form.billing_city,
          state: form.billing_state,
          zip: form.billing_zip,
          country: 'Indonesia',
        },
      };
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create customer');
      onCreated(data.contact_name || form.contact_name);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const req = <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>;
  const inp = 'via-input text-xs py-2 px-3 w-full';
  const tabCls = (t: string) => `px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border-none ${
    activeTab === t
      ? 'bg-[var(--surface-3)] text-[var(--text)]'
      : 'text-[var(--text-3)] hover:text-[var(--text)]'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[540px] mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <h3 className="text-[var(--text)] font-semibold text-sm">Add New Customer</h3>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--surface-2)]">
          {(['basic', 'address', 'settings'] as const).map(t => (
            <button key={t} className={tabCls(t)} onClick={() => setActiveTab(t)} style={{ background: 'none' }}>
              {t === 'basic' ? 'Basic Info' : t === 'address' ? 'Address' : 'Settings'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* Basic Info */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label style={lbl}>Customer Name{req}</label>
                <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
                  placeholder="e.g. PROFITTO INOVASI KREATIF, PT"
                  className={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Company Name</label>
                <input value={form.company_name} onChange={e => set('company_name', e.target.value)}
                  placeholder="Leave blank if same as customer name"
                  className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lbl}>Mobile / WhatsApp</label>
                  <input value={form.mobile} onChange={e => set('mobile', e.target.value)}
                    placeholder="08xx xxxx xxxx" className={inp} />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="Office phone" className={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="email@company.com" type="email" className={inp} />
              </div>
              <div>
                <label style={lbl}>NPWP</label>
                <input value={form.npwp} onChange={e => set('npwp', e.target.value)}
                  placeholder="XX.XXX.XXX.X-XXX.XXX" className={inp} style={{ fontFamily: 'JetBrains Mono, monospace' }} />
              </div>
            </div>
          )}

          {/* Address */}
          {activeTab === 'address' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-3)] text-xs">Billing Address</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={copyBilling} onChange={e => setCopyBilling(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" />
                  <span className="text-[var(--text-3)] text-xs">Copy to Shipping Address</span>
                </label>
              </div>
              <div>
                <label style={lbl}>Street / Address</label>
                <input value={form.billing_street1} onChange={e => set('billing_street1', e.target.value)}
                  placeholder="Jl. ..." className={inp} />
              </div>
              <div>
                <label style={lbl}>Street 2</label>
                <input value={form.billing_street2} onChange={e => set('billing_street2', e.target.value)}
                  placeholder="Kec. / Kelurahan / Building" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lbl}>City</label>
                  <input value={form.billing_city} onChange={e => set('billing_city', e.target.value)}
                    placeholder="Bandung" className={inp} />
                </div>
                <div>
                  <label style={lbl}>State / Province</label>
                  <input value={form.billing_state} onChange={e => set('billing_state', e.target.value)}
                    placeholder="West Java" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={lbl}>ZIP Code</label>
                  <input value={form.billing_zip} onChange={e => set('billing_zip', e.target.value)}
                    placeholder="40xxx" className={inp} />
                </div>
                <div>
                  <label style={lbl}>Country</label>
                  <input value="Indonesia" disabled className={inp + ' opacity-50'} />
                </div>
              </div>
            </div>
          )}

          {/* Settings */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div>
                <label style={lbl}>Discount Tier{req}</label>
                <select value={form.cf_tier} onChange={e => set('cf_tier', e.target.value)} className={inp}>
                  {CF_TIER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Vendor / Customer Type{req}</label>
                <select value={form.cf_customer_type} onChange={e => set('cf_customer_type', e.target.value)} className={inp}>
                  {CF_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Region{req}</label>
                <select value={form.cf_region} onChange={e => set('cf_region', e.target.value)} className={inp}>
                  {CF_REGION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Payment Terms</label>
                <select value={form.payment_terms} onChange={e => set('payment_terms', Number(e.target.value))} className={inp}>
                  {PAYMENT_TERMS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tax Rate</label>
                <select value={form.tax_id} onChange={e => set('tax_id', e.target.value)} className={inp}>
                  <option value="8607767000000093294">PPN 11%</option>
                  <option value="">No Tax</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 p-2.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs flex-shrink-0">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <div className="flex gap-1">
            {(['basic', 'address', 'settings'] as const).map(t => (
              <span key={t} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: activeTab === t ? 'var(--accent)' : 'var(--border)',
                display: 'inline-block', cursor: 'pointer',
              }} onClick={() => setActiveTab(t)} />
            ))}
          </div>
          <div className="flex gap-3">
            {activeTab !== 'basic' && (
              <button onClick={() => setActiveTab(activeTab === 'settings' ? 'address' : 'basic')}
                className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
                ← Back
              </button>
            )}
            {activeTab !== 'settings' ? (
              <button onClick={() => setActiveTab(activeTab === 'basic' ? 'address' : 'settings')}
                className="px-4 py-2 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] border border-[var(--border)] rounded-lg transition-colors">
                Next →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Customer'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Customer Table ───────────────────────────────────────────────────────────

// ─── Editable Phone Component ────────────────────────────────────────────────

function EditablePhone({ contactId, value, email }: {
  contactId: string;
  value: string;
  email: string;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPhone(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function handleSave() {
    if (phone === value) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, mobile: phone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Failed to update: ' + String(e));
      setPhone(value); // revert
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setPhone(value); setEditing(false); }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" style={{ minWidth: 160 }}>
        <input
          ref={inputRef}
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="via-input text-xs py-1 px-2 w-32"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
          placeholder="08xx xxxx xxxx"
          disabled={saving}
        />
        {saving && <span className="text-[var(--text-4)] text-xs">…</span>}
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => setEditing(true)}
      title="Click to edit phone"
    >
      {phone ? (
        <span className="text-[var(--text-3)] text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {saved ? <span className="text-[var(--success)]">✓ {phone}</span> : phone}
        </span>
      ) : email ? (
        <span className="text-[var(--text-3)] text-xs">{email}</span>
      ) : (
        <span className="text-[var(--text-4)] text-xs">—</span>
      )}
      <span className="opacity-0 group-hover:opacity-60 text-[var(--text-4)] transition-opacity" style={{ fontSize: 10 }}>✏</span>
    </div>
  );
}

function CustomerTable({ title, desc, customers, loading, search, showActivity, showInactive, emptyIcon, emptyMsg, selectedIds, onToggleSelect }: {
  title: string; desc: string; customers: Customer[];
  loading: boolean; search: string;
  showActivity: boolean; showInactive: boolean;
  emptyIcon: string; emptyMsg: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<'so_count_90d' | 'total_90d' | 'days_since_last_order' | null>(
    showActivity ? 'total_90d' : null
  );
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  function handleSort(key: typeof sortKey) {
    if (!key) return;
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const filtered = useMemo(() => {
    let result = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.contact_name.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.cf_region.toLowerCase().includes(q) ||
        c.cf_tier.toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
      });
    }
    return result;
  }, [customers, search, sortKey, sortDir]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="via-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">{title}</h2>
          <p className="text-[var(--text-3)] text-xs mt-0.5">{desc}</p>
        </div>
        {!loading && <span className="text-[var(--text-4)] text-xs" style={mono}>{filtered.length} customers</span>}
      </div>

      {loading && (
        <div className="p-5 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-4 bg-[var(--surface-3)] rounded flex-1" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-24" />
              <div className="h-4 bg-[var(--surface-3)] rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center py-10">
          <div className="text-3xl mb-2 opacity-20">{emptyIcon}</div>
          <div className="text-[var(--text-3)] text-sm">{emptyMsg}</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 36 }}>
                  <input type="checkbox" className="w-3.5 h-3.5 rounded"
                    checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.contact_id))}
                    onChange={() => {
                      const allSel = filtered.every(c => selectedIds.has(c.contact_id));
                      filtered.forEach(c => {
                        const has = selectedIds.has(c.contact_id);
                        if (allSel && has) onToggleSelect(c.contact_id);
                        else if (!allSel && !has) onToggleSelect(c.contact_id);
                      });
                    }} />
                </th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Region</th>
                <th style={thStyle}>Tier</th>
                {showActivity && <>
                  <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('so_count_90d')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, float: 'right' }}>
                      SOs (90d)
                      <span style={{ color: sortKey === 'so_count_90d' ? 'var(--accent)' : 'var(--border)', fontSize: 9 }}>
                        {sortKey === 'so_count_90d' ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                      </span>
                    </span>
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('total_90d')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, float: 'right' }}>
                      Revenue (90d)
                      <span style={{ color: sortKey === 'total_90d' ? 'var(--accent)' : 'var(--border)', fontSize: 9 }}>
                        {sortKey === 'total_90d' ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                      </span>
                    </span>
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Last Order</th>
                </>}
                {showInactive && <>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Last Order</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Inactive</th>
                </>}
                {!showActivity && !showInactive && (
                  <th style={thStyle}>Added</th>
                )}
                <th style={{ ...thStyle, textAlign: 'right' }}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.contact_id}
                  className={`transition-colors ${selectedIds.has(c.contact_id) ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-2)]'}`}
                  style={{ borderBottom: '1px solid var(--border-muted)' }}>
                  <td style={{ padding: '8px 12px', width: 36 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-3.5 h-3.5 rounded"
                      checked={selectedIds.has(c.contact_id)}
                      onChange={() => onToggleSelect(c.contact_id)} />
                  </td>
                  <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                    <div className="text-[var(--text)] text-xs font-medium truncate" title={c.contact_name}>{c.contact_name}</div>
                    {c.company_name && c.company_name !== c.contact_name && (
                      <div className="text-[var(--text-4)] text-xs truncate">{c.company_name}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                    <EditablePhone
                      contactId={c.contact_id}
                      value={c.mobile || c.phone || ''}
                      email={c.email}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="text-[var(--text-3)] text-xs">{c.cf_region || '—'}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <TierBadge tier={c.cf_tier} />
                  </td>
                  {showActivity && <>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <span style={{ ...mono, color: c.so_count_90d > 0 ? 'var(--success)' : 'var(--text-4)', fontSize: 12, fontWeight: 600 }}>
                        {c.so_count_90d}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <span style={{ ...mono, color: 'var(--text-2)', fontSize: 12 }}>{formatRp(c.total_90d)}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {c.last_so_date ? (
                        <div>
                          <DaysBadge days={c.days_since_last_order} suffix="ago" />
                          <div className="text-[var(--text-4)]" style={{ fontSize: 10, ...mono }}>{c.last_so_number}</div>
                        </div>
                      ) : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}
                    </td>
                  </>}
                  {showInactive && <>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {c.last_so_date ? (
                        <div>
                          <div className="text-[var(--text-3)] text-xs">{c.last_so_date}</div>
                          <div className="text-[var(--text-4)]" style={{ fontSize: 10, ...mono }}>{c.last_so_number}</div>
                        </div>
                      ) : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>Never</span>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <DaysBadge days={c.days_since_last_order < 999 ? c.days_since_last_order : 90} suffix="inactive" />
                    </td>
                  </>}
                  {!showActivity && !showInactive && (
                    <td style={{ padding: '8px 12px' }}>
                      <div className="text-[var(--text-3)] text-xs">{c.created_time.split('T')[0]}</div>
                    </td>
                  )}
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <span style={{ ...mono, fontSize: 12, color: c.outstanding_receivable_amount > 0 ? 'var(--warning)' : 'var(--text-4)' }}>
                      {formatRp(c.outstanding_receivable_amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <tr>
                {showActivity ? (
                  <>
                    <td colSpan={6} style={{ padding: '7px 12px', color: 'var(--text-3)', fontSize: 11, ...mono }}>
                      TOTAL ({filtered.length} customers)
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', ...mono, color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>
                      {formatRp(filtered.reduce((s, c) => s + c.total_90d, 0))}
                    </td>
                    <td colSpan={2} />
                  </>
                ) : (
                  <td colSpan={10} style={{ padding: '7px 12px', color: 'var(--text-3)', fontSize: 11, ...mono }}>
                    TOTAL ({filtered.length} customers)
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [newCustomers, setNewCustomers] = useState<Customer[]>([]);
  const [activeCustomers, setActiveCustomers] = useState<Customer[]>([]);
  const [inactiveCustomers, setInactiveCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handlePrintLabels() {
    if (selectedIds.size === 0) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/customers/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      type ContactAddr = {
        company_name: string; contact_name: string; phone: string; mobile: string;
        billing_address: { address: string; street2: string; city: string; zip: string; state: string } | null;
      };

      // Build label HTML blocks
      const labelBlocks = data.contacts.map((c: ContactAddr) => {
        const ba = c.billing_address;
        const name = c.company_name || c.contact_name || '';
        const line1 = ba?.address || '';
        const line2 = ba?.street2 || '';
        const cityLine = [ba?.city, ba?.zip, ba?.state].filter(Boolean).join(' ');
        const phone = c.phone || c.mobile || '';
        const lines = ['Kepada Yth. Bapak/Ibu', name, line1, line2, cityLine, phone ? 'Tel. ' + phone : ''].filter(Boolean);
        const pTags = lines.map((line, i) => {
          if (i === 0) return '<p class="kepada">' + line + '</p>';
          if (i === 1) return '<p class="name">' + line + '</p>';
          return '<p>' + line + '</p>';
        }).join('');
        return '<div class="label">' + pTags + '</div>';
      }).join('');

      const css = [
        '* { margin: 0; padding: 0; box-sizing: border-box; }',
        'body { font-family: Arial, sans-serif; font-size: 15px; background: white; color: black; }',
        '.page { padding: 20mm; }',
        '.label { margin-bottom: 22mm; page-break-inside: avoid; }',
        '.label p { line-height: 1.8; margin: 0; font-size: 15px; }',
        '.kepada { font-size: 15px; }',
        '.name { font-weight: bold; font-size: 15px; }',
        '@media print { body { margin: 0; } .page { padding: 15mm 20mm; } .label { margin-bottom: 20mm; } }',
      ].join(' ');

      const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<title>Mailing Labels</title>'
        + '<style>' + css + '</style>'
        + '</head><body>'
        + '<div class="page">' + labelBlocks + '</div>'
        + '<script>window.onload = function(){ window.print(); }<\/script>'
        + '</body></html>';

      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
      setSelectedIds(new Set()); // clear after print
    } catch (e) { alert('Failed to load addresses: ' + String(e)); }
    finally { setPrinting(false); }
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setNewCustomers(data.new_customers || []);
      setActiveCustomers(data.active_customers || []);
      setInactiveCustomers(data.inactive_customers || []);
      setTotal(data.total || 0);
      setLastRefreshed(new Date().toLocaleTimeString('id-ID'));
      setSelectedIds(new Set()); // clear selection on refresh
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function handleCreated(name: string) {
    setShowAddModal(false);
    setSuccessMsg(`Customer "${name}" created successfully.`);
    fetchAll();
  }

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Customers</h1>
            <p className="text-[var(--text-3)] text-sm mt-1">
              New, active, and inactive customers based on Sales Order activity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefreshed && <span className="text-[var(--text-4)] text-xs" style={mono}>Updated {lastRefreshed}</span>}
            <button onClick={fetchAll} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
            {selectedIds.size > 0 && (
              <button onClick={handlePrintLabels} disabled={printing}
                className="px-4 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] rounded-lg font-medium border border-[var(--border)] transition-colors flex items-center gap-1.5 disabled:opacity-50">
                {printing ? '…' : `🖨 Print Labels (${selectedIds.size})`}
              </button>
            )}
            <button onClick={() => setShowAddModal(true)}
              className="px-4 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors flex items-center gap-1.5">
              <span>+</span> New Customer
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Customers', value: loading ? '…' : total, color: 'var(--text)' },
            { label: 'New (last 7 days)', value: loading ? '…' : newCustomers.length, color: 'var(--success)' },
            { label: 'Active (last 90 days)', value: loading ? '…' : activeCustomers.length, color: 'var(--info)' },
            { label: 'Inactive (90+ days)', value: loading ? '…' : inactiveCustomers.length, color: 'var(--warning)' },
          ].map(c => (
            <div key={c.label} className="via-card px-4 py-3">
              <div className="text-[var(--text-3)] text-xs mb-1">{c.label}</div>
              <div className="text-2xl font-semibold" style={{ ...mono, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">{error}</div>}
        {successMsg && (
          <div className="mb-4 p-3 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg text-[var(--success)] text-sm flex items-center justify-between">
            <span>✓ {successMsg}</span>
            <button onClick={() => setSuccessMsg('')} className="text-[var(--success)] opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Search */}
        <div className="mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer name, company, mobile, region, tier…"
            className="via-input text-xs py-1.5 px-3 w-80" />
        </div>

        {/* Tables */}
        <div className="space-y-6">
          <CustomerTable
            title="New Customers"
            desc="Created in the last 7 days"
            customers={newCustomers} loading={loading} search={search}
            showActivity={false} showInactive={false}
            emptyIcon="○" emptyMsg="No new customers in the last 7 days."
            selectedIds={selectedIds} onToggleSelect={toggleSelect}
          />
          <CustomerTable
            title="Active Customers"
            desc="At least one Sales Order in the last 90 days — sorted by revenue"
            customers={activeCustomers} loading={loading} search={search}
            showActivity={true} showInactive={false}
            emptyIcon="○" emptyMsg="No active customers found."
            selectedIds={selectedIds} onToggleSelect={toggleSelect}
          />
          <CustomerTable
            title="Inactive Customers"
            desc="No Sales Orders for 90+ days — sorted by most recently active first"
            customers={inactiveCustomers} loading={loading} search={search}
            showActivity={false} showInactive={true}
            emptyIcon="○" emptyMsg="No inactive customers. Everyone is buying!"
            selectedIds={selectedIds} onToggleSelect={toggleSelect}
          />
        </div>

      </div>

      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
