'use client';

import React from 'react';
import { CheckCircle, XCircle, Clock, Package, User, MapPin, AlertTriangle } from 'lucide-react';
import { SOPreview } from '@/types/order';
import { formatRupiah } from '@/lib/utils/money';

interface ActionPreviewCardProps {
  preview: SOPreview;
  type: 'create' | 'update';
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 80
      ? 'via-badge via-badge-success'
      : pct >= 50
      ? 'via-badge via-badge-warning'
      : 'via-badge via-badge-danger';
  return <span className={cls}>{pct}% match</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'via-badge via-badge-muted',
    open: 'via-badge via-badge-open',
    confirmed: 'via-badge via-badge-info',
    invoiced: 'via-badge via-badge-success',
  };
  return (
    <span className={map[status.toLowerCase()] || 'via-badge via-badge-muted'}>
      {status}
    </span>
  );
}

export default function ActionPreviewCard({ preview, type }: ActionPreviewCardProps) {
  const hasMissingFields = preview.missing_fields.length > 0;
  const hasWarnings = preview.warnings.length > 0;

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--surface-2)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text)]">
            {type === 'create' ? 'New Sales Order Preview' : 'Update Sales Order Preview'}
          </span>
        </div>
        <StatusBadge status="draft" />
      </div>

      {/* Customer */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-start gap-3">
          <User className="w-4 h-4 text-[var(--text-3)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--text)]">
                {preview.customer_name || '— Not matched —'}
              </span>
              <ConfidenceBadge score={preview.customer_confidence} />
            </div>
            {preview.customer_id && (
              <div className="text-xs text-[var(--text-3)] mt-0.5 font-mono">
                ID: {preview.customer_id}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider mb-2">
          Items
        </div>
        <div className="overflow-x-auto">
          <table className="via-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Name</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Official Price</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <code className="text-xs bg-[var(--surface-3)] px-1.5 py-0.5 rounded text-[var(--accent-text)]">
                      {item.item_code}
                    </code>
                  </td>
                  <td className="text-[var(--text-3)]">
                    {item.item_name || '—'}
                  </td>
                  <td className="text-right font-mono text-sm">{item.quantity}</td>
                  <td className="text-[var(--text-3)]">{item.unit}</td>
                  <td className="text-right font-mono text-sm">
                    {item.official_price ? (
                      <span className="text-[var(--success)]">
                        {formatRupiah(item.official_price)}
                      </span>
                    ) : (
                      <span className="text-[var(--danger)]">Not found</span>
                    )}
                  </td>
                  <td className="text-right font-mono text-sm text-[var(--text)]">
                    {item.official_price ? formatRupiah(item.line_total) : '—'}
                  </td>
                  <td>
                    {item.price_mismatch ? (
                      <span className="via-badge via-badge-warning">Price ⚠️</span>
                    ) : item.warnings.length > 0 ? (
                      <span className="via-badge via-badge-warning">⚠️</span>
                    ) : item.official_price ? (
                      <span className="via-badge via-badge-success">OK</span>
                    ) : (
                      <span className="via-badge via-badge-danger">Missing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Customer-provided price warnings */}
        {preview.items.some((i) => i.customer_provided_price !== null) && (
          <div className="mt-2 p-2 rounded bg-amber-950/20 border border-amber-800/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-300/80">
                <span className="font-semibold">Customer-provided prices detected and ignored.</span>
                {' '}Official Zoho prices are used instead.
                {preview.items
                  .filter((i) => i.customer_provided_price !== null)
                  .map((item, idx) => (
                    <div key={idx} className="mt-1">
                      <code className="text-amber-200">{item.item_code}</code>:{' '}
                      Customer: {formatRupiah(item.customer_provided_price)} →
                      Official: <span className="text-green-300">{formatRupiah(item.official_price)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtotal */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
        <span className="text-sm text-[var(--text-3)]">Subtotal</span>
        <span className="text-lg font-bold text-[var(--text)] font-mono">
          {formatRupiah(preview.subtotal)}
          <span className="text-xs text-[var(--text-3)] font-normal ml-1">excl. PPN</span>
        </span>
      </div>

      {/* Delivery */}
      {(preview.delivery.location || preview.delivery.address) && (
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-[var(--text-3)] mt-0.5 shrink-0" />
            <div className="text-sm">
              {preview.delivery.location && (
                <div className="text-[var(--text-3)]">{preview.delivery.location}</div>
              )}
              {preview.delivery.address && (
                <div className="text-[var(--text-3)] text-xs mt-0.5">{preview.delivery.address}</div>
              )}
              {preview.delivery.notes && (
                <div className="text-[var(--text-3)] text-xs mt-0.5 italic">{preview.delivery.notes}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Missing fields */}
      {hasMissingFields && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-red-950/20">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-[var(--danger)]" />
            <span className="text-xs font-semibold text-[var(--danger)] uppercase tracking-wider">
              Missing Fields
            </span>
          </div>
          <ul className="space-y-1">
            {preview.missing_fields.map((f, idx) => (
              <li key={idx} className="text-xs text-[var(--danger)]/80 flex items-start gap-2">
                <span>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="px-4 py-3 border-b border-[var(--border)] bg-amber-950/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Warnings
            </span>
          </div>
          <ul className="space-y-1">
            {preview.warnings.map((w, idx) => (
              <li key={idx} className="text-xs text-amber-300/80 flex items-start gap-2">
                <span>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Approval block */}
      <div className="px-4 py-3 bg-[var(--surface-2)]">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-[var(--text-3)]" />
          <span className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
            Awaiting Approval
          </span>
        </div>
        <div className="text-xs text-[var(--text-3)] mb-2">
          To {type === 'create' ? 'create' : 'update'} this Sales Order in Zoho Books, type exactly:
        </div>
        <code className="block px-3 py-2 rounded bg-[var(--surface-3)] border border-[var(--border)] text-sm text-blue-300 font-mono tracking-wide">
          {preview.requires_approval}
        </code>
        <div className="text-xs text-[var(--text-3)] mt-2">
          ⛔ Shorter commands like &quot;approve&quot;, &quot;yes&quot;, or &quot;ok&quot; will not work.
        </div>
      </div>
    </div>
  );
}
