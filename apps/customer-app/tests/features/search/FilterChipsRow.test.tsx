import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FilterChipsRow } from '@/features/search/components/FilterChipsRow'
import { EMPTY_FILTERS, type FilterState } from '@/features/search/components/FilterSheet'
import type { Category } from '@/lib/api/discovery'

const categories: Category[] = [
  { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: null, pinIcon: null, parentId: null, intentType: 'LOCAL' },
  { id: 's1', name: 'Italian', iconUrl: null, pinColour: null, pinIcon: null, parentId: 'c1' },
]
const amenities = [{ id: 'a1', name: 'Wi-Fi' }]

describe('FilterChipsRow', () => {
  it('renders nothing when no filter differs from EMPTY_FILTERS', () => {
    const { toJSON } = render(
      <FilterChipsRow filters={EMPTY_FILTERS} categories={categories} onChange={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('renders a category chip with the resolved category name', () => {
    const filters: FilterState = { ...EMPTY_FILTERS, categoryId: 'c1' }
    const { getByText } = render(
      <FilterChipsRow filters={filters} categories={categories} onChange={jest.fn()} />,
    )
    expect(getByText('Food & Drink')).toBeTruthy()
  })

  it('omits the category chip when categoryId matches baseFilters (route category)', () => {
    const routeBase: FilterState = { ...EMPTY_FILTERS, categoryId: 'c1' }
    const { queryByText, toJSON } = render(
      <FilterChipsRow filters={routeBase} baseFilters={routeBase} categories={categories} onChange={jest.fn()} />,
    )
    expect(queryByText('Food & Drink')).toBeNull()
    expect(toJSON()).toBeNull()
  })

  it('shows a subcategory chip when drilled below the route base category', () => {
    const routeBase: FilterState = { ...EMPTY_FILTERS, categoryId: 'c1' }
    const filters: FilterState = { ...routeBase, categoryId: 's1' }
    const { getByText, queryByText } = render(
      <FilterChipsRow filters={filters} baseFilters={routeBase} categories={categories} onChange={jest.fn()} />,
    )
    expect(getByText('Italian')).toBeTruthy()
    expect(queryByText('Food & Drink')).toBeNull()
  })

  it('renders sort / voucherType / amenity / openNow chips', () => {
    const filters: FilterState = {
      categoryId: null, sortBy: 'nearest', voucherTypes: ['BOGO'], amenityIds: ['a1'], openNow: true,
    }
    const { getByText } = render(
      <FilterChipsRow filters={filters} categories={categories} amenities={amenities} onChange={jest.fn()} />,
    )
    expect(getByText('Sort: Nearest')).toBeTruthy()
    expect(getByText('BOGO')).toBeTruthy()
    expect(getByText('Wi-Fi')).toBeTruthy()
    expect(getByText('Open now')).toBeTruthy()
  })

  it('tapping a chip removes ONLY that filter', () => {
    const onChange = jest.fn()
    const filters: FilterState = { ...EMPTY_FILTERS, sortBy: 'nearest', openNow: true }
    const { getByText } = render(
      <FilterChipsRow filters={filters} categories={categories} onChange={onChange} />,
    )
    fireEvent.press(getByText('Sort: Nearest'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'relevance', openNow: true }))
  })

  it('"Clear all" appears only with 2+ active filters and resets everything to base', () => {
    const onChange = jest.fn()
    const single: FilterState = { ...EMPTY_FILTERS, openNow: true }
    const { queryByText: queryOne } = render(
      <FilterChipsRow filters={single} categories={categories} onChange={jest.fn()} />,
    )
    expect(queryOne('Clear all')).toBeNull()

    const multiple: FilterState = { ...EMPTY_FILTERS, openNow: true, sortBy: 'nearest' }
    const { getByText } = render(
      <FilterChipsRow filters={multiple} categories={categories} onChange={onChange} />,
    )
    fireEvent.press(getByText('Clear all'))
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS)
  })
})
