import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapEmptyArea } from '@/features/map/components/MapEmptyArea'

describe('MapEmptyArea', () => {
  it('renders viewport_empty copy + Re-centre CTA + fires onRecentre when pressed', () => {
    const onRecentre = jest.fn()
    const { getByText } = render(
      <MapEmptyArea variant="viewport_empty" onRecentre={onRecentre} hasFilters={false} />,
    )
    expect(getByText('No merchants in this area')).toBeTruthy()
    expect(getByText(/Try moving the map/)).toBeTruthy()
    fireEvent.press(getByText('Re-centre'))
    expect(onRecentre).toHaveBeenCalledTimes(1)
  })

  it('renders no_uk_supply copy + Re-centre CTA (Plan 4 M4.6 vocabulary-aligned)', () => {
    // Plan 4 M4.6 (2026-05-22) — copy alignment with PR #112 fixup-6.4
    // owner-locked vocabulary.  Pre-M4.6 title used "in the UK" + body
    // used em dash + "growing daily" framing; new copy avoids the
    // banned phrases.
    const { getByText, queryByText } = render(
      <MapEmptyArea variant="no_uk_supply" onRecentre={jest.fn()} hasFilters={false} />,
    )
    expect(getByText('No matches yet for this view')).toBeTruthy()
    expect(getByText('Try a different category, or clear filters to broaden the search.')).toBeTruthy()
    expect(getByText('Re-centre')).toBeTruthy()
    // Negative pins — banned vocabulary must NOT appear on the new copy.
    expect(queryByText(/in the UK yet/)).toBeNull()
    expect(queryByText(/growing daily/)).toBeNull()
    expect(queryByText(/—/)).toBeNull()
  })

  it('renders offshore copy + "Recentre to UK" CTA + fires onRecentre when pressed', () => {
    const onRecentre = jest.fn()
    const { getByText } = render(
      <MapEmptyArea variant="offshore" onRecentre={onRecentre} hasFilters={false} />,
    )
    expect(getByText('Map is outside the UK')).toBeTruthy()
    expect(getByText(/Redeemo is UK-only/)).toBeTruthy()
    fireEvent.press(getByText('Recentre to UK'))
    expect(onRecentre).toHaveBeenCalledTimes(1)
  })

  it('shows Clear Filters button when hasFilters=true and variant is viewport_empty', () => {
    const onClearFilters = jest.fn()
    const { getByText } = render(
      <MapEmptyArea
        variant="viewport_empty"
        onRecentre={jest.fn()}
        onClearFilters={onClearFilters}
        hasFilters={true}
      />,
    )
    expect(getByText('Clear Filters')).toBeTruthy()
    fireEvent.press(getByText('Clear Filters'))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('shows Clear Filters button when hasFilters=true and variant is no_uk_supply', () => {
    const { getByText } = render(
      <MapEmptyArea
        variant="no_uk_supply"
        onRecentre={jest.fn()}
        onClearFilters={jest.fn()}
        hasFilters={true}
      />,
    )
    expect(getByText('Clear Filters')).toBeTruthy()
  })

  it('does NOT show Clear Filters when offshore (offshore CTA only re-centres to UK)', () => {
    const { queryByText } = render(
      <MapEmptyArea
        variant="offshore"
        onRecentre={jest.fn()}
        onClearFilters={jest.fn()}
        hasFilters={true}
      />,
    )
    expect(queryByText('Clear Filters')).toBeNull()
  })

  it('does NOT show Clear Filters when hasFilters=false', () => {
    const { queryByText } = render(
      <MapEmptyArea
        variant="viewport_empty"
        onRecentre={jest.fn()}
        onClearFilters={jest.fn()}
        hasFilters={false}
      />,
    )
    expect(queryByText('Clear Filters')).toBeNull()
  })

  it('does NOT show Clear Filters when onClearFilters is not provided', () => {
    const { queryByText } = render(
      <MapEmptyArea variant="viewport_empty" onRecentre={jest.fn()} hasFilters={true} />,
    )
    expect(queryByText('Clear Filters')).toBeNull()
  })
})
