import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherContextLabel } from '@/features/merchant/components/VoucherContextLabel'

// Round 6 §1: keeps the merchant-wide count visible, with the
// redemption-context suffix only when there's more than one branch:
//   multi-branch  → "{n} offers available · Redeem at {branch}"
//   single-branch → "{n} offers available"          (no suffix)
// Singular form: "1 offer available".
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

  it('renders the count WITHOUT the redemption-context suffix on a single-branch merchant', () => {
    const { getByText, queryByText } = render(
      <VoucherContextLabel count={2} branchShortName="Only" isMultiBranch={false} hasVouchers={true} />
    )
    expect(getByText('2 offers available')).toBeTruthy()
    expect(queryByText(' · Redeem at Only')).toBeNull()
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
