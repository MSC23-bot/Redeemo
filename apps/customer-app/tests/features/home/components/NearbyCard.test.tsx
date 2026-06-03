import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NearbyCard } from '@/features/home/components/NearbyCard'
import { color } from '@/design-system'
import { makeBranchTile } from '../../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('NearbyCard (name-on-banner browse card)', () => {
  it('renders name, subcategory, location, status, rating and the stacked saving', () => {
    const tile = makeBranchTile({
      isOpenNow: true,
      avgRating: 4.6,
      reviewCount: 20,
      branchLocalityName: 'Huddersfield',
      distance: 322, // 0.2 mi
      merchant: { businessName: 'Karaara', descriptor: 'Indian Cafe', voucherCount: 3, maxEstimatedSaving: 11.95, totalEstimatedSaving: 25.95 },
    })
    const { getByText, getByTestId, queryByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(getByTestId('nearby-card-name')).toBeTruthy()
    expect(getByText('Karaara')).toBeTruthy()      // name (on banner)
    expect(getByText('Indian Cafe')).toBeTruthy()  // subcategory (white strip)
    expect(getByText('0.2 mi')).toBeTruthy()
    expect(getByText('Huddersfield')).toBeTruthy()
    expect(getByText('Open')).toBeTruthy()
    expect(getByTestId('nearby-card-rating')).toBeTruthy()
    expect(getByText('4.6')).toBeTruthy()
    // TOTAL across all vouchers, with pence — not the single max, not rounded.
    expect(getByText('£25.95')).toBeTruthy()
    expect(queryByText('£11.95')).toBeNull()
    expect(queryByText('£26')).toBeNull()
    expect(getByText(/3 vouchers/)).toBeTruthy() // inline "· 3 vouchers"
  })

  it('open/closed is its own element (beside the subcategory), separate from the location text', () => {
    const tile = makeBranchTile({
      isOpenNow: true,
      branchLocalityName: 'Huddersfield',
      distance: 322,
      merchant: { businessName: 'X', descriptor: 'Cafe' },
    })
    const { getByTestId, getByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    const status = getByTestId('nearby-card-open')
    // 'Open' is inside the status element; the location text is NOT (status sits
    // on the subcategory row's right, so "Closing in 60 min" has room later).
    const within = (node: any, text: string): boolean => {
      if (node?.props?.children === text) return true
      const kids = node?.children ?? []
      return kids.some((k: any) => typeof k === 'object' && within(k, text))
    }
    expect(within(status, 'Open')).toBe(true)
    expect(within(status, 'Huddersfield')).toBe(false)
    expect(getByText('Huddersfield')).toBeTruthy()
  })

  it('rating moved onto the banner (white value over the dark gradient)', () => {
    const tile = makeBranchTile({ avgRating: 4.6, reviewCount: 20, merchant: { businessName: 'Karaara' } })
    const { getByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(StyleSheet.flatten(getByText('4.6').props.style).color).toBe('#FFFFFF')
  })

  it('a long locality does NOT eat the distance — distance is a pinned node', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Hoxton East & Shoreditch',
      distance: 1609,
      merchant: { businessName: 'Bean & Brew', descriptor: 'Specialty Coffee Cafe' },
    })
    const { getByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(getByText('Hoxton East & Shoreditch')).toBeTruthy()
    expect(getByText('1.0 mi')).toBeTruthy()
  })

  it('whole-pound total drops the .00 (formatGbpCompact)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'X', voucherCount: 2, maxEstimatedSaving: 7, totalEstimatedSaving: 15 } })
    const { getByText, queryByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(getByText('£15')).toBeTruthy()
    expect(queryByText('£15.00')).toBeNull()
  })

  it('count-only when no saving; hides rating when null and shows Closed', () => {
    const tile = makeBranchTile({ avgRating: null, isOpenNow: false, merchant: { businessName: 'X', voucherCount: 3, maxEstimatedSaving: null, totalEstimatedSaving: null } })
    const { getByText, queryByText, queryByTestId } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers available')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
    expect(queryByTestId('nearby-card-rating')).toBeNull()
    expect(getByText('Closed')).toBeTruthy()
  })

  it('saving amount uses the Mustica Pro display face (the data is the hero)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'X', voucherCount: 1, maxEstimatedSaving: 5, totalEstimatedSaving: 5 } })
    const { getByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(StyleSheet.flatten(getByText('£5').props.style).fontFamily).toBe('MusticaPro-Semibold')
  })

  it('name on the banner is white (legible over the photo gradient)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Karaara' } })
    const { getByTestId } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(StyleSheet.flatten(getByTestId('nearby-card-name').props.style).color).toBe('#FFFFFF')
  })

  it('fires onPress with the branch id when the name is tapped', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({ id: 'brn-9', merchant: { businessName: 'Karaara', descriptor: 'Indian Cafe' } })
    const { getByText } = render(<NearbyCard branch={tile} onPress={onPress} />)
    fireEvent.press(getByText('Karaara'))
    expect(onPress).toHaveBeenCalledWith('brn-9')
  })

  it('uses color tokens for open status (savings-green dot, success label)', () => {
    const tile = makeBranchTile({ isOpenNow: true, merchant: { businessName: 'X' } })
    const { getByText } = render(<NearbyCard branch={tile} onPress={() => {}} />)
    expect(StyleSheet.flatten(getByText('Open').props.style).color).toBe(color.success)
  })
})
