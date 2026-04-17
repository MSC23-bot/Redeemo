import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapMerchantTile } from '@/features/map/components/MapMerchantTile'
import { MerchantTile } from '@/lib/api/discovery'

const mockMerchant: MerchantTile = {
  id: 'm1',
  businessName: 'Bella Italia',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  primaryCategory: { id: 'c1', name: 'Food & Drink' },
  subcategory: null,
  voucherCount: 2,
  maxEstimatedSaving: 20,
  distance: 500,
  nearestBranchId: 'b1',
  avgRating: 4.2,
  reviewCount: 30,
  isFavourited: false,
}

const mockMerchant2: MerchantTile = {
  id: 'm2',
  businessName: 'Nails & Beauty',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  primaryCategory: { id: 'c2', name: 'Beauty & Wellness' },
  subcategory: null,
  voucherCount: 1,
  maxEstimatedSaving: 10,
  distance: 1200,
  nearestBranchId: 'b2',
  avgRating: null,
  reviewCount: 0,
  isFavourited: true,
}

describe('MapMerchantTile', () => {
  it('renders merchant name', () => {
    const onClose = jest.fn()
    const onMerchantPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByText } = render(
      <MapMerchantTile
        merchants={[mockMerchant]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onMerchantPress={onMerchantPress}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
  })

  it('calls onClose when X is pressed', () => {
    const onClose = jest.fn()
    const onMerchantPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByLabelText } = render(
      <MapMerchantTile
        merchants={[mockMerchant]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onMerchantPress={onMerchantPress}
      />,
    )
    const closeBtn = getByLabelText('Close merchant tile')
    fireEvent.press(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders multiple merchants with dot indicators', () => {
    const onClose = jest.fn()
    const onMerchantPress = jest.fn()
    const onIndexChange = jest.fn()
    const { getByText } = render(
      <MapMerchantTile
        merchants={[mockMerchant, mockMerchant2]}
        activeIndex={0}
        onClose={onClose}
        onIndexChange={onIndexChange}
        onMerchantPress={onMerchantPress}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
  })
})
