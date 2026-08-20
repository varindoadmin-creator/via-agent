"use client";

import { useEffect, useRef, useState } from "react";
import StatusPill, { PillTone } from "@/components/ui/StatusPill";

interface BankTransaction {
  row_hash: string;
  date: string;
  description: string;
  name_in_statement: string;
  amount: number;
  direction?: "CR";
  raw?: Record<string, string>;
}

interface SingleInvoiceMatch {
  type: "single";
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  total: number;
  balance: number;
  name_score: number;
  amount_score: number;
  match_score: number;
  match_reason: string;
}

interface MultiInvoiceMatch {
  type: "multi";
  customer_name: string;
  customer_id: string;
  invoices: Array<{
    invoice_id: string;
    invoice_number: string;
    invoice_date: string;
    balance: number;
  }>;
  total_matched: number;
  difference: number;
  name_score: number;
  match_score: number;
  match_reason: string;
}

type InvoiceMatch = SingleInvoiceMatch | MultiInvoiceMatch;

interface ReconcileResult {
  transaction: BankTransaction;
  matches: InvoiceMatch[];
  status: "matched" | "possible" | "no_match";
}

interface PaymentSelection {
  result: ReconcileResult;
  match: InvoiceMatch;
}

interface LedgerRow {
  bank_row_hash: string;
  date: string;
  amount: number;
  description: string;
  name_in_statement: string;
  status: string;
  source: string;
  zoho_payment_number: string | null;
  invoice_numbers: string[] | null;
  notes: string | null;
  updated_at: string;
}

interface MonthGroup {
  month: string;
  label: string;
  count: number;
  total_amount: number;
  rows: LedgerRow[];
}

function ledgerStatusLabel(status: string) {
  switch (status) {
    case "zoho_received": return "Received in Zoho";
    case "manual_received": return "Manually Recorded";
    case "received": return "Received";
    default: return status || "—";
  }
}

function formatRp(amount: number) {
  return `Rp ${Math.round(amount || 0).toLocaleString("id-ID")}`;
}

function positiveInvoiceBalance(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0;
}

function visibleMatch(match: InvoiceMatch): InvoiceMatch | null {
  if (match.type === "single") {
    return positiveInvoiceBalance(match.balance) ? match : null;
  }
  const invoices = match.invoices
    .filter((inv) => positiveInvoiceBalance(inv.balance))
    .sort((a, b) => {
      const ad = Date.parse(a.invoice_date || "");
      const bd = Date.parse(b.invoice_date || "");
      if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd;
      return String(a.invoice_number || "").localeCompare(String(b.invoice_number || ""));
    });
  if (invoices.length === 0) return null;
  const total = invoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  return {
    ...match,
    invoices,
    total_matched: total,
    match_reason: `${invoices.length} invoice${invoices.length > 1 ? "s" : ""} sum to payment amount`,
  };
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "text-[var(--success)]"
      : pct >= 60
        ? "text-[var(--warning)]"
        : "text-orange-600";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

function approvalKey(result: ReconcileResult) {
  return (
    result.transaction.row_hash ||
    `${result.transaction.date}_${result.transaction.amount}_${result.transaction.description}`
  );
}

export default function ReconcilePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ReconcileResult[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<
    Map<string, PaymentSelection>
  >(new Map());
  const [selectedManualRows, setSelectedManualRows] = useState<
    Map<string, ReconcileResult>
  >(new Map());
  const [receiving, setReceiving] = useState(false);
  const [receiveResults, setReceiveResults] = useState<
    Record<string, unknown>[]
  >([]);
  const [receivedKeys, setReceivedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [recordedMonths, setRecordedMonths] = useState<MonthGroup[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loadingRecorded, setLoadingRecorded] = useState(true);
  const [recordedError, setRecordedError] = useState("");
  const [dateSortDir, setDateSortDir] = useState<"asc" | "desc">("desc");

  async function fetchRecordedStatements() {
    setLoadingRecorded(true);
    setRecordedError("");
    try {
      const res = await fetch("/api/reconcile");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load recorded bank statements.");
      const months: MonthGroup[] = data.months || [];
      setRecordedMonths(months);
      setSelectedMonth((prev) => prev && months.some((m) => m.month === prev) ? prev : (months[0]?.month || ""));
    } catch (err) {
      setRecordedError(String(err));
    } finally {
      setLoadingRecorded(false);
    }
  }

  useEffect(() => { fetchRecordedStatements(); }, []);

  async function runMatchFromStatement() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Please upload a CSV or PDF bank statement first.");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    setSummary(null);
    setSelectedPayments(new Map());
    setSelectedManualRows(new Map());
    setReceiveResults([]);
    setReceivedKeys(new Set());

    try {
      const form = new FormData();
      form.append("mode", "match_statement");
      form.append("file", file);

      const res = await fetch("/api/reconcile", { method: "POST", body: form });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error || "Bank reconciliation failed.");
      setSummary(data.summary);
      setResults(data.results);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function togglePaymentSelection(
    result: ReconcileResult,
    match: InvoiceMatch,
  ) {
    const key = approvalKey(result);
    setSelectedPayments((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      const existingId = existing ? matchId(existing.match) : null;
      if (existingId === matchId(match)) next.delete(key);
      else next.set(key, { result, match });
      return next;
    });
  }

  function toggleExpand(result: ReconcileResult) {
    const key = approvalKey(result);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function matchId(match: InvoiceMatch) {
    return match.type === "single"
      ? match.invoice_id
      : `multi_${match.customer_id}_${match.total_matched}_${match.invoices.map((i) => i.invoice_id).join("_")}`;
  }

  function isSelectedForPayment(result: ReconcileResult, match: InvoiceMatch) {
    const existing = selectedPayments.get(approvalKey(result));
    return existing ? matchId(existing.match) === matchId(match) : false;
  }
  function toggleManualRow(result: ReconcileResult) {
    const key = approvalKey(result);
    setSelectedManualRows((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, result);
      return next;
    });
  }

  function isSelectedManualRow(result: ReconcileResult) {
    return selectedManualRows.has(approvalKey(result));
  }

  async function markRowsAsReceived() {
    if (selectedManualRows.size === 0) return;
    setReceiving(true);
    setError("");
    try {
      const rows = Array.from(selectedManualRows.values()).map((result) => ({
        transaction_key: approvalKey(result),
        row_hash: result.transaction.row_hash,
        date: result.transaction.date,
        amount: result.transaction.amount,
        description: result.transaction.description,
        name_in_statement: result.transaction.name_in_statement,
        notes:
          "Marked as received in VIA because payment was already recorded manually in Zoho Books.",
      }));

      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mark_received", rows }),
      });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error || "Failed to mark rows as received.");

      const okKeys = new Set(rows.map((r) => r.transaction_key));
      setReceiveResults(data.results || []);
      setReceivedKeys(
        (prev) => new Set([...Array.from(prev), ...Array.from(okKeys)]),
      );
      setResults((prev) => prev.filter((row) => !okKeys.has(approvalKey(row))));
      setSelectedManualRows(new Map());
      fetchRecordedStatements();
      setSelectedPayments((prev) => {
        const next = new Map(prev);
        okKeys.forEach((k) => next.delete(k));
        return next;
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        okKeys.forEach((k) => next.delete(k));
        return next;
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setReceiving(false);
    }
  }

  async function receivePayments() {
    if (selectedPayments.size === 0) return;
    setReceiving(true);
    setError("");
    try {
      const payload = Array.from(selectedPayments.values()).map(
        ({ result, match }) => {
          const transactionKey = approvalKey(result);
          if (match.type === "single") {
            const amountToApply = Math.min(
              result.transaction.amount,
              match.balance,
            );
            return {
              transaction_key: transactionKey,
              row_hash: result.transaction.row_hash,
              customer_id: match.customer_id,
              invoice_id: match.invoice_id,
              amount: amountToApply,
              date: result.transaction.date,
              description: result.transaction.description,
              name_in_statement: result.transaction.name_in_statement,
            };
          }

          let remaining = result.transaction.amount;
          const invoices = match.invoices
            .filter((i) => positiveInvoiceBalance(i.balance))
            .map((i) => {
              const amount_applied = Math.min(i.balance, remaining);
              remaining -= amount_applied;
              return { invoice_id: i.invoice_id, amount_applied };
            })
            .filter((i) => i.amount_applied > 0);

          return {
            transaction_key: transactionKey,
            row_hash: result.transaction.row_hash,
            customer_id: match.customer_id,
            amount: invoices.reduce((sum, i) => sum + i.amount_applied, 0),
            date: result.transaction.date,
            description: result.transaction.description,
            name_in_statement: result.transaction.name_in_statement,
            invoices,
          };
        },
      );

      const res = await fetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "receive_payment", approvals: payload }),
      });
      const data = await res.json();
      const received = (data.results || []).filter(
        (r: Record<string, unknown>) => r.success && r.transaction_key,
      );
      setReceiveResults(data.results || []);
      if (received.length > 0) {
        const okKeys = new Set<string>(
          received.map((r: Record<string, unknown>) =>
            String(r.transaction_key),
          ),
        );
        setReceivedKeys(
          (prev) => new Set([...Array.from(prev), ...Array.from(okKeys)]),
        );
        setResults((prev) =>
          prev.filter((row) => !okKeys.has(approvalKey(row))),
        );
        setSelectedPayments((prev) => {
          const next = new Map(prev);
          okKeys.forEach((k) => next.delete(k));
          return next;
        });
        setExpanded((prev) => {
          const next = new Set(prev);
          okKeys.forEach((k) => next.delete(k));
          return next;
        });
        fetchRecordedStatements();
      }
      if (!data.success) throw new Error(data.error || "Some payments failed.");
    } catch (err) {
      setError(String(err));
    } finally {
      setReceiving(false);
    }
  }

  const statusColor = (s: string) =>
    s === "matched"
      ? "text-[var(--success)] bg-[var(--success-bg)] border-[var(--success-border)]"
      : s === "possible"
        ? "text-[var(--warning)] bg-[var(--warning-bg)] border-[var(--warning-border)]"
        : "text-[var(--text-4)] border-[var(--border)]";

  const statusLabel = (s: string) =>
    s === "matched"
      ? "● Strong"
      : s === "possible"
        ? "◐ Possible"
        : "○ No Match";

  const statusTone = (s: string): PillTone =>
    s === "matched" ? "good" : s === "possible" ? "warning" : "neutral";

  return (
    <div className="text-[var(--text)] p-6 pb-24 min-h-full">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Bank Reconciliation
          </h1>
        </div>

        <div className="border border-[var(--border)] rounded-xl p-4 mb-6 bg-[var(--surface)]">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--text-2)] mb-2">
                Please Upload a Bank Statement
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
                className="block w-full text-sm text-[var(--text-2)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:text-white hover:file:bg-[var(--accent-hover)]"
              />
            </div>

            <button
              onClick={runMatchFromStatement}
              disabled={loading}
              className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? "Matching..." : "Upload"}
            </button>

            {selectedPayments.size > 0 && (
              <button
                onClick={receivePayments}
                disabled={receiving}
                className="px-5 py-2.5 bg-[var(--success)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {receiving
                  ? "Recording..."
                  : `Receive Payment for ${selectedPayments.size} Invoice${selectedPayments.size > 1 ? "s" : ""}`}
              </button>
            )}

            {selectedManualRows.size > 0 && (
              <button
                onClick={markRowsAsReceived}
                disabled={receiving}
                className="px-5 py-2.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text)] border border-[var(--border)] rounded-lg font-medium transition-colors"
              >
                {receiving
                  ? "Saving..."
                  : `Mark ${selectedManualRows.size} Bank Row${selectedManualRows.size > 1 ? "s" : ""} as Received`}
              </button>
            )}
          </div>
          {fileName && (
            <div className="text-xs text-[var(--text-3)] mt-3">
              Selected statement: {fileName}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            {[
              {
                label: "Statement Transactions",
                value: summary.total_statement_rows ?? summary.total_csv_rows,
                color: "text-[var(--text)]",
              },
              {
                label: "Incoming Payments",
                value: summary.total_cr_transactions,
                color: "text-[var(--text)]",
              },
              {
                label: "Strong Match",
                value: summary.matched,
                color: "text-[var(--success)]",
              },
              {
                label: "Possible Match",
                value: summary.possible,
                color: "text-[var(--warning)]",
              },
              {
                label: "No Match",
                value: summary.no_match,
                color: "text-[var(--text-4)]",
              },
              {
                label: "Already Received",
                value: summary.hidden_received_transactions || 0,
                color: "text-[var(--success)]",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="border border-[var(--border)] rounded-lg p-4"
              >
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[var(--text-3)] text-sm mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {receiveResults.length > 0 && (
          <div className="mb-6 p-4 border border-[var(--border)] rounded-lg">
            <h3 className="font-semibold text-[var(--text)] mb-3">
              Payment Received Results
            </h3>
            <p className="text-xs text-[var(--text-3)] mb-2">
              Processed transactions are recorded and will be automatically
              excluded from future reconciliations.
            </p>
            {receiveResults.map((r, i) => {
              const rec = r as Record<string, unknown>;
              return (
                <div
                  key={i}
                  className={`text-sm py-1.5 flex items-start gap-2 ${rec.success ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                >
                  <span>{rec.success ? "✓" : "✗"}</span>
                  <div>
                    {rec.success ? (
                      <>
                        <span className="font-medium">
                          {rec.payment_number as string}
                        </span>
                        <span className="text-[var(--text-3)] mx-2">—</span>
                        <span>{rec.customer_name as string}</span>
                        <span className="text-[var(--text-3)] mx-2">—</span>
                        <span className="font-mono">
                          {formatRp(Number(rec.amount))}
                        </span>
                      </>
                    ) : (
                      <span>{rec.error as string}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results
              .filter((result) => !receivedKeys.has(approvalKey(result)))
              .map((result, idx) => {
                const key = approvalKey(result);
                const isOpen = expanded.has(key);
                const visibleMatches = result.matches
                  .map(visibleMatch)
                  .filter(Boolean) as InvoiceMatch[];
                return (
                  <div
                    key={key || idx}
                    className={`border rounded-xl overflow-hidden ${statusColor(result.status)}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(result)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] text-left hover:bg-[var(--surface-2)]"
                    >
                      <span
                        role="checkbox"
                        aria-checked={isSelectedManualRow(result)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleManualRow(result);
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 ${isSelectedManualRow(result) ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--border)] text-transparent"}`}
                        title="Tick this if this bank row was already manually recorded in Zoho Books"
                      >
                        ✓
                      </span>
                      <span className="w-6 h-6 rounded-full border border-[var(--border)] flex items-center justify-center text-xs">
                        {isOpen ? "−" : "+"}
                      </span>
                      <StatusPill tone={statusTone(result.status)}>
                        {statusLabel(result.status)}
                      </StatusPill>
                      <span className="text-[var(--text-3)] text-sm w-24 flex-shrink-0">
                        {result.transaction.date}
                      </span>
                      <span className="text-[var(--text)] font-mono font-semibold">
                        {formatRp(result.transaction.amount)}
                      </span>
                      <span className="text-[var(--text-2)] text-sm flex-1 truncate">
                        {result.transaction.name_in_statement ||
                          result.transaction.description}
                      </span>
                      <span className="text-xs text-[var(--text-4)]">
                        {visibleMatches.length} match
                        {visibleMatches.length === 1 ? "" : "es"}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="divide-y divide-[var(--border-muted)]">
                        <div className="px-4 py-3 text-xs text-[var(--text-3)] bg-[var(--surface-2)]">
                          <div>
                            <span className="text-[var(--text-4)]">
                              Description:
                            </span>{" "}
                            {result.transaction.description}
                          </div>
                          <div className="mt-1">
                            <span className="text-[var(--text-4)]">
                              Manual Zoho payment already recorded?
                            </span>{" "}
                            Tick the checkbox on the row and click Mark Bank Row
                            as Received.
                          </div>
                        </div>

                        {visibleMatches.length === 0 && (
                          <div className="px-4 py-3 text-[var(--text-4)] text-sm italic">
                            No matching invoice found — check Zoho manually or
                            skip.
                          </div>
                        )}

                        {visibleMatches.map((match, mIdx) => {
                          const selected = isSelectedForPayment(result, match);
                          const isMulti = match.type === "multi";
                          return (
                            <div
                              key={mIdx}
                              onClick={() =>
                                togglePaymentSelection(result, match)
                              }
                              className={`flex items-start gap-4 px-4 py-3 cursor-pointer transition-colors ${selected ? "bg-[var(--success-bg)] border-l-2 border-[var(--success)]" : "hover:bg-[var(--surface-2)]"}`}
                            >
                              <div
                                className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-[var(--success)] border-[var(--success)] text-white" : "border-[var(--border)]"}`}
                              >
                                {selected && (
                                  <span className="text-xs font-bold">✓</span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {isMulti ? (
                                  <>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs px-1.5 py-0.5 bg-[var(--accent-light)] text-[var(--accent)] rounded font-medium">
                                        {match.invoices.length} INVOICES
                                      </span>
                                      <span className="text-[var(--text-2)] text-sm font-medium">
                                        {match.customer_name}
                                      </span>
                                    </div>
                                    <div className="space-y-0.5">
                                      {match.invoices.map((inv, ii) => (
                                        <div
                                          key={ii}
                                          className="flex items-center gap-2 text-xs text-[var(--text-3)]"
                                        >
                                          <span className="text-[var(--accent)] font-mono">
                                            {inv.invoice_number}
                                          </span>
                                          <span>{inv.invoice_date}</span>
                                          <span className="font-mono text-[var(--text-2)]">
                                            {formatRp(inv.balance)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="text-xs text-[var(--text-4)] mt-1">
                                      {match.match_reason}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[var(--accent)] text-sm font-mono">
                                        {match.invoice_number}
                                      </span>
                                      <span className="text-[var(--text-2)] text-sm truncate">
                                        {match.customer_name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-4)]">
                                      <span>Inv: {match.invoice_date}</span>
                                      <span>Due: {match.due_date}</span>
                                      <span>{match.match_reason}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {isMulti ? (
                                  <div className="text-[var(--text)] font-mono text-sm">
                                    {formatRp(match.total_matched)}
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-[var(--text)] font-mono text-sm">
                                      {formatRp(match.balance)}
                                    </div>
                                    {match.balance !== match.total && (
                                      <div className="text-[var(--text-4)] text-xs">
                                        Total: {formatRp(match.total)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-right w-12">
                                <ScoreBadge score={match.match_score} />
                                <div className="text-xs text-[var(--text-4)] mt-0.5">
                                  score
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        <div className="border border-[var(--border)] rounded-xl mb-6 bg-[var(--surface)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Recorded Bank Statement</h2>
            </div>
            <div className="flex items-center gap-2">
              {recordedMonths.length > 0 && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="text-xs border border-[var(--border)] rounded-lg px-2.5 py-1.5 bg-[var(--surface)] text-[var(--text)]"
                >
                  {recordedMonths.map((m) => (
                    <option key={m.month} value={m.month}>
                      {m.label} ({m.count})
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={fetchRecordedStatements}
                disabled={loadingRecorded}
                className="px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text)] border border-[var(--border)] rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingRecorded ? "…" : "↻"}
              </button>
            </div>
          </div>

          {recordedError && (
            <div className="m-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs">
              {recordedError}
            </div>
          )}

          {!loadingRecorded && !recordedError && recordedMonths.length === 0 && (
            <div className="py-10 text-center text-[var(--text-3)] text-sm">No recorded bank statement rows yet.</div>
          )}

          {loadingRecorded && recordedMonths.length === 0 && (
            <div className="py-10 text-center text-[var(--text-3)] text-sm">Loading…</div>
          )}

          {!recordedError && selectedMonth && (() => {
            const group = recordedMonths.find((m) => m.month === selectedMonth);
            if (!group) return null;
            const sortedRows = [...group.rows].sort((a, b) =>
              dateSortDir === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
            );
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-3)] uppercase tracking-wide bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <th
                        className="px-4 py-2 font-medium cursor-pointer select-none hover:text-[var(--text)]"
                        onClick={() => setDateSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      >
                        Date <span className="text-[var(--text-4)]">{dateSortDir === "asc" ? "▲" : "▼"}</span>
                      </th>
                      <th className="px-4 py-2 font-medium">Name / Description</th>
                      <th className="px-4 py-2 font-medium text-right">Amount</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Zoho Payment #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.bank_row_hash} className="border-b border-[var(--border-muted)] last:border-b-0">
                        <td className="px-4 py-2 text-[var(--text-3)] whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-2 text-[var(--text-2)] max-w-xs truncate" title={row.name_in_statement || row.description}>
                          {row.name_in_statement || row.description}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[var(--text)]">{formatRp(row.amount)}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-3)]">
                            {ledgerStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-[var(--text-3)] font-mono text-xs">{row.zoho_payment_number || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--surface-2)] border-t border-[var(--border)]">
                      <td colSpan={2} className="px-4 py-2 text-xs text-[var(--text-3)]">Total Value</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-[var(--text)]">{formatRp(group.total_amount)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
