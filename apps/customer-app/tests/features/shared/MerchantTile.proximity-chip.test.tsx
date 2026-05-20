// Plan 4 M3b — proximity chip wiring in shared MerchantTile.
//
// Covers all five band states (3 visible, 2 hidden + the absent case).
// MerchantTile is used by Home Featured / Trending / NearbyByCategory,
// Category results, and the Map carousel (via MapBranchTile). One
// wiring in MerchantTile.tsx feeds every consumer; this test pins it.

import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { makeMerchantTile } from '../../fixtures/merchantTile'

describe('MerchantTile — proximity chip wiring (Plan 4 M3b)', () => {
  it('renders "In your area" when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeMerchantTile({ proximityBand: 'IN_YOUR_AREA' })
    const { getByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(getByText('In your area')).toBeTruthy()
  })

  // PR #112 device-QA copy refresh (2026-05-19) — owner-locked copy on
  // ProximityBandChip. Negative pins guard against silent revert.
  it('renders "A short trip away" when proximityBand is A_LITTLE_FURTHER (PR #112 copy)', () => {
    const tile = makeMerchantTile({ proximityBand: 'A_LITTLE_FURTHER' })
    const { getByText, queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(getByText('A short trip away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()
  })

  it('renders "Closest match on Redeemo" when proximityBand is NEAREST_ON_REDEEMO (PR #112 copy)', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEAREST_ON_REDEEMO' })
    const { getByText, queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(getByText('Closest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is NEARBY', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEARBY' })
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is null (V2-rejected merchant in hybrid phase)', () => {
    const tile = makeMerchantTile({ proximityBand: null })
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is absent (pre-M3 response)', () => {
    const tile = makeMerchantTile() // fixture default omits the field
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Closest match on Redeemo')).toBeNull()
  })
})
