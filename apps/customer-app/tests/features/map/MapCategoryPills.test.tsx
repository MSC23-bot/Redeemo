import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapCategoryPills } from '@/features/map/components/MapCategoryPills'
import type { Category } from '@/lib/api/discovery'

// Map Phase 2 S5a (GRILL Q4) — tap-to-reveal subcategory drill-down.
const categories: Category[] = [
  { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, parentId: null, intentType: 'LOCAL' },
  { id: 'c2', name: 'Beauty',       iconUrl: null, pinColour: '#E91E8C', pinIcon: null, parentId: null, intentType: 'LOCAL' },
  { id: 's1', name: 'Italian',      iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
  { id: 's2', name: 'Pizza',        iconUrl: null, pinColour: null,      pinIcon: null, parentId: 'c1' },
]

describe('MapCategoryPills — subcategory drill-down (GRILL Q4)', () => {
  it('map stays clean at rest: no second row when nothing is selected', () => {
    const { queryByText, queryByLabelText } = render(
      <MapCategoryPills categories={categories} activeId={null} onSelect={jest.fn()} />,
    )
    expect(queryByText('Italian')).toBeNull()
    expect(queryByLabelText('All Food & Drink')).toBeNull()
  })

  it('no second row for a top-level with zero children (Beauty)', () => {
    const { queryByLabelText } = render(
      <MapCategoryPills categories={categories} activeId="c2" onSelect={jest.fn()} />,
    )
    expect(queryByLabelText('All Beauty')).toBeNull()
  })

  it('selecting a parent with children reveals its subcategory row', () => {
    const { getByText, getByLabelText } = render(
      <MapCategoryPills categories={categories} activeId="c1" onSelect={jest.fn()} />,
    )
    expect(getByText('Italian')).toBeTruthy()
    expect(getByText('Pizza')).toBeTruthy()
    expect(getByLabelText('All Food & Drink')).toBeTruthy()
  })

  it('a subcategory selection (activeId is a CHILD id) still highlights the parent pill and shows the row', () => {
    const { getByLabelText, getByText } = render(
      <MapCategoryPills categories={categories} activeId="s1" onSelect={jest.fn()} />,
    )
    // Parent pill reads "selected" — walks parentId to resolve the top-level.
    expect(getByLabelText('Food & Drink').props.accessibilityState.selected).toBe(true)
    expect(getByText('Pizza')).toBeTruthy() // row is open
    expect(getByLabelText('Italian').props.accessibilityState.selected).toBe(true)
  })

  it('tapping a child calls onSelect with the child id', () => {
    const onSelect = jest.fn()
    const { getByText } = render(
      <MapCategoryPills categories={categories} activeId="c1" onSelect={onSelect} />,
    )
    fireEvent.press(getByText('Italian'))
    expect(onSelect).toHaveBeenCalledWith('s1')
  })

  it('tapping "All <Parent>" calls onSelect with the parent id (widen back)', () => {
    const onSelect = jest.fn()
    const { getByLabelText } = render(
      <MapCategoryPills categories={categories} activeId="s1" onSelect={onSelect} />,
    )
    fireEvent.press(getByLabelText('All Food & Drink'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('tapping the top-level pill again still calls onSelect(cat.id) — the parent screen owns tap-same-clears semantics', () => {
    const onSelect = jest.fn()
    const { getByText } = render(
      <MapCategoryPills categories={categories} activeId="c1" onSelect={onSelect} />,
    )
    fireEvent.press(getByText('Food & Drink'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('the "All" (clear) pill still calls onSelect(null)', () => {
    const onSelect = jest.fn()
    const { getByLabelText } = render(
      <MapCategoryPills categories={categories} activeId="c1" onSelect={onSelect} />,
    )
    fireEvent.press(getByLabelText('All categories'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('renders top-level categories only in the primary row', () => {
    const { getByText, queryByText } = render(
      <MapCategoryPills categories={categories} activeId={null} onSelect={jest.fn()} />,
    )
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
    expect(queryByText('Italian')).toBeNull()
  })
})
