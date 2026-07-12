import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// Map Phase 2 W2b (F11, W2-D5) — the Map carousel card, reached via the
// opt-in `<BranchTile variant="mapCarousel">` delegation. The default
// variant (Home / Search / Favourites / Category) must be byte-unaffected;
// the last describe block pins that parity.

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchCarouselCard (BranchTile variant="mapCarousel")', () => {
  it('renders the card body: name + "category · locality · distance"', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Soho',
      distance:           500,
      merchant: {
        businessName:    'Bella Italia',
        primaryCategory: { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null, parentId: null },
      },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByText('Bella Italia')).toBeTruthy()
    expect(getByText(/Food & Drink · Soho/)).toBeTruthy()
  })

  it('status pill reads "Open until HH:MM" using closesAtLocal when open', () => {
    const tile = makeBranchTile({
      isOpenNow:     true,
      closesAtLocal: '17:30',
      merchant:      { businessName: 'Pino' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByText('Open until 17:30')).toBeTruthy()
  })

  it('status pill reads "Closed" when not open (never invents an opens-at time)', () => {
    const tile = makeBranchTile({ isOpenNow: false, closesAtLocal: null, merchant: { businessName: 'Pino' } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByText('Closed')).toBeTruthy()
  })

  it('brand-locked banner fallback (W2-D5) renders when bannerUrl is null (NOT the image)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Local Cafe', bannerUrl: null, logoUrl: null } })
    const { getByTestId, queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByTestId('branch-carousel-banner-fallback')).toBeTruthy()
    expect(queryByTestId('branch-carousel-banner-image')).toBeNull()
  })

  it('uses the banner image when bannerUrl is set', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Pino', bannerUrl: 'https://example.com/b.jpg' } })
    const { getByTestId, queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByTestId('branch-carousel-banner-image').props.source).toEqual([{ uri: 'https://example.com/b.jpg' }])
    expect(queryByTestId('branch-carousel-banner-fallback')).toBeNull()
  })

  it('logo falls back to the navy initial tile when logoUrl is null', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Pino', logoUrl: null } })
    const { getByText, queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(queryByTestId('branch-carousel-logo-image')).toBeNull()
    expect(getByText('P')).toBeTruthy()
  })

  it('renders the shared value line (save capsule + voucher stub) and the branch-level heart', () => {
    const tile = makeBranchTile({
      id:       'brn-x',
      merchant: { businessName: 'Pino', voucherCount: 2, maxEstimatedSaving: 20 },
    })
    const { getByText, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} variant="mapCarousel" />)
    expect(getByTestId('branch-carousel-value')).toBeTruthy()
    expect(getByText('Save up to £20')).toBeTruthy()
    expect(getByText('2 vouchers')).toBeTruthy()
    expect(getByTestId('branch-carousel-brn-x-heart')).toBeTruthy()
  })

  it('tap fires onPress with the branch id', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({ id: 'brn-tap', merchant: { businessName: 'Pino' } })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={onPress} variant="mapCarousel" />)
    fireEvent.press(getByLabelText(/^Pino/))
    expect(onPress).toHaveBeenCalledWith('brn-tap')
  })

  // Parity — the DEFAULT variant must not leak any carousel-only chrome, so
  // Home / Search / Favourites / Category stay byte-unaffected by W2b.
  describe('default variant parity', () => {
    it('default BranchTile renders none of the mapCarousel testIDs', () => {
      const tile = makeBranchTile({ merchant: { businessName: 'Pino', bannerUrl: null, logoUrl: null } })
      const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(queryByTestId('branch-carousel-banner-fallback')).toBeNull()
      expect(queryByTestId('branch-carousel-value')).toBeNull()
      // The default card keeps its own banner-fallback testID.
      expect(queryByTestId('branch-tile-banner-fallback')).toBeTruthy()
    })
  })
})
