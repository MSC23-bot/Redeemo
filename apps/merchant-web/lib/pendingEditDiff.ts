// Fidelity polish (Branches + Business Profile pending-edit banners, 2026-07-07
// audit): a small SHARED pure helper that diffs a PendingEdit row's
// `proposedChanges` bag against the current live record, so both the Branches
// PendingEditsList and the Business Profile PendingEditBanner can render the same
// "<Field label>: <old> -> <new>" rows instead of the old generic "a change is
// already in review" copy with no detail. Framework-free so it is trivially
// unit-testable and reusable from any future edit surface (mirrors the existing
// lib/business-profile/format.ts pure-helper pattern).
//
// IMAGE fields (logoUrl / bannerUrl today) never print the raw URL string in the
// diff - the caller passes their field name in `imageFields` and this renders a
// friendly "<Field label> (change pending)" row instead of an old -> new value
// pair, so a signed/public asset URL never leaks into the UI as plain text.

export interface PendingEditDiffRow {
  /** The raw proposedChanges key, e.g. "addressLine1". */
  field: string
  /** Human label, e.g. "Address line 1". */
  label: string
  /** True for logoUrl/bannerUrl-style fields: no old/new values are shown. */
  isImage: boolean
  /** Display string for the current live value (irrelevant when isImage). */
  oldDisplay: string
  /** Display string for the proposed new value (irrelevant when isImage). */
  newDisplay: string
}

const NOT_SET = 'Not set'

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return NOT_SET
  if (typeof v === 'string') {
    const trimmed = v.trim()
    return trimmed.length > 0 ? trimmed : NOT_SET
  }
  return String(v)
}

// Builds one diff row per key that is BOTH in `fieldLabels` (the allow-listed,
// human-labelled fields this surface knows how to show) AND actually present on
// `proposedChanges` (a partial bag - only the fields the merchant actually
// changed). Keys outside `fieldLabels` (e.g. branch photo add/remove arrays, or
// resolved lat/lng) are silently skipped - this is a display diff, not a full
// dump of the proposed-changes payload.
export function computePendingEditDiff(
  proposedChanges: Record<string, unknown> | null | undefined,
  current: Record<string, unknown>,
  fieldLabels: Record<string, string>,
  imageFields: ReadonlySet<string> = new Set(),
): PendingEditDiffRow[] {
  if (!proposedChanges) return []
  const rows: PendingEditDiffRow[] = []
  for (const field of Object.keys(fieldLabels)) {
    if (!(field in proposedChanges)) continue
    const isImage = imageFields.has(field)
    rows.push({
      field,
      label: fieldLabels[field],
      isImage,
      oldDisplay: isImage ? '' : displayValue(current[field]),
      newDisplay: isImage ? '' : displayValue(proposedChanges[field]),
    })
  }
  return rows
}
