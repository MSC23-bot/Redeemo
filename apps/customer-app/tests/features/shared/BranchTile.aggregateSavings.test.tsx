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

// Map Phase 2 S4 — opt-in `savingsDisplay="aggregate"` variant.
//
// HARD GUARDRAIL: BranchTile is shared with Search/Category (both LOCKED
// test-pinned surfaces). Every assertion in the FIRST describe block below
// pins that the DEFAULT render (no `savingsDisplay` prop, i.e. what
// Search/Category actually render) is byte-for-byte identical to the
// pre-S4 "Save up to £X · N vouchers" single-line treatment — proven here
// by using a fixture where maxEstimatedSaving and totalEstimatedSaving
// deliberately DIFFER, so a regression that accidentally reads the wrong
// field would fail this test immediately.
describe('BranchTile — savingsDisplay default ("max") is unchanged from pre-S4', () => {
  it('renders the single-line "Save up to £X" from maxEstimatedSaving, NOT totalEstimatedSaving, when savingsDisplay is omitted', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName:         'Covelum',
        voucherCount:         3,
        maxEstimatedSaving:   12,
        totalEstimatedSaving: 47, // deliberately different from maxEstimatedSaving
      },
    })
    const { getByText, queryByText, getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByTestId('branch-tile-value')).toBeTruthy()
    const saveNode = getByText('Save up to £12')
    expect(StyleSheet.flatten(saveNode.props.style).color).toBe('#15803D')
    expect(getByText('3 vouchers')).toBeTruthy()
    // The aggregate figure/copy must NEVER leak into the default render.
    expect(queryByText('£47')).toBeNull()
    expect(queryByText(/across 3 vouchers/)).toBeNull()
    expect(queryByText('Save')).toBeNull() // aggregate's standalone "Save" label
  })

  it('also stays on the default single-line path when savingsDisplay="max" is passed explicitly', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName:         'Covelum',
        voucherCount:         3,
        maxEstimatedSaving:   12,
        totalEstimatedSaving: 47,
      },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} savingsDisplay="max" />)
    expect(getByText('Save up to £12')).toBeTruthy()
    expect(queryByText('£47')).toBeNull()
  })
})

describe('BranchTile — savingsDisplay="aggregate" (Map carousel card parity)', () => {
  it('renders "Save £X" + "across N vouchers" from totalEstimatedSaving/voucherCount, stacked, Mustica-green amount', () => {
    const tile = makeBranchTile({
      merchant: {
        businessName:         'Covelum',
        voucherCount:         3,
        maxEstimatedSaving:   12,
        totalEstimatedSaving: 47,
      },
    })
    const { getByText, getByTestId } = render(
      <BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />,
    )
    expect(getByTestId('branch-tile-value')).toBeTruthy()
    const amountNode = getByText('£47')
    expect(StyleSheet.flatten(amountNode.props.style).color).toBe('#15803D')
    expect(StyleSheet.flatten(amountNode.props.style).fontFamily).toBe('MusticaPro-Semibold')
    expect(getByText('Save')).toBeTruthy()
    expect(getByText('across 3 vouchers')).toBeTruthy()
  })

  it('singular voucher count reads "across 1 voucher"', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 1, totalEstimatedSaving: 8 },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />)
    expect(getByText('across 1 voucher')).toBeTruthy()
  })

  it('shows "N vouchers available" (no "Save" label, no amount) when totalEstimatedSaving is null — matches Home', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 2, totalEstimatedSaving: null },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />,
    )
    expect(getByText('2 vouchers available')).toBeTruthy()
    expect(queryByText('Save')).toBeNull()
  })

  it('shows "N vouchers available" when totalEstimatedSaving is exactly 0 — matches Home (zero is not a positive saving)', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 4, totalEstimatedSaving: 0 },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />,
    )
    expect(getByText('4 vouchers available')).toBeTruthy()
    expect(queryByText('Save')).toBeNull()
    expect(queryByText('£0')).toBeNull()
  })

  it('renders nothing in the value row when both totalEstimatedSaving and voucherCount are absent, and no proximity band', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 0, totalEstimatedSaving: null },
      proximityBand: null,
    })
    const { queryByTestId } = render(<BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />)
    expect(queryByTestId('branch-tile-value')).toBeNull()
  })

  it('proximity band chip still renders alongside the aggregate saving block', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', voucherCount: 2, totalEstimatedSaving: 15 },
      proximityBand: 'IN_YOUR_AREA',
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={() => {}} savingsDisplay="aggregate" />)
    expect(getByTestId('branch-tile-proximity')).toBeTruthy()
    expect(getByTestId('branch-tile-value')).toBeTruthy()
  })
})
