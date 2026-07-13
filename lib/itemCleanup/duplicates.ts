// ─── Duplicate item detection ─────────────────────────────────────────────────
// Report-only, same posture as customerCleanup/duplicates.ts: flags likely
// duplicate item records for a human to review and merge manually in Zoho
// Books. Never merges/deletes anything — merging items affects stock history
// and open transactions, which needs a judgment call VIA shouldn't make.
//
// Matching is exact-on-normalized-field only (no fuzzy/similarity scoring).

export interface ItemDuplicateCandidate {
  item_id: string;
  name: string;
  sku: string;
  brand: string;
  unit: string;
  status: string;
}

export type ItemDuplicateReason = 'Same SKU' | 'Same item name';

export interface ItemDuplicateGroup {
  key: string;
  reasons: ItemDuplicateReason[];
  items: ItemDuplicateCandidate[];
}

/** Uppercase, trim, collapse internal whitespace. */
function normalizeKey(raw: string | undefined | null): string {
  if (!raw?.trim()) return '';
  return raw.toUpperCase().trim().replace(/\s+/g, ' ');
}

class DisjointSet {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function pushMap(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
}

export function findItemDuplicateGroups(items: ItemDuplicateCandidate[]): ItemDuplicateGroup[] {
  const dsu = new DisjointSet();

  const skuMap = new Map<string, string[]>();
  const nameMap = new Map<string, string[]>();

  for (const it of items) {
    dsu.find(it.item_id);

    const skuKey = normalizeKey(it.sku);
    if (skuKey) pushMap(skuMap, skuKey, it.item_id);

    const nameKey = normalizeKey(it.name);
    if (nameKey) pushMap(nameMap, nameKey, it.item_id);
  }

  for (const map of [skuMap, nameMap]) {
    for (const ids of map.values()) {
      for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
    }
  }

  const reasonsByRoot = new Map<string, Set<ItemDuplicateReason>>();
  function addReasons(map: Map<string, string[]>, reason: ItemDuplicateReason) {
    for (const ids of map.values()) {
      if (ids.length < 2) continue;
      const root = dsu.find(ids[0]);
      if (!reasonsByRoot.has(root)) reasonsByRoot.set(root, new Set());
      reasonsByRoot.get(root)!.add(reason);
    }
  }
  addReasons(skuMap, 'Same SKU');
  addReasons(nameMap, 'Same item name');

  const membersByRoot = new Map<string, ItemDuplicateCandidate[]>();
  for (const it of items) {
    const root = dsu.find(it.item_id);
    const list = membersByRoot.get(root);
    if (list) list.push(it);
    else membersByRoot.set(root, [it]);
  }

  const groups: ItemDuplicateGroup[] = [];
  for (const [root, members] of membersByRoot) {
    if (members.length < 2) continue;
    groups.push({
      key: root,
      reasons: Array.from(reasonsByRoot.get(root) || []),
      items: members,
    });
  }

  groups.sort((a, b) => b.items.length - a.items.length || b.reasons.length - a.reasons.length);
  return groups;
}
