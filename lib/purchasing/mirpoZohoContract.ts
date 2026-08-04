export const MIRPO_VENDOR_NAME = 'TAK PRODUCTS AND SERVICES, PT';
export const MIRPO_REFERENCE = 'MIRPO';
export const MIRPO_TARGET_QTY = 600;

export type MirpoDraftLine = { item_id: string; quantity: number };

export function assertMirpoZohoLines(lines: MirpoDraftLine[]): void {
  if (!lines.length) throw new Error('The MIRPO has no included line items.');
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (total !== MIRPO_TARGET_QTY) throw new Error(`A MIRPO must total exactly ${MIRPO_TARGET_QTY} sheets; received ${total}.`);
  if (lines.some((line) => !line.item_id || !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new Error('Every MIRPO line must have an item and positive quantity.');
}
