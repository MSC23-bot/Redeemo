/**
 * Phase 3C.1g M2.5 — `<BranchFavCard>` snapshot of states + tap.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchFavCard } from '../components/BranchFavCard'
import type { FavouriteBranchItem } from '@/lib/api/favourites'

function makeRow(overrides: Partial<FavouriteBranchItem> = {}): FavouriteBranchItem {
  const base: FavouriteBranchItem = {
    id:                 'br-1',
    name:               'Iron Forge Gym — Marsden',
    isMainBranch:       true,
    addressLine1:       '1 Test St',
    addressLine2:       null,
    city:               'Marsden',
    postcode:           'HD7 6EZ',
    latitude:           53.6,
    longitude:          -1.9,
    locationConfidence: 'MANUALLY_CONFIRMED',
    merchant: {
      id:              'm-1',
      businessName:    'Iron Forge Gym',
      tradingName:     null,
      logoUrl:         null,
      bannerUrl:       null,
      status:          'ACTIVE',
      primaryCategory: { id: 'cat-1', name: 'Gym' },
    },
    voucherCount:       3,
    maxEstimatedSaving: 25,
    avgRating:          4.2,
    reviewCount:        17,
    isOpen:             true,
    isUnavailable:      false,
    favouritedAt:       '2026-05-29T10:00:00.000Z',
  }
  return { ...base, ...overrides }
}

describe('BranchFavCard', () => {
  it('renders merchant name + branch name + Open pill when isOpen=true', () => {
    const { getByText, getByLabelText } = render(
      <BranchFavCard row={makeRow()} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Iron Forge Gym')).toBeTruthy()
    expect(getByText('Iron Forge Gym — Marsden')).toBeTruthy()
    expect(getByText('Open now')).toBeTruthy()
    // a11y label combines merchant + branch + status
    expect(
      getByLabelText('Iron Forge Gym, Iron Forge Gym — Marsden. Open now. 3 vouchers.'),
    ).toBeTruthy()
  })

  it('renders Closed pill when isOpen=false (and not unavailable)', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ isOpen: false })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Closed')).toBeTruthy()
  })

  it('renders Unavailable pill when isUnavailable=true (precedence over isOpen)', () => {
    const { getByText } = render(
      <BranchFavCard
        row={makeRow({ isUnavailable: true, isOpen: true })}
        onPress={jest.fn()}
        testID="card"
      />
    )
    expect(getByText('Unavailable')).toBeTruthy()
  })

  it('press calls onPress', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <BranchFavCard row={makeRow()} onPress={onPress} testID="card" />
    )
    fireEvent.press(getByTestId('card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('handles null logoUrl by rendering a brand-rose initial fallback', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ merchant: { ...makeRow().merchant, logoUrl: null } })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('I')).toBeTruthy()  // initial of "Iron Forge Gym"
  })

  it('handles missing city/postcode by surfacing the fallback string', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ city: null, postcode: null })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Location unavailable')).toBeTruthy()
  })

  // §R2 — Device-QA R1 Wave 2 (2026-05-30) — visible Remove button.
  // Replaces the deleted SwipeToRemove gesture.  When `onRemove` is
  // passed, a Trash icon button is rendered at the top-right; tapping
  // it fires `onRemove` without bubbling to the card's `onPress`.
  describe('§R2 — visible Remove button', () => {
    it('renders the Remove button only when onRemove is provided', () => {
      const { queryByTestId, rerender } = render(
        <BranchFavCard row={makeRow()} onPress={jest.fn()} testID="card" />
      )
      expect(queryByTestId('card-remove')).toBeNull()

      rerender(<BranchFavCard row={makeRow()} onPress={jest.fn()} onRemove={jest.fn()} testID="card" />)
      expect(queryByTestId('card-remove')).toBeTruthy()
    })

    it('Remove button press calls onRemove (not onPress)', () => {
      const onPress  = jest.fn()
      const onRemove = jest.fn()
      const { getByTestId } = render(
        <BranchFavCard row={makeRow()} onPress={onPress} onRemove={onRemove} testID="card" />
      )
      fireEvent.press(getByTestId('card-remove'))
      expect(onRemove).toHaveBeenCalledTimes(1)
      expect(onPress).not.toHaveBeenCalled()
    })

    it('Remove button accessibility label names the merchant', () => {
      const { getByLabelText } = render(
        <BranchFavCard row={makeRow()} onPress={jest.fn()} onRemove={jest.fn()} testID="card" />
      )
      expect(getByLabelText('Remove Iron Forge Gym from favourites')).toBeTruthy()
    })
  })
})
