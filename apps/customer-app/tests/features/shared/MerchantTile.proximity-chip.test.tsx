// Plan 4 M3b — proximity chip wiring in shared MerchantTile.
//
// Covers all five band states (3 visible, 2 hidden + the absent case).
// MerchantTile is used by Home Featured / Trending / NearbyByCategory,
// Category results, and the Map carousel (via MapMerchantTile). One
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

  it('renders "A little further" when proximityBand is A_LITTLE_FURTHER', () => {
    const tile = makeMerchantTile({ proximityBand: 'A_LITTLE_FURTHER' })
    const { getByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(getByText('A little further')).toBeTruthy()
  })

  it('renders "Nearest on Redeemo" when proximityBand is NEAREST_ON_REDEEMO', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEAREST_ON_REDEEMO' })
    const { getByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(getByText('Nearest on Redeemo')).toBeTruthy()
  })

  it('renders no chip when proximityBand is NEARBY', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEARBY' })
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is null (V2-rejected merchant in hybrid phase)', () => {
    const tile = makeMerchantTile({ proximityBand: null })
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is absent (pre-M3 response)', () => {
    const tile = makeMerchantTile() // fixture default omits the field
    const { queryByText } = render(<MerchantTile merchant={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })
})
