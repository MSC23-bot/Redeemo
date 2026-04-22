import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MerchantFavCard } from '@/features/favourites/components/MerchantFavCard'
import type { FavouriteMerchantItem } from '@/lib/api/favourites'

const baseMerchant: FavouriteMerchantItem = {
  id: 'm1',
  businessName: 'Pizza Palace',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  status: 'ACTIVE',
  isUnavailable: false,
  primaryCategory: { id: 'c1', name: 'Food & Drink' },
  voucherCount: 3,
  maxEstimatedSaving: 15,
  avgRating: 4.5,
  reviewCount: 22,
  isOpen: true,
  branch: { id: 'b1', name: 'High Street', addressLine1: '1 High St', latitude: 51.5, longitude: -0.1 },
  favouritedAt: '2026-04-01T10:00:00.000Z',
}

describe('MerchantFavCard', () => {
  it('renders merchant name', () => {
    const { getByText } = render(
      <MerchantFavCard merchant={baseMerchant} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Pizza Palace')).toBeTruthy()
  })

  it('renders category and address info', () => {
    const { getByText } = render(
      <MerchantFavCard merchant={baseMerchant} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText(/Food & Drink/)).toBeTruthy()
  })

  it('calls onPress with merchant id when card is tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <MerchantFavCard merchant={baseMerchant} onPress={onPress} onRemove={jest.fn()} />,
    )
    fireEvent.press(getByLabelText('Pizza Palace, Food & Drink, open'))
    expect(onPress).toHaveBeenCalledWith('m1')
  })

  it('calls onRemove with merchant id when heart is tapped', () => {
    const onRemove = jest.fn()
    const { getByLabelText } = render(
      <MerchantFavCard merchant={baseMerchant} onPress={jest.fn()} onRemove={onRemove} />,
    )
    fireEvent.press(getByLabelText('Remove Pizza Palace from favourites'))
    expect(onRemove).toHaveBeenCalledWith('m1')
  })

  it('shows "Unavailable" text for suspended merchant', () => {
    const unavailable = { ...baseMerchant, isUnavailable: true, status: 'SUSPENDED' as const }
    const { getByText } = render(
      <MerchantFavCard merchant={unavailable} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('Unavailable')).toBeTruthy()
  })

  it('shows logo initial when no logoUrl', () => {
    const { getByText } = render(
      <MerchantFavCard merchant={baseMerchant} onPress={jest.fn()} onRemove={jest.fn()} />,
    )
    expect(getByText('P')).toBeTruthy()
  })
})
