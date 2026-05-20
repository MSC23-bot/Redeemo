import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FeaturedCarousel } from '@/features/home/components/FeaturedCarousel'
import { makeBranchTile } from '../../../fixtures/branchTile'

const branches = [
  makeBranchTile({
    id: 'brn-pizza-1',
    branchName: 'Shoreditch',
    distance: 800,
    avgRating: 4.5,
    reviewCount: 50,
    merchant: {
      id: 'm1',
      businessName: 'Pizza Place',
      primaryCategory: { id: 'c1', name: 'Food & Drink', parentId: null },
      voucherCount: 3,
      maxEstimatedSaving: 15,
      totalEstimatedSaving: 45,
    },
  }),
  makeBranchTile({
    id: 'brn-hair-1',
    branchName: 'Camden',
    distance: 1200,
    avgRating: 4.8,
    reviewCount: 30,
    isFavourited: true,
    merchant: {
      id: 'm2',
      businessName: 'Hair Salon',
      primaryCategory: { id: 'c2', name: 'Beauty', parentId: null },
      voucherCount: 2,
      maxEstimatedSaving: 10,
      totalEstimatedSaving: 20,
    },
  }),
]

describe('FeaturedCarousel (Phase 2.3 branch-first)', () => {
  it('renders section header with star icon', () => {
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText('Featured')).toBeTruthy()
  })

  it('renders See all link', () => {
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getByText('See all')).toBeTruthy()
  })

  it('renders branch tiles with FEATURED badge', () => {
    const { getAllByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(getAllByText('FEATURED')).toHaveLength(2)
  })

  it('returns null when branches array is empty', () => {
    const { toJSON } = render(
      <FeaturedCarousel branches={[]} onBranchPress={jest.fn()} onSeeAll={jest.fn()} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('calls onSeeAll when See all is pressed', () => {
    const onSeeAll = jest.fn()
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={jest.fn()} onSeeAll={onSeeAll} />,
    )
    fireEvent.press(getByText('See all'))
    expect(onSeeAll).toHaveBeenCalled()
  })

  it('calls onBranchPress with branch.id when a tile is pressed', () => {
    // Phase 2.3 navigation pin — adapter swaps `id: branch.id`, so the
    // shared <MerchantTile>'s onPress(id) callback fires with the BRANCH
    // id (load-bearing for ?branch=<branchId>&from=home URL contract).
    const onBranchPress = jest.fn()
    const { getByText } = render(
      <FeaturedCarousel branches={branches} onBranchPress={onBranchPress} onSeeAll={jest.fn()} />,
    )
    fireEvent.press(getByText('Pizza Place'))
    expect(onBranchPress).toHaveBeenCalledWith('brn-pizza-1')
  })
})
