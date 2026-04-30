import React from 'react'
import { render } from '@testing-library/react-native'
import { MapListView } from '@/features/map/components/MapListView'
import { makeMerchantTile } from '../../fixtures/merchantTile'

const mockMerchants = [
  makeMerchantTile({
    id:                 'm1',
    businessName:       'Bella Italia',
    primaryCategory:    { id: 'c1', name: 'Food & Drink',     pinColour: null, pinIcon: null },
    voucherCount:       2,
    maxEstimatedSaving: 20,
    distance:           500,
    nearestBranchId:    'b1',
    avgRating:          4.2,
    reviewCount:        30,
  }),
  makeMerchantTile({
    id:                 'm2',
    businessName:       'Nails & Beauty',
    primaryCategory:    { id: 'c2', name: 'Beauty & Wellness', pinColour: null, pinIcon: null },
    voucherCount:       1,
    maxEstimatedSaving: 10,
    distance:           1200,
    nearestBranchId:    'b2',
    isFavourited:       true,
  }),
]

describe('MapListView', () => {
  it('renders "Nearby Merchants" header', () => {
    const onDismiss = jest.fn()
    const onMerchantPress = jest.fn()
    const { getByText } = render(
      <MapListView
        visible={true}
        merchants={mockMerchants}
        total={2}
        onDismiss={onDismiss}
        onMerchantPress={onMerchantPress}
      />,
    )
    expect(getByText('Nearby Merchants')).toBeTruthy()
  })

  it('renders merchant count badge', () => {
    const onDismiss = jest.fn()
    const onMerchantPress = jest.fn()
    const { getByText } = render(
      <MapListView
        visible={true}
        merchants={mockMerchants}
        total={2}
        onDismiss={onDismiss}
        onMerchantPress={onMerchantPress}
      />,
    )
    expect(getByText('2')).toBeTruthy()
  })

  it('renders merchant names', () => {
    const onDismiss = jest.fn()
    const onMerchantPress = jest.fn()
    const { getByText } = render(
      <MapListView
        visible={true}
        merchants={mockMerchants}
        total={2}
        onDismiss={onDismiss}
        onMerchantPress={onMerchantPress}
      />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
    expect(getByText('Nails & Beauty')).toBeTruthy()
  })
})
