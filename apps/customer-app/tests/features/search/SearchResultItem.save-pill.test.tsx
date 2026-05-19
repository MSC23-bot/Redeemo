// PR #112 device-QA fixup-4 (2026-05-19) — save badge anatomy pin.
//
// Owner-locked state machine — hierarchy is now SAVING-FIRST (the
// commercial hook); voucher count is secondary context.  Copy is
// vouchers-language ("voucher" / "vouchers"), never "offer(s)".
//
//   voucherCount === 0                              → badge hidden.
//   voucherCount === 1 + maxEstimatedSaving > 0     → "Save up to £X.XX" + "1 voucher"
//   voucherCount === 1 + maxEstimatedSaving null/0  → "1 voucher" only
//   voucherCount >= 2 + totalEstimatedSaving > 0    → "Save £X.XX"      + "across N vouchers"
//   voucherCount >= 2 + totalEstimatedSaving null/0 → "N vouchers" only
//
// Locked NEGATIVE pins (must NOT appear anywhere on the badge):
//   - "Save £X" pattern is ALLOWED (locked copy); "Save £X off" / "Save £X.XX off" prior
//     wording is NOT.
//   - "total value"   (fixup-3 wording)
//   - "offers" / "offer" (any-fixup wording)
//   - "Up to £X off"  (fixup-2 single-line wording)

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — save badge anatomy (PR #112 fixup-4)', () => {
  describe('2+ vouchers — primary "Save £X" + secondary "across N vouchers"', () => {
    it('6 vouchers + totalEstimatedSaving=38.5 → "Save £38.50" + "across 6 vouchers"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm1', businessName: 'Pizza Express',
          voucherCount: 6, maxEstimatedSaving: 8.5, totalEstimatedSaving: 38.5,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save £38.50')).toBeTruthy()
      expect(getByText('across 6 vouchers')).toBeTruthy()
      // Negative pins — old wording must NOT leak.
      expect(queryByText(/offers?/i)).toBeNull()
      expect(queryByText(/total value/i)).toBeNull()
      expect(queryByText(/Up to £/)).toBeNull()
    })

    it('2 vouchers + totalEstimatedSaving=13.5 → "Save £13.50" + "across 2 vouchers"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm2', businessName: 'Two Voucher Co',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: 13.5,
        },
      })
      const { getByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save £13.50')).toBeTruthy()
      expect(getByText('across 2 vouchers')).toBeTruthy()
    })

    it('10 vouchers + totalEstimatedSaving=99.5 → "Save £99.50" + "across 10 vouchers"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm3', businessName: 'Big Chain',
          voucherCount: 10, maxEstimatedSaving: 12, totalEstimatedSaving: 99.5,
        },
      })
      const { getByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save £99.50')).toBeTruthy()
      expect(getByText('across 10 vouchers')).toBeTruthy()
    })

    it('GBP two-decimal contract: 3 vouchers + totalSaving=24 → "Save £24.00" + "across 3 vouchers"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm4', businessName: 'Whole Pound Total',
          voucherCount: 3, maxEstimatedSaving: 8, totalEstimatedSaving: 24,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save £24.00')).toBeTruthy()
      expect(getByText('across 3 vouchers')).toBeTruthy()
      expect(queryByText('Save £24')).toBeNull() // 2dp contract
    })

    it('2 vouchers + totalEstimatedSaving=null → single-line "2 vouchers" (no saving headline)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm5', businessName: 'No Total Available',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: null,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('2 vouchers')).toBeTruthy()
      // No "Save £" line when total is null/0 — we do NOT fall back to max for the 2+ case.
      expect(queryByText(/Save £/)).toBeNull()
      expect(queryByText(/across/)).toBeNull()
    })

    it('2 vouchers + totalEstimatedSaving=0 → single-line "2 vouchers" (zero suppresses headline)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm6', businessName: 'Zero Total',
          voucherCount: 2, maxEstimatedSaving: 8.5, totalEstimatedSaving: 0,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('2 vouchers')).toBeTruthy()
      expect(queryByText(/Save £/)).toBeNull()
    })
  })

  describe('1 voucher — primary "Save up to £X" + secondary "1 voucher"', () => {
    it('1 voucher + maxEstimatedSaving=5.5 → "Save up to £5.50" + "1 voucher"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm7', businessName: 'Single Voucher Co',
          voucherCount: 1, maxEstimatedSaving: 5.5, totalEstimatedSaving: 5.5,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save up to £5.50')).toBeTruthy()
      expect(getByText('1 voucher')).toBeTruthy()
      // Negative pins
      expect(queryByText(/offer/i)).toBeNull()
      expect(queryByText(/total value/i)).toBeNull()
      expect(queryByText(/across/)).toBeNull()
      expect(queryByText('1 vouchers')).toBeNull()    // pluralisation guard
    })

    it('1 voucher + maxEstimatedSaving=10 → "Save up to £10.00" + "1 voucher" (2dp on whole-pound)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm8', businessName: 'Whole Pound Single',
          voucherCount: 1, maxEstimatedSaving: 10, totalEstimatedSaving: 10,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('Save up to £10.00')).toBeTruthy()
      expect(getByText('1 voucher')).toBeTruthy()
      expect(queryByText('Save up to £10')).toBeNull()
    })

    it('1 voucher + maxEstimatedSaving=null → single-line "1 voucher" only', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm9', businessName: 'Single No Saving',
          voucherCount: 1, maxEstimatedSaving: null, totalEstimatedSaving: null,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 voucher')).toBeTruthy()
      expect(queryByText(/Save/)).toBeNull()
    })

    it('1 voucher + maxEstimatedSaving=0 → single-line "1 voucher"', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm10', businessName: 'Zero Single',
          voucherCount: 1, maxEstimatedSaving: 0, totalEstimatedSaving: 0,
        },
      })
      const { getByText, queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(getByText('1 voucher')).toBeTruthy()
      expect(queryByText(/Save/)).toBeNull()
    })
  })

  describe('0 vouchers — badge hidden entirely', () => {
    it('voucherCount=0 + all savings null → badge hidden', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm11', businessName: 'No Vouchers',
          voucherCount: 0, maxEstimatedSaving: null, totalEstimatedSaving: null,
        },
      })
      const { queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(queryByText(/voucher/)).toBeNull()
      expect(queryByText(/Save/)).toBeNull()
      expect(queryByText(/offer/i)).toBeNull()
    })

    it('voucherCount=0 + savings non-null → STILL hidden (count drives badge)', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm12', businessName: 'Saving But No Vouchers',
          voucherCount: 0, maxEstimatedSaving: 8.5, totalEstimatedSaving: 8.5,
        },
      })
      const { queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(queryByText(/voucher/)).toBeNull()
      expect(queryByText(/Save/)).toBeNull()
    })
  })

  describe('regression — banned legacy strings', () => {
    it('"Save £X off" / "Save £X.XX off" prior wording must NOT appear anywhere', () => {
      const tile = makeBranchTile({
        merchant: {
          id: 'm13', businessName: 'Comprehensive',
          voucherCount: 5, maxEstimatedSaving: 8.5, totalEstimatedSaving: 42.5,
        },
      })
      const { queryByText } = render(
        <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
      )
      expect(queryByText(/Save £[\d.]+\s+off/)).toBeNull()
      expect(queryByText(/offer/i)).toBeNull()
      expect(queryByText(/total value/i)).toBeNull()
      expect(queryByText(/Up to £/)).toBeNull()
    })
  })
})
