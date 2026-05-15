// Plan 4 M3b — proximity chip wiring in SearchResultItem.
//
// SearchResultItem is the dedicated Search-screen list row (separate
// from the card-shaped MerchantTile shared elsewhere). It must surface
// the same proximity chip with the same hide-rules.

import React from 'react'
import { render } from '@testing-library/react-native'
import { SearchResultItem } from '@/features/search/components/SearchResultItem'
import { makeMerchantTile } from '../../fixtures/merchantTile'

describe('SearchResultItem — proximity chip wiring (Plan 4 M3b)', () => {
  it('renders "In your area" when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeMerchantTile({ proximityBand: 'IN_YOUR_AREA' })
    const { getByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('In your area')).toBeTruthy()
  })

  it('renders "A little further" when proximityBand is A_LITTLE_FURTHER', () => {
    const tile = makeMerchantTile({ proximityBand: 'A_LITTLE_FURTHER' })
    const { getByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('A little further')).toBeTruthy()
  })

  it('renders "Nearest on Redeemo" when proximityBand is NEAREST_ON_REDEEMO', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEAREST_ON_REDEEMO' })
    const { getByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Nearest on Redeemo')).toBeTruthy()
  })

  it('renders no chip when proximityBand is NEARBY', () => {
    const tile = makeMerchantTile({ proximityBand: 'NEARBY' })
    const { queryByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is null', () => {
    const tile = makeMerchantTile({ proximityBand: null })
    const { queryByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is absent', () => {
    const tile = makeMerchantTile()
    const { queryByText } = render(
      <SearchResultItem merchant={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })
})
