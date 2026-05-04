import React from 'react'
import { render } from '@testing-library/react-native'
import { VoucherContextLabel } from '@/features/merchant/components/VoucherContextLabel'

describe('VoucherContextLabel', () => {
  it('renders "Showing offers for {branchName}" when multi-branch and has vouchers', () => {
    const { getByText } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByText('Showing offers for Brightlingsea')).toBeTruthy()
  })

  it('returns null on single-branch merchant', () => {
    const { toJSON } = render(
      <VoucherContextLabel branchShortName="Only" isMultiBranch={false} hasVouchers={true} />
    )
    expect(toJSON()).toBeNull()
  })

  it('returns null when there are 0 vouchers', () => {
    const { toJSON } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={false} />
    )
    expect(toJSON()).toBeNull()
  })

  it('exposes testID for animation hookup', () => {
    const { getByTestId } = render(
      <VoucherContextLabel branchShortName="Brightlingsea" isMultiBranch={true} hasVouchers={true} />
    )
    expect(getByTestId('voucher-context-label')).toBeTruthy()
  })
})
