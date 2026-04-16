import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MerchantTile } from '@/features/shared/MerchantTile'

const merchant = {
  id: 'm1',
  businessName: 'Spitalfields Pizza',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  primaryCategory: { id: 'c1', name: 'Food & Drink' },
  subcategory: { id: 'sc1', name: 'Pizza' },
  voucherCount: 3,
  maxEstimatedSaving: 15,
  distance: 800,
  nearestBranchId: 'b1',
  avgRating: 4.5,
  reviewCount: 128,
  isFavourited: false,
}

describe('MerchantTile', () => {
  it('renders merchant name', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText('Spitalfields Pizza')).toBeTruthy()
  })

  it('renders FEATURED badge when showFeaturedBadge is true', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} showFeaturedBadge onPress={jest.fn()} />)
    expect(getByText('FEATURED')).toBeTruthy()
  })

  it('does not render FEATURED badge by default', () => {
    const { queryByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(queryByText('FEATURED')).toBeNull()
  })

  it('renders voucher count and save amount', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(getByText('Save up to £15')).toBeTruthy()
  })

  it('formats distance in metres when under 1000m', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText(/800m/)).toBeTruthy()
  })

  it('formats distance in miles when over 1000m', () => {
    const m = { ...merchant, distance: 3200 }
    const { getByText } = render(<MerchantTile merchant={m} onPress={jest.fn()} />)
    expect(getByText(/mi/)).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={onPress} />)
    fireEvent.press(getByText('Spitalfields Pizza'))
    expect(onPress).toHaveBeenCalledWith('m1')
  })

  it('calls onFavourite when heart is pressed', () => {
    const onFav = jest.fn()
    const { getByLabelText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} onFavourite={onFav} />)
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(onFav).toHaveBeenCalledWith('m1')
  })

  it('renders close button when showClose is true', () => {
    const onClose = jest.fn()
    const { getByLabelText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} showClose onClose={onClose} />)
    fireEvent.press(getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
