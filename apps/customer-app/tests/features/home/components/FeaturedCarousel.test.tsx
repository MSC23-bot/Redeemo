import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FeaturedCarousel } from '@/features/home/components/FeaturedCarousel'
import { makeMerchantTile } from '../../../fixtures/merchantTile'

const merchants = [
  makeMerchantTile({
    id: 'm1', businessName: 'Pizza Place',
    primaryCategory: { id: 'c1', name: 'Food & Drink', pinColour: null, pinIcon: null },
    voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1',
    avgRating: 4.5, reviewCount: 50,
  }),
  makeMerchantTile({
    id: 'm2', businessName: 'Hair Salon',
    primaryCategory: { id: 'c2', name: 'Beauty', pinColour: null, pinIcon: null },
    voucherCount: 2, maxEstimatedSaving: 10, distance: 1200, nearestBranchId: 'b2',
    avgRating: 4.8, reviewCount: 30, isFavourited: true,
  }),
]

describe('FeaturedCarousel', () => {
  it('renders section header with star icon', () => {
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getByText('Featured')).toBeTruthy()
  })

  it('renders See all link', () => {
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getByText('See all')).toBeTruthy()
  })

  it('renders merchant tiles with FEATURED badge', () => {
    const { getAllByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getAllByText('FEATURED')).toHaveLength(2)
  })

  it('returns null when merchants array is empty', () => {
    const { toJSON } = render(<FeaturedCarousel merchants={[]} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(toJSON()).toBeNull()
  })

  it('calls onSeeAll when See all is pressed', () => {
    const onSeeAll = jest.fn()
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={onSeeAll} />)
    fireEvent.press(getByText('See all'))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('calls onMerchantPress with merchant id when tile is pressed', () => {
    const onMerchantPress = jest.fn()
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={onMerchantPress} onSeeAll={jest.fn()} />)
    fireEvent.press(getByText('Pizza Place'))
    expect(onMerchantPress).toHaveBeenCalledWith('m1')
  })
})
