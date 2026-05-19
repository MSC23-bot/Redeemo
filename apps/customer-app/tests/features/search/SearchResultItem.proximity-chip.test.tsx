// Plan 4 M3b — proximity chip wiring in SearchResultItem.
//
// SearchResultItem is the dedicated Search-screen list row (separate
// from the card-shaped MerchantTile shared elsewhere). It must surface
// the same proximity chip with the same hide-rules.
//
// Discovery Rebaseline PR-2 (Phase 2.1): prop shape switched from
// `MerchantTile` to `BranchTile`. `proximityBand` is now hoisted to
// BRANCH level on the wire — the hide-rules are unchanged.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('SearchResultItem — proximity chip wiring (Plan 4 M3b)', () => {
  it('renders "In your area" when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA' })
    const { getByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('In your area')).toBeTruthy()
  })

  // PR #112 device-QA copy refresh (2026-05-19) — owner-locked copy on
  // ProximityBandChip:
  //   A_LITTLE_FURTHER   → 'A little further away'
  //   NEAREST_ON_REDEEMO → 'Closest match on Redeemo'
  it('renders "A little further away" when proximityBand is A_LITTLE_FURTHER (PR #112 copy)', () => {
    const tile = makeBranchTile({ proximityBand: 'A_LITTLE_FURTHER' })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('A little further away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()
  })

  it('renders "Closest match on Redeemo" when proximityBand is NEAREST_ON_REDEEMO (PR #112 copy)', () => {
    const tile = makeBranchTile({ proximityBand: 'NEAREST_ON_REDEEMO' })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Closest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is NEARBY', () => {
    const tile = makeBranchTile({ proximityBand: 'NEARBY' })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further away')).toBeNull()
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is null', () => {
    const tile = makeBranchTile({ proximityBand: null })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further away')).toBeNull()
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })
})
