// PR #112 fixup-4 (2026-05-19) — proximity moves OFF the standalone
// chip and INTO the dense meta line.  Owner direction: the bright-red
// `Closest match on Redeemo` pill was visually too loud and competed
// with the merchant name.  The proximity signal now folds into the
// `descriptor · distance · proximity` meta-line:
//
//   IN_YOUR_AREA       → "In your area"
//   A_LITTLE_FURTHER   → "A short trip"     (shorter than the chip variant)
//   NEAREST_ON_REDEEMO → "Closest match"    (shorter than the chip variant)
//   NEARBY / null      → nothing in meta
//
// The standalone <ProximityBandChip> still exists for OTHER surfaces
// (Home / Map / Category) — Search just doesn't render it any more.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem, proximityMetaLabel } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — proximity in meta line (PR #112 fixup-4)', () => {
  it('IN_YOUR_AREA renders "In your area" in the meta line', () => {
    const tile = makeBranchTile({
      proximityBand: 'IN_YOUR_AREA',
      distance: 2400,
      merchant: { id: 'm1', businessName: 'M', descriptor: 'Indian Restaurant', voucherCount: 0 },
    })
    const { getByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText(/Indian Restaurant.*In your area/)).toBeTruthy()
  })

  it('A_LITTLE_FURTHER renders "A short trip" in the meta line', () => {
    const tile = makeBranchTile({
      proximityBand: 'A_LITTLE_FURTHER',
      distance: 10_800,
      merchant: { id: 'm2', businessName: 'M', descriptor: 'Coffee shop', voucherCount: 0 },
    })
    const { getByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText(/Coffee shop.*A short trip/)).toBeTruthy()
  })

  it('NEAREST_ON_REDEEMO renders "Closest match" in the meta line', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEAREST_ON_REDEEMO',
      distance: 278_900,
      merchant: { id: 'm3', businessName: 'M', descriptor: 'Indian Restaurant', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText(/173\.\d miles away.*Closest match/)).toBeTruthy()
    // Negative pin — bright-red pill copy must NOT appear.
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })

  it('NEARBY renders nothing extra in the meta line', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEARBY',
      distance: 200,
      merchant: { id: 'm4', businessName: 'M', descriptor: 'Cafe', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    // Cafe + distance only; no proximity tail.
    expect(getByText(/Cafe.*200 metres away/)).toBeTruthy()
    expect(queryByText(/In your area/)).toBeNull()
    expect(queryByText(/A short trip/)).toBeNull()
    expect(queryByText(/Closest match/)).toBeNull()
  })

  it('null proximityBand renders nothing extra in the meta line', () => {
    const tile = makeBranchTile({
      proximityBand: null,
      distance: 5000,
      merchant: { id: 'm5', businessName: 'M', descriptor: 'Bakery', voucherCount: 0 },
    })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText(/In your area/)).toBeNull()
    expect(queryByText(/A short trip/)).toBeNull()
    expect(queryByText(/Closest match/)).toBeNull()
  })
})

describe('proximityMetaLabel helper (PR #112 fixup-4)', () => {
  it('NEARBY → null (no tag)', () => {
    expect(proximityMetaLabel('NEARBY')).toBeNull()
  })
  it('IN_YOUR_AREA → "In your area"', () => {
    expect(proximityMetaLabel('IN_YOUR_AREA')).toBe('In your area')
  })
  it('A_LITTLE_FURTHER → "A short trip"', () => {
    expect(proximityMetaLabel('A_LITTLE_FURTHER')).toBe('A short trip')
  })
  it('NEAREST_ON_REDEEMO → "Closest match" (NOT "Closest match on Redeemo")', () => {
    expect(proximityMetaLabel('NEAREST_ON_REDEEMO')).toBe('Closest match')
  })
  it('null / undefined → null', () => {
    expect(proximityMetaLabel(null)).toBeNull()
    expect(proximityMetaLabel(undefined)).toBeNull()
  })
})
