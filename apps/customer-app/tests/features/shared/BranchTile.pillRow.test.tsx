import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { color } from '@/design-system'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

// 2026-06-02 premium v2 — the voucher/save PILLS are gone. The value is a
// single line: "Save up to £X" (savings-green, bold) + voucher count (navy,
// prominent — the count is an important message, not grey chrome).
describe('BranchTile value line', () => {
  it('renders save (green, bold) + voucher count (navy) when both have content', () => {
    const tile = makeBranchTile({
      proximityBand: 'IN_YOUR_AREA',
      distance:      500,
      merchant: { businessName: 'Covelum', descriptor: 'Italian Restaurant', voucherCount: 3, maxEstimatedSaving: 9 },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const save = getByText('Save up to £9')
    expect(StyleSheet.flatten(save.props.style).fontSize).toBe(15)
    expect(StyleSheet.flatten(save.props.style).fontFamily).toBe('Lato-Bold')
    expect(StyleSheet.flatten(save.props.style).color).toBe('#15803D')
    const count = getByText('3 vouchers')
    expect(StyleSheet.flatten(count.props.style).color).toBe(color.text.primary)
    expect(StyleSheet.flatten(count.props.style).fontFamily).toBe('Lato-SemiBold')
  })

  it('renders the voucher count alone when maxEstimatedSaving is null', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: null },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(queryByText(/Save up to/)).toBeNull()
  })

  it('renders no count when voucherCount is 0', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'No Vouchers', voucherCount: 0, maxEstimatedSaving: null } })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/voucher/)).toBeNull()
  })

  it('renders a sub-£1 saving with pence, never "Save up to £0"', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Penny Saver', voucherCount: 2, maxEstimatedSaving: 0.4 },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Save up to £0.40')).toBeTruthy()
    expect(queryByText('Save up to £0')).toBeNull()
  })

  it('renders a whole-pound saving compactly (no trailing .00)', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Round Pound', voucherCount: 1, maxEstimatedSaving: 44 },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Save up to £44')).toBeTruthy()
  })

  it('collapses the value row entirely when there is no saving, no voucher count and no proximity', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEARBY', // BAND_META.NEARBY is null → no proximity chip
      merchant: { businessName: 'Bare Tile', voucherCount: 0, maxEstimatedSaving: null },
    })
    const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('branch-tile-value')).toBeNull()
    expect(queryByTestId('branch-tile-proximity')).toBeNull()
  })

  it('singular "1 voucher" copy', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 1, maxEstimatedSaving: null } })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('1 voucher')).toBeTruthy()
  })

  it('NEVER renders the retired ProximityBandChip element', () => {
    const bands = ['NEARBY', 'IN_YOUR_AREA', 'A_LITTLE_FURTHER', 'NEAREST_ON_REDEEMO'] as const
    for (const band of bands) {
      const tile = makeBranchTile({ proximityBand: band })
      const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(queryByTestId('proximity-band-chip')).toBeNull()
    }
  })

  it('card style does NOT include overflow:"hidden" so content is never clipped', () => {
    const tile = makeBranchTile({ merchant: { businessName: 'Covelum', voucherCount: 3 } })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    let cur: any = getByLabelText(/^Covelum/)
    let cardNode: any = null
    for (let i = 0; i < 8 && cur; i++) {
      const flat = StyleSheet.flatten(cur.props?.style)
      if (flat && flat.backgroundColor === '#FFFFFF' && typeof flat.borderRadius === 'number') {
        cardNode = cur
        break
      }
      cur = cur.parent
    }
    expect(cardNode).not.toBeNull()
    expect(StyleSheet.flatten(cardNode.props.style).overflow).not.toBe('hidden')
  })

  it('rating renders right-aligned in content — value 13pt Lato-Bold, count 11pt', () => {
    const tile = makeBranchTile({ avgRating: 4.5, reviewCount: 12, merchant: { businessName: 'Covelum' } })
    const { getByText, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByTestId('branch-tile-rating')).toBeTruthy()
    expect(StyleSheet.flatten(getByText('4.5').props.style).fontSize).toBe(13)
    expect(StyleSheet.flatten(getByText('4.5').props.style).fontFamily).toBe('Lato-Bold')
    expect(StyleSheet.flatten(getByText('(12)').props.style).fontSize).toBe(11)
  })

  it('rating is suppressed when avgRating is null', () => {
    const tile = makeBranchTile({ avgRating: null, merchant: { businessName: 'Covelum' } })
    const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByTestId('branch-tile-rating')).toBeNull()
  })
})
