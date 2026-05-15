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

  // Plan 4 M3b — proves the inner shared MerchantTile receives the
  // proximityBand prop unaltered through the Map carousel wrapper.
  // MerchantTile's own chip-matrix test covers all band variants;
  // this is the integration pin specifically for the Map render path.
  it('surfaces the proximity chip on the selected map card', () => {
    const tile = makeMerchantTile({
      id:                 'm-near',
      businessName:       'In Your Area Cafe',
      proximityBand:      'IN_YOUR_AREA',
    })
    const { getByText } = render(
      <MapMerchantTile
        merchants={[tile]}
        activeIndex={0}
        onClose={jest.fn()}
        onIndexChange={jest.fn()}
        onMerchantPress={jest.fn()}
      />,
    )
    expect(getByText('In Your Area Cafe')).toBeTruthy()
    expect(getByText('In your area')).toBeTruthy()
  })
})
