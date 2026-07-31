import { NextRequest, NextResponse } from "next/server";
import {
  getZohoAccessToken,
  getZohoApiBaseUrl,
  getZohoOrgId,
} from "@/lib/zoho/auth";
import { fetchWithRetry, type RetryOptions } from "@/lib/zoho/retry";
import {
  getDiscountCommissionBucket,
  usesLowMarginDiscountSchema,
  type DiscountCommissionBucketKey,
} from "@/lib/commission/discount";

// Yearly commission reports fetch and aggregate many Zoho invoice details.
// Vercel's default function duration can terminate the request and return an
// HTML timeout page before this route has a chance to return JSON.
export const maxDuration = 300;

type AnyRecord = Record<string, unknown>;

let purchaseRateCache: {
  createdAt: number;
  rates: Map<string, number>;
} | null = null;
const PURCHASE_RATE_CACHE_MS = 5 * 60 * 1000;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner()),
  );
  return results;
}

async function zohoGet(path: string, retryOptions?: RetryOptions) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes("?") ? "&" : "?";
  const controller = new AbortController();
  const timeoutMs = retryOptions ? 120_000 : 8_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchWithRetry(
      `${base}${path}${sep}organization_id=${orgId}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        signal: controller.signal,
      },
      retryOptions,
    );
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    return Number(cleaned) || 0;
  }
  return 0;
}

function extractBrand(sku: string): string {
  if (!sku) return "Unknown";
  const prefix = sku.split("-")[0].toUpperCase();
  const brandMap: Record<string, string> = {
    LAM: "Lamitak",
    EDL: "EDL",
    EAS: "EDL",
    AICA: "AICA",
    TACO: "TACO",
    TAC: "TACO",
    CARTA: "CARTA",
  };
  return brandMap[prefix] || prefix;
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "this_month":
      return {
        from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
        to: `${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`,
      };
    case "prev_month": {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return {
        from: `${py}-${String(pm + 1).padStart(2, "0")}-01`,
        to: `${py}-${String(pm + 1).padStart(2, "0")}-${new Date(py, pm + 1, 0).getDate()}`,
      };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "prev_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return {
        from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
        to: `${y}-${String(m + 1).padStart(2, "0")}-${new Date(y, m + 1, 0).getDate()}`,
      };
  }
}

async function fetchAllInvoices(from: string, to: string, status?: string) {
  const allInvoices: AnyRecord[] = [];
  let page = 1;
  while (true) {
    const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
    const data = await zohoGet(
      `/invoices?date_start=${from}&date_end=${to}${statusParam}&per_page=200&page=${page}&sort_column=date&sort_order=A`,
    );
    const batch = (data.invoices || []) as AnyRecord[];
    allInvoices.push(...batch);
    if (batch.length < 200) break;
    page++;
    if (page > 20) break;
  }
  return allInvoices;
}

async function buildPurchaseRateMap() {
  if (
    purchaseRateCache &&
    Date.now() - purchaseRateCache.createdAt < PURCHASE_RATE_CACHE_MS
  ) {
    return purchaseRateCache.rates;
  }

  const rates = new Map<string, number>();
  let page = 1;

  while (true) {
    const data = await zohoGet(`/items?per_page=200&page=${page}`);
    const batch = (data.items || []) as AnyRecord[];

    for (const item of batch) {
      const itemId = String(item.item_id || "");
      const sku = String(item.sku || "").toUpperCase();
      const name = String(item.name || "");
      const purchaseRate = parseMoney(
        item.purchase_rate ??
          item.purchase_rate_formatted ??
          item.purchase_description ??
          0,
      );

      if (itemId) rates.set(itemId, purchaseRate);
      if (sku) rates.set(`sku:${sku}`, purchaseRate);
      if (name) rates.set(`name:${name}`, purchaseRate);
    }

    if (batch.length < 200) break;
    page++;
    if (page > 20) break;
  }

  purchaseRateCache = { createdAt: Date.now(), rates };
  return rates;
}

async function fetchInvoiceDetailsForReport(
  invoices: AnyRecord[],
  options: { concurrency?: number; delayMs?: number } = {},
) {
  const concurrency = options.concurrency ?? 8;
  const delayMs = options.delayMs ?? 0;
  // Zoho applies an organization-wide requests-per-minute limit. Annual
  // reports need pacing, but applying that delay to monthly reports can exceed
  // the browser/serverless request window. Callers select the appropriate mode.
  const details = await mapLimit(invoices, concurrency, async (inv, index) => {
    if (delayMs > 0 && index > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const invId = String(inv.invoice_id || "");
    if (!invId)
      return {
        inv,
        detailInvoice: null,
        error: new Error("Missing invoice_id"),
      };
    try {
      const detail = await zohoGet(`/invoices/${invId}`, {
        retries: 4,
        baseDelayMs: 5_000,
      });
      return {
        inv,
        detailInvoice: (detail.invoice || {}) as AnyRecord,
        error: null,
      };
    } catch (error) {
      console.warn(`[Reports] Skipping invoice ${invId}:`, error);
      return { inv, detailInvoice: null, error };
    }
  });

  const failed = details.filter((d) => !d.detailInvoice);
  if (failed.length > 0) {
    const rateLimited = failed.some(({ error }) =>
      /Zoho 429|code["']?:\s*43|maximum number of requests per minute/i.test(
        String(error),
      ),
    );
    throw new Error(
      rateLimited
        ? "Zoho Books temporarily rate-limited this organization. Please wait a few minutes and retry; no partial report was returned."
        : `Could not load ${failed.length} of ${invoices.length} invoice details from Zoho. Please retry; no partial report was returned.`,
    );
  }

  return details as {
    inv: AnyRecord;
    detailInvoice: AnyRecord;
    error: null;
  }[];
}

function getLinePurchaseRate(
  li: AnyRecord,
  purchaseRates: Map<string, number>,
) {
  const direct = parseMoney(
    li.purchase_rate ?? li.cost_price ?? li.purchase_price ?? 0,
  );
  if (direct > 0) return direct;

  const itemId = String(li.item_id || "");
  const sku = String(li.sku || "").toUpperCase();
  const name = String(li.name || li.item_name || "");

  if (itemId && purchaseRates.has(itemId))
    return purchaseRates.get(itemId) || 0;
  if (sku && purchaseRates.has(`sku:${sku}`))
    return purchaseRates.get(`sku:${sku}`) || 0;
  if (name && purchaseRates.has(`name:${name}`))
    return purchaseRates.get(`name:${name}`) || 0;
  return 0;
}

function getSalesPerson(inv: AnyRecord, detailInvoice?: AnyRecord) {
  const candidates = [
    inv.salesperson_name,
    inv.sales_person_name,
    inv.salesperson,
    inv.sales_person,
    detailInvoice?.salesperson_name,
    detailInvoice?.sales_person_name,
    detailInvoice?.salesperson,
    detailInvoice?.sales_person,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return "Unassigned";
}

function isInvoicePaid(inv: AnyRecord, detailInvoice?: AnyRecord) {
  const status = String(
    detailInvoice?.status || inv.status || inv.invoice_status || "",
  ).toLowerCase();
  const paymentStatus = String(
    detailInvoice?.payment_status || inv.payment_status || "",
  ).toLowerCase();
  const balance = parseMoney(
    detailInvoice?.balance ??
      inv.balance ??
      detailInvoice?.balance_formatted ??
      inv.balance_formatted ??
      0,
  );
  const total = parseMoney(
    detailInvoice?.total ??
      inv.total ??
      detailInvoice?.total_formatted ??
      inv.total_formatted ??
      0,
  );

  if (status === "paid" || paymentStatus === "paid") return true;
  if (
    (status === "closed" || status === "overdue") &&
    total > 0 &&
    balance <= 0
  )
    return true;
  return total > 0 && balance <= 0;
}

function getCommissionRate(grossProfit: number) {
  if (grossProfit >= 50_000_000) return 0.2;
  if (grossProfit >= 25_000_000) return 0.15;
  return 0.1;
}

function getCommissionTier(grossProfit: number) {
  if (grossProfit >= 50_000_000) return "Tier 3";
  if (grossProfit >= 25_000_000) return "Tier 2";
  return "Tier 1";
}

function getLineDiscountPercent(li: AnyRecord, invoice: AnyRecord): number {
  const discounts = Array.isArray(li.discounts) ? li.discounts as AnyRecord[] : [];
  const explicit = parseMoney(
    discounts[0]?.discount_percent ??
      li.discount_percentage ??
      li.discount_percent ??
      li.discount ??
      0,
  );
  if (explicit > 0) return explicit;

  const discountAmount = parseMoney(li.discount_amount ?? 0);
  const netRevenue = parseMoney(li.item_total ?? li.amount ?? 0);
  if (discountAmount > 0 && netRevenue + discountAmount > 0) {
    return (discountAmount / (netRevenue + discountAmount)) * 100;
  }

  if (String(invoice.discount_type || "") !== "item_level") {
    return parseMoney(invoice.discount ?? invoice.discount_percentage ?? 0);
  }
  return 0;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "item";
  const period = searchParams.get("period") || "this_month";
  const paidOnly = searchParams.get("paid_only") === "true";
  const includeDetails =
    searchParams.get("include_details") === "true" || type === "commission";

  try {
    const { from, to } = getDateRange(period);

    if (type === "item") {
      const data = await zohoGet(
        `/reports/salesbyitem?from_date=${from}&to_date=${to}`,
      );
      const rows = (data.sales || []).map((s: AnyRecord) => ({
        name: String(s.item_name || ""),
        sku: String(
          (s as Record<string, Record<string, string>>).item?.sku || "",
        ),
        unit: String(s.unit || ""),
        quantity: Number(s.quantity_sold) || 0,
        amount: parseMoney(s.amount),
        avg_price: parseMoney(s.average_price),
      }));
      return NextResponse.json({ success: true, rows, from, to });
    }

    // A paid-only filter remains available for other callers, but the
    // Commission page intentionally requests all invoices.
    const invoiceStatus = type === "commission" && paidOnly ? "paid" : undefined;
    const allInvoices = await fetchAllInvoices(from, to, invoiceStatus);

    if (type === "team") {
      // Company-wide commission pool distributed across all employees: 0.5%
      // of total Revenue before PPN across ALL invoices (paid or not),
      // regardless of Salesperson assignment — unlike the per-salesperson
      // commission below, which only counts paid, assigned invoices.
      // Zoho's aggregate report returns invoice sales exclusive of tax in one
      // request. This avoids fetching hundreds of individual invoice details
      // for annual periods. Zoho's invoice_sales value includes shipping.
      const salesReport = await zohoGet(
        `/reports/salesbysalesperson?from_date=${from}&to_date=${to}&per_page=200`,
      );
      const salesRows = (salesReport.sales || []) as AnyRecord[];
      const revenue = salesRows.reduce(
        (sum, row) => sum + parseMoney(row.invoice_sales ?? row.sales ?? 0),
        0,
      );

      let paidInvoiceCount = 0;
      let unpaidInvoiceCount = 0;

      for (const inv of allInvoices) {
        const paid = isInvoicePaid(inv);
        if (paid) paidInvoiceCount += 1;
        else unpaidInvoiceCount += 1;
      }

      const rate = 0.005;
      return NextResponse.json({
        success: true,
        revenue,
        rate,
        commission: revenue * rate,
        from,
        to,
        invoice_count: allInvoices.length,
        paid_invoice_count: paidInvoiceCount,
        unpaid_invoice_count: unpaidInvoiceCount,
        basis: "0.5% of total Revenue before PPN across all invoices (company-wide, paid or not), regardless of Salesperson assignment. Distributed across all employees.",
      });
    }

    if (type === "salesperson") {
      // Lightweight revenue-by-salesperson for the Sales Reports page — no
      // cost/GP/commission here, that lives under Reports > Commission.
      const isAnnual = period === "this_year" || period === "prev_year";
      const detailedInvoices = await fetchInvoiceDetailsForReport(
        allInvoices,
        isAnnual
          ? { concurrency: 1, delayMs: 750 }
          : { concurrency: 8 },
      );
      const aggregated = new Map<
        string,
        { amount: number; invoice_ids: Set<string>; customer_names: Set<string> }
      >();

      for (const { inv, detailInvoice } of detailedInvoices) {
        const salesPerson = getSalesPerson(inv, detailInvoice);
        if (!salesPerson || salesPerson.toLowerCase() === "unassigned") continue;

        const lineItems = (detailInvoice.line_items || []) as AnyRecord[];
        let invoiceRevenue = 0;
        for (const li of lineItems) {
          invoiceRevenue += parseMoney(li.item_total ?? li.amount ?? 0);
        }

        const current = aggregated.get(salesPerson) || {
          amount: 0,
          invoice_ids: new Set<string>(),
          customer_names: new Set<string>(),
        };
        current.amount += invoiceRevenue;
        current.invoice_ids.add(String(inv.invoice_id));
        current.customer_names.add(String(inv.customer_name || "Unknown"));
        aggregated.set(salesPerson, current);
      }

      const rows = Array.from(aggregated.entries()).map(([name, val]) => ({
        name,
        amount: val.amount,
        invoice_count: val.invoice_ids.size,
        customer_count: val.customer_names.size,
      }));

      return NextResponse.json({
        success: true,
        rows,
        from,
        to,
        invoice_count: allInvoices.length,
      });
    }

    if (type === "brand" || type === "location" || type === "customer") {
      const aggregated = new Map<
        string,
        { quantity: number; amount: number; count: number }
      >();

      for (const inv of allInvoices) {
        const invId = String(inv.invoice_id);
        const locationName = String(inv.location_name || "Unknown");
        const customerName = String(inv.customer_name || "Unknown");

        try {
          const detail = await zohoGet(`/invoices/${invId}`);
          const lineItems = (detail.invoice?.line_items || []) as AnyRecord[];

          for (const li of lineItems) {
            const sku = String(li.sku || "");
            const qty = Number(li.quantity) || 0;
            const amt = parseMoney(li.item_total ?? li.amount ?? 0);
            const lineLocation = String(
              li.location_name || locationName || "Unknown",
            );

            let key = "";
            if (type === "brand") key = extractBrand(sku);
            else if (type === "location") key = lineLocation;
            else if (type === "customer") key = customerName;

            if (!key) continue;
            const existing = aggregated.get(key) || {
              quantity: 0,
              amount: 0,
              count: 0,
            };
            aggregated.set(key, {
              quantity: existing.quantity + qty,
              amount: existing.amount + amt,
              count: type === "customer" ? existing.count + 1 : existing.count,
            });
          }
        } catch {
          /* skip failed invoice */
        }
      }

      const rows = Array.from(aggregated.entries()).map(([key, val]) => ({
        name: key,
        quantity: val.quantity,
        amount: val.amount,
        count: val.count,
        avg_price: val.quantity > 0 ? val.amount / val.quantity : 0,
      }));

      return NextResponse.json({
        success: true,
        rows,
        from,
        to,
        invoice_count: allInvoices.length,
      });
    }

    if (type === "commission") {
      // Performance note:
      // This report needs invoice line items to calculate GP from Purchase Rate.
      // Fetch invoice details in parallel instead of one-by-one, and cache item purchase rates briefly.
      const isAnnual = period === "this_year" || period === "prev_year";
      const [purchaseRates, detailedInvoices] = await Promise.all([
        buildPurchaseRateMap(),
        fetchInvoiceDetailsForReport(
          allInvoices,
          isAnnual
            ? { concurrency: 1, delayMs: 750 }
            : { concurrency: 8 },
        ),
      ]);
      const aggregated = new Map<
        string,
        {
          quantity: number;
          amount: number;
          cost: number;
          gross_profit: number;
          invoice_ids: Set<string>;
          customer_names: Set<string>;
          missing_cost_lines: number;
          discount_commission_amount: number;
          discount_breakdown: Record<DiscountCommissionBucketKey, { revenue: number; commission: number; line_count: number }>;
          invoices: AnyRecord[];
        }
      >();
      let paidInvoiceCount = 0;
      let unpaidInvoiceCount = 0;

      for (const { inv, detailInvoice } of detailedInvoices) {
        const invId = String(inv.invoice_id);
        const customerName = String(inv.customer_name || "Unknown");

        const paid = isInvoicePaid(inv, detailInvoice);
        if (paid) paidInvoiceCount += 1;
        else unpaidInvoiceCount += 1;
        if (paidOnly && !paid) continue;

        const salesPerson = getSalesPerson(inv, detailInvoice);
        // Do not include office sales / invoices without assigned Sales Person.
        // Commission reports should only calculate for named Sales Person records.
        if (!salesPerson || salesPerson.toLowerCase() === "unassigned") continue;

        const lineItems = (detailInvoice.line_items || []) as AnyRecord[];
        const current = aggregated.get(salesPerson) || {
          quantity: 0,
          amount: 0,
          cost: 0,
          gross_profit: 0,
          invoice_ids: new Set<string>(),
          customer_names: new Set<string>(),
          missing_cost_lines: 0,
          discount_commission_amount: 0,
          discount_breakdown: {
            standard_0: { revenue: 0, commission: 0, line_count: 0 },
            standard_2: { revenue: 0, commission: 0, line_count: 0 },
            standard_5: { revenue: 0, commission: 0, line_count: 0 },
            standard_7: { revenue: 0, commission: 0, line_count: 0 },
            standard_10: { revenue: 0, commission: 0, line_count: 0 },
            low_margin_0: { revenue: 0, commission: 0, line_count: 0 },
            low_margin_3: { revenue: 0, commission: 0, line_count: 0 },
            low_margin_5: { revenue: 0, commission: 0, line_count: 0 },
            other: { revenue: 0, commission: 0, line_count: 0 },
          },
          invoices: [],
        };

        const invoiceLines: AnyRecord[] = [];
        let invoiceQty = 0;
        let invoiceRevenue = 0;
        let invoiceCost = 0;
        let invoiceMissingCostLines = 0;

        for (const li of lineItems) {
          const qty = Number(li.quantity) || 0;
          const rate = parseMoney(li.rate ?? 0);
          const revenue = parseMoney(li.item_total ?? li.amount ?? 0);
          const purchaseRate = getLinePurchaseRate(li, purchaseRates);
          const cost = purchaseRate * qty;
          const gp = revenue - cost;
          const sku = String(li.sku || "");
          const itemName = String(li.name || li.item_name || "");
          const discountPercent = getLineDiscountPercent(li, detailInvoice);
          const lowMarginSchema = usesLowMarginDiscountSchema(sku, itemName);
          const discountBucket = getDiscountCommissionBucket(discountPercent, lowMarginSchema);
          const discountCommissionRate = discountBucket.rate;
          const discountCommission = revenue * discountCommissionRate;

          current.quantity += qty;
          current.amount += revenue;
          current.cost += cost;
          current.gross_profit += gp;
          current.discount_commission_amount += discountCommission;
          current.discount_breakdown[discountBucket.key].revenue += revenue;
          current.discount_breakdown[discountBucket.key].commission += discountCommission;
          current.discount_breakdown[discountBucket.key].line_count += 1;
          if (purchaseRate <= 0 && revenue > 0) {
            current.missing_cost_lines += 1;
            invoiceMissingCostLines += 1;
          }

          invoiceQty += qty;
          invoiceRevenue += revenue;
          invoiceCost += cost;
          invoiceLines.push({
            item_id: String(li.item_id || ""),
            name: itemName,
            sku,
            brand: extractBrand(sku),
            quantity: qty,
            rate,
            revenue,
            purchase_rate: purchaseRate,
            cost,
            gross_profit: gp,
            gp_margin: revenue > 0 ? gp / revenue : 0,
            discount_percent: discountPercent,
            discount_commission_schema: discountBucket.schema,
            discount_commission_rate: discountCommissionRate,
            discount_commission: discountCommission,
          });
        }

        current.invoice_ids.add(invId);
        current.customer_names.add(customerName);
        current.invoices.push({
          invoice_id: invId,
          invoice_number: String(
            detailInvoice.invoice_number || inv.invoice_number || "",
          ),
          date: String(detailInvoice.date || inv.date || ""),
          due_date: String(detailInvoice.due_date || inv.due_date || ""),
          customer_name: customerName,
          status: String(detailInvoice.status || inv.status || ""),
          paid,
          total: parseMoney(detailInvoice.total ?? inv.total ?? 0),
          balance: parseMoney(detailInvoice.balance ?? inv.balance ?? 0),
          quantity: invoiceQty,
          revenue: invoiceRevenue,
          cost: invoiceCost,
          gross_profit: invoiceRevenue - invoiceCost,
          gp_margin:
            invoiceRevenue > 0
              ? (invoiceRevenue - invoiceCost) / invoiceRevenue
              : 0,
          missing_cost_lines: invoiceMissingCostLines,
          line_items: invoiceLines,
        });
        aggregated.set(salesPerson, current);
      }

      const rows = Array.from(aggregated.entries()).map(([name, val]) => {
        const gpMargin = val.amount > 0 ? val.gross_profit / val.amount : 0;
        const commissionRate = getCommissionRate(val.gross_profit);
        return {
          name,
          quantity: val.quantity,
          amount: val.amount,
          cost: val.cost,
          gross_profit: val.gross_profit,
          gp_margin: gpMargin,
          avg_price: val.quantity > 0 ? val.amount / val.quantity : 0,
          invoice_count: val.invoice_ids.size,
          customer_count: val.customer_names.size,
          missing_cost_lines: val.missing_cost_lines,
          discount_commission_amount: val.discount_commission_amount,
          discount_breakdown: val.discount_breakdown,
          commission_tier: getCommissionTier(val.gross_profit),
          commission_rate: commissionRate,
          commission_amount: val.gross_profit * commissionRate,
          company_keeps: val.gross_profit - val.gross_profit * commissionRate,
          monthly_gp_commission_rate: 0.2,
          monthly_gp_commission_amount: val.gross_profit * 0.2,
          monthly_gp_company_keeps: val.gross_profit * 0.8,
          invoices: includeDetails
            ? val.invoices.sort((a, b) =>
                String(b.date).localeCompare(String(a.date)),
              )
            : [],
        };
      });

      return NextResponse.json({
        success: true,
        rows,
        from,
        to,
        invoice_count: allInvoices.length,
        paid_invoice_count: paidInvoiceCount,
        unpaid_invoice_count: unpaidInvoiceCount,
        paid_only: paidOnly,
        include_details: includeDetails,
        basis: paidOnly
          ? "Paid invoices with assigned Salesperson only. Revenue before PPN minus Purchase Rate × quantity invoiced."
          : "All invoices with assigned Salesperson only. Revenue before PPN minus Purchase Rate × quantity invoiced.",
        discount_commission_basis:
          "Calculated per assigned invoice line. Standard items: 0% earns 5%, 1–2% earns 4%, 3–5% earns 3%, 6–7% earns 2%, and 8–10% earns 1%. Special Price items with ARTE, ART, CC, CCM, CCP, CCX, ATS, ATP, ATW, CATS, CATP prefixes and NEWEDGE products: 0% earns 3%, 1–3% earns 2%, and 4–5% earns 1%. Higher discounts earn 0%.",
        tiers: [
          { min_gp: 0, max_gp: 25_000_000, rate: 0.1 },
          { min_gp: 25_000_000, max_gp: 50_000_000, rate: 0.15 },
          { min_gp: 50_000_000, max_gp: null, rate: 0.2 },
        ],
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown type" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[Reports]", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
