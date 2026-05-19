// PR #112 device-QA fix (2026-05-19) — save-pill anatomy pin.
//
// Owner screenshot evidence: the previous single-line "Save £8.5" pill
// dropped the second decimal AND surfaced a £-value without explaining
// what the user gets in return ("save what? from where?").  Locked
// anatomy:
//
//   voucherCount === 0  → pill hidden entirely.
//   voucherCount > 0 + maxEstimatedSaving > 0 →
//     line 1: "Up to £8.50 off"  (locked wording — NEVER "Save £X.XX")
//     line 2: "2 offers" / "1 offer"
//   voucherCount > 0 + maxEstimatedSaving null/0 →
//     line 1: "2 offers" (or "1 offer") only — no upper line.
//
// Negative pins guard against regression to "Save £X.XX" wording.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — save pill anatomy (PR #112)', () => {
  it('stacked pill: voucherCount=2 + maxSaving=8.5 → "Up to £8.50 off" + "2 offers"', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm1', businessName: 'Pizza Express',
        voucherCount: 2, maxEstimatedSaving: 8.5,
      },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Up to £8.50 off')).toBeTruthy()
    expect(getByText('2 offers')).toBeTruthy()
    // Negative pins — regressed wording must NOT appear.
    expect(queryByText(/Save £/)).toBeNull()
    expect(queryByText('Up to £8.5 off')).toBeNull()    // missing 2nd decimal
  })

  it('singular: voucherCount=1 + maxSaving=10 → "Up to £10.00 off" + "1 offer"', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm2', businessName: 'Single Offer Co',
        voucherCount: 1, maxEstimatedSaving: 10,
      },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Up to £10.00 off')).toBeTruthy()
    expect(getByText('1 offer')).toBeTruthy()
    expect(queryByText('1 offers')).toBeNull()
  })

  it('voucherCount=2 + maxSaving=null → single line "2 offers" only', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm3', businessName: 'No Saving Specified',
        voucherCount: 2, maxEstimatedSaving: null,
      },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('2 offers')).toBeTruthy()
    // No "Up to" line at all.
    expect(queryByText(/Up to £/)).toBeNull()
  })

  it('voucherCount=2 + maxSaving=0 → single line "2 offers" only (0 saving = no upper line)', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm4', businessName: 'Zero Saving',
        voucherCount: 2, maxEstimatedSaving: 0,
      },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('2 offers')).toBeTruthy()
    expect(queryByText(/Up to £/)).toBeNull()
  })

  it('voucherCount=0 → pill hidden entirely (no save / no offers)', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm5', businessName: 'No Vouchers',
        voucherCount: 0, maxEstimatedSaving: null,
      },
    })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText(/Up to £/)).toBeNull()
    expect(queryByText(/offer/)).toBeNull()
    expect(queryByText(/Save £/)).toBeNull()
  })

  it('voucherCount=0 + maxSaving=8.5 → STILL hidden (no vouchers = no pill, even if a saving figure exists)', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm6', businessName: 'Saving But No Vouchers',
        voucherCount: 0, maxEstimatedSaving: 8.5,
      },
    })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    // voucherCount drives the pill — saving figure alone is not enough.
    expect(queryByText(/Up to £/)).toBeNull()
    expect(queryByText(/offer/)).toBeNull()
  })

  it('GBP two-decimal contract: voucherCount=3 + maxSaving=8 → "Up to £8.00 off" (whole-pound 2dp)', () => {
    const tile = makeBranchTile({
      merchant: {
        id: 'm7', businessName: 'Whole Pound',
        voucherCount: 3, maxEstimatedSaving: 8,
      },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Up to £8.00 off')).toBeTruthy()
    expect(queryByText('Up to £8 off')).toBeNull()
  })
})
