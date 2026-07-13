'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { LEADS, RECRUITMENT_PLAN, Lead } from '@/lib/data/leads';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'JetBrains Mono, monospace' };

const STAGES = ['New', 'Contacted', 'Meeting Scheduled', 'Agreed', 'Declined'] as const;
type Stage = typeof STAGES[number];

interface LeadStatus { stage: string; notes: string; updated_at: string }

function stageBadgeClass(stage: string) {
  switch (stage) {
    case 'Agreed': return 'via-badge-success';
    case 'Meeting Scheduled': return 'via-badge-warning';
    case 'Contacted': return 'via-badge-info';
    case 'Declined': return 'via-badge-danger';
    default: return 'via-badge-muted';
  }
}

function TierBadge({ tierGroup }: { tierGroup: Lead['tierGroup'] }) {
  if (tierGroup === 'top') return <span className="via-badge via-badge-warning text-xs">⭐⭐ Top Priority</span>;
  if (tierGroup === 'tier1') return <span className="via-badge via-badge-open text-xs">Tier 1</span>;
  return <span className="via-badge via-badge-muted text-xs">Tier 2</span>;
}

function LamitakBadge({ status }: { status: Lead['carriesLamitak'] }) {
  if (status === 'yes') return <span className="via-badge via-badge-success text-xs">Already carries</span>;
  if (status === 'unconfirmed') return <span className="via-badge via-badge-muted text-xs">Unconfirmed</span>;
  return <span className="via-badge via-badge-muted text-xs">No</span>;
}

function CopyIconButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy"
      className="text-[var(--text-4)] hover:text-[var(--text)] transition-colors"
      style={{ fontSize: 11 }}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}

// ─── Stage select (inline, persists to Supabase) ───────────────────────────

function StageSelect({ leadId, stage, onChange }: { leadId: string; stage: string; onChange: (s: string) => void }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    onChange(next);
    setSaving(true);
    try {
      await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, stage: next }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={stage}
      onClick={e => e.stopPropagation()}
      onChange={e => handleChange(e.target.value)}
      disabled={saving}
      className={`via-badge border text-xs ${stageBadgeClass(stage)}`}
      style={{ cursor: 'pointer', border: 'none', appearance: 'none', paddingRight: 10 }}
    >
      {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// ─── Notes (inline editable, persists on blur) ─────────────────────────────

function NotesField({ leadId, value, onChange }: { leadId: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  async function handleBlur() {
    if (draft === value) return;
    setSaving(true);
    try {
      await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, notes: draft }),
      });
      onChange(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <textarea
      value={draft}
      onClick={e => e.stopPropagation()}
      onChange={e => setDraft(e.target.value)}
      onBlur={handleBlur}
      placeholder="Add outreach notes…"
      rows={2}
      className="via-input text-xs py-1.5 px-2 w-full"
      style={{ resize: 'vertical', opacity: saving ? 0.6 : 1 }}
    />
  );
}

// ─── Recruitment plan panel ─────────────────────────────────────────────────

function RecruitmentPlanPanel() {
  return (
    <div className="via-card overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h2 className="text-[var(--text)] font-semibold text-sm">30-Day Recruitment Plan</h2>
        <div className="text-[var(--text-3)] text-xs mt-0.5">Reference plan for onboarding Level 2 sub-dealers.</div>
      </div>
      <div className="divide-y divide-[var(--border-muted)]">
        {RECRUITMENT_PLAN.map(week => (
          <div key={week.label} className="px-5 py-4">
            <div className="text-[var(--accent-text)] text-xs font-semibold uppercase tracking-wide mb-2.5">{week.label}</div>
            <div className="space-y-3">
              {week.items.map(item => (
                <div key={item.action} className="pl-3" style={{ borderLeft: '2px solid var(--border)' }}>
                  <div className="text-[var(--text)] text-xs font-medium">{item.action}</div>
                  <div className="text-[var(--text-4)] text-xs mt-0.5">{item.target}</div>
                  <div className="text-[var(--text-3)] text-xs mt-1 leading-relaxed">{item.whatToDo}</div>
                  <div className="text-[var(--text-4)] text-xs mt-1">
                    <span className="text-[var(--success)]">✓ Success:</span> {item.successMetric}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Customers table (leads sourced from Requests: samples/quotes/catalogues) ──

interface RequestLead {
  name: string;
  phone: string;
  address: string;
  types: string[];
  total_requests: number;
  first_at: string;
  last_at: string;
}

function typeBadgeClass(type: string) {
  switch (type) {
    case 'Sample': return 'via-badge-info';
    case 'Quote': return 'via-badge-warning';
    case 'Catalogue': return 'via-badge-muted';
    default: return 'via-badge-muted';
  }
}

function CustomersFromRequestsTable() {
  const [leads, setLeads] = useState<RequestLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leads/customers');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load');
      setLeads(data.customers || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

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
          <h2 className="text-[var(--text)] font-semibold text-sm">Customers</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-4)] text-xs" style={mono}>{leads.length} leads</span>
          <button onClick={fetchLeads} disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
            {loading ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">{error}</div>
      )}

      {!loading && !error && leads.length === 0 && (
        <div className="flex flex-col items-center py-10">
          <div className="text-3xl mb-2 opacity-20">○</div>
          <div className="text-[var(--text-3)] text-sm">No requests received yet.</div>
        </div>
      )}

      {!error && leads.length > 0 && (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Address</th>
                <th style={thStyle}>Requested</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Last Request</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={`${l.phone}-${i}`} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                  <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                    <div className="text-[var(--text)] text-xs font-medium truncate" title={l.name}>{l.name || '(unnamed)'}</div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--text-3)] text-xs" style={mono}>{l.phone || '—'}</span>
                      {l.phone && <CopyIconButton value={l.phone} />}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', maxWidth: 260 }}>
                    <div className="text-[var(--text-3)] text-xs truncate" title={l.address}>{l.address || '—'}</div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {l.types.map(t => (
                        <span key={t} className={`via-badge border text-xs ${typeBadgeClass(t)}`}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="text-[var(--text-2)] text-xs" style={mono}>{l.total_requests}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className="text-[var(--text-4)] text-xs" style={mono}>
                      {new Date(l.last_at).toLocaleDateString('id-ID')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [statuses, setStatuses] = useState<Record<string, LeadStatus>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | Lead['tierGroup']>('all');
  const [stageFilter, setStageFilter] = useState<'all' | Stage>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [statusApiDown, setStatusApiDown] = useState(false);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.success) { setStatuses(data.statuses || {}); setStatusApiDown(false); }
      else setStatusApiDown(true);
    } catch {
      setStatusApiDown(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatuses(); }, [fetchStatuses]);

  function stageFor(leadId: string) {
    return statuses[leadId]?.stage || 'New';
  }
  function notesFor(leadId: string) {
    return statuses[leadId]?.notes || '';
  }
  function setLocalStatus(leadId: string, patch: Partial<LeadStatus>) {
    setStatuses(prev => ({
      ...prev,
      [leadId]: { ...(prev[leadId] || { stage: 'New', notes: '', updated_at: '' }), ...patch },
    }));
  }

  const filtered = useMemo(() => {
    let result = LEADS;
    if (tierFilter !== 'all') result = result.filter(l => l.tierGroup === tierFilter);
    if (stageFilter !== 'all') result = result.filter(l => stageFor(l.id) === stageFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.storeName.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.province.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q)
      );
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tierFilter, stageFilter, statuses]);

  const summary = useMemo(() => {
    const agreed = LEADS.filter(l => stageFor(l.id) === 'Agreed').length;
    const contacted = LEADS.filter(l => stageFor(l.id) !== 'New').length;
    const topPriority = LEADS.filter(l => l.tierGroup === 'top' || l.tierGroup === 'tier1').length;
    const carriesLamitak = LEADS.filter(l => l.carriesLamitak === 'yes').length;
    return { agreed, contacted, topPriority, carriesLamitak };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses]);

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Leads</h1>
            <div className="text-[var(--text-3)] text-xs mt-1">Level 2 sub-dealer recruitment targets — Lamitak distribution expansion.</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowPlan(s => !s)}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors">
              {showPlan ? 'Hide' : 'Show'} 30-Day Plan
            </button>
            <button onClick={fetchStatuses} disabled={loading}
              className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50">
              {loading ? '…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {statusApiDown && (
          <div className="mb-5 p-3 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg text-[var(--warning)] text-xs">
            Outreach stage/notes tracking is unavailable — the <code>leads_status</code> table hasn&apos;t been created in Supabase yet.
            Run <code>supabase/leads_status.sql</code> in the Supabase SQL editor, then refresh. The lead list itself still works normally.
          </div>
        )}

        {showPlan && <RecruitmentPlanPanel />}

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Leads', value: LEADS.length, color: 'var(--text)' },
            { label: 'Tier 1 / Top Priority', value: summary.topPriority, color: 'var(--accent-text)' },
            { label: 'Already Carrying Lamitak', value: summary.carriesLamitak, color: 'var(--success)' },
            { label: 'Agreed / Onboarded', value: summary.agreed, color: 'var(--success)' },
          ].map(c => (
            <div key={c.label} className="via-card px-4 py-3">
              <div className="text-[var(--text-3)] text-xs mb-1">{c.label}</div>
              <div className="text-2xl font-semibold" style={{ ...mono, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search store, city, province…"
            className="via-input text-xs py-1.5 px-3 w-72" />
          <select value={tierFilter} onChange={e => setTierFilter(e.target.value as typeof tierFilter)}
            className="via-input text-xs py-1.5 px-3">
            <option value="all">All Tiers</option>
            <option value="top">⭐⭐ Top Priority</option>
            <option value="tier1">Tier 1</option>
            <option value="tier2">Tier 2</option>
          </select>
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
            className="via-input text-xs py-1.5 px-3">
            <option value="all">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="mb-5">
          <CustomersFromRequestsTable />
        </div>

        {/* Table */}
        <div className="via-card overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-[var(--text)] font-semibold text-sm">Sub-Dealer</h2>
            <span className="text-[var(--text-4)] text-xs" style={mono}>{filtered.length} leads</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10">
              <div className="text-3xl mb-2 opacity-20">○</div>
              <div className="text-[var(--text-3)] text-sm">No leads match your filters.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 36 }}>#</th>
                    <th style={thStyle}>Store</th>
                    <th style={thStyle}>Tier</th>
                    <th style={thStyle}>Lamitak?</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Proposed Territory</th>
                    <th style={thStyle}>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => {
                    const isOpen = expanded === lead.id;
                    return (
                      <Fragment key={lead.id}>
                        <tr
                          onClick={() => setExpanded(isOpen ? null : lead.id)}
                          className="transition-colors hover:bg-[var(--surface-2)]"
                          style={{ borderBottom: '1px solid var(--border-muted)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '8px 12px' }}>
                            <span className="text-[var(--text-4)] text-xs" style={mono}>{lead.rank}</span>
                          </td>
                          <td style={{ padding: '8px 12px', maxWidth: 240 }}>
                            <div className="text-[var(--text)] text-xs font-medium truncate" title={lead.storeName}>{lead.storeName}</div>
                            <div className="text-[var(--text-4)] text-xs truncate">{lead.city}, {lead.province}</div>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <TierBadge tierGroup={lead.tierGroup} />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <LamitakBadge status={lead.carriesLamitak} />
                          </td>
                          <td style={{ padding: '8px 12px', maxWidth: 200 }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--text-3)] text-xs truncate" title={lead.contact}>{lead.contact}</span>
                              <CopyIconButton value={lead.contact} />
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                            <span className="text-[var(--text-3)] text-xs truncate" title={lead.proposedTerritory}>{lead.proposedTerritory}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                            <StageSelect
                              leadId={lead.id}
                              stage={stageFor(lead.id)}
                              onChange={s => setLocalStatus(lead.id, { stage: s })}
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr style={{ borderBottom: '1px solid var(--border-muted)', background: 'var(--surface-2)' }}>
                            <td colSpan={7} style={{ padding: '14px 20px' }}>
                              <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-3">
                                  <div>
                                    <div className="text-[var(--text-4)] text-xs uppercase tracking-wide mb-1">Address</div>
                                    <div className="text-[var(--text-2)] text-xs leading-relaxed">{lead.address}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-4)] text-xs uppercase tracking-wide mb-1">Other Brands Carried</div>
                                    <div className="text-[var(--text-2)] text-xs leading-relaxed">{lead.otherBrands}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-4)] text-xs uppercase tracking-wide mb-1">Why Good Sub-Dealer</div>
                                    <div className="text-[var(--text-2)] text-xs leading-relaxed">{lead.whyGood}</div>
                                  </div>
                                  <div>
                                    <div className="text-[var(--text-4)] text-xs uppercase tracking-wide mb-1">Recruitment Action</div>
                                    <div className="text-[var(--text-2)] text-xs leading-relaxed">{lead.recruitmentAction}</div>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wide mb-1">Outreach Notes</div>
                                  <NotesField
                                    leadId={lead.id}
                                    value={notesFor(lead.id)}
                                    onChange={v => setLocalStatus(lead.id, { notes: v })}
                                  />
                                  {statuses[lead.id]?.updated_at && (
                                    <div className="text-[var(--text-4)] text-xs mt-1.5" style={mono}>
                                      Last updated {new Date(statuses[lead.id].updated_at).toLocaleString('id-ID')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
