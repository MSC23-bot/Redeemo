import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FilterSheet, FilterState } from '@/features/search/components/FilterSheet'

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null, subcategories: [{ id: 'sc1', name: 'Pizza' }] },
      { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
    ] },
    isLoading: false,
  }),
}))

const defaultFilters: FilterState = {
  categoryId: null,
  subcategoryId: null,
  sortBy: 'relevance',
  voucherTypes: [],
  maxDistanceMiles: 10,
  minSaving: 0,
  amenityIds: [],
  openNow: false,
}

describe('FilterSheet', () => {
  it('renders sort options', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />
    )
    expect(getByText('Relevance')).toBeTruthy()
    expect(getByText('Nearest')).toBeTruthy()
  })

  it('renders apply button with result count', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />
    )
    expect(getByText('Show 42 results')).toBeTruthy()
  })

  it('calls onApply with updated filters when applied', () => {
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />
    )
    fireEvent.press(getByText('Nearest'))
    fireEvent.press(getByText('Show 42 results'))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'nearest' }))
  })
})
