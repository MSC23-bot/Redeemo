import React from 'react'
import { render } from '@testing-library/react-native'
import { RatingBlock } from '@/features/merchant/components/RatingBlock'

describe('RatingBlock', () => {
  it('renders the rating + count when count > 0', () => {
    const { getByText } = render(<RatingBlock avgRating={4.5} reviewCount={7} />)
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(7)')).toBeTruthy()
  })

  it('renders the placeholder text when count is 0', () => {
    const { getByText, queryByText } = render(<RatingBlock avgRating={null} reviewCount={0} />)
    expect(getByText('No reviews yet')).toBeTruthy()
    expect(queryByText('(0)')).toBeNull()
  })

  it('renders the placeholder text when avgRating is null even if count > 0 (defensive)', () => {
    const { getByText } = render(<RatingBlock avgRating={null} reviewCount={3} />)
    expect(getByText('No reviews yet')).toBeTruthy()
  })

  it('rounds avgRating to 1 decimal', () => {
    const { getByText } = render(<RatingBlock avgRating={4.333} reviewCount={3} />)
    expect(getByText('4.3')).toBeTruthy()
  })
})
