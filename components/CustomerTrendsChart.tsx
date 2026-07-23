'use client';

import { useEffect, useMemo, useState } from 'react';

interface TrendPoint {
  month: string;
  label: string;
  new_customers: number;
  total_customers: number;
  active_customers: number;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

// Categorical slots (validated: node scripts/validate_palette.js "#2a78d6,#1baf7a,#eb6834" --mode light --surface "#ffffff")
const SERIES = [
  { key: 'total_customers' as const, name: 'Total Customers', color: '#2a78d6' },
  { key: 'new_customers' as const, name: 'New Customers', color: '#1baf7a' },
  { key: 'active_customers' as const, name: 'Active Customers', color: '#eb6834' },
];

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const residual = max / magnitude;
  let niceResidual: number;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  return niceResidual * magnitude;
}

const W = 760;
const H = 300;
const MARGIN = { top: 16, right: 96, bottom: 28, left: 40 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

export default function CustomerTrendsChart() {
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/customers/trends');
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        if (!cancelled) setPoints(data.points || []);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const p of points) {
      m = Math.max(m, p.total_customers, p.new_customers, p.active_customers);
    }
    return niceMax(m);
  }, [points]);

  const n = points.length;
  const xAt = (i: number) => n <= 1 ? MARGIN.left : MARGIN.left + (PLOT_W * i) / (n - 1);
  const yAt = (v: number) => MARGIN.top + PLOT_H - (PLOT_H * v) / (maxVal || 1);

  const linePaths = useMemo(() => {
    return SERIES.map(s => ({
      ...s,
      d: points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)},${yAt(p[s.key])}`).join(' '),
    }));
  }, [points, maxVal]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));

  if (loading) {
    return (
      <div className="via-card px-4 py-3 mb-5">
        <div className="text-[var(--text-3)] text-xs">Loading…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="via-card px-4 py-3 mb-5">
        <div className="text-[var(--danger)] text-xs">Failed to load trend: {error}</div>
      </div>
    );
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="via-card px-4 py-3 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[var(--text-3)] text-xs">Customer Trend — Month over Month</div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-4">
            {SERIES.map(s => (
              <div key={s.key} className="flex items-center gap-1.5">
                <svg width="14" height="8" aria-hidden="true">
                  <line x1="0" y1="4" x2="14" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-[var(--text-3)] text-xs">{s.name}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowTable(v => !v)}
            className="px-2 py-1 text-[11px] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] rounded border border-[var(--border)] transition-colors"
          >
            {showTable ? 'View chart' : 'View table'}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="via-table w-full">
            <thead>
              <tr>
                <th className="text-left">Month</th>
                <th className="text-right">Total Customers</th>
                <th className="text-right">New Customers</th>
                <th className="text-right">Active Customers</th>
              </tr>
            </thead>
            <tbody>
              {points.map(p => (
                <tr key={p.month}>
                  <td style={mono}>{p.label}</td>
                  <td className="text-right" style={mono}>{p.total_customers.toLocaleString('id-ID')}</td>
                  <td className="text-right" style={mono}>{p.new_customers.toLocaleString('id-ID')}</td>
                  <td className="text-right" style={mono}>{p.active_customers.toLocaleString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label="Line chart of total, new, and active customers by month"
          >
            {/* Gridlines */}
            {yTicks.map(t => (
              <g key={t}>
                <line
                  x1={MARGIN.left} x2={W - MARGIN.right}
                  y1={yAt(t)} y2={yAt(t)}
                  stroke="#e5e7eb" strokeWidth="1"
                />
                <text x={MARGIN.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle"
                  fontSize="10" fill="var(--text-4)" style={mono}>
                  {t.toLocaleString('id-ID')}
                </text>
              </g>
            ))}

            {/* Baseline */}
            <line x1={MARGIN.left} x2={W - MARGIN.right} y1={yAt(0)} y2={yAt(0)} stroke="#c3c2b7" strokeWidth="1" />

            {/* X-axis labels (every other month to avoid crowding) */}
            {points.map((p, i) => (
              (n <= 8 || i % 2 === 0 || i === n - 1) && (
                <text key={p.month} x={xAt(i)} y={H - MARGIN.bottom + 16} textAnchor="middle"
                  fontSize="10" fill="var(--text-4)" style={mono}>
                  {p.label}
                </text>
              )
            ))}

            {/* Hover hit bands */}
            {points.map((p, i) => {
              const bandW = n <= 1 ? PLOT_W : PLOT_W / (n - 1);
              const bandX = xAt(i) - bandW / 2;
              return (
                <rect
                  key={p.month}
                  x={Math.max(MARGIN.left, bandX)}
                  y={MARGIN.top}
                  width={bandW}
                  height={PLOT_H}
                  fill="transparent"
                  onPointerEnter={() => setHoverIdx(i)}
                  onPointerLeave={() => setHoverIdx(idx => idx === i ? null : idx)}
                  style={{ cursor: 'crosshair' }}
                />
              );
            })}

            {/* Lines */}
            {linePaths.map(s => (
              <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {/* End markers + direct labels */}
            {n > 0 && SERIES.map(s => {
              const last = points[n - 1];
              const val = last[s.key];
              return (
                <g key={s.key}>
                  <circle cx={xAt(n - 1)} cy={yAt(val)} r="4" fill={s.color} stroke="#ffffff" strokeWidth="2" />
                  <text x={xAt(n - 1) + 8} y={yAt(val)} dominantBaseline="middle"
                    fontSize="11" fontWeight={600} fill="var(--text-2)" style={mono}>
                    {val.toLocaleString('id-ID')}
                  </text>
                </g>
              );
            })}

            {/* Crosshair */}
            {hoverIdx !== null && (
              <>
                <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={MARGIN.top} y2={MARGIN.top + PLOT_H}
                  stroke="#c3c2b7" strokeWidth="1" />
                {SERIES.map(s => (
                  <circle key={s.key} cx={xAt(hoverIdx)} cy={yAt(points[hoverIdx][s.key])}
                    r="4" fill={s.color} stroke="#ffffff" strokeWidth="2" />
                ))}
              </>
            )}
          </svg>

          {/* Tooltip */}
          {hovered && hoverIdx !== null && (
            <div
              style={{
                position: 'absolute',
                left: `${(xAt(hoverIdx) / W) * 100}%`,
                top: 4,
                transform: hoverIdx > n - 3 ? 'translateX(-100%)' : 'translateX(12px)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              <div className="text-[var(--text-3)] text-[11px] mb-1">{hovered.label}</div>
              {SERIES.map(s => (
                <div key={s.key} className="flex items-center gap-2" style={{ marginTop: 2 }}>
                  <svg width="10" height="6" aria-hidden="true">
                    <line x1="0" y1="3" x2="10" y2="3" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[var(--text)] text-xs font-semibold" style={mono}>
                    {hovered[s.key].toLocaleString('id-ID')}
                  </span>
                  <span className="text-[var(--text-3)] text-[11px]">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
