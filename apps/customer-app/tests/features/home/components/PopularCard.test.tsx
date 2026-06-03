import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PopularCard } from '@/features/home/components/PopularCard'
import { color } from '@/design-system'
import { makeBranchTile } from '../../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('PopularCard (Popular/Trending discovery card)', () => {
  it('renders name, category, where line, open, rating, and the stacked saving', () => {
    const tile = makeBranchTile({
      isOpenNow: true,
      avgRating: 4.6,
      reviewCount: 20,
      branchLocalityName: 'Huddersfield',
      distance: 322, // 0.2 mi
      // 3 vouchers (£4.50 + £9.50 + £11.95), best single £11.95, TOTAL = £25.95.
      merchant: { businessName: 'Karaara', descriptor: 'Indian Cafe', voucherCount: 3, maxEstimatedSaving: 11.95, totalEstimatedSaving: 25.95 },
    })
    const { getByText, getByTestId, queryByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    expect(getByText('Karaara')).toBeTruthy()
    expect(getByText('Indian Cafe')).toBeTruthy()
    // Locality + distance are separate nodes (distance is pinned, never truncated).
    expect(getByText('Huddersfield')).toBeTruthy()
    expect(getByText('0.2 mi')).toBeTruthy()
    expect(getByText('Open')).toBeTruthy()
    expect(getByTestId('popular-card-rating')).toBeTruthy()
    expect(getByText('4.6')).toBeTruthy()
    // Saving is the TOTAL across all vouchers WITH pence (£25.95) — not the
    // single-voucher max (£11.95) and NOT rounded to the pound (£25/£26).
    expect(getByText('£25.95')).toBeTruthy()
    expect(queryByText('£25')).toBeNull()
    expect(queryByText('£26')).toBeNull()
    // Count is NEVER truncated (the "2 vou…" bug).
    expect(getByText('across 3 vouchers')).toBeTruthy()
    // Option B copy (2026-06-04): total value uses "Save … across N vouchers",
    // NOT "Save up to" (which is reserved for a single voucher's max).
    expect(getByText('Save')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('a long locality does NOT eat the distance — distance is a pinned node', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Hoxton East & Shoreditch',
      distance: 1609, // 1.0 mi
      merchant: { businessName: 'Bean & Brew', descriptor: 'Specialty Coffee Cafe' },
    })
    const { getByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    expect(getByText('Hoxton East & Shoreditch')).toBeTruthy() // locality (it's the one that truncates)
    expect(getByText('1.0 mi')).toBeTruthy()                   // distance always present
  })

  it('voucher count is rendered IN FULL, never truncated', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'X', voucherCount: 2, maxEstimatedSaving: 3, totalEstimatedSaving: 11 } })
    const { getByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    const node = getByText('across 2 vouchers')
    expect(StyleSheet.flatten(node.props.style).color).toBe(color.text.primary)
  })

  it('drops proximity (redundant with distance + "near you" section)', () => {
    const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA', merchant: { businessName: 'X', descriptor: 'Cafe' } })
    const { queryByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('Nearest match')).toBeNull()
  })

  it('count-only when no saving', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'X', voucherCount: 3, maxEstimatedSaving: null } })
    const { getByText, queryByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers available')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('hides rating when avgRating is null; shows Closed when shut', () => {
    const tile = makeBranchTile({ avgRating: null, isOpenNow: false, merchant: { businessName: 'X' } })
    const { queryByTestId, getByText } = render(<PopularCard branch={tile} onPress={() => {}} />)
    expect(queryByTestId('popular-card-rating')).toBeNull()
    expect(getByText('Closed')).toBeTruthy()
  })

  it('fires onPress with the branch id', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({ id: 'brn-9', merchant: { businessName: 'Karaara', descriptor: 'Indian Cafe' } })
    const { getByLabelText } = render(<PopularCard branch={tile} onPress={onPress} />)
    fireEvent.press(getByLabelText(/^Karaara/))
    expect(onPress).toHaveBeenCalledWith('brn-9')
  })
})
