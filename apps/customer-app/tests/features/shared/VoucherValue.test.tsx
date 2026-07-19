import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherValue } from '@/features/shared/VoucherValue'

// Map Phase 2 W2b (F9 + F11) — the shared value piece used by BOTH the Map
// ledger rows and the carousel card footer. Pins the save capsule + voucher
// count composition so the two surfaces cannot drift. Round 5: the count
// element is the filled brand-red <TicketMark> + label, no dashed
// container; the capsule wording is the full "Save up to £X".
describe('VoucherValue', () => {
  it('renders a "Save up to £X" capsule and a TicketMark voucher count when both are present', () => {
    const { getByText, getByTestId } = render(
      <VoucherValue saveAmount={20} voucherCount={2} testID="vv" />,
    )
    expect(getByTestId('vv')).toBeTruthy()
    expect(getByText('Save up to £20')).toBeTruthy()
    expect(getByText('2 vouchers')).toBeTruthy()
    expect(getByTestId('voucher-value-save')).toBeTruthy()
    expect(getByTestId('voucher-value-stub')).toBeTruthy()
    // Round 5 — the count identity is the custom filled ticket SVG.
    expect(getByTestId('voucher-value-ticket-mark')).toBeTruthy()
  })

  it('singularises the stub to "1 voucher"', () => {
    const { getByText } = render(<VoucherValue saveAmount={5} voucherCount={1} />)
    expect(getByText('1 voucher')).toBeTruthy()
  })

  it('hides the save capsule when there is no positive saving (stub still shows)', () => {
    const { getByText, queryByTestId } = render(<VoucherValue saveAmount={null} voucherCount={3} />)
    expect(queryByTestId('voucher-value-save')).toBeNull()
    expect(getByText('3 vouchers')).toBeTruthy()
  })

  it('hides the save capsule when the saving is exactly 0', () => {
    const { queryByTestId, getByText } = render(<VoucherValue saveAmount={0} voucherCount={2} />)
    expect(queryByTestId('voucher-value-save')).toBeNull()
    expect(getByText('2 vouchers')).toBeTruthy()
  })

  it('hides the voucher stub when the count is 0 (capsule still shows)', () => {
    const { queryByTestId, getByText } = render(<VoucherValue saveAmount={12} voucherCount={0} />)
    expect(queryByTestId('voucher-value-stub')).toBeNull()
    expect(getByText('Save up to £12')).toBeTruthy()
  })

  it('renders nothing when there is neither a saving nor any vouchers', () => {
    const { queryByTestId, toJSON } = render(
      <VoucherValue saveAmount={null} voucherCount={0} testID="vv" />,
    )
    expect(queryByTestId('vv')).toBeNull()
    expect(toJSON()).toBeNull()
  })

  // W2b round 5 — the round-4 'amount' wording was owner-rejected (the
  // bare "£15" read meaningless) and the prop removed with the side-rail
  // geometry. The FULL wording is the visible text; the a11y label
  // matches it.
  it('capsule visible text is the FULL "Save up to £X" (round-5 wording revert)', () => {
    const { getByText, queryByText, getByLabelText } = render(
      <VoucherValue saveAmount={15} voucherCount={3} />,
    )
    expect(getByText('Save up to £15')).toBeTruthy()
    expect(queryByText(/^£15$/)).toBeNull()
    expect(getByLabelText('Save up to £15')).toBeTruthy()
  })
})
