// ─── Draft approval binding ──────────────────────────────────────────────────
// Brief sections 12/43: an approval binds to a draft's exact (id, version,
// hash). If material data changes, the version increments and any approval
// bound to the old version is stale. computeDraftHash is a pure content hash
// (not the version number itself) so an approval can also detect "same
// version number, but the field content actually changed" — belt and braces
// against a version-increment bug, not just the primary defense.

import { createHash } from 'node:crypto';

export function computeDraftHash(materialFields: Record<string, unknown>): string {
  const canonical = JSON.stringify(materialFields, Object.keys(materialFields).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/** True when an approval bound to (approvedVersion, approvedHash) is still valid for the draft's current state. */
export function isApprovalStillValid(input: {
  approvedVersion: number; approvedHash: string;
  currentVersion: number; currentMaterialFields: Record<string, unknown>;
}): boolean {
  if (input.approvedVersion !== input.currentVersion) return false;
  return input.approvedHash === computeDraftHash(input.currentMaterialFields);
}
