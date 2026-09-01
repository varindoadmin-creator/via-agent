// ─── Commercial draft response templates ─────────────────────────────────────
// Deterministic Bahasa Indonesia templates only, same convention as
// lib/integrations/wati/responseDecision.ts. Never promises a commitment
// (brief section 42): "Ya, pesan" is customer intent, not internal approval —
// every template here stops at "kami siapkan untuk direview", never "pesanan
// Anda telah diproses" until a real post-approval Zoho object exists.

export function askWhichCustomer(companyNames: string[]): string {
  const options = companyNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  return `Baik Kak, pesanan ini ingin diproses atas nama:\n\n${options}`;
}

export function askWhichAddress(labels: string[]): string {
  const options = labels.map((label, i) => `${i + 1}. ${label}`).join('\n');
  return `Baik Kak, untuk pengiriman ingin dikirim ke alamat yang mana?\n\n${options}`;
}

export function askForDeliveryAddress(): string {
  return 'Baik Kak, mohon diinformasikan alamat pengiriman untuk pesanan ini.';
}

export function customerPossibleDuplicateHandoff(): string {
  return 'Baik Kak, kami perlu verifikasi data perusahaan terlebih dahulu. Tim kami akan segera menghubungi.';
}

export function orderReadyForReview(itemLabel: string, quantity: number, unit: string | null, formattedTotal: string): string {
  const qty = unit ? `${quantity} ${unit}` : String(quantity);
  return `Baik Kak, pesanan ${itemLabel} sejumlah ${qty} (estimasi total ${formattedTotal}) sudah kami siapkan untuk direview tim kami. Kami akan konfirmasi kembali setelah disetujui.`;
}

export function quotationReadyForReview(itemLabel: string, quantity: number, unit: string | null, formattedTotal: string): string {
  const qty = unit ? `${quantity} ${unit}` : String(quantity);
  return `Baik Kak, quotation untuk ${itemLabel} sejumlah ${qty} (estimasi total ${formattedTotal}) sedang kami siapkan. Kami akan kirimkan setelah selesai diproses.`;
}

export function salesOrderConfirmed(orderNumber: string): string {
  return `Baik Kak, pesanan telah kami proses dengan nomor SO ${orderNumber}.`;
}

export function quotationConfirmed(quotationNumber: string): string {
  return `Baik Kak, quotation sudah kami siapkan dengan nomor ${quotationNumber}.`;
}

export function partialAvailability(availableLabel: string, unavailableLabel: string): string {
  return `${availableLabel} tersedia, namun ${unavailableLabel} belum tersedia. Apakah pesanan ${availableLabel} tetap ingin dilanjutkan?`;
}

export function orderCancellationNoActiveDraft(): string {
  return 'Baik Kak, saat ini tidak ada pesanan aktif yang dapat dibatalkan.';
}

export function orderCancellationConfirmed(): string {
  return 'Baik Kak, pesanan telah kami batalkan.';
}

export function orderCancellationNeedsHuman(): string {
  return 'Baik Kak, pesanan ini sudah diproses lebih lanjut. Kami bantu hubungkan dengan Admin untuk proses pembatalan.';
}

export function orderModificationApplied(itemLabel: string, quantity: number, unit: string | null): string {
  const qty = unit ? `${quantity} ${unit}` : String(quantity);
  return `Baik Kak, pesanan ${itemLabel} telah kami perbarui menjadi ${qty}. Menunggu review tim kami kembali.`;
}

export function orderModificationNeedsHuman(): string {
  return 'Baik Kak, pesanan ini sudah diproses lebih lanjut. Kami bantu hubungkan dengan Admin untuk perubahan pesanan.';
}

export function onboardingReadyForReviewAck(): string {
  return 'Terima kasih Kak, data perusahaan sudah lengkap. Tim kami akan review dan konfirmasi kembali.';
}

export function commercialNeedsHumanNoPhone(): string {
  return 'Baik Kak, mohon ditunggu, tim kami akan segera membantu terkait pesanan ini.';
}
