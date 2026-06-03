import React from 'react'
import { render } from '@testing-library/react-native'
import { TrendingFlame } from '@/design-system/motion/TrendingFlame'

describe('TrendingFlame (Batch 2 — Popular/Trending trending mark)', () => {
  it('renders the animated flame with the provided testID', () => {
    const { getByTestId } = render(<TrendingFlame color="#E84A00" testID="flame" />)
    expect(getByTestId('flame')).toBeTruthy()
  })
})
