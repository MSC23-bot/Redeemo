import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeaturedHeroCard } from '@/features/home/components/FeaturedHeroCard'
import { makeBranchTile } from '../../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('FeaturedHeroCard (editorial hero)', () => {
  it('renders the lockup (name + descriptor), FEATURED badge, and value', () => {
    const tile = makeBranchTile({
      isOpenNow: true,
      // 3 vouchers (£4.50 + £9.50 + £11.95), best single £11.95, TOTAL = £25.95.
      merchant: { businessName: 'Pinos Pizzeria', descriptor: 'Italian Restaurant', voucherCount: 3, maxEstimatedSaving: 11.95, totalEstimatedSaving: 25.95 },
    })
    const { getByText, getByTestId, queryByText } = render(<FeaturedHeroCard branch={tile} onPress={() => {}} />)
    expect(getByText('Pinos Pizzeria')).toBeTruthy()
    expect(getByText('Italian Restaurant')).toBeTruthy()
    expect(getByText('FEATURED')).toBeTruthy()
    expect(getByTestId('featured-hero-value')).toBeTruthy()
    // TOTAL across all vouchers WITH pence (£25.95), not the max (£11.95) and not rounded.
    expect(getByText('£25.95')).toBeTruthy()
    expect(queryByText('£25')).toBeNull()
    expect(getByText('across 3 vouchers')).toBeTruthy()
    expect(getByText('Open')).toBeTruthy()
  })

  it('shows the rating pill when avgRating is set, hides it when null', () => {
    const rated = makeBranchTile({ avgRating: 4.6, reviewCount: 20, merchant: { businessName: 'X' } })
    const { getByTestId } = render(<FeaturedHeroCard branch={rated} onPress={() => {}} />)
    expect(getByTestId('featured-hero-rating')).toBeTruthy()

    const unrated = makeBranchTile({ avgRating: null, merchant: { businessName: 'Y' } })
    const { queryByTestId } = render(<FeaturedHeroCard branch={unrated} onPress={() => {}} />)
    expect(queryByTestId('featured-hero-rating')).toBeNull()
  })

  it('voucher count only when there is no saving', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'X', voucherCount: 2, maxEstimatedSaving: null } })
    const { getByText, queryByText } = render(<FeaturedHeroCard branch={tile} onPress={() => {}} />)
    expect(getByText('2 vouchers available')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('fires onPress with the branch id', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({ id: 'brn-1', merchant: { businessName: 'Pinos', descriptor: 'Italian Restaurant' } })
    const { getByLabelText } = render(<FeaturedHeroCard branch={tile} onPress={onPress} />)
    fireEvent.press(getByLabelText(/^Pinos/))
    expect(onPress).toHaveBeenCalledWith('brn-1')
  })
})
