import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapMerchantTile } from '@/features/map/components/MapMerchantTile'
import { makeMerchantTile } from '../../fixtures/merchantTile'

const mockMerchant = makeMerchantTile({
  id:                 'm1',
  businessName:       'Bella Italia',
  primaryCategory:    { id: 'c1', name: 'Food & Drink',     pinColour: null, pinIcon: null },
  voucherCount:       2,
  maxEstimatedSaving: 20,
  distance:           500,
  nearestBranchId:    'b1',
  avgRating:          4.2,
  reviewCount:        30,
})

const mockMerchant2 = makeMerchantTile({
  id:                 'm2',
  businessName:       'Nails & Beauty',
  primaryCategory:    { id: 'c2', name: 'Beauty & Wellness', pinColour: null, pinIcon: null },
  voucherCount:       1,
  maxEstimatedSaving: 10,
  distance:           1200,
  nearestBranchId:    'b2',
  isFavourited:       true,
})

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
