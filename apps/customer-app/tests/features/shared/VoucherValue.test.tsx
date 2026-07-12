import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherValue } from '@/features/shared/VoucherValue'

// Map Phase 2 W2b (F9 + F11) — the shared value piece used by BOTH the Map
// ledger rows and the carousel card footer. Pins the save capsule + voucher
// stub composition so the two surfaces cannot drift.
describe('VoucherValue', () => {
  it('renders a "Save up to £X" capsule and an "N vouchers" stub when both are present', () => {
    const { getByText, getByTestId } = render(
      <VoucherValue saveAmount={20} voucherCount={2} testID="vv" />,
    )
    expect(getByTestId('vv')).toBeTruthy()
    expect(getByText('Save up to £20')).toBeTruthy()
    expect(getByText('2 vouchers')).toBeTruthy()
    expect(getByTestId('voucher-value-save')).toBeTruthy()
    expect(getByTestId('voucher-value-stub')).toBeTruthy()
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
})
