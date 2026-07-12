import { FilterState, VOUCHER_TYPE_CHIPS, EMPTY_FILTERS } from '../components/FilterSheet'

/**
 * Map Phase 2 S5a — shared FilterState helpers used by the filter-button
 * active count badge and the applied-filters chips row across Map /
 * Search / CategoryResults.
 */

/**
 * Count of NON-scope filters — sortBy / voucherTypes / amenityIds /
 * openNow. Deliberately EXCLUDES `categoryId`.
 *
 * This mirrors MapScreen's pre-existing `hasNonScopeFilters` boolean
 * (locked behaviour, pinned by `MapScreen.test.tsx`'s "filter button
 * active-dot" suite: "does NOT show the active-dot when only categoryId
 * is set"). Category selection already has its own visible affordance
 * (the active category pill turns brand-rose) — re-flagging it on the
 * filter button's badge would be redundant. Generalised here from a
 * boolean to a COUNT so the badge can show "2" instead of a bare dot,
 * and reused for Search + CategoryResults so all three surfaces' filter
 * buttons carry identical semantics (Map Phase 2 acceptance criterion 6:
 * "Filter semantics identical across Map/Search/Category").
 */
export function nonScopeFilterCount(filters: FilterState): number {
  let count = 0
  if (filters.sortBy !== 'relevance') count += 1
  if (filters.openNow) count += 1
  count += filters.amenityIds.length
  count += VOUCHER_TYPE_CHIPS.filter((chip) =>
    chip.values.every((v) => filters.voucherTypes.includes(v)),
  ).length
  return count
}

export type AppliedFilterEntry =
  | { kind: 'category'; id: string; label: string }
  | { kind: 'sort'; label: string }
  | { kind: 'voucherType'; chipLabel: string; values: string[] }
  | { kind: 'amenity'; id: string; label: string }
  | { kind: 'openNow' }

/**
 * Diff-based applied-filter list for the chips row — every field that
 * differs from `base` (defaults to `EMPTY_FILTERS`) becomes one removable
 * chip. Unlike `nonScopeFilterCount`, this INCLUDES category/subcategory:
 * the chips row is a full audit trail of "everything currently applied",
 * not just the filter-button badge's narrower "non-scope" semantics.
 *
 * Using `base` (rather than always diffing against a hardcoded empty
 * state) is what lets CategoryResultsScreen show a chip ONLY for a
 * subcategory drill-down (`categoryId !== routeId`) and never for the
 * route category itself — the category page's own title already
 * communicates that.
 */
export function appliedFilterEntries(
  filters: FilterState,
  categoryNameById: Map<string, string>,
  amenityNameById: Map<string, string>,
  sortLabelByKey: Map<FilterState['sortBy'], string>,
  base: FilterState = EMPTY_FILTERS,
): AppliedFilterEntry[] {
  const entries: AppliedFilterEntry[] = []

  if (filters.categoryId !== base.categoryId && filters.categoryId !== null) {
    entries.push({
      kind:  'category',
      id:    filters.categoryId,
      label: categoryNameById.get(filters.categoryId) ?? 'Category',
    })
  }

  if (filters.sortBy !== base.sortBy) {
    entries.push({ kind: 'sort', label: sortLabelByKey.get(filters.sortBy) ?? filters.sortBy })
  }

  const baseVoucherTypes = new Set(base.voucherTypes)
  for (const chip of VOUCHER_TYPE_CHIPS) {
    const active     = chip.values.every((v) => filters.voucherTypes.includes(v))
    const activeBase = chip.values.every((v) => baseVoucherTypes.has(v))
    if (active && !activeBase) {
      entries.push({ kind: 'voucherType', chipLabel: chip.label, values: chip.values })
    }
  }

  const baseAmenities = new Set(base.amenityIds)
  for (const id of filters.amenityIds) {
    if (baseAmenities.has(id)) continue
    entries.push({ kind: 'amenity', id, label: amenityNameById.get(id) ?? 'Amenity' })
  }

  if (filters.openNow && !base.openNow) {
    entries.push({ kind: 'openNow' })
  }

  return entries
}

/**
 * Applies the removal of a single chip, returning the next FilterState.
 * `base` supplies the field's reset-to value (category falls back to
 * `base.categoryId`, matching FilterSheet's own "promote to parent"
 * semantics rather than nulling out entirely).
 */
export function removeAppliedFilter(
  filters: FilterState,
  entry:   AppliedFilterEntry,
  base:    FilterState = EMPTY_FILTERS,
): FilterState {
  switch (entry.kind) {
    case 'category':
      return { ...filters, categoryId: base.categoryId, amenityIds: base.amenityIds }
    case 'sort':
      return { ...filters, sortBy: base.sortBy }
    case 'voucherType':
      return { ...filters, voucherTypes: filters.voucherTypes.filter((v) => !entry.values.includes(v)) }
    case 'amenity':
      return { ...filters, amenityIds: filters.amenityIds.filter((id) => id !== entry.id) }
    case 'openNow':
      return { ...filters, openNow: base.openNow }
  }
}
