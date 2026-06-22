"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "this_month" | "prev_month" | "this_year" | "prev_year";
type ReportType = "item" | "brand" | "location" | "customer" | "salesperson";
type SortDir = "asc" | "desc";

interface InvoiceLine {
  item_id?: string;
  name: string;
  sku: string;
  brand?: string;
  quantity: number;
  rate: number;
  revenue: number;
  purchase_rate: number;
  cost: number;
  gross_profit: number;
  gp_margin?: number;
}

interface InvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  date: string;
  customer_name: string;
  status: string;
  paid: boolean;
  total: number;
  balance: number;
  quantity: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  gp_margin: number;
  missing_cost_lines?: number;
  line_items: InvoiceLine[];
}

interface ReportRow {
  name: string;
  sku?: string;
  quantity: number;
  amount: number;
  avg_price: number;
  count?: number;
  cost?: number;
  gross_profit?: number;
  gp_margin?: number;
  invoice_count?: number;
  customer_count?: number;
  missing_cost_lines?: number;
  commission_tier?: string;
  commission_rate?: number;
  commission_amount?: number;
  company_keeps?: number;
  invoices?: InvoiceDetail[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "JetBrains Mono, monospace" };
const formatRp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const formatQty = (n: number) => Number(n).toLocaleString("id-ID");
const formatPct = (n: number) => ((n || 0) * 100).toFixed(1) + "%";

const PERIODS: { key: Period; label: string }[] = [
  { key: "this_month", label: "This Month" },
  { key: "prev_month", label: "Previous Month" },
  { key: "this_year", label: "This Year" },
  { key: "prev_year", label: "Previous Year" },
];

const REPORT_TYPES: {
  key: ReportType;
  label: string;
  desc: string;
  icon: string;
}[] = [
  {
    key: "item",
    label: "Sales by Item",
    desc: "Top 100 items by revenue",
    icon: "▣",
  },
  {
    key: "brand",
    label: "Sales by Brand",
    desc: "Revenue breakdown by brand",
    icon: "◈",
  },
  {
    key: "location",
    label: "Sales by Location",
    desc: "Revenue by warehouse/location",
    icon: "⊙",
  },
  {
    key: "customer",
    label: "Sales by Customer",
    desc: "Revenue breakdown by customer",
    icon: "◎",
  },
  {
    key: "salesperson",
    label: "Sales by Sales Person",
    desc: "GP and commission by salesperson",
    icon: "◇",
  },
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active)
    return (
      <span style={{ color: "var(--text-4)", marginLeft: 4, fontSize: 9 }}>
        ↕
      </span>
    );
  return (
    <span style={{ color: "var(--accent)", marginLeft: 4, fontSize: 9 }}>
      {dir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(cols)].map((_, j) => (
            <td key={j} style={{ padding: "10px 12px" }}>
              <div
                style={{
                  height: 12,
                  background: "var(--surface-3)",
                  borderRadius: 4,
                  width: j === 0 ? "70%" : "50%",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalesReportsPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [reportType, setReportType] = useState<ReportType>("item");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [sortKey, setSortKey] = useState<
    | "amount"
    | "quantity"
    | "avg_price"
    | "name"
    | "cost"
    | "gross_profit"
    | "gp_margin"
    | "commission_amount"
  >("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [expandedName, setExpandedName] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const extraParams =
        reportType === "salesperson" ? "&paid_only=true&include_details=true" : "";
      const res = await fetch(
        `/api/reports?type=${reportType}&period=${period}${extraParams}`,
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      // For item report, limit to top 100
      const limited =
        reportType === "item"
          ? (data.rows as ReportRow[])
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 100)
          : (data.rows as ReportRow[]);
      setRows(limited);
      setExpandedName("");
      setDateRange(data.from && data.to ? `${data.from} – ${data.to}` : "");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [reportType, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          (row.sku || "").toLowerCase().includes(q),
      );
    }
    return [...r].sort((a, b) => {
      const av = sortKey === "name" ? a.name : a[sortKey] || 0;
      const bv = sortKey === "name" ? b.name : b[sortKey] || 0;
      if (typeof av === "string")
        return sortDir === "asc"
          ? av.localeCompare(bv as string)
          : (bv as string).localeCompare(av);
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const quantity = rows.reduce((s, r) => s + r.quantity, 0);
    const cost = rows.reduce((s, r) => s + (r.cost || 0), 0);
    const grossProfit = rows.reduce((s, r) => s + (r.gross_profit || 0), 0);
    const commission = rows.reduce((s, r) => s + (r.commission_amount || 0), 0);
    return {
      amount,
      quantity,
      cost,
      grossProfit,
      commission,
      gpMargin: amount > 0 ? grossProfit / amount : 0,
    };
  }, [rows]);

  // Brand color map
  const brandColors: Record<string, string> = {
    Lamitak: "#cc785c",
    EDL: "#5c8acc",
    AICA: "#5cac6a",
    TACO: "#ac5c8a",
    CARTA: "#8a7c5c",
    AIDI: "#5c8aac",
  };

  const thStyle: React.CSSProperties = {
    padding: "9px 12px",
    textAlign: "left",
    cursor: "pointer",
    userSelect: "none",
    color: "var(--text-3)",
    fontWeight: 500,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: "var(--surface-2)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  };

  const currentType = REPORT_TYPES.find((t) => t.key === reportType)!;

  return (
    <>
      <style jsx global>{`
        .print-only { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: #ffffff !important; }
          body * { visibility: hidden !important; }
          .salesperson-print-area, .salesperson-print-area * { visibility: visible !important; }
          .salesperson-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            color: #111111 !important;
            font-family: Arial, sans-serif !important;
          }
          .salesperson-print-area .print-only { display: block !important; }
          .salesperson-print-area .print-hide { display: none !important; }
          .salesperson-print-area table {
            width: 100% !important;
            border-collapse: collapse !important;
            background: #ffffff !important;
            color: #111111 !important;
          }
          .salesperson-print-area th,
          .salesperson-print-area td {
            border: 1px solid #d0d0d0 !important;
            color: #111111 !important;
            background: #ffffff !important;
            padding: 6px 7px !important;
            font-size: 10px !important;
          }
          .salesperson-print-area th {
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.04em !important;
            background: #f3f3f3 !important;
          }
          .salesperson-print-area .print-title {
            font-size: 18px !important;
            font-weight: 700 !important;
            margin-bottom: 4px !important;
          }
          .salesperson-print-area .print-subtitle {
            font-size: 11px !important;
            color: #444444 !important;
            margin-bottom: 12px !important;
          }
          .salesperson-print-area .print-summary {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
          }
          .salesperson-print-area .print-summary-box {
            border: 1px solid #d0d0d0 !important;
            padding: 8px !important;
            background: #ffffff !important;
          }
          .salesperson-print-area .print-summary-label {
            font-size: 8px !important;
            color: #555555 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
          }
          .salesperson-print-area .print-summary-value {
            font-size: 12px !important;
            color: #111111 !important;
            font-weight: 700 !important;
            margin-top: 3px !important;
          }
        }
      `}</style>
    <div
      style={{
        background: "var(--bg)",
        minHeight: "100%",
        padding: "24px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">
              Sales Reports
            </h1>
            <p className="text-[var(--text-3)] text-sm mt-0.5">
              {dateRange ? `${dateRange}` : "Loading date range…"}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] rounded-lg border border-[var(--border)] transition-colors disabled:opacity-50"
            style={mono}
          >
            {loading ? "…" : "↻ Refresh"}
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-2 mb-5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 text-xs font-medium rounded-lg border transition-all ${
                period === p.key
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-[var(--surface-2)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-3)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Report type cards */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          {REPORT_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setReportType(t.key)}
              className={`via-card p-4 text-left transition-all border-2 ${
                reportType === t.key
                  ? "border-[var(--accent)] bg-[var(--accent-light)]"
                  : "border-transparent hover:border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  style={{
                    fontSize: 14,
                    color:
                      reportType === t.key ? "var(--accent)" : "var(--text-3)",
                  }}
                >
                  {t.icon}
                </span>
                <span
                  className={`text-xs font-semibold ${reportType === t.key ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
                >
                  {t.label}
                </span>
              </div>
              <p className="text-[var(--text-4)] text-xs">{t.desc}</p>
            </button>
          ))}
        </div>

        {/* Summary strip */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-[var(--surface-2)] rounded-lg border border-[var(--border)]">
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">
                Total Revenue
              </div>
              <div
                className="text-[var(--text)] font-bold text-sm"
                style={mono}
              >
                {formatRp(totals.amount)}
              </div>
            </div>
            <div className="w-px h-8 bg-[var(--border)]" />
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">
                Total Qty
              </div>
              <div
                className="text-[var(--text)] font-bold text-sm"
                style={mono}
              >
                {formatQty(totals.quantity)} sht
              </div>
            </div>
            {reportType === "salesperson" && (
              <>
                <div className="w-px h-8 bg-[var(--border)]" />
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">
                    Gross Profit
                  </div>
                  <div
                    className="text-[var(--success)] font-bold text-sm"
                    style={mono}
                  >
                    {formatRp(totals.grossProfit)}
                  </div>
                </div>
                <div className="w-px h-8 bg-[var(--border)]" />
                <div>
                  <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">
                    Commission
                  </div>
                  <div
                    className="text-[var(--accent)] font-bold text-sm"
                    style={mono}
                  >
                    {formatRp(totals.commission)}
                  </div>
                </div>
              </>
            )}
            <div className="w-px h-8 bg-[var(--border)]" />
            <div>
              <div className="text-[var(--text-4)] text-xs uppercase tracking-wider mb-0.5">
                {currentType.label}
              </div>
              <div
                className="text-[var(--text)] font-bold text-sm"
                style={mono}
              >
                {rows.length} rows
              </div>
            </div>
            <div className="ml-auto">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="via-input text-xs py-1.5 px-3 w-48"
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 mb-4 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="via-card overflow-hidden">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: "center" }}>
                  {reportType === "salesperson" ? "" : "#"}
                </th>

                {/* Name column */}
                <th style={thStyle} onClick={() => handleSort("name")}>
                  {reportType === "item"
                    ? "Item"
                    : reportType === "brand"
                      ? "Brand"
                      : reportType === "location"
                        ? "Location"
                        : reportType === "salesperson"
                          ? "Sales Person"
                          : "Customer"}
                  <SortIcon active={sortKey === "name"} dir={sortDir} />
                </th>

                {/* SKU for item report */}
                {reportType === "item" && (
                  <th style={{ ...thStyle, width: 140 }}>SKU</th>
                )}

                {reportType === "salesperson" ? (
                  <>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 140 }}
                      onClick={() => handleSort("amount")}
                    >
                      Revenue{" "}
                      <SortIcon active={sortKey === "amount"} dir={sortDir} />
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 140 }}
                      onClick={() => handleSort("cost")}
                    >
                      Cost{" "}
                      <SortIcon active={sortKey === "cost"} dir={sortDir} />
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 140 }}
                      onClick={() => handleSort("gross_profit")}
                    >
                      GP{" "}
                      <SortIcon
                        active={sortKey === "gross_profit"}
                        dir={sortDir}
                      />
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 100 }}
                      onClick={() => handleSort("gp_margin")}
                    >
                      GP %{" "}
                      <SortIcon
                        active={sortKey === "gp_margin"}
                        dir={sortDir}
                      />
                    </th>
                    <th style={{ ...thStyle, textAlign: "right", width: 95 }}>
                      Invoices
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 120 }}
                      onClick={() => handleSort("commission_amount")}
                    >
                      Commission{" "}
                      <SortIcon
                        active={sortKey === "commission_amount"}
                        dir={sortDir}
                      />
                    </th>
                  </>
                ) : (
                  <>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 120 }}
                      onClick={() => handleSort("quantity")}
                    >
                      Qty Sold{" "}
                      <SortIcon active={sortKey === "quantity"} dir={sortDir} />
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 150 }}
                      onClick={() => handleSort("avg_price")}
                    >
                      Avg Price{" "}
                      <SortIcon
                        active={sortKey === "avg_price"}
                        dir={sortDir}
                      />
                    </th>
                    <th
                      style={{ ...thStyle, textAlign: "right", width: 160 }}
                      onClick={() => handleSort("amount")}
                    >
                      Revenue{" "}
                      <SortIcon active={sortKey === "amount"} dir={sortDir} />
                    </th>
                    <th style={{ ...thStyle, width: 120 }}>Share</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <SkeletonRows
                  cols={
                    reportType === "item"
                      ? 7
                      : reportType === "salesperson"
                        ? 8
                        : 6
                  }
                />
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "var(--text-4)",
                      fontSize: 13,
                    }}
                  >
                    No data for this period.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((row, i) => {
                  const pct =
                    totals.amount > 0 ? (row.amount / totals.amount) * 100 : 0;
                  const brandColor =
                    reportType === "brand"
                      ? brandColors[row.name] || "var(--accent)"
                      : "var(--accent)";
                  const brand = row.sku
                    ? row.sku.split("-")[0].toUpperCase()
                    : "";
                  const brandLookup: Record<string, string> = {
                    LAM: "Lamitak",
                    EDL: "EDL",
                    EAS: "EDL",
                    AICA: "AICA",
                    TACO: "TACO",
                    TAC: "TACO",
                    CARTA: "CARTA",
                    AIDI: "AIDI",
                  };
                  const itemColor =
                    brandColors[brandLookup[brand] || ""] || "var(--accent)";

                  const isExpanded =
                    reportType === "salesperson" && expandedName === row.name;
                  const canExpand = reportType === "salesperson";
                  const colSpan =
                    reportType === "salesperson"
                      ? 8
                      : reportType === "item"
                        ? 7
                        : 6;

                  return (
                    <React.Fragment key={row.name}>
                      <tr
                        onClick={() =>
                          canExpand &&
                          setExpandedName(isExpanded ? "" : row.name)
                        }
                        style={{
                          borderBottom: isExpanded
                            ? "none"
                            : "1px solid var(--border-muted)",
                          cursor: canExpand ? "pointer" : "default",
                        }}
                        className="hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <td
                          style={{
                            padding: "9px 12px",
                            textAlign: "center",
                            color: "var(--text-4)",
                            fontSize: 11,
                            ...mono,
                          }}
                        >
                          {canExpand ? (
                            <span
                              style={{
                                display: "inline-block",
                                transform: isExpanded
                                  ? "rotate(90deg)"
                                  : "none",
                                transition: "transform 0.15s ease",
                                color: "var(--text-3)",
                              }}
                            >
                              ›
                            </span>
                          ) : (
                            i + 1
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", maxWidth: 320 }}>
                          <div
                            style={{
                              color: "var(--text)",
                              fontSize: 12,
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={row.name}
                          >
                            {reportType === "brand" && (
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: brandColor,
                                  marginRight: 6,
                                  verticalAlign: "middle",
                                }}
                              />
                            )}
                            {row.name}
                          </div>
                        </td>
                        {reportType === "item" && (
                          <td style={{ padding: "9px 12px" }}>
                            {row.sku && (
                              <span
                                style={{
                                  ...mono,
                                  fontSize: 10,
                                  color: itemColor,
                                  background: "var(--surface-3)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {row.sku}
                              </span>
                            )}
                          </td>
                        )}
                        {reportType === "salesperson" ? (
                          <>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text)",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {formatRp(row.amount)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text-3)",
                                fontSize: 12,
                              }}
                            >
                              {formatRp(row.cost || 0)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color:
                                  (row.gross_profit || 0) >= 0
                                    ? "var(--success)"
                                    : "var(--danger)",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {formatRp(row.gross_profit || 0)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text-2)",
                                fontSize: 12,
                              }}
                            >
                              {formatPct(row.gp_margin || 0)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text-3)",
                                fontSize: 12,
                              }}
                            >
                              {row.invoice_count || 0}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--accent)",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              <div>{formatRp(row.commission_amount || 0)}</div>
                              <div
                                style={{ color: "var(--text-4)", fontSize: 10 }}
                              >
                                {row.commission_tier} ·{" "}
                                {formatPct(row.commission_rate || 0)}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text-2)",
                                fontSize: 12,
                              }}
                            >
                              {formatQty(row.quantity)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text-3)",
                                fontSize: 12,
                              }}
                            >
                              {formatRp(row.avg_price)}
                            </td>
                            <td
                              style={{
                                padding: "9px 12px",
                                textAlign: "right",
                                ...mono,
                                color: "var(--text)",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {formatRp(row.amount)}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    background: "var(--surface-3)",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(pct, 100)}%`,
                                      height: "100%",
                                      background:
                                        reportType === "brand"
                                          ? brandColor
                                          : "var(--accent)",
                                      borderRadius: 2,
                                      transition: "width 0.3s ease",
                                    }}
                                  />
                                </div>
                                <span
                                  style={{
                                    ...mono,
                                    fontSize: 10,
                                    color: "var(--text-4)",
                                    minWidth: 32,
                                    textAlign: "right",
                                  }}
                                >
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <td
                            colSpan={colSpan}
                            style={{
                              padding: "0 12px 16px 52px",
                              background: "var(--surface-2)",
                            }}
                          >
                            <div className="salesperson-print-area" style={{ paddingTop: 14 }}>
                              <div className="print-only">
                                <div className="print-title">VIA Sales Commission Statement</div>
                                <div className="print-subtitle">{row.name} · {dateRange} · Paid invoices only</div>
                                <div className="print-summary">
                                  <div className="print-summary-box">
                                    <div className="print-summary-label">Revenue Before PPN</div>
                                    <div className="print-summary-value">{formatRp(row.amount)}</div>
                                  </div>
                                  <div className="print-summary-box">
                                    <div className="print-summary-label">Cost</div>
                                    <div className="print-summary-value">{formatRp(row.cost || 0)}</div>
                                  </div>
                                  <div className="print-summary-box">
                                    <div className="print-summary-label">Gross Profit</div>
                                    <div className="print-summary-value">{formatRp(row.gross_profit || 0)}</div>
                                  </div>
                                  <div className="print-summary-box">
                                    <div className="print-summary-label">Commission Rate</div>
                                    <div className="print-summary-value">{formatPct(row.commission_rate || 0)}</div>
                                  </div>
                                  <div className="print-summary-box">
                                    <div className="print-summary-label">Commission</div>
                                    <div className="print-summary-value">{formatRp(row.commission_amount || 0)}</div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mb-3 print-hide">
                                <div>
                                  <div className="text-[var(--text)] text-sm font-semibold">
                                    Invoices for {row.name}
                                  </div>
                                  <div className="text-[var(--text-4)] text-xs mt-0.5">
                                    {row.invoices?.length || 0} paid invoices ·
                                    expand shows item details, sell price,
                                    purchase rate, cost, and GP
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.print();
                                  }}
                                  className="px-3 py-1.5 text-xs bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-[var(--text-2)] rounded-lg border border-[var(--border)]"
                                  style={mono}
                                >
                                  Print / Save PDF
                                </button>
                              </div>

                              <div
                                style={{
                                  border: "1px solid var(--border)",
                                  borderRadius: 10,
                                  overflow: "hidden",
                                  background: "var(--surface)",
                                }}
                              >
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                  }}
                                >
                                  <thead>
                                    <tr>
                                      <th style={{ ...thStyle, width: 90 }}>
                                        Date
                                      </th>
                                      <th style={thStyle}>Invoice</th>
                                      <th style={thStyle}>Customer</th>
                                      <th
                                        style={{
                                          ...thStyle,
                                          textAlign: "right",
                                        }}
                                      >
                                        Revenue
                                      </th>
                                      <th
                                        style={{
                                          ...thStyle,
                                          textAlign: "right",
                                        }}
                                      >
                                        Cost
                                      </th>
                                      <th
                                        style={{
                                          ...thStyle,
                                          textAlign: "right",
                                        }}
                                      >
                                        GP
                                      </th>
                                      <th
                                        style={{
                                          ...thStyle,
                                          textAlign: "center",
                                        }}
                                      >
                                        Paid
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(row.invoices || []).map((inv) => (
                                      <React.Fragment key={inv.invoice_id}>
                                        <tr>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              ...mono,
                                              fontSize: 11,
                                              color: "var(--text-3)",
                                            }}
                                          >
                                            {inv.date}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              ...mono,
                                              fontSize: 11,
                                              color: "var(--text)",
                                            }}
                                          >
                                            {inv.invoice_number}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              fontSize: 12,
                                              color: "var(--text)",
                                            }}
                                          >
                                            {inv.customer_name}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              textAlign: "right",
                                              ...mono,
                                              fontSize: 11,
                                            }}
                                          >
                                            {formatRp(inv.revenue)}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              textAlign: "right",
                                              ...mono,
                                              fontSize: 11,
                                              color: "var(--text-3)",
                                            }}
                                          >
                                            {formatRp(inv.cost)}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              textAlign: "right",
                                              ...mono,
                                              fontSize: 11,
                                              color:
                                                inv.gross_profit >= 0
                                                  ? "var(--success)"
                                                  : "var(--danger)",
                                              fontWeight: 700,
                                            }}
                                          >
                                            {formatRp(inv.gross_profit)}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 10px",
                                              textAlign: "center",
                                              ...mono,
                                              fontSize: 10,
                                              color: inv.paid
                                                ? "var(--success)"
                                                : "var(--text-4)",
                                            }}
                                          >
                                            {inv.paid ? "PAID" : "UNPAID"}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td
                                            colSpan={7}
                                            style={{
                                              padding: "0 10px 10px 28px",
                                              background: "var(--surface-2)",
                                            }}
                                          >
                                            <table
                                              style={{
                                                width: "100%",
                                                borderCollapse: "collapse",
                                              }}
                                            >
                                              <thead>
                                                <tr>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                    }}
                                                  >
                                                    Item
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      width: 130,
                                                    }}
                                                  >
                                                    SKU
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 70,
                                                    }}
                                                  >
                                                    Qty
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 115,
                                                    }}
                                                  >
                                                    Sell Price
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 120,
                                                    }}
                                                  >
                                                    Revenue
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 125,
                                                    }}
                                                  >
                                                    Purchase Rate
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 120,
                                                    }}
                                                  >
                                                    Cost
                                                  </th>
                                                  <th
                                                    style={{
                                                      ...thStyle,
                                                      fontSize: 9,
                                                      textAlign: "right",
                                                      width: 120,
                                                    }}
                                                  >
                                                    GP
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {inv.line_items.map(
                                                  (li, idx) => (
                                                    <tr
                                                      key={`${inv.invoice_id}-${idx}`}
                                                    >
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          fontSize: 11,
                                                          color: "var(--text)",
                                                        }}
                                                      >
                                                        {li.name}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          ...mono,
                                                          fontSize: 10,
                                                          color:
                                                            "var(--text-3)",
                                                        }}
                                                      >
                                                        {li.sku}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        {formatQty(li.quantity)}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        {formatRp(li.rate)}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        {formatRp(li.revenue)}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                          color:
                                                            li.purchase_rate > 0
                                                              ? "var(--text-3)"
                                                              : "var(--danger)",
                                                        }}
                                                      >
                                                        {formatRp(
                                                          li.purchase_rate,
                                                        )}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        {formatRp(li.cost)}
                                                      </td>
                                                      <td
                                                        style={{
                                                          padding: "7px 8px",
                                                          textAlign: "right",
                                                          ...mono,
                                                          fontSize: 10,
                                                          color:
                                                            li.gross_profit >= 0
                                                              ? "var(--success)"
                                                              : "var(--danger)",
                                                          fontWeight: 700,
                                                        }}
                                                      >
                                                        {formatRp(
                                                          li.gross_profit,
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ),
                                                )}
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot
                style={{
                  borderTop: "1px solid var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                <tr>
                  {reportType === "salesperson" ? (
                    <>
                      <td
                        colSpan={2}
                        style={{
                          padding: "8px 12px",
                          ...mono,
                          color: "var(--text-3)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        TOTAL ({filtered.length} rows)
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--text)",
                          fontWeight: 700,
                        }}
                      >
                        {formatRp(filtered.reduce((s, r) => s + r.amount, 0))}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--text-3)",
                          fontWeight: 700,
                        }}
                      >
                        {formatRp(
                          filtered.reduce((s, r) => s + (r.cost || 0), 0),
                        )}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--success)",
                          fontWeight: 700,
                        }}
                      >
                        {formatRp(
                          filtered.reduce(
                            (s, r) => s + (r.gross_profit || 0),
                            0,
                          ),
                        )}
                      </td>
                      <td />
                      <td />
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--accent)",
                          fontWeight: 700,
                        }}
                      >
                        {formatRp(
                          filtered.reduce(
                            (s, r) => s + (r.commission_amount || 0),
                            0,
                          ),
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        colSpan={reportType === "item" ? 3 : 2}
                        style={{
                          padding: "8px 12px",
                          ...mono,
                          color: "var(--text-3)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        TOTAL ({filtered.length} rows)
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--text-2)",
                          fontWeight: 700,
                        }}
                      >
                        {formatQty(
                          filtered.reduce((s, r) => s + r.quantity, 0),
                        )}
                      </td>
                      <td />
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          ...mono,
                          color: "var(--text)",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {formatRp(filtered.reduce((s, r) => s + r.amount, 0))}
                      </td>
                      <td />
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Note for brand/location/customer */}
        {!loading && reportType !== "item" && (
          <p className="text-[var(--text-4)] text-xs mt-3">
            Sales by Sales Person includes paid invoices with assigned Sales Person only. GP uses
            Revenue before PPN minus Item Purchase Rate × quantity invoiced.
            Commission tiers: GP &lt; Rp25m = 10%, Rp25m–&lt;Rp50m = 15%, Rp50m+
            = 20%.
          </p>
        )}
      </div>
    </div>
    </>
  );
}
