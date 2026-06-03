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

// 2026-06-02 premium card v2 (impeccable). Pins the no-pills content chrome:
// right-aligned open status / rating / proximity + the single value line.
describe('BranchTile — premium v2', () => {
  describe('Open status (content, top-right)', () => {
    it('renders "Open" when isOpenNow is true', () => {
      const tile = makeBranchTile({ isOpenNow: true, merchant: { businessName: 'Covelum' } })
      const { getByText, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(getByTestId('branch-tile-open')).toBeTruthy()
      expect(getByText('Open')).toBeTruthy()
    })

    it('renders "Closed" when isOpenNow is false', () => {
      const tile = makeBranchTile({ isOpenNow: false, merchant: { businessName: 'Covelum' } })
      const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(getByText('Closed')).toBeTruthy()
    })
  })

  describe('Proximity (content, right, no pill bg)', () => {
    it('renders the proximity meta for IN_YOUR_AREA', () => {
      const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA', merchant: { businessName: 'Covelum' } })
      const { getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(getByTestId('branch-tile-proximity')).toBeTruthy()
    })

    it('renders no proximity meta for NEARBY / null', () => {
      for (const band of ['NEARBY', null] as const) {
        const tile = makeBranchTile({ proximityBand: band, merchant: { businessName: 'Covelum' } })
        const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
        expect(queryByTestId('branch-tile-proximity')).toBeNull()
      }
    })
  })

  describe('Value line (no pills)', () => {
    it('renders "Save up to £X" (green) + voucher count (navy) as one line', () => {
      const tile = makeBranchTile({
        merchant: { businessName: 'Covelum', voucherCount: 3, maxEstimatedSaving: 12 },
      })
      const { getByText, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(getByTestId('branch-tile-value')).toBeTruthy()
      const saveNode = getByText('Save up to £12')
      expect(StyleSheet.flatten(saveNode.props.style).color).toBe('#15803D')
      const countNode = getByText('3 vouchers')
      expect(StyleSheet.flatten(countNode.props.style).color).toBe(color.text.primary)
    })

    it('shows the voucher count alone when there is no saving', () => {
      const tile = makeBranchTile({
        merchant: { businessName: 'Covelum', voucherCount: 2, maxEstimatedSaving: null },
      })
      const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(getByText('2 vouchers')).toBeTruthy()
      expect(queryByText(/Save up to/)).toBeNull()
    })
  })

  describe('No legacy pills / chips', () => {
    it('does not render the old highlight chip even when highlights exist', () => {
      const tile = makeBranchTile({
        merchant: { businessName: 'Covelum', highlights: [{ highlightTagId: 'h1', label: 'Dog friendly' }] },
      })
      const { queryByTestId, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
      expect(queryByTestId('branch-tile-highlight-chip')).toBeNull()
      expect(queryByText('Dog friendly')).toBeNull()
    })
  })

  describe('Card edge', () => {
    it('card carries a hairline border so it reads against the near-white page', () => {
      const tile = makeBranchTile({ merchant: { businessName: 'Covelum' } })
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
      const flat = StyleSheet.flatten(cardNode.props.style)
      // Premium v3: white card on the warm Home body — soft navy shadow + a
      // warm hairline (not the cool grey border.subtle).
      expect(flat.borderWidth).toBe(1)
      expect(flat.borderColor).toBe('#EDE4D7')
      expect(flat.shadowColor).toBe('#010C35')
    })
  })
})
