import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'

describe('SuccessPopup', () => {
  const baseProps = {
    visible: true,
    redemptionCode: 'ABC1234567',
    voucherTitle: 'BOGO Pizza',
    voucherType: 'BOGO' as const,
    merchantName: 'Pizza Palace',
    branchName: 'High Street',
    imageUrl: null,
    redeemedAt: '2026-04-17T10:00:00Z',
    onShowToStaff: jest.fn(),
    onRateReview: jest.fn(),
    onDone: jest.fn(),
  }

  it('renders "Voucher Redeemed!" title', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('Voucher Redeemed!')).toBeTruthy()
  })

  it('displays redemption code', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('ABC1234567')).toBeTruthy()
  })

  it('displays voucher title and merchant name', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('BOGO Pizza')).toBeTruthy()
    expect(getByText('Pizza Palace')).toBeTruthy()
  })

  it('calls onShowToStaff when "Show to Staff" is tapped', () => {
    const onShowToStaff = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onShowToStaff={onShowToStaff} />)
    fireEvent.press(getByText('Show to Staff'))
    expect(onShowToStaff).toHaveBeenCalled()
  })

  it('calls onDone when "Done" is tapped', () => {
    const onDone = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onDone={onDone} />)
    fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalled()
  })

  it('calls onRateReview when "Rate & Review" is tapped', () => {
    const onRateReview = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onRateReview={onRateReview} />)
    fireEvent.press(getByText('Rate & Review'))
    expect(onRateReview).toHaveBeenCalled()
  })

  it('does not render when visible is false', () => {
    const { queryByText } = render(<SuccessPopup {...baseProps} visible={false} />)
    expect(queryByText('Voucher Redeemed!')).toBeNull()
  })
})
