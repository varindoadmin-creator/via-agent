// ─── Customer self-service response templates ────────────────────────────────
// Deterministic Bahasa Indonesia templates only, same convention as
// lib/integrations/wati/responseDecision.ts. Brief section 50: concise,
// professional, never a verbose "based on analysis of financial data..."
// preamble.

import type { CustomerSafeOrderStatus } from '../../../customerSelfService/orderStatus.ts';
import type { CustomerSafeInvoice } from '../../../customerSelfService/invoiceStatus.ts';
import type { PaymentStatusOutcome } from '../../../customerSelfService/paymentStatus.ts';
import type { CustomerReceivableSummary } from '../../../customerSelfService/outstandingInvoices.ts';
import { formatIDR } from '../../../zoho/tax.ts';

export function askWhichCustomerForInquiry(companyNames: string[]): string {
  const options = companyNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  return `Baik Pak/Bu, informasi ini ingin dicek untuk:\n\n${options}`;
}

export function askWhichOpenOrder(soNumbers: string[]): string {
  return `Baik Pak/Bu, saat ini ada beberapa pesanan aktif. Pesanan yang dimaksud ${soNumbers.join(' atau ')}?`;
}

const ORDER_STATUS_PHRASE: Record<CustomerSafeOrderStatus['status'], string> = {
  RECEIVED: 'sudah kami terima dan sedang kami siapkan',
  PROCESSING: 'sedang diproses',
  CONFIRMED: 'sudah diproses',
  PARTIALLY_FULFILLED: 'sebagian sudah diselesaikan',
  FULFILLED: 'sudah selesai diproses',
  CANCELLED: 'telah dibatalkan',
  UNKNOWN: 'sedang kami periksa statusnya',
};

export function orderStatusReply(order: CustomerSafeOrderStatus): string {
  return `Baik Pak/Bu, pesanan ${order.orderNumber} saat ini ${ORDER_STATUS_PHRASE[order.status]}.`;
}

export function orderNotFound(soNumber: string): string {
  return `Mohon maaf Pak/Bu, kami belum menemukan pesanan ${soNumber} pada akun perusahaan Bapak/Ibu. Boleh dicek kembali nomornya?`;
}

export function needOrderReference(): string {
  return 'Baik Pak/Bu, boleh diinformasikan nomor SO/pesanannya?';
}

export function orderHistoryReply(orders: CustomerSafeOrderStatus[]): string {
  if (orders.length === 0) return 'Baik Pak/Bu, belum ada riwayat pesanan yang tercatat untuk akun ini.';
  const lines = orders.map(o => `${o.orderNumber} — ${o.orderDate}`).join('\n');
  return `Baik Pak/Bu, berikut ${orders.length} pesanan terakhir:\n\n${lines}\n\nApakah Bapak/Ibu ingin saya cek periode tertentu?`;
}

export function lastOrderReply(order: CustomerSafeOrderStatus | null): string {
  if (!order) return 'Baik Pak/Bu, belum ada pesanan yang tercatat untuk akun ini.';
  const firstItem = order.items[0];
  const itemPart = firstItem ? `, dengan ${firstItem.productName}${firstItem.itemCode ? ` (${firstItem.itemCode})` : ''} sebanyak ${firstItem.quantity}${firstItem.unit ? ` ${firstItem.unit}` : ''}` : '';
  return `Pesanan terakhir adalah ${order.orderNumber} tanggal ${order.orderDate}${itemPart}.`;
}

const INVOICE_STATUS_PHRASE: Record<CustomerSafeInvoice['status'], string> = {
  PAID: 'sudah tercatat lunas',
  PARTIALLY_PAID: 'sudah sebagian terbayar',
  UNPAID: 'belum tercatat lunas',
  OVERDUE: 'masih memiliki saldo dan telah melewati tanggal jatuh tempo',
  VOID: 'sudah dibatalkan',
  UNKNOWN: 'sedang kami periksa statusnya',
};

export function invoiceStatusReply(invoice: CustomerSafeInvoice): string {
  const base = `${invoice.invoiceNumber} ${INVOICE_STATUS_PHRASE[invoice.status]}`;
  if (invoice.status === 'UNPAID' || invoice.status === 'OVERDUE' || invoice.status === 'PARTIALLY_PAID') {
    return `Baik Pak/Bu, ${base}, dengan saldo ${formatIDR(invoice.balanceDue)}.`;
  }
  return `Baik Pak/Bu, ${base}.`;
}

export function invoiceNotFound(invoiceNumber: string): string {
  return `Mohon maaf Pak/Bu, kami belum menemukan invoice ${invoiceNumber} pada akun perusahaan Bapak/Ibu. Boleh dicek kembali nomor invoicenya?`;
}

export function needInvoiceReference(): string {
  return 'Baik Pak/Bu, boleh diinformasikan nomor invoicenya?';
}

export function invoiceDocumentSent(invoiceNumber: string): string {
  return `Baik Pak/Bu, berikut invoice ${invoiceNumber}.`;
}

export function invoiceDocumentSendFailed(): string {
  return 'Mohon maaf Pak/Bu, saat ini kami belum dapat mengirimkan dokumen tersebut. Kami bantu teruskan untuk pengecekan.';
}

export function outstandingInvoicesReply(customerLabel: string, invoices: CustomerSafeInvoice[]): string {
  if (invoices.length === 0) return `Baik Pak/Bu, saat ini tidak ada invoice yang belum lunas untuk ${customerLabel}.`;
  const lines = invoices.map(i => `${i.invoiceNumber} — ${formatIDR(i.balanceDue)}${i.dueDate ? ` — jatuh tempo ${i.dueDate}` : ''}`).join('\n');
  return `Pak/Bu, untuk ${customerLabel} terdapat ${invoices.length} invoice yang masih memiliki saldo:\n\n${lines}`;
}

export function paymentStatusReply(outcome: PaymentStatusOutcome): string {
  if (outcome.outcome === 'NOT_FOUND') return invoiceNotFound('');
  if (outcome.outcome === 'RECORDED') return `Baik Pak/Bu, pembayaran untuk ${outcome.invoice.invoiceNumber} sudah tercatat.`;
  if (outcome.outcome === 'PARTIALLY_RECORDED') return `Baik Pak/Bu, ${outcome.invoice.invoiceNumber} sudah sebagian terbayar, dengan sisa saldo ${formatIDR(outcome.invoice.balanceDue)}.`;
  // Brief section 21: never accuse the customer, never auto-mark paid — route for finance follow-up.
  return `Baik Pak/Bu, pembayaran tersebut belum terlihat sebagai pembayaran teralokasi di sistem kami untuk ${outcome.invoice.invoiceNumber}. Kami bantu teruskan untuk pengecekan.`;
}

export function receivableSummaryReply(customerLabel: string, summary: CustomerReceivableSummary): string {
  if (summary.invoiceCount === 0) return `Baik Pak/Bu, saat ini tidak ada saldo invoice terbuka untuk ${customerLabel}.`;
  return `Total saldo invoice yang masih terbuka untuk ${customerLabel} saat ini adalah ${formatIDR(summary.totalOutstanding)}.`;
}

const DELIVERY_STATUS_PHRASE: Record<string, string> = {
  NOT_YET_DISPATCHED: 'belum dikirim',
  PROCESSING: 'sedang disiapkan untuk pengiriman',
  PARTIALLY_DISPATCHED: 'sebagian sudah dikirim',
  DISPATCHED: 'sudah dikirim',
  DELIVERED: 'sudah sampai',
  UNKNOWN: 'sedang kami periksa',
};

export function deliveryStatusReply(orderNumber: string, status: string): string {
  return `Baik Pak/Bu, pesanan ${orderNumber} saat ini ${DELIVERY_STATUS_PHRASE[status] ?? 'sedang kami periksa'}.`;
}

/** Brief section 26's exact example — never invents driver/ETA/tracking data. */
export function deliveryDataUnavailable(): string {
  return 'Pesanan sudah diproses, namun status pengiriman belum tersedia secara otomatis. Kami bantu cek dengan Admin.';
}

/** Brief section 41's exact example. */
export function upstreamUnavailable(): string {
  return 'Maaf Pak/Bu, saat ini status tersebut belum dapat kami cek. Kami bantu teruskan untuk pengecekan.';
}
