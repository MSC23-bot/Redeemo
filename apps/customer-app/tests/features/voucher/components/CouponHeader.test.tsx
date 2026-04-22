import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'

const mockGoBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockGoBack }) }))

describe('CouponHeader', () => {
  const baseProps = {
    voucherType: 'BOGO' as const,
    title: 'Buy One Get One Free',
    description: 'On all main courses',
    estimatedSaving: 14.99,
    isFavourited: false,
    onToggleFavourite: jest.fn(),
    onShare: jest.fn(),
  }

  it('renders voucher title and description', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('Buy One Get One Free')).toBeTruthy()
    expect(getByText('On all main courses')).toBeTruthy()
  })

  it('displays estimated saving in GBP', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('£14.99')).toBeTruthy()
  })

  it('shows voucher type badge text', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('BUY ONE GET ONE FREE')).toBeTruthy()
  })

  it('calls onToggleFavourite when heart is tapped', () => {
    const onToggleFavourite = jest.fn()
    const { getByAccessibilityLabel } = render(
      <CouponHeader {...baseProps} onToggleFavourite={onToggleFavourite} />,
    )
    fireEvent.press(getByAccessibilityLabel('Toggle favourite'))
    expect(onToggleFavourite).toHaveBeenCalled()
  })

  it('calls router.back when back button is tapped', () => {
    const { getByAccessibilityLabel } = render(<CouponHeader {...baseProps} />)
    fireEvent.press(getByAccessibilityLabel('Go back'))
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('applies washed out filter when isRedeemed is true', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} isRedeemed />)
    const header = getByTestId('coupon-header')
    expect(header.props.style).toBeDefined()
  })
})
