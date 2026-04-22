import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherFavCard } from '@/features/favourites/components/VoucherFavCard'
import type { FavouriteVoucherItem } from '@/lib/api/favourites'

const baseVoucher: FavouriteVoucherItem = {
  id: 'v1',
  title: 'Buy One Get One Free',
  description: 'Valid Mon–Fri',
  type: 'BOGO',
  estimatedSaving: 12,
  expiresAt: null,
  isRedeemedInCurrentCycle: false,
  isUnavailable: false,
  merchant: { id: 'm1', businessName: 'Pizza Palace', logoUrl: null },
  favouritedAt: '2026-04-01T10:00:00.000Z',
}

describe('VoucherFavCard', () => {
  it('renders voucher title', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Buy One Get One Free')).toBeTruthy()
  })

  it('renders merchant name', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Pizza Palace')).toBeTruthy()
  })

  it('renders type badge label', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('BOGO')).toBeTruthy()
  })

  it('shows save pill with saving amount', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Save £12')).toBeTruthy()
  })

  it('shows Redeem CTA when not redeemed and not unavailable', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Redeem')).toBeTruthy()
  })

  it('shows Redeemed label when isRedeemedInCurrentCycle', () => {
    const redeemed = { ...baseVoucher, isRedeemedInCurrentCycle: true }
    const { getByText } = render(
      <VoucherFavCard voucher={redeemed} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Redeemed')).toBeTruthy()
  })

  it('shows Unavailable label when isUnavailable', () => {
    const unavailable = { ...baseVoucher, isUnavailable: true }
    const { getByText } = render(
      <VoucherFavCard voucher={unavailable} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Unavailable')).toBeTruthy()
  })

  it('calls onPress with voucher id when tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={onPress} onRemove={jest.fn()} />,
    )
    fireEvent.press(getByLabelText('Buy One Get One Free at Pizza Palace, save £12'))
    expect(onPress).toHaveBeenCalledWith('v1')
  })

  it('calls onRemove when heart is tapped', () => {
    const onRemove = jest.fn()
    const { getByLabelText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={onRemove} />,
    )
    fireEvent.press(getByLabelText('Remove Buy One Get One Free from favourites'))
    expect(onRemove).toHaveBeenCalledWith('v1')
  })

  it('renders description when provided', () => {
    const { getByText } = render(
      <VoucherFavCard voucher={baseVoucher} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Valid Mon–Fri')).toBeTruthy()
  })
})
