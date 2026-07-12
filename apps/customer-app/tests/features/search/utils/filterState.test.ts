import {
  nonScopeFilterCount,
  appliedFilterEntries,
  removeAppliedFilter,
} from '@/features/search/utils/filterState'
import { EMPTY_FILTERS, type FilterState } from '@/features/search/components/FilterSheet'

const base = EMPTY_FILTERS

describe('nonScopeFilterCount', () => {
  it('is 0 for EMPTY_FILTERS', () => {
    expect(nonScopeFilterCount(base)).toBe(0)
  })

  // Map Phase 2 S5a — pins the MapScreen.test.tsx "filter button
  // active-dot" invariant this count generalises: category is EXCLUDED.
  it('does NOT count categoryId (mirrors the locked Map filter-button-badge invariant)', () => {
    const filters: FilterState = { ...base, categoryId: 'c1' }
    expect(nonScopeFilterCount(filters)).toBe(0)
  })

  it('counts a non-relevance sort as 1', () => {
    expect(nonScopeFilterCount({ ...base, sortBy: 'nearest' })).toBe(1)
  })

  it('counts openNow as 1', () => {
    expect(nonScopeFilterCount({ ...base, openNow: true })).toBe(1)
  })

  it('counts each selected amenity individually', () => {
    expect(nonScopeFilterCount({ ...base, amenityIds: ['a1', 'a2'] })).toBe(2)
  })

  it('counts a multi-value voucher-type chip (Discount) as ONE, not two', () => {
    expect(nonScopeFilterCount({ ...base, voucherTypes: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] })).toBe(1)
  })

  it('does not count a PARTIAL voucher-type group (only one of two Discount values present)', () => {
    expect(nonScopeFilterCount({ ...base, voucherTypes: ['DISCOUNT_FIXED'] })).toBe(0)
  })

  it('sums across every non-scope field', () => {
    const filters: FilterState = {
      categoryId:   'c1',
      sortBy:       'top_rated',
      voucherTypes: ['BOGO'],
      amenityIds:   ['a1'],
      openNow:      true,
    }
    // sort(1) + BOGO(1) + amenity(1) + openNow(1) = 4; categoryId excluded.
    expect(nonScopeFilterCount(filters)).toBe(4)
  })
})

describe('appliedFilterEntries', () => {
  const categoryNameById = new Map([['c1', 'Food & Drink'], ['s1', 'Italian']])
  const amenityNameById  = new Map([['a1', 'Wi-Fi']])
  const sortLabelByKey   = new Map([
    ['relevance', 'Relevance'], ['nearest', 'Nearest'],
    ['top_rated', 'Top Rated'], ['highest_saving', 'Highest Saving'],
  ]) as Map<FilterState['sortBy'], string>

  it('is empty for EMPTY_FILTERS', () => {
    expect(appliedFilterEntries(base, categoryNameById, amenityNameById, sortLabelByKey)).toEqual([])
  })

  it('includes a category entry (unlike nonScopeFilterCount) when categoryId is set', () => {
    const filters: FilterState = { ...base, categoryId: 'c1' }
    const entries = appliedFilterEntries(filters, categoryNameById, amenityNameById, sortLabelByKey)
    expect(entries).toEqual([{ kind: 'category', id: 'c1', label: 'Food & Drink' }])
  })

  it('omits the category entry when categoryId matches a custom base (CategoryResultsScreen route category)', () => {
    const routeBase: FilterState = { ...base, categoryId: 'c1' }
    const filters: FilterState = { ...routeBase }
    const entries = appliedFilterEntries(filters, categoryNameById, amenityNameById, sortLabelByKey, routeBase)
    expect(entries).toEqual([])
  })

  it('includes a subcategory chip when drilled below the route base category', () => {
    const routeBase: FilterState = { ...base, categoryId: 'c1' }
    const filters: FilterState = { ...routeBase, categoryId: 's1' }
    const entries = appliedFilterEntries(filters, categoryNameById, amenityNameById, sortLabelByKey, routeBase)
    expect(entries).toEqual([{ kind: 'category', id: 's1', label: 'Italian' }])
  })

  it('includes sort / voucherType / amenity / openNow entries when set', () => {
    const filters: FilterState = {
      categoryId:   null,
      sortBy:       'nearest',
      voucherTypes: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'],
      amenityIds:   ['a1'],
      openNow:      true,
    }
    const entries = appliedFilterEntries(filters, categoryNameById, amenityNameById, sortLabelByKey)
    expect(entries).toEqual([
      { kind: 'sort', label: 'Nearest' },
      { kind: 'voucherType', chipLabel: 'Discount', values: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] },
      { kind: 'amenity', id: 'a1', label: 'Wi-Fi' },
      { kind: 'openNow' },
    ])
  })
})

describe('removeAppliedFilter', () => {
  const sortLabelByKey = new Map() as Map<FilterState['sortBy'], string>
  const categoryNameById = new Map()
  const amenityNameById = new Map()
  void sortLabelByKey; void categoryNameById; void amenityNameById

  it('category removal falls back to base.categoryId (widen, not clear)', () => {
    const routeBase: FilterState = { ...base, categoryId: 'c1' }
    const filters: FilterState = { ...routeBase, categoryId: 's1', amenityIds: ['a1'] }
    const next = removeAppliedFilter(filters, { kind: 'category', id: 's1', label: 'Italian' }, routeBase)
    expect(next.categoryId).toBe('c1')
    // amenityIds reset too — eligibility differs per category.
    expect(next.amenityIds).toEqual([])
  })

  it('sort removal falls back to base.sortBy', () => {
    const filters: FilterState = { ...base, sortBy: 'nearest' }
    const next = removeAppliedFilter(filters, { kind: 'sort', label: 'Nearest' }, base)
    expect(next.sortBy).toBe('relevance')
  })

  it('voucherType removal drops only that chip group\'s values', () => {
    const filters: FilterState = { ...base, voucherTypes: ['BOGO', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] }
    const next = removeAppliedFilter(
      filters,
      { kind: 'voucherType', chipLabel: 'Discount', values: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] },
      base,
    )
    expect(next.voucherTypes).toEqual(['BOGO'])
  })

  it('amenity removal drops only that amenity id', () => {
    const filters: FilterState = { ...base, amenityIds: ['a1', 'a2'] }
    const next = removeAppliedFilter(filters, { kind: 'amenity', id: 'a1', label: 'Wi-Fi' }, base)
    expect(next.amenityIds).toEqual(['a2'])
  })

  it('openNow removal falls back to base.openNow', () => {
    const filters: FilterState = { ...base, openNow: true }
    const next = removeAppliedFilter(filters, { kind: 'openNow' }, base)
    expect(next.openNow).toBe(false)
  })
})
