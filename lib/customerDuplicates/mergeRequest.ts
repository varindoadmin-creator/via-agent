export function buildZohoContactMergePath(keepContactId: string, groupContactIds: string[]): string {
  const keepId = String(keepContactId || '').trim();
  const duplicateIds = [...new Set(groupContactIds.map(String))]
    .filter(contactId => contactId && contactId !== keepId)
    .sort();
  if (!keepId) throw new Error('A contact to keep is required.');
  if (!duplicateIds.length) throw new Error('At least one duplicate contact is required.');
  return `/contacts/${encodeURIComponent(keepId)}/merge?contact_ids=${encodeURIComponent(duplicateIds.join(','))}`;
}
