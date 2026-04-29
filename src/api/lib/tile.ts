/**
 * Spec §3.6 — descriptor construction with de-duplication rule.
 *
 * Pattern: `{tagLabel} {subcategoryDescriptorSuffix}`
 *
 * De-dup rule: collapse repetition between the tag and the suffix. Two cases
 * are detected (case-insensitive):
 *   1. Full substring containment — one string contains the other in full.
 *      Render the longer one alone.
 *      e.g. "Boutique" + "Boutique Hotel" → "Boutique Hotel"
 *   2. Word-boundary overlap — the tag ends with one or more whole words that
 *      the suffix starts with. Render the longer of the two strings alone.
 *      e.g. "Cookery Class" + "Class & Workshop" → "Cookery Class"
 *
 * Prevents visual repetition like "Boutique Boutique Hotel" or
 * "Cookery Class Class & Workshop".
 */
export function buildDescriptor(
  tagLabel: string | null,
  subcategoryDescriptorSuffix: string,
): string {
  if (!tagLabel) return subcategoryDescriptorSuffix

  const tagLower = tagLabel.toLowerCase()
  const suffixLower = subcategoryDescriptorSuffix.toLowerCase()

  // Case 1 — full substring containment.
  // Note: when the suffix is empty, `tagLower.includes('')` is always true,
  // so we fall through to returning `tagLabel` alone. That is the intended
  // behaviour — an empty suffix means the subcategory has no descriptor
  // suffix configured, so the tag is the entire descriptor.
  if (suffixLower.includes(tagLower)) return subcategoryDescriptorSuffix
  if (tagLower.includes(suffixLower)) return tagLabel

  // Case 2 — word-boundary overlap (tag ends with same words suffix starts with).
  // Required by the spec's worked example in §3.6 / §3.7 row 11:
  //   "Cookery Class" + "Class & Workshop" → "Cookery Class".
  // Pure substring containment (Case 1) cannot produce that output — neither
  // string contains the other in full — so the worked example forces this
  // additional rule. Tag wins: §3.7 prescribes the tag-only rendering, which
  // also matches the convention that the admin-tagged primary descriptor is
  // the more specific label.
  const tagWords = tagLower.split(/\s+/).filter(Boolean)
  const suffixWords = suffixLower.split(/\s+/).filter(Boolean)
  const maxOverlap = Math.min(tagWords.length, suffixWords.length)
  for (let n = maxOverlap; n >= 1; n--) {
    const tagTail = tagWords.slice(tagWords.length - n).join(' ')
    const suffixHead = suffixWords.slice(0, n).join(' ')
    if (tagTail === suffixHead) return tagLabel
  }

  return `${tagLabel} ${subcategoryDescriptorSuffix}`
}

/**
 * Returns the descriptor suffix for a subcategory.
 * Falls back to the subcategory name when no override is set.
 */
export function descriptorSuffixFor(subcategory: { name: string; descriptorSuffix: string | null }): string {
  return subcategory.descriptorSuffix ?? subcategory.name
}

/**
 * Spec §3.4 — applies admin-curated `RedundantHighlight` rules to a merchant's
 * highlight tag list, returning only the highlights that should be shown.
 *
 * The redundant tag-id set is pre-resolved by the caller (typically a discovery
 * API route resolves it from the DB once per request via the merchant's
 * subcategoryId). This helper stays pure: no Prisma, no I/O. Caller-driven
 * separation keeps the helper trivially testable and reusable across routes.
 *
 * Order is preserved from the input array. Input is not mutated; a new array
 * is returned.
 *
 * Example:
 *   const redundant = new Set(redundantRows.map((r) => r.highlightTagId))
 *   const visible = filterVisibleHighlights(merchant.highlights, redundant)
 */
export function filterVisibleHighlights<T extends { id: string }>(
  highlights: T[],
  redundantTagIds: ReadonlySet<string>,
): T[] {
  if (redundantTagIds.size === 0) return highlights.slice()
  return highlights.filter((h) => !redundantTagIds.has(h.id))
}

/**
 * Filters MerchantHighlight rows by removing those whose `highlightTagId` is in
 * the redundant set for the merchant's subcategory (per spec §3.4).
 *
 * Use this when filtering MerchantHighlight rows directly. For filtering Tag
 * rows (keyed on `id` rather than `highlightTagId`), use `filterVisibleHighlights`
 * instead.
 *
 * Pure helper — caller pre-resolves the redundant tag-id set from the DB
 * (typically batched per result-set in a discovery API route).
 *
 * Order is preserved from the input array. Input is not mutated; a new array
 * is returned.
 */
export function filterRedundantHighlights<T extends { highlightTagId: string }>(
  highlights: T[],
  redundantHighlightTagIds: ReadonlySet<string>,
): T[] {
  if (redundantHighlightTagIds.size === 0) return highlights.slice()
  return highlights.filter((h) => !redundantHighlightTagIds.has(h.highlightTagId))
}
