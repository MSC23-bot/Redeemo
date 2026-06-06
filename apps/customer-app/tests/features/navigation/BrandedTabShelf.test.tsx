import React from 'react'
import { render } from '@testing-library/react-native'
import { BrandedTabShelf } from '@/features/navigation/BrandedTabShelf'

describe('BrandedTabShelf', () => {
  it('renders the warm off-white shelf surface', () => {
    const { getByTestId } = render(<BrandedTabShelf />)
    expect(getByTestId('branded-tab-shelf')).toBeTruthy()
  })
})
