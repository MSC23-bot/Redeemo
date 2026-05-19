// PR #112 device-QA fixup-3 (2026-05-19) — save-pill anatomy pin.
//
// Owner-locked state machine (hierarchy reversed from fixup-2 — count is
// now PRIMARY, value is SECONDARY; multi-offer merchants surface TOTAL
// value across all active vouchers instead of the misleading max-single
// saving):
//
//   voucherCount === 0                              → pill hidden.
//   voucherCount === 1 + maxEstimatedSaving > 0     → "1 offer" + "Up to £X.XX off"
//   voucherCount === 1 + maxEstimatedSaving null/0  → "1 offer" only
//   voucherCount >= 2 + totalEstimatedSaving > 0    → "N offers" + "£X.XX total value"
//   voucherCount >= 2 + totalEstimatedSaving null/0 → "N offers" only
//
// Backend additive `merchant.totalEstimatedSaving` drives the multi-offer
// secondary line.  `maxEstimatedSaving` continues to feed the 1-offer
// path unchanged.  Negative pins guard against regression to "Save £" or
// "Up to £X off" wording for the 2+ case.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — save pill anatomy (PR #112 fixup-3)', () => {
  describe('2+ offers — primary "N offers" + secondary "£X.XX total value"', () => {
    it('2 offers + totalEstimatedSaving=13.5 → "2 offers" + "£13.50 total value"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm1', businessName: 'Pizza Express',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: 13.5,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('2 offers')).toBeTruthy()
      expect(getByText('£13.50 total value')).toBeTruthy()
      // Negative pins — 1-offer wording must NOT leak into the 2+ case.
      expect(queryByText(/Up to £/)).toBeNull()
      expect(queryByText(/Save £/)).toBeNull()
    })

    it('10 offers + totalEstimatedSaving=99.5 → "10 offers" + "£99.50 total value"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm2', businessName: 'Big Chain',
          voucherCount: 10, maxEstimatedSaving: 12, totalEstimatedSaving: 99.5,
        },
      })
      const { getByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('10 offers')).toBeTruthy()
      expect(getByText('£99.50 total value')).toBeTruthy()
    })

    it('GBP two-decimal contract: 3 offers + totalSaving=24 → "3 offers" + "£24.00 total value"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm3', businessName: 'Whole Pound Total',
          voucherCount: 3, maxEstimatedSaving: 8, totalEstimatedSaving: 24,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('3 offers')).toBeTruthy()
      expect(getByText('£24.00 total value')).toBeTruthy()
      expect(queryByText('£24 total value')).toBeNull()
    })

    it('2 offers + totalEstimatedSaving=null → single-line "2 offers" (no total-value line)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm4', businessName: 'No Total Available',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: null,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('2 offers')).toBeTruthy()
      // No total-value line, AND no "Up to £" line (which is a 1-offer-only treatment).
      expect(queryByText(/total value/)).toBeNull()
      expect(queryByText(/Up to £/)).toBeNull()
    })

    it('2 offers + totalEstimatedSaving=0 → single-line "2 offers" (zero saving suppresses line)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm5', businessName: 'Zero Total',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: 0,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('2 offers')).toBeTruthy()
      expect(queryByText(/total value/)).toBeNull()
    })
  })

  describe('1 offer — primary "1 offer" + secondary "Up to £X.XX off"', () => {
    it('1 offer + maxEstimatedSaving=5.5 → "1 offer" + "Up to £5.50 off"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm6', businessName: 'Single Offer Co',
          voucherCount: 1, maxEstimatedSaving: 5.5, totalEstimatedSaving: 5.5,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 offer')).toBeTruthy()
      expect(getByText('Up to £5.50 off')).toBeTruthy()
      // Negative pins — 2+ wording must NOT leak into the 1-offer case.
      expect(queryByText(/total value/)).toBeNull()
      expect(queryByText(/Save £/)).toBeNull()
    })

    it('1 offer + maxEstimatedSaving=10 → "1 offer" + "Up to £10.00 off"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm7', businessName: 'Whole Pound Single',
          voucherCount: 1, maxEstimatedSaving: 10, totalEstimatedSaving: 10,
        },
      })
      const { getByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 offer')).toBeTruthy()
      expect(getByText('Up to £10.00 off')).toBeTruthy()
    })

    it('1 offer + maxEstimatedSaving=null → single-line "1 offer" only', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm8', businessName: 'Single No Saving',
          voucherCount: 1, maxEstimatedSaving: null, totalEstimatedSaving: null,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 offer')).toBeTruthy()
      expect(queryByText(/Up to £/)).toBeNull()
      expect(queryByText(/total value/)).toBeNull()
    })

    it('1 offer + maxEstimatedSaving=0 → single-line "1 offer" (zero suppresses line)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm9', businessName: 'Zero Single',
          voucherCount: 1, maxEstimatedSaving: 0, totalEstimatedSaving: 0,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 offer')).toBeTruthy()
      expect(queryByText(/Up to £/)).toBeNull()
    })
  })

  describe('0 offers — pill hidden entirely', () => {
    it('voucherCount=0 + all savings null → pill hidden', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm10', businessName: 'No Vouchers',
          voucherCount: 0, maxEstimatedSaving: null, totalEstimatedSaving: null,
        },
      })
      const { queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(queryByText(/offer/)).toBeNull()
      expect(queryByText(/total value/)).toBeNull()
      expect(queryByText(/Up to £/)).toBeNull()
      expect(queryByText(/Save £/)).toBeNull()
    })

    it('voucherCount=0 + max/total non-null → STILL hidden (count drives pill, not savings)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm11', businessName: 'Saving But No Vouchers',
          voucherCount: 0, maxEstimatedSaving: 8.5, totalEstimatedSaving: 8.5,
        },
      })
      const { queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(queryByText(/offer/)).toBeNull()
      expect(queryByText(/total value/)).toBeNull()
      expect(queryByText(/Up to £/)).toBeNull()
    })
  })

  // Regression guard — never let "Save £X.XX" creep back in.
  it('regression: "Save £" wording never appears in any state', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm12', businessName: 'Comprehensive',
        voucherCount: 5, maxEstimatedSaving: 8.5, totalEstimatedSaving: 42.5,
      },
    })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText(/Save £/)).toBeNull()
  })
})
