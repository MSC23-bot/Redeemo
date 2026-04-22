import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedeemCTA } from '@/features/voucher/components/RedeemCTA'

describe('RedeemCTA', () => {
  it('renders "Redeem This Voucher" for subscribed state', () => {
    const { getByText } = render(
      <RedeemCTA state="can_redeem" onPress={jest.fn()} />,
    )
    expect(getByText('Redeem This Voucher')).toBeTruthy()
  })

  it('renders subscribe CTA for free user', () => {
    const { getByText } = render(
      <RedeemCTA state="subscribe" onPress={jest.fn()} />,
    )
    expect(getByText(/Subscribe to Redeem/)).toBeTruthy()
  })

  it('renders disabled already redeemed CTA', () => {
    const { getByText } = render(
      <RedeemCTA state="already_redeemed" onPress={jest.fn()} />,
    )
    expect(getByText('Already Redeemed This Cycle')).toBeTruthy()
  })

  it('renders disabled expired CTA', () => {
    const { getByText } = render(
      <RedeemCTA state="expired" onPress={jest.fn()} />,
    )
    expect(getByText('Voucher Has Expired')).toBeTruthy()
  })

  it('renders disabled outside-window CTA with schedule', () => {
    const { getByText } = render(
      <RedeemCTA state="outside_window" onPress={jest.fn()} scheduleLabel="Mon–Fri, 11am–3pm" />,
    )
    expect(getByText('Not Available Right Now')).toBeTruthy()
    expect(getByText('Mon–Fri, 11am–3pm')).toBeTruthy()
  })

  it('fires onPress when state is can_redeem', () => {
    const onPress = jest.fn()
    const { getByText } = render(<RedeemCTA state="can_redeem" onPress={onPress} />)
    fireEvent.press(getByText('Redeem This Voucher'))
    expect(onPress).toHaveBeenCalled()
  })

  it('does not call onPress for already_redeemed state', () => {
    const onPress = jest.fn()
    render(<RedeemCTA state="already_redeemed" onPress={onPress} />)
    expect(onPress).not.toHaveBeenCalled()
  })
})
