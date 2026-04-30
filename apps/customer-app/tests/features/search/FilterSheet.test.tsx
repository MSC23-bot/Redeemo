import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FilterSheet, FilterState } from '@/features/search/components/FilterSheet'

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

  it('renders sort options', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Relevance')).toBeTruthy()
    expect(getByText('Nearest')).toBeTruthy()
    expect(getByText('Top Rated')).toBeTruthy()
    expect(getByText('Highest Saving')).toBeTruthy()
  })

  it('renders apply button with result count', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(getByText('Show 42 results')).toBeTruthy()
  })

  it('calls onApply with updated filters when applied', () => {
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />,
    )
    fireEvent.press(getByText('Nearest'))
    fireEvent.press(getByText('Show 42 results'))
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
    fireEvent.press(getByText('Show 42 results'))
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
    fireEvent.press(getByText('Show 42 results'))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'c2', amenityIds: [] }),
    )
  })

  it('does NOT include Distance or Min Savings sections (deferred to Plan 2)', () => {
    const { queryByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />,
    )
    expect(queryByText(/Distance/i)).toBeNull()
    expect(queryByText(/Min\.?\s?Savings/i)).toBeNull()
  })
})
