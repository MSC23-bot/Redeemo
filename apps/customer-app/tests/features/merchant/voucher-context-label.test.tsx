import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherContextLabel } from '@/features/merchant/components/VoucherContextLabel'

// Round 6 §1: copy was "Showing offers for {branch}" — implied
// branch-owned vouchers. Now keeps the merchant-wide count
// + branch redemption context visible together:
//   "{count} offers available · Redeem at {branch}"
// Singular form: "1 offer available · Redeem at {branch}".
describe('VoucherContextLabel', () => {
  it('renders the count + redemption-context copy when multi-branch and has vouchers', () => {
    const { getByText } = render(
      <VoucherContextLabel count={3} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByText('3 offers available')).toBeTruthy()
    expect(getByText(' · Redeem at Brightlingsea')).toBeTruthy()
  })

  it('uses singular "offer" when count is 1', () => {
    const { getByText } = render(
      <VoucherContextLabel count={1} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByText('1 offer available')).toBeTruthy()
    expect(getByText(' · Redeem at Brightlingsea')).toBeTruthy()
  })

  it('returns null on single-branch merchant', () => {
    const { toJSON } = render(
      <VoucherContextLabel count={2} branchShortName="Only" isMultiBranch={false} hasVouchers={true} />
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when there are 0 vouchers', () => {
    const { toJSON } = render(
      <VoucherContextLabel count={0} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={false} />
    )
    expect(toJSON()).toBeNull()
  })

  it('exposes testID for animation hookup', () => {
    const { getByTestId } = render(
      <VoucherContextLabel count={3} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByTestId('voucher-context-label')).toBeTruthy()
  })
})
