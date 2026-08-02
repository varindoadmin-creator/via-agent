// ─── Duplicate customer detection ─────────────────────────────────────────────
// Report-only, like missing-address: flags likely duplicates for a human to
// review and merge manually in Zoho Books. Never merges/deletes anything
// itself — merging is destructive (transaction history, balances) and needs
// a judgment call VIA shouldn't make.
//
// Matching is exact-on-normalized-field only (no fuzzy/similarity scoring) —
// same conservative posture as rules.ts: never guess, only flag what's
// actually the same underlying value written differently.

export interface DuplicateCandidate {
  contact_id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string;
  mobile: string;
  npwp: string;
  status: string;
}

export type DuplicateReason = 'Same NPWP' | 'Same phone/mobile number' | 'Same email' | 'Same name';

export interface DuplicateGroup {
  key: string;
  reasons: DuplicateReason[];
  customers: DuplicateCandidate[];
}

const LEGAL_SUFFIX_WORDS = new Set(['PT', 'CV', 'UD', 'PD', 'FA', 'TBK', 'KOPERASI', 'YAYASAN']);

/** Uppercase, strip punctuation and legal-entity words, collapse spaces — order-independent. */
function normalizeNameKey(raw: string | undefined | null): string {
  if (!raw?.trim()) return '';
  const words = raw
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !LEGAL_SUFFIX_WORDS.has(w));
  return words.join(' ');
}

/** Last 9 digits — absorbs 0/62/+62 country-code prefix differences. */
function normalizePhoneKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-9);
}

/** Strips non-digits; rejects short values and dummy all-same-digit placeholders (e.g. "0000000000000"). */
function normalizeNpwpKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (/^(\d)\1+$/.test(digits)) return null;
  return digits;
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

export function findDuplicateGroups(contacts: DuplicateCandidate[]): DuplicateGroup[] {
  // Zoho Books merges by retaining the master and marking absorbed contacts
  // inactive. Inactive contacts are historical records, not actionable
  // duplicates, so they must never reappear after a successful merge.
  const activeContacts = contacts.filter(contact => !contact.status || contact.status.toLowerCase() === 'active');
  const dsu = new DisjointSet();

  const npwpMap = new Map<string, string[]>();
  const phoneMap = new Map<string, string[]>();
  const emailMap = new Map<string, string[]>();
  const nameMap = new Map<string, string[]>();

  for (const c of activeContacts) {
    dsu.find(c.contact_id);

    const npwpKey = normalizeNpwpKey(c.npwp);
    if (npwpKey) pushMap(npwpMap, npwpKey, c.contact_id);

    const phoneKey = normalizePhoneKey(c.phone);
    if (phoneKey) pushMap(phoneMap, phoneKey, c.contact_id);
    const mobileKey = normalizePhoneKey(c.mobile);
    if (mobileKey && mobileKey !== phoneKey) pushMap(phoneMap, mobileKey, c.contact_id);

    const emailKey = c.email?.trim().toLowerCase();
    if (emailKey) pushMap(emailMap, emailKey, c.contact_id);

    const nameKey = normalizeNameKey(c.company_name) || normalizeNameKey(c.contact_name);
    if (nameKey) pushMap(nameMap, nameKey, c.contact_id);
  }

  for (const map of [npwpMap, phoneMap, emailMap, nameMap]) {
    for (const ids of map.values()) {
      for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
    }
  }

  const reasonsByRoot = new Map<string, Set<DuplicateReason>>();
  function addReasons(map: Map<string, string[]>, reason: DuplicateReason) {
    for (const ids of map.values()) {
      if (ids.length < 2) continue;
      const root = dsu.find(ids[0]);
      if (!reasonsByRoot.has(root)) reasonsByRoot.set(root, new Set());
      reasonsByRoot.get(root)!.add(reason);
    }
  }
  addReasons(npwpMap, 'Same NPWP');
  addReasons(phoneMap, 'Same phone/mobile number');
  addReasons(emailMap, 'Same email');
  addReasons(nameMap, 'Same name');

  const membersByRoot = new Map<string, DuplicateCandidate[]>();
  for (const c of activeContacts) {
    const root = dsu.find(c.contact_id);
    const list = membersByRoot.get(root);
    if (list) list.push(c);
    else membersByRoot.set(root, [c]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, members] of membersByRoot) {
    if (members.length < 2) continue;
    groups.push({
      key: root,
      reasons: Array.from(reasonsByRoot.get(root) || []),
      customers: members,
    });
  }

  groups.sort((a, b) => b.customers.length - a.customers.length || b.reasons.length - a.reasons.length);
  return groups;
}
