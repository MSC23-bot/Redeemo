import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile pill row (Batch 1B)', () => {
  it('renders VoucherCountPill + SavePill when both have content', () => {
    const tile = makeBranchTile({
      proximityBand:  'IN_YOUR_AREA',
      distance:       500,
      merchant: {
        businessName:       'Covelum',
        descriptor:         'Italian Restaurant',
        voucherCount:       3,
        maxEstimatedSaving: 9,
      },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(getByText('Save up to £9')).toBeTruthy()
  })

  it('renders only VoucherCountPill when maxEstimatedSaving is null', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: null },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('hides VoucherCountPill when count is 0 (null-guard)', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'No Vouchers', voucherCount: 0 } })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/voucher/)).toBeNull()
  })

  it('NEVER renders the ProximityBandChip element inside the tile (proximity moved to info line)', () => {
    const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA' })
    const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('NEVER renders the ProximityBandChip for any band value', () => {
    const bands = ['NEARBY', 'IN_YOUR_AREA', 'A_LITTLE_FURTHER', 'NEAREST_ON_REDEEMO'] as const
    for (const band of bands) {
      const tile = makeBranchTile({ proximityBand: band })
      const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(queryByTestId('proximity-band-chip')).toBeNull()
    }
  })

  it('pill-row style includes flexWrap:"wrap" so Dynamic Type Largest wraps gracefully', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 9 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Walk up the rendered React tree from the VoucherCountPill text node
    // until we hit a host View whose style declares `flexDirection: 'row'`
    // — that's the pillRow. RNTL 13.x exposes forwardRef + wrapper layers
    // as separate parents (Text-wrapper, DS-Text, View-host, View-wrapper,
    // VoucherCountPill, View-host pillRow, View-wrapper pillRow), so a
    // fixed-depth walk is fragile; we search by style instead.
    const pillText = getByText('3 vouchers')
    let cur: any = pillText.parent
    let pillRow: any = null
    for (let i = 0; i < 12 && cur; i++) {
      const flat = StyleSheet.flatten(cur.props?.style)
      if (flat && flat.flexDirection === 'row' && flat.gap === 6) {
        pillRow = cur
        break
      }
      cur = cur.parent
    }
    expect(pillRow).not.toBeNull()
    const flat = StyleSheet.flatten(pillRow.props.style)
    expect(flat.flexWrap).toBe('wrap')
  })

  it('card style does NOT include overflow:"hidden" so a wrapped pill row second-row is not clipped', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 3 } })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // The labelled element is the inner Pressable from PressableScale; its
    // outer Animated.View carries the card style. Walk up until we hit a
    // node whose style declares the card backgroundColor white + borderRadius.
    const labelled = getByLabelText(/^Covelum/)
    let cur: any = labelled
    let cardStyleNode: any = null
    for (let i = 0; i < 8 && cur; i++) {
      const flat = StyleSheet.flatten(cur.props?.style)
      if (flat && flat.backgroundColor === '#FFFFFF' && typeof flat.borderRadius === 'number') {
        cardStyleNode = cur
        break
      }
      cur = cur.parent
    }
    expect(cardStyleNode).not.toBeNull()
    const flat = StyleSheet.flatten(cardStyleNode.props.style)
    expect(flat.overflow).not.toBe('hidden')
  })

  it('VoucherCountPill text uses 11pt Lato-SemiBold (locked §9.7)', () => {
    const tile = makeBranchTile({ merchant: { voucherCount: 3 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const flat = StyleSheet.flatten(getByText('3 vouchers').props.style)
    expect(flat.fontSize).toBe(11)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('SavePill text uses 11pt Lato-SemiBold (locked §9.7)', () => {
    const tile = makeBranchTile({ merchant: { voucherCount: 3, maxEstimatedSaving: 9 } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const flat = StyleSheet.flatten(getByText('Save up to £9').props.style)
    expect(flat.fontSize).toBe(11)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('StarRating renders rating at 13pt + count at 11pt (Star size=14 pinned in standalone StarRating.test.tsx)', () => {
    const tile = makeBranchTile({
      avgRating:   4.5,
      reviewCount: 12,
      merchant:    { businessName: 'Covelum' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const ratingFlat = StyleSheet.flatten(getByText('4.5').props.style)
    expect(ratingFlat.fontSize).toBe(13)
    const countFlat  = StyleSheet.flatten(getByText('(12)').props.style)
    expect(countFlat.fontSize).toBe(11)
    // Star icon size=14 assertion lives in tests/features/shared/StarRating.test.tsx
    // — uses testID='star-rating-icon' on the Star JSX element. Keeping the
    // size pin in the standalone suite avoids coupling BranchTile's composition
    // tests to lucide-react-native's forwardRef internals.
  })
})
