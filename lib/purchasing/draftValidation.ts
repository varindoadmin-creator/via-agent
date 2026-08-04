export type DraftItem = {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  vendor_name: string;
  required_date: string;
  estimated_unit_cost: number;
  excluded?: boolean;
  exclusion_reason?: string;
};

export function canCreateMirpoDraft(role: string | null): boolean { return role === 'director'; }

export function validateDraftItems(value: unknown): DraftItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) throw new Error('Draft must contain 1–1000 items');
  return value.map((raw, index) => {
    const item = (raw || {}) as Record<string, unknown>;
    const quantity = Number(item.quantity);
    if (!String(item.item_id || '').trim()) throw new Error(`Item ${index + 1} has no item ID`);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) throw new Error(`Item ${index + 1} has an invalid quantity`);
    const requiredDate = String(item.required_date || '');
    if (requiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(requiredDate)) throw new Error(`Item ${index + 1} has an invalid required date`);
    return {
      item_id: String(item.item_id), sku: String(item.sku || ''), name: String(item.name || ''), quantity,
      vendor_name: String(item.vendor_name || ''), required_date: requiredDate,
      estimated_unit_cost: Math.max(0, Number(item.estimated_unit_cost) || 0),
      excluded: Boolean(item.excluded), exclusion_reason: String(item.exclusion_reason || '').slice(0, 500),
    };
  });
}

export function assertMirpoPolicyQuantity(items: DraftItem[], target = 600): void {
  const total = items.filter((item) => !item.excluded).reduce((sum, item) => sum + item.quantity, 0);
  if (total !== target) throw new Error(`A MIRPO must total exactly ${target} sheets; received ${total}`);
}
