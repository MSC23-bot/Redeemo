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

  describe('PR-B T8h — count drops by redeemed-this-cycle vouchers', () => {
    it('multi-branch: shows the AVAILABLE count, not the total ("2 offers available · Redeem at Brightlingsea" when 1 of 3 has been redeemed)', () => {
      // Owner-reported: redeeming a voucher should immediately reduce
      // "3 offers available" → "2 offers available".  Today the parent
      // VouchersTab passes `availableCount = vouchers.length -
      // redeemedVoucherIds.size` as `count`.  This pin guards the copy
      // contract on the label.
      const { getByText } = render(
        <VoucherContextLabel count={2} totalCount={3} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
      )
      expect(getByText('2 offers available')).toBeTruthy()
      expect(getByText(' · Redeem at Brightlingsea')).toBeTruthy()
    })

    it('all-redeemed edge case: count=0 + totalCount>0 swaps copy to "All offers redeemed this cycle" and drops the branch suffix', () => {
      const { getByText, queryByText } = render(
        <VoucherContextLabel count={0} totalCount={3} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
      )
      expect(getByText('All offers redeemed this cycle')).toBeTruthy()
      expect(queryByText('0 offers available')).toBeNull()
      expect(queryByText(/Redeem at/)).toBeNull()
    })

    it('all-redeemed on a single-branch merchant uses the same copy (no branch suffix to drop)', () => {
      const { getByText } = render(
        <VoucherContextLabel count={0} totalCount={2} branchShortName="Only" isMultiBranch={false} hasVouchers={true} />
      )
      expect(getByText('All offers redeemed this cycle')).toBeTruthy()
    })

    it('does NOT switch to all-redeemed copy when totalCount is omitted and count is 0 (legacy backwards-compatibility path: assumed empty merchant, falls through to "0 offers available")', () => {
      // When `totalCount` is not passed, `allRedeemed = count === 0
      // && (totalCount ?? count) > 0`.  With totalCount omitted the
      // expression is `0 > 0` → false; we fall through to standard copy.
      const { getByText } = render(
        <VoucherContextLabel count={0} branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
      )
      expect(getByText('0 offers available')).toBeTruthy()
    })
  })
})
