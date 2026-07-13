import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FilterSheet, FilterState, VOUCHER_TYPE_CHIPS, EMPTY_FILTERS } from '@/features/search/components/FilterSheet'

// Categories fixture: 2 top-levels + 2 subcategories of Food & Drink
jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null,  intentType: 'LOCAL' },
      { id: 'c2', name: 'Beauty',       iconUrl: null, pinColour: '#E91E8C', pinIcon: null, parentId: null,  intentType: 'LOCAL' },
      { id: 's1', name: 'Italian',      iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
      { id: 's2', name: 'Pizza',        iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
    ] },
    isLoading: false,
  }),
}))

// Eligible amenities — controlled per test via the mock state
const mockState = {
  amenities: [] as Array<{ id: string; name: string; iconUrl: string | null; isActive: boolean }>,
}

jest.mock('@/hooks/useEligibleAmenities', () => ({
  useEligibleAmenities: (categoryId: string | null | undefined) => ({
    data: categoryId ? { amenities: mockState.amenities } : undefined,
    isLoading: false,
  }),
}))

// Updated FilterState — no subcategoryId, no maxDistanceMiles, no minSaving
// (those are dropped in PR B; deferred to Plan 2). Keep voucherTypes /
// amenityIds / openNow / sortBy / categoryId.
const defaultFilters: FilterState = {
  categoryId:    null,
  sortBy:        'relevance',
  voucherTypes:  [],
  amenityIds:    [],
  openNow:       false,
}

describe('FilterSheet', () => {
  beforeEach(() => { mockState.amenities = [] })

  it('renders sort options (W2b round 2: shared segmented control, display labels; canonical a11y labels retained)', () => {
    const { getByText, getByLabelText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    // Display-only labels (SORT_DISPLAY_LABEL).
    expect(getByText('Relevance')).toBeTruthy()
    expect(getByText('Nearest')).toBeTruthy()
    expect(getByText('Top rated')).toBeTruthy()
    expect(getByText('Best saving')).toBeTruthy()
    // Canonical accessibility labels stay on the SORT_OPTIONS wording.
    expect(getByLabelText('Sort by Top Rated')).toBeTruthy()
    expect(getByLabelText('Sort by Highest Saving')).toBeTruthy()
  })

  it('renders apply button with result count', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Show 42 places')).toBeTruthy()
  })

  it('calls onApply with updated filters when applied', () => {
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    fireEvent.press(getByText('Nearest'))
    fireEvent.press(getByText('Show 42 places'))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'nearest' }))
  })

  it('Category section renders TOP-LEVELS only (parentId === null)', () => {
    const { getByText, queryByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
    // Subcategories are NOT shown until a top-level is selected
    expect(queryByText('Italian')).toBeNull()
    expect(queryByText('Pizza')).toBeNull()
  })

  it('Subcategory drill-down appears when a top-level is selected', () => {
    const filtersWithCategory: FilterState = { ...defaultFilters, categoryId: 'c1' }
    const { getByText } = render(
      <FilterSheet visible filters={filtersWithCategory} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Subcategory')).toBeTruthy()
    expect(getByText('Italian')).toBeTruthy()
    expect(getByText('Pizza')).toBeTruthy()
  })

  it('Subcategory section is hidden when no top-level is selected', () => {
    const { queryByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(queryByText('Subcategory')).toBeNull()
  })

  it('hides Amenities section when no category is selected (decision #3)', () => {
    mockState.amenities = [
      { id: 'a1', name: 'Wi-Fi',           iconUrl: null, isActive: true },
      { id: 'a2', name: 'Outdoor Seating', iconUrl: null, isActive: true },
    ]
    const { queryByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    // No category selected → useEligibleAmenities is disabled → no Amenities section
    expect(queryByText('Amenities')).toBeNull()
    expect(queryByText('Wi-Fi')).toBeNull()
  })

  it('shows Amenities (real names from /categories/:id/amenities) when a category IS selected', () => {
    mockState.amenities = [
      { id: 'amenity-uuid-1', name: 'Wi-Fi',           iconUrl: null, isActive: true },
      { id: 'amenity-uuid-2', name: 'Outdoor Seating', iconUrl: null, isActive: true },
    ]
    const filtersWithCategory: FilterState = { ...defaultFilters, categoryId: 'c1' }
    const { getByText } = render(
      <FilterSheet visible filters={filtersWithCategory} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Amenities')).toBeTruthy()
    expect(getByText('Wi-Fi')).toBeTruthy()
    expect(getByText('Outdoor Seating')).toBeTruthy()
  })

  it('toggling an amenity sends real Amenity.id UUID to onApply (NOT a synthetic local string)', () => {
    mockState.amenities = [
      { id: 'amenity-uuid-1', name: 'Wi-Fi', iconUrl: null, isActive: true },
    ]
    const filtersWithCategory: FilterState = { ...defaultFilters, categoryId: 'c1' }
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={filtersWithCategory} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    fireEvent.press(getByText('Wi-Fi'))
    fireEvent.press(getByText('Show 42 places'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ amenityIds: ['amenity-uuid-1'] }),
    )
  })

  it('selecting a different category clears amenityIds (eligibility differs per category)', () => {
    mockState.amenities = [
      { id: 'amenity-uuid-1', name: 'Wi-Fi', iconUrl: null, isActive: true },
    ]
    // User starts with category=c1 + Wi-Fi selected
    const startFilters: FilterState = { ...defaultFilters, categoryId: 'c1', amenityIds: ['amenity-uuid-1'] }
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={startFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    // Switch top-level to Beauty
    fireEvent.press(getByText('Beauty'))
    fireEvent.press(getByText('Show 42 places'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'c2', amenityIds: [] }),
    )
  })

  it('tapping the parent of a currently-selected subcategory promotes to parent (does NOT clear)', () => {
    // User starts on Italian (subcategory of Food & Drink) and taps the
    // Food & Drink top-level pill — should switch to the parent, not
    // clear everything.
    const startFilters: FilterState = { ...defaultFilters, categoryId: 's1' }
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={startFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    fireEvent.press(getByText('Food & Drink'))
    fireEvent.press(getByText('Show 42 places'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'c1' }),
    )
  })

  it('tapping the same currently-selected top-level CLEARS the filter', () => {
    const startFilters: FilterState = { ...defaultFilters, categoryId: 'c1' }
    const onApply = jest.fn()
    const { getAllByText, getByText } = render(
      <FilterSheet visible filters={startFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    // The active pill renders its label twice (the pill body); use the first.
    fireEvent.press(getAllByText('Food & Drink')[0]!)
    fireEvent.press(getByText('Show 42 places'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
    )
  })

  it('does NOT include Distance or Min Savings sections (deferred to Plan 2)', () => {
    const { queryByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(queryByText(/Distance/i)).toBeNull()
    expect(queryByText(/Min\.?\s?Savings/i)).toBeNull()
  })

  // Map Phase 2 S0 — voucher-type label→enum mapping (live bug fix).
  // Pins the exact chip → backend-enum mapping table so a future edit
  // can't silently reintroduce a display-string / enum mismatch.
  describe('voucher-type label→enum mapping', () => {
    it('pins the exact chip → backend VoucherType enum values', () => {
      expect(VOUCHER_TYPE_CHIPS).toEqual([
        { label: 'BOGO',         values: ['BOGO'] },
        { label: 'Discount',     values: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] },
        { label: 'Freebie',      values: ['FREEBIE'] },
        { label: 'Spend & Save', values: ['SPEND_AND_SAVE'] },
        { label: 'Package Deal', values: ['PACKAGE_DEAL'] },
        { label: 'Time-Limited', values: ['TIME_LIMITED'] },
        { label: 'Reusable',     values: ['REUSABLE'] },
      ])
    })

    it('renders a chip for every mapping-table label', () => {
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      for (const chip of VOUCHER_TYPE_CHIPS) {
        expect(getByText(chip.label)).toBeTruthy()
      }
    })

    it('selecting the "Discount" chip sends BOTH DISCOUNT_FIXED and DISCOUNT_PERCENT in onApply (real backend enum, not the display string)', () => {
      const onApply = jest.fn()
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      fireEvent.press(getByText('Discount'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ voucherTypes: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] }),
      )
    })

    it('selecting a single-value chip (BOGO) sends only its enum value', () => {
      const onApply = jest.fn()
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      fireEvent.press(getByText('BOGO'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ voucherTypes: ['BOGO'] }),
      )
    })

    it('deselecting "Discount" removes BOTH enum values together (all-or-nothing toggle)', () => {
      const onApply = jest.fn()
      const startFilters: FilterState = {
        ...defaultFilters,
        voucherTypes: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'],
      }
      const { getByText } = render(
        <FilterSheet visible filters={startFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      fireEvent.press(getByText('Discount'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ voucherTypes: [] }),
      )
    })

    it('Discount chip shows selected (active styling) only when BOTH enum values are present', () => {
      // Partial state (only one of the two Discount values present) should
      // NOT read as "Discount selected" — `every` requires both.
      const partialFilters: FilterState = { ...defaultFilters, voucherTypes: ['DISCOUNT_FIXED'] }
      const onApply = jest.fn()
      const { getByText } = render(
        <FilterSheet visible filters={partialFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      // Tapping Discount from a partial state should complete the group
      // (both DISCOUNT_FIXED and DISCOUNT_PERCENT end up present), not
      // clear it — confirms the `active` check is `every`, not `some`.
      fireEvent.press(getByText('Discount'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ voucherTypes: ['DISCOUNT_FIXED', 'DISCOUNT_PERCENT'] }),
      )
    })

    it('selecting multiple chips accumulates enum values across groups', () => {
      const onApply = jest.fn()
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      fireEvent.press(getByText('BOGO'))
      fireEvent.press(getByText('Time-Limited'))
      fireEvent.press(getByText('Reusable'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ voucherTypes: ['BOGO', 'TIME_LIMITED', 'REUSABLE'] }),
      )
    })
  })

  // Map Phase 2 S5a — redesign additions: header close, Reset footer
  // button, live-count override + fallback, draft-change reporting.
  describe('S5a redesign', () => {
    it('EMPTY_FILTERS is the canonical all-clear state', () => {
      expect(EMPTY_FILTERS).toEqual({
        categoryId:   null,
        sortBy:       'relevance',
        voucherTypes: [],
        amenityIds:   [],
        openNow:      false,
      })
    })

    it('renders a header with a title and a close button that dismisses', () => {
      const onDismiss = jest.fn()
      const { getByText, getByLabelText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={onDismiss} />,
      )
      expect(getByText('Filters')).toBeTruthy()
      fireEvent.press(getByLabelText('Close filters'))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('Reset returns the draft to EMPTY_FILTERS by default (does not call onApply or onDismiss)', () => {
      const onApply = jest.fn()
      const onDismiss = jest.fn()
      const startFilters: FilterState = {
        categoryId: 'c1', sortBy: 'nearest', voucherTypes: ['BOGO'], amenityIds: ['a1'], openNow: true,
      }
      const { getByText, getByLabelText } = render(
        <FilterSheet visible filters={startFilters} resultCount={7} onApply={onApply} onDismiss={onDismiss} />,
      )
      fireEvent.press(getByLabelText('Reset filters'))
      // Reset is draft-only — neither callback fires...
      expect(onApply).not.toHaveBeenCalled()
      expect(onDismiss).not.toHaveBeenCalled()
      // ...but applying afterwards sends the reset (empty) state.
      fireEvent.press(getByText('Show 7 places'))
      expect(onApply).toHaveBeenCalledWith(EMPTY_FILTERS)
    })

    it('Reset returns the draft to a custom baseFilters when provided (CategoryResultsScreen contract)', () => {
      const onApply = jest.fn()
      const startFilters: FilterState = {
        categoryId: 's1', sortBy: 'nearest', voucherTypes: [], amenityIds: [], openNow: true,
      }
      const baseFilters: FilterState = { ...EMPTY_FILTERS, categoryId: 'c1' }
      const { getByText, getByLabelText } = render(
        <FilterSheet
          visible
          filters={startFilters}
          resultCount={7}
          onApply={onApply}
          onDismiss={jest.fn()}
          baseFilters={baseFilters}
        />,
      )
      fireEvent.press(getByLabelText('Reset filters'))
      fireEvent.press(getByText('Show 7 places'))
      // categoryId returns to the ROUTE category ('c1'), not null — Reset
      // must not filter the user out of the category page they're on.
      expect(onApply).toHaveBeenCalledWith(baseFilters)
    })

    it('shows resultCount when liveCount is not provided (unchanged default)', () => {
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      expect(getByText('Show 42 places')).toBeTruthy()
    })

    it('prefers liveCount over resultCount when provided', () => {
      const { getByText, queryByText } = render(
        <FilterSheet
          visible
          filters={defaultFilters}
          resultCount={42}
          onApply={jest.fn()}
          onDismiss={jest.fn()}
          liveCount={14}
        />,
      )
      expect(getByText('Show 14 places')).toBeTruthy()
      expect(queryByText('Show 42 places')).toBeNull()
    })

    it('falls back to resultCount when liveCount is explicitly null (no context to preview against yet)', () => {
      const { getByText } = render(
        <FilterSheet
          visible
          filters={defaultFilters}
          resultCount={42}
          onApply={jest.fn()}
          onDismiss={jest.fn()}
          liveCount={null}
        />,
      )
      expect(getByText('Show 42 places')).toBeTruthy()
    })

    it('reports every draft change via onDraftChange, including the initial sync', () => {
      const onDraftChange = jest.fn()
      const { getByText } = render(
        <FilterSheet
          visible
          filters={defaultFilters}
          resultCount={42}
          onApply={jest.fn()}
          onDismiss={jest.fn()}
          onDraftChange={onDraftChange}
        />,
      )
      expect(onDraftChange).toHaveBeenCalledWith(defaultFilters)
      onDraftChange.mockClear()
      fireEvent.press(getByText('Nearest'))
      expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'nearest' }))
    })
  })

  // Map Phase 2 W2b (F10) — visual redesign additions: per-section
  // selected summaries, "Show N places" footer copy, and the Open Now
  // chip-style toggle (all S5a mechanics preserved).
  describe('W2b redesign', () => {
    it('footer copy reads "Show N places" (not "results")', () => {
      const { getByText, queryByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={9} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      expect(getByText('Show 9 places')).toBeTruthy()
      expect(queryByText('Show 9 results')).toBeNull()
    })

    it('shows an "Any" section summary for each empty section', () => {
      const { getAllByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      // Category / Sort By / Voucher Type / Open Now all read "Any" when nothing is applied.
      expect(getAllByText('Any').length).toBeGreaterThanOrEqual(4)
    })

    it('summarises a selected voucher type as "1 selected" in its section header', () => {
      const filters: FilterState = { ...defaultFilters, voucherTypes: ['BOGO'] }
      const { getByText } = render(
        <FilterSheet visible filters={filters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      expect(getByText('1 selected')).toBeTruthy()
    })

    it('Open Now is a chip toggle: pressing "Open now" applies openNow=true (semantics preserved)', () => {
      const onApply = jest.fn()
      const { getByText } = render(
        <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
      )
      fireEvent.press(getByText('Open now'))
      fireEvent.press(getByText('Show 42 places'))
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ openNow: true }))
    })

    it('Open Now section summarises as "On" when active', () => {
      const filters: FilterState = { ...defaultFilters, openNow: true }
      const { getByText } = render(
        <FilterSheet visible filters={filters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
      )
      expect(getByText('On')).toBeTruthy()
    })
  })
})
