import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getZohoAccessToken, getZohoApiBaseUrl } from "@/lib/zoho/auth";
import { fetchWithRetry } from "@/lib/zoho/retry";

const ORG_ID = () => process.env.ZOHO_ORGANIZATION_ID || "";

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${sep}organization_id=${ORG_ID()}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function zohoPost(path: string, data: Record<string, unknown>) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const url = `${base}${path}?organization_id=${ORG_ID()}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function normalizeName(name: string): string {
  return String(name || "")
    .toUpperCase()
    .replace(/\b(CV|PT|UD|PD|TB|TOKO|AND|DE|THE|CV\.|PT\.)\b/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchScore(bankName: string, zohoName: string): number {
  const b = normalizeName(bankName);
  const z = normalizeName(zohoName);
  if (!b || !z) return 0;
  if (b === z) return 1.0;
  if (z.includes(b) || b.includes(z)) return 0.9;
  const bWords = b.split(" ").filter((w) => w.length >= 3);
  const zWords = z.split(" ").filter((w) => w.length >= 3);
  if (bWords.length === 0 || zWords.length === 0) return 0;
  const matches = bWords.filter((w) =>
    zWords.some((zw) => zw.includes(w) || w.includes(zw)),
  );
  return matches.length / Math.max(bWords.length, zWords.length);
}

function amountMatchScore(bankAmount: number, invoiceAmount: number): number {
  if (!invoiceAmount || !bankAmount) return 0;
  if (Math.round(bankAmount) === Math.round(invoiceAmount)) return 1.0;
  const diff = Math.abs(bankAmount - invoiceAmount);
  const pct = diff / invoiceAmount;
  if (pct <= 0.001) return 0.99;
  if (pct <= 0.01) return 0.9;
  if (pct <= 0.03) return 0.75;
  if (pct <= 0.05) return 0.65;
  if (pct <= 0.1) return 0.45;
  return 0;
}

interface ZohoInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
}

// IDR has no meaningful sub-unit — invoices with a sub-Rupiah residual balance
// (e.g. Rp 0.1 left over from prior payment rounding) are effectively paid and
// display as "Rp 0", so they must not be treated as open for matching purposes.
function hasPositiveBalance(inv: { balance?: unknown }): boolean {
  const balance = Number(inv.balance || 0);
  return Number.isFinite(balance) && Math.round(balance) > 0;
}

interface BankTransaction {
  row_hash: string;
  date: string;
  description: string;
  name_in_statement: string;
  amount: number;
  direction: "CR";
  raw?: Record<string, string>;
}

async function fetchInvoiceBalance(
  invoiceId: string,
): Promise<{
  invoice_id: string;
  balance: number;
  customer_id: string;
  invoice_number: string;
}> {
  const data = await zohoGet(`/invoices/${invoiceId}`);
  const inv = data.invoice || {};
  return {
    invoice_id: String(inv.invoice_id || invoiceId),
    balance: parseFloat(String(inv.balance || 0)) || 0,
    customer_id: String(inv.customer_id || ""),
    invoice_number: String(inv.invoice_number || ""),
  };
}

async function buildSafeInvoiceApplications(approval: {
  amount: number;
  invoice_id?: string;
  invoices?: Array<{ invoice_id: string; amount_applied: number }>;
}): Promise<Array<{ invoice_id: string; amount_applied: number }>> {
  const requested = approval.invoices?.length
    ? approval.invoices
    : approval.invoice_id
      ? [{ invoice_id: approval.invoice_id, amount_applied: approval.amount }]
      : [];

  let remaining = Math.max(0, Number(approval.amount) || 0);
  const safe: Array<{ invoice_id: string; amount_applied: number }> = [];

  for (const item of requested) {
    if (!item.invoice_id || remaining <= 0) continue;
    const latest = await fetchInvoiceBalance(item.invoice_id);
    const requestedAmount = Math.max(0, Number(item.amount_applied) || 0);
    const applyAmount = Math.min(requestedAmount, latest.balance, remaining);
    if (applyAmount > 0) {
      safe.push({
        invoice_id: item.invoice_id,
        amount_applied: Math.round(applyAmount),
      });
      remaining -= applyAmount;
    }
  }

  return safe;
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

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface StatementPeriod {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

// Some BCA exports (e.g. "Corporate Account Transaction") only print "DD/MM" in the
// transaction date column, omitting the year entirely \u2014 the year only appears in a
// "Periode : DD/MM/YYYY - DD/MM/YYYY" metadata line. Without this, date parsing falls
// back to JS's ambiguous Date() parsing, which silently produces bogus ~2001 dates \u2014
// corrupting both the reconciliation hash and the actual Zoho payment date on approval.
function extractStatementPeriod(text: string): StatementPeriod | null {
  const m = text.match(
    /periode\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  );
  if (!m) return null;
  return {
    startMonth: Number(m[2]),
    startYear: Number(m[3]),
    endMonth: Number(m[5]),
    endYear: Number(m[6]),
  };
}

// Resolves a "DD/MM"-only date (no year) against the statement period, and returns
// a fully-qualified "DD/MM/YYYY" string. Non-matching input is returned unchanged.
function resolveBareDayMonth(raw: string, period: StatementPeriod | null): string {
  const bare = raw.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!bare || !period) return raw;
  const day = bare[1];
  const month = Number(bare[2]);
  const year =
    month === period.startMonth
      ? period.startYear
      : month === period.endMonth
        ? period.endYear
        : period.endYear;
  return `${day}/${bare[2]}/${year}`;
}

function parseCsv(text: string): Record<string, string>[] {
  const normalized = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // BCA/Indonesian bank exports often have account metadata before the actual table.
  // Example header row: Tanggal Transaksi,Keterangan,Cabang,Jumlah,Saldo
  let headerIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]).map((c) =>
      c.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    const hasDate = cells.some(
      (c) => c.includes("tanggal") || c.includes("date"),
    );
    const hasDesc = cells.some(
      (c) =>
        c.includes("keterangan") ||
        c.includes("description") ||
        c.includes("remark"),
    );
    const hasAmount = cells.some(
      (c) =>
        c.includes("jumlah") ||
        c.includes("amount") ||
        c.includes("credit") ||
        c.includes("debit"),
    );
    if (hasDate && hasDesc && hasAmount) {
      headerIndex = i;
      break;
    }
  }

  const headers = parseCsvLine(lines[headerIndex]).map(
    (h) => h.trim() || "Column",
  );
  return lines
    .slice(headerIndex + 1)
    .map((line) => {
      const cells = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] || "";
      });
      row.__raw_line = line;
      return row;
    })
    .filter((row) => Object.values(row).some((v) => String(v || "").trim()));
}

function extractNameFromBcaDescription(description: string): string {
  const d = String(description || "").trim();
  // Common BCA mutasi pattern:
  // TRSF E-BANKING CR 0206/FTSCY/WS95271 10749510.00  Bon varindo SAMUEL
  // Keep the free-text after the transaction amount because this usually contains payer/customer reference.
  const m = d.match(/\b(?:CR|DB)\b\s+\S+\s+([0-9][0-9.,]*)\s+(.+)$/i);
  if (m?.[2]) return m[2].trim();
  const m2 = d.match(/\b[0-9][0-9.,]*\s+(.+)$/);
  if (m2?.[1]) return m2[1].trim();
  return d;
}

function findField(row: Record<string, string>, candidates: string[]): string {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const cand = candidate.toLowerCase();
    const found = entries.find(([key]) =>
      key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(cand.replace(/[^a-z0-9]/g, "")),
    );
    if (found && String(found[1] || "").trim()) return String(found[1]).trim();
  }
  return "";
}

function parseMoney(value: string): number {
  let s = String(value || "").trim();
  if (!s) return 0;
  const isNegative = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()\sA-Za-zRp$]/g, "");
  if (!s) return 0;

  // Indonesian format 1.234.567,89
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts[parts.length - 1].length <= 2)
      s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
    else s = s.replace(/,/g, "");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length > 2 || parts[parts.length - 1].length === 3)
      s = s.replace(/\./g, "");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -Math.abs(n) : n;
}

function toZohoDate(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 10);

  // Already YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Indonesian/BCA style DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }

  // Some exports include timestamp after the date. Try first date-looking token.
  const token = raw.match(
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/,
  );
  if (token) return toZohoDate(token[1]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  // Last fallback: today, because Zoho rejects non-YYYY-MM-DD payment dates.
  return new Date().toISOString().slice(0, 10);
}

function makeBankRowHash(input: {
  date: unknown;
  amount: unknown;
  description: unknown;
  direction?: unknown;
}) {
  const date = toZohoDate(input.date);
  const amount = Math.round(Number(input.amount || 0));
  const direction = String(input.direction || "CR")
    .toUpperCase()
    .trim();
  const description = String(input.description || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 ._/-]/g, "")
    .trim();
  return crypto
    .createHash("sha256")
    .update(`${date}|${amount}|${direction}|${description}`)
    .digest("hex");
}

function supabaseConfig() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const table =
    process.env.SUPABASE_RECONCILIATION_TABLE || "bank_reconciliation_ledger";
  return { url: url.replace(/\/$/, ""), key, table };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (res.status === 204) return [];
  return res.json();
}

const BANK_NAME_HISTORY_TABLE =
  process.env.SUPABASE_BANK_NAME_HISTORY_TABLE || "customer_bank_names";

/** customer_id → set of normalized bank account names seen paying that customer before. */
async function getBankNameHistory(): Promise<Map<string, Set<string>>> {
  const history = new Map<string, Set<string>>();
  try {
    const data = await supabaseRequest(
      `${BANK_NAME_HISTORY_TABLE}?select=customer_id,bank_account_name_key`,
    );
    if (!Array.isArray(data)) return history;
    for (const r of data as Record<string, unknown>[]) {
      const customerId = String(r.customer_id || "");
      const key = String(r.bank_account_name_key || "");
      if (!customerId || !key) continue;
      if (!history.has(customerId)) history.set(customerId, new Set());
      history.get(customerId)!.add(key);
    }
  } catch (err) {
    // Soft-fail so matching still works before the customer_bank_names table exists.
    console.warn("[Reconcile] Failed to load bank name history:", err);
  }
  return history;
}

/**
 * Remember that this customer has received a bank transfer under this account name,
 * so future statements can be matched to them even when the name on the statement
 * doesn't closely resemble the Zoho customer name. One customer can have several
 * bank account names on file — each is tracked as its own row.
 */
async function recordBankAccountName(
  customerId: string,
  customerName: string,
  bankAccountName: string,
) {
  const name = String(bankAccountName || "").trim();
  const key = normalizeName(name);
  if (!customerId || !name || !key) return;
  try {
    const existing = await supabaseRequest(
      `${BANK_NAME_HISTORY_TABLE}?customer_id=eq.${encodeURIComponent(customerId)}&bank_account_name_key=eq.${encodeURIComponent(key)}&select=times_seen`,
    );
    const timesSeen =
      Array.isArray(existing) && existing[0]
        ? (Number((existing[0] as Record<string, unknown>).times_seen) || 0) + 1
        : 1;
    await supabaseRequest(
      `${BANK_NAME_HISTORY_TABLE}?on_conflict=customer_id,bank_account_name_key`,
      {
        method: "POST",
        body: JSON.stringify([
          {
            customer_id: customerId,
            customer_name: customerName || "",
            bank_account_name: name,
            bank_account_name_key: key,
            times_seen: timesSeen,
            last_seen_at: new Date().toISOString(),
          },
        ]),
      },
    );
  } catch (err) {
    console.warn("[Reconcile] Failed to record bank account name history:", err);
  }
}

async function getReceivedLedgerHashes(): Promise<Set<string>> {
  const { table } = supabaseConfig();
  const data = await supabaseRequest(
    `${table}?select=bank_row_hash,status&status=in.(received,manual_received,zoho_received)`,
  );
  if (!Array.isArray(data)) return new Set();
  return new Set(
    data
      .map((r: Record<string, unknown>) => String(r.bank_row_hash || ""))
      .filter(Boolean),
  );
}

async function upsertReconciliationLedger(
  entries: Array<Record<string, unknown>>,
) {
  if (!entries.length) return [];
  const { table } = supabaseConfig();
  const rows = entries.map((e) => ({
    bank_row_hash: e.bank_row_hash || e.transaction_key,
    date: e.date ? toZohoDate(e.date) : null,
    amount: Number(e.amount || 0),
    direction: "CR",
    description: String(e.description || ""),
    name_in_statement: String(e.name_in_statement || ""),
    status: e.status || "received",
    source: e.source || "via",
    zoho_payment_id: e.zoho_payment_id || null,
    zoho_payment_number: e.zoho_payment_number || null,
    invoice_ids: e.invoice_ids || [],
    invoice_numbers: e.invoice_numbers || [],
    notes: e.notes || null,
    updated_at: new Date().toISOString(),
  }));
  return supabaseRequest(`${table}?on_conflict=bank_row_hash`, {
    method: "POST",
    body: JSON.stringify(rows),
  });
}

function rowToTransaction(
  row: Record<string, string>,
  period: StatementPeriod | null = null,
): BankTransaction | null {
  const rawDate =
    findField(row, [
      "tanggal transaksi",
      "date",
      "tanggal",
      "posting date",
      "transaction date",
      "value date",
    ]) ||
    Object.values(row)[0] ||
    "";
  const date = resolveBareDayMonth(rawDate, period);
  const description =
    findField(row, [
      "keterangan",
      "description",
      "remark",
      "remarks",
      "transaction description",
      "reference",
      "narasi",
      "berita",
    ]) || Object.values(row).join(" ");
  const jumlahRaw = findField(row, ["jumlah"]);
  const creditRaw = findField(row, [
    "credit",
    "kredit",
    "cr",
    "deposit",
    "masuk",
    "paid in",
  ]);
  const debitRaw = findField(row, [
    "debit",
    "debet",
    "dr",
    "withdrawal",
    "keluar",
    "paid out",
  ]);
  const amountRaw = findField(row, ["amount", "nominal", "transaction amount"]);

  // BCA column D / "Jumlah" contains both amount and direction: "1,000,000.00 CR" or "10,000,000.00 DB".
  // For reconciliation, use only CR (money in) and ignore DB (money out).
  let amount = 0;
  const directionText = `${jumlahRaw} ${description}`.toUpperCase();
  if (jumlahRaw) {
    if (/\bDB\b/.test(directionText)) return null;
    if (!/\bCR\b/.test(directionText)) return null;
    amount = parseMoney(jumlahRaw);
  } else if (creditRaw) {
    amount = parseMoney(creditRaw);
  } else if (amountRaw) {
    if (/\bDB\b/.test(String(amountRaw).toUpperCase())) return null;
    amount = parseMoney(amountRaw);
  } else if (debitRaw) {
    return null;
  }

  if (amount <= 0) return null;
  const detectedName =
    findField(row, [
      "name",
      "customer",
      "beneficiary",
      "sender",
      "payer",
      "from",
      "counterparty",
    ]) || extractNameFromBcaDescription(description);
  const txn = {
    date: String(date).trim(),
    description: String(description).trim(),
    name_in_statement: String(detectedName).trim(),
    amount,
    direction: "CR" as const,
    raw: row,
  };
  return { ...txn, row_hash: makeBankRowHash(txn) };
}

async function fetchOpenInvoices(): Promise<ZohoInvoice[]> {
  const [invRes, partialRes] = await Promise.all([
    zohoGet("/invoices?status=unpaid&per_page=200"),
    zohoGet("/invoices?status=partially_paid&per_page=200"),
  ]);

  const merged = new Map<string, ZohoInvoice>();
  for (const i of [
    ...(invRes.invoices || []),
    ...(partialRes.invoices || []),
  ] as Record<string, unknown>[]) {
    const invoiceId = String(i.invoice_id);
    merged.set(invoiceId, {
      invoice_id: invoiceId,
      invoice_number: String(i.invoice_number),
      customer_name: String(i.customer_name),
      customer_id: String(i.customer_id),
      date: String(i.date),
      due_date: String(i.due_date),
      total: parseFloat(String(i.total)) || 0,
      balance: parseFloat(String(i.balance)) || 0,
    });
  }

  return Array.from(merged.values()).filter((i) => hasPositiveBalance(i));
}

function findMultiInvoiceCombinations(
  bankAmount: number,
  invoices: ZohoInvoice[],
  tolerance = 0.001,
): Array<{ invoices: ZohoInvoice[]; total: number; difference: number }> {
  const results: Array<{
    invoices: ZohoInvoice[];
    total: number;
    difference: number;
  }> = [];
  const maxInvoices = 6;
  const maxDiff = Math.max(1000, bankAmount * tolerance);
  const sorted = invoices.filter((i) => hasPositiveBalance(i)).sort((a, b) => a.balance - b.balance);

  function search(start: number, current: ZohoInvoice[], currentTotal: number) {
    const diff = Math.abs(currentTotal - bankAmount);
    if (current.length > 1 && diff <= maxDiff) {
      results.push({
        invoices: [...current],
        total: currentTotal,
        difference: currentTotal - bankAmount,
      });
      if (results.length >= 5) return;
    }
    if (
      current.length >= maxInvoices ||
      currentTotal >= bankAmount + maxDiff ||
      results.length >= 5
    )
      return;
    for (let i = start; i < sorted.length; i++)
      search(i + 1, [...current, sorted[i]], currentTotal + sorted[i].balance);
  }

  search(0, [], 0);
  return results;
}

function matchTransactions(
  transactions: BankTransaction[],
  allInvoices: ZohoInvoice[],
  bankNameHistory: Map<string, Set<string>> = new Map(),
  minScore = 0.4,
): ReconcileResult[] {
  const isKnownBankName = (customerId: string, bankName: string): boolean => {
    const known = bankNameHistory.get(customerId);
    return !!known && known.has(normalizeName(bankName));
  };

  const byCustomer = new Map<string, ZohoInvoice[]>();
  const openInvoices = allInvoices.filter((inv) => hasPositiveBalance(inv));

  for (const inv of openInvoices) {
    if (!byCustomer.has(inv.customer_id)) byCustomer.set(inv.customer_id, []);
    byCustomer.get(inv.customer_id)!.push(inv);
  }

  const results: ReconcileResult[] = [];
  for (const txn of transactions) {
    const matches: InvoiceMatch[] = [];
    for (const inv of openInvoices) {
      const rawNameScore = nameMatchScore(
        txn.name_in_statement || txn.description,
        inv.customer_name,
      );
      const knownBankName = isKnownBankName(
        inv.customer_id,
        txn.name_in_statement,
      );
      // A bank account name we've seen pay this exact customer before is a stronger
      // signal than string similarity to the Zoho customer name (e.g. "Jully Agatta"
      // paying invoices for customer "JDESIGN").
      const nameScore = knownBankName ? 1.0 : rawNameScore;
      const amountScore = amountMatchScore(txn.amount, inv.balance);
      // Amount is the strongest fallback when the bank sender name is not the invoice customer
      // e.g. Likha Interior invoice paid by Andy Winata.
      const matchScore =
        amountScore === 1.0 && nameScore < 0.3
          ? 0.72
          : nameScore * 0.4 + amountScore * 0.6;
      if (matchScore >= minScore || amountScore === 1.0) {
        const reasons: string[] = [];
        if (knownBankName) reasons.push("known bank account for this customer");
        else if (nameScore >= 0.9) reasons.push("name matches");
        else if (nameScore >= 0.5) reasons.push("name partially matches");
        else if (amountScore === 1.0)
          reasons.push("name different/unclear, amount exact");
        if (amountScore === 1.0) reasons.push("amount exact");
        else if (amountScore >= 0.9) reasons.push("amount near-exact");
        else if (amountScore >= 0.45) reasons.push("amount close");
        matches.push({
          type: "single",
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
          customer_id: inv.customer_id,
          invoice_date: inv.date,
          due_date: inv.due_date,
          total: inv.total,
          balance: inv.balance,
          name_score: Math.round(nameScore * 100) / 100,
          amount_score: Math.round(amountScore * 100) / 100,
          match_score: Math.round(matchScore * 100) / 100,
          match_reason: reasons.join(", ") || "possible match",
        });
      }
    }

    for (const [customerId, custInvoices] of byCustomer) {
      if (custInvoices.length < 2) continue;
      const customerName = custInvoices[0].customer_name;
      const knownBankName = isKnownBankName(customerId, txn.name_in_statement);
      const nameScore = knownBankName
        ? 1.0
        : nameMatchScore(txn.name_in_statement || txn.description, customerName);
      if (nameScore < 0.3) continue;
      for (const combo of findMultiInvoiceCombinations(
        txn.amount,
        custInvoices,
      )) {
        const matchScore = nameScore * 0.4 + 0.6;
        matches.push({
          type: "multi",
          customer_name: customerName,
          customer_id: customerId,
          invoices: combo.invoices.map((i) => ({
            invoice_id: i.invoice_id,
            invoice_number: i.invoice_number,
            invoice_date: i.date,
            balance: i.balance,
          })),
          total_matched: combo.total,
          difference: combo.difference,
          name_score: Math.round(nameScore * 100) / 100,
          match_score: Math.round(matchScore * 100) / 100,
          match_reason: knownBankName
            ? `known bank account for this customer, ${combo.invoices.length} invoices sum to payment amount`
            : `${combo.invoices.length} invoices sum to payment amount`,
        });
      }
    }

    matches.sort((a, b) => {
      if (Math.abs(b.match_score - a.match_score) < 0.01) {
        if (a.type === "multi" && b.type !== "multi") return -1;
        if (b.type === "multi" && a.type !== "multi") return 1;
      }
      return b.match_score - a.match_score;
    });

    const status =
      matches.length === 0
        ? "no_match"
        : matches[0].match_score >= 0.8
          ? "matched"
          : "possible";
    results.push({ transaction: txn, matches: matches.slice(0, 12), status });
  }
  return results;
}

function makeZohoReferenceNumber(description: unknown, date: unknown): string {
  const d = String(date || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 8);
  const clean = String(description || "")
    .replace(/\s+/g, " ")
    .replace(/[^A-Za-z0-9\-_/ .]/g, "")
    .trim();
  const base = clean || `BANK-${d || new Date().toISOString().slice(0, 10)}`;
  // Zoho Books requires reference_number to be less than 50 characters.
  return base.slice(0, 49);
}

async function runCsvMatch(file: File) {
  const text = await file.text();
  const period = extractStatementPeriod(text);
  const rows = parseCsv(text);
  const transactions = rows
    .map((row) => rowToTransaction(row, period))
    .filter(Boolean) as BankTransaction[];
  console.log(
    `[Reconcile] CSV rows=${rows.length} incoming=${transactions.length}`,
  );

  const [receivedHashes, bankNameHistory] = await Promise.all([
    getReceivedLedgerHashes(),
    getBankNameHistory(),
  ]);
  const hiddenReceived = transactions.filter((t) =>
    receivedHashes.has(t.row_hash),
  ).length;
  const pendingTransactions = transactions.filter(
    (t) => !receivedHashes.has(t.row_hash),
  );

  const allInvoices = await fetchOpenInvoices();
  console.log(
    `[Reconcile] Zoho open invoices=${allInvoices.length} ledger_hidden=${hiddenReceived} known_bank_names=${bankNameHistory.size}`,
  );

  const results = matchTransactions(
    pendingTransactions,
    allInvoices,
    bankNameHistory,
  );
  console.log(
    `[Reconcile] BCA CSV parser focused on Column D/Jumlah CR only. First CR: ${transactions[0]?.amount || 0} ${transactions[0]?.name_in_statement || ""}`,
  );
  const matched = results.filter((r) => r.status === "matched").length;
  const possible = results.filter((r) => r.status === "possible").length;
  const noMatch = results.filter((r) => r.status === "no_match").length;

  return NextResponse.json({
    success: true,
    summary: {
      total_csv_rows: rows.length,
      total_cr_transactions: transactions.length,
      hidden_received_transactions: hiddenReceived,
      matched,
      possible,
      no_match: noMatch,
      total_invoices_checked: allInvoices.length,
    },
    results,
  });
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

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// GET /api/reconcile — recorded bank statement rows from Supabase, grouped by month
// (most recent month first) for the "Recorded Bank Statement" view.
export async function GET() {
  try {
    const { table } = supabaseConfig();
    const data = await supabaseRequest(
      `${table}?select=bank_row_hash,date,amount,description,name_in_statement,status,source,zoho_payment_number,invoice_numbers,notes,updated_at&order=date.desc&limit=2000`,
    );
    const rows = (Array.isArray(data) ? data : []) as LedgerRow[];

    const byMonth = new Map<string, LedgerRow[]>();
    for (const row of rows) {
      const month = String(row.date || "").slice(0, 7);
      if (!month) continue;
      const list = byMonth.get(month);
      if (list) list.push(row);
      else byMonth.set(month, [row]);
    }

    const months = Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, monthRows]) => ({
        month,
        label: monthLabel(month),
        count: monthRows.length,
        total_amount: monthRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        rows: monthRows,
      }));

    return NextResponse.json({ success: true, months });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const mode = String(formData.get("mode") || "match_csv");
      if (mode !== "match_csv")
        return NextResponse.json(
          { success: false, error: "Unknown form mode" },
          { status: 400 },
        );
      const file = formData.get("file");
      if (!(file instanceof File))
        return NextResponse.json(
          { success: false, error: "CSV file is required." },
          { status: 400 },
        );
      return runCsvMatch(file);
    }

    const body = await request.json();
    const { mode, approvals, rows } = body as {
      mode?: string;
      rows?: Array<{
        transaction_key?: string;
        row_hash?: string;
        amount: number;
        date: string;
        description: string;
        name_in_statement?: string;
        notes?: string;
      }>;
      approvals?: Array<{
        transaction_key?: string;
        row_hash?: string;
        customer_id: string;
        amount: number;
        date: string;
        description: string;
        name_in_statement?: string;
        payment_mode?: string;
        invoice_id?: string;
        invoices?: Array<{ invoice_id: string; amount_applied: number }>;
      }>;
    };

    if (mode === "mark_received") {
      if (!rows?.length)
        return NextResponse.json(
          { success: false, error: "No bank rows selected." },
          { status: 400 },
        );
      const ledgerRows = rows.map((row) => ({
        bank_row_hash:
          row.row_hash ||
          row.transaction_key ||
          makeBankRowHash({
            date: row.date,
            amount: row.amount,
            description: row.description,
            direction: "CR",
          }),
        date: row.date,
        amount: row.amount,
        description: row.description,
        name_in_statement: row.name_in_statement || "",
        status: "manual_received",
        source: "manual_zoho",
        notes:
          row.notes ||
          "Marked as received in VIA because payment was already recorded manually in Zoho Books.",
      }));
      await upsertReconciliationLedger(ledgerRows);
      return NextResponse.json({
        success: true,
        results: ledgerRows.map((row) => ({
          success: true,
          transaction_key: row.bank_row_hash,
          status: "manual_received",
          amount: row.amount,
        })),
      });
    }

    if (mode && mode !== "receive_payment" && mode !== "approve")
      return NextResponse.json(
        { success: false, error: "Unknown JSON mode" },
        { status: 400 },
      );

    if (!approvals?.length)
      return NextResponse.json(
        { success: false, error: "No selected invoices provided" },
        { status: 400 },
      );

    const bankAccountId =
      process.env.ZOHO_BANK_ACCOUNT_ID || "8607767000000239960";
    const results = [];

    for (const approval of approvals) {
      try {
        const invoiceList = await buildSafeInvoiceApplications(approval);
        const safeAmount = invoiceList.reduce(
          (sum, inv) => sum + inv.amount_applied,
          0,
        );

        if (invoiceList.length === 0 || safeAmount <= 0) {
          results.push({
            success: false,
            transaction_key: approval.transaction_key,
            error:
              "No outstanding balance remains for the selected invoice(s). Refresh reconciliation and try again.",
            invoice_id: approval.invoice_id || "multi",
          });
          continue;
        }

        const paymentData = {
          customer_id: approval.customer_id,
          payment_mode: "bank_transfer",
          account_id: bankAccountId,
          amount: safeAmount,
          date: toZohoDate(approval.date),
          reference_number: makeZohoReferenceNumber(
            approval.description,
            approval.date,
          ),
          description: `Payment received from bank reconciliation - ${String(approval.description || "").slice(0, 500)}`,
          invoices: invoiceList,
        };
        const res = await zohoPost("/customerpayments", paymentData);
        if (approval.name_in_statement) {
          await recordBankAccountName(
            approval.customer_id,
            String(res.payment?.customer_name || ""),
            approval.name_in_statement,
          );
        }
        const ledgerHash =
          approval.row_hash ||
          approval.transaction_key ||
          makeBankRowHash({
            date: approval.date,
            amount: approval.amount,
            description: approval.description,
            direction: "CR",
          });
        await upsertReconciliationLedger([
          {
            bank_row_hash: ledgerHash,
            date: approval.date,
            amount: safeAmount,
            description: approval.description,
            name_in_statement: approval.name_in_statement || "",
            status: "zoho_received",
            source: "via_receive_payment",
            zoho_payment_id: res.payment?.payment_id,
            zoho_payment_number: res.payment?.payment_number,
            invoice_ids: invoiceList.map((i) => i.invoice_id),
            notes: "Payment Received created from VIA Bank Reconciliation.",
          },
        ]);
        results.push({
          success: true,
          transaction_key: ledgerHash,
          payment_id: res.payment?.payment_id,
          payment_number: res.payment?.payment_number,
          customer_name: res.payment?.customer_name,
          amount: res.payment?.amount || safeAmount,
          invoice_count: invoiceList.length,
        });
      } catch (err) {
        results.push({
          success: false,
          transaction_key: approval.transaction_key,
          error: String(err),
          invoice_id: approval.invoice_id || "multi",
        });
      }
    }

    return NextResponse.json({
      success: results.every((r) => r.success),
      results,
    });
  } catch (err) {
    console.error("[Reconcile] Error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
