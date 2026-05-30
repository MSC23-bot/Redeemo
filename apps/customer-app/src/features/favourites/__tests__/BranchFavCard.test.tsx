/**
 * Phase 3C.1g M2.5 + Device-QA R1 Wave 3 (2026-05-30) finding #20 —
 * `<BranchFavCard>` v1 visual upgrade.
 *
 * Pins:
 *   - Renders the banner image when merchant.bannerUrl is present.
 *   - Falls back to the brand-gradient banner when bannerUrl is null.
 *   - Renders the merchant logo OR an initial fallback when logoUrl is null.
 *   - Merchant name + cuisine/category line + area line are visible.
 *   - Rating chip surfaces when avgRating + reviewCount are present.
 *   - Status pill: "Open now" / "Closed" / "Unavailable" (precedence on
 *     isUnavailable).
 *   - Voucher count pill + "Save up to £X" pill surface when the
 *     payload has them.
 *   - Tap fires onPress.
 *   - Visible Trash button (Device-QA R1 Wave 2) — bubbles onRemove,
 *     not onPress; accessibility label names the merchant.
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

describe('BranchFavCard — body content', () => {
  it('renders merchant name + cuisine/category + area line + open pill', () => {
    const { getByText, getByLabelText } = render(
      <BranchFavCard row={makeRow()} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Iron Forge Gym')).toBeTruthy()
    expect(getByText('Gym')).toBeTruthy()                       // cuisine/category
    expect(getByText(/Marsden, HD7 6EZ/)).toBeTruthy()           // area line
    expect(getByText('Open now')).toBeTruthy()
    // a11y label combines merchant + branch subtitle + status + voucher count
    expect(
      getByLabelText('Iron Forge Gym, Iron Forge Gym — Marsden. Open now. 3 vouchers.'),
    ).toBeTruthy()
  })

  it('omits the area line when city + postcode are both null', () => {
    const { queryByText } = render(
      <BranchFavCard row={makeRow({ city: null, postcode: null })} onPress={jest.fn()} testID="card" />
    )
    // Pre-Wave-3 the card rendered the literal "Location unavailable"
    // fallback string.  The Wave-3 card simply omits the area line when
    // both fields are missing.
    expect(queryByText('Location unavailable')).toBeNull()
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
})

describe('BranchFavCard — banner + logo (Wave 3 §20)', () => {
  it('renders the brand-gradient fallback banner when merchant.bannerUrl is null', () => {
    const { getByTestId, queryByTestId } = render(
      <BranchFavCard row={makeRow()} onPress={jest.fn()} testID="card" />
    )
    expect(getByTestId('card-banner-gradient')).toBeTruthy()
    expect(queryByTestId('card-banner-image')).toBeNull()
  })

  it('renders the banner image when merchant.bannerUrl is set', () => {
    const { getByTestId, queryByTestId } = render(
      <BranchFavCard
        row={makeRow({ merchant: { ...makeRow().merchant, bannerUrl: 'https://cdn.example/banner.jpg' } })}
        onPress={jest.fn()}
        testID="card"
      />
    )
    expect(getByTestId('card-banner-image')).toBeTruthy()
    expect(queryByTestId('card-banner-gradient')).toBeNull()
  })

  it('handles null logoUrl by rendering a brand-rose initial fallback', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ merchant: { ...makeRow().merchant, logoUrl: null } })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('I')).toBeTruthy()  // initial of "Iron Forge Gym"
  })
})

describe('BranchFavCard — pills (Wave 3 §20)', () => {
  it('renders the voucher count pill when voucherCount > 0', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ voucherCount: 5 })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('5 vouchers')).toBeTruthy()
  })

  it('renders singular "1 voucher" when voucherCount === 1', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ voucherCount: 1 })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('1 voucher')).toBeTruthy()
  })

  it('omits the voucher count pill when voucherCount === 0', () => {
    const { queryByText } = render(
      <BranchFavCard row={makeRow({ voucherCount: 0 })} onPress={jest.fn()} testID="card" />
    )
    expect(queryByText(/voucher/)).toBeNull()
  })

  it('renders the "Save up to £X" pill when maxEstimatedSaving > 0 (whole pounds drop .00)', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ maxEstimatedSaving: 25 })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Save up to £25')).toBeTruthy()
  })

  it('renders pennies on the saving pill when not whole pounds', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ maxEstimatedSaving: 12.5 })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('Save up to £12.50')).toBeTruthy()
  })

  it('omits the saving pill when maxEstimatedSaving === 0', () => {
    const { queryByText } = render(
      <BranchFavCard row={makeRow({ maxEstimatedSaving: 0 })} onPress={jest.fn()} testID="card" />
    )
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('renders rating chip when avgRating + reviewCount > 0 are both present', () => {
    const { getByText } = render(
      <BranchFavCard row={makeRow({ avgRating: 4.5, reviewCount: 8 })} onPress={jest.fn()} testID="card" />
    )
    expect(getByText('4.5 (8)')).toBeTruthy()
  })

  it('omits the rating chip when avgRating is null', () => {
    const { queryByText } = render(
      <BranchFavCard row={makeRow({ avgRating: null, reviewCount: 0 })} onPress={jest.fn()} testID="card" />
    )
    expect(queryByText(/\(\d+\)/)).toBeNull()
  })
})

describe('BranchFavCard — interactions', () => {
  it('press calls onPress', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <BranchFavCard row={makeRow()} onPress={onPress} testID="card" />
    )
    fireEvent.press(getByTestId('card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // §R2 — Device-QA R1 Wave 2 (2026-05-30) — visible Remove button.
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
