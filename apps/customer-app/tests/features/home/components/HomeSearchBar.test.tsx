import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeSearchBar } from '@/features/home/components/HomeSearchBar'

describe('HomeSearchBar', () => {
  it('renders the placeholder copy', () => {
    const { getByText } = render(<HomeSearchBar onPress={jest.fn()} />)
    expect(getByText(/Search merchants, vouchers/i)).toBeTruthy()
  })

  it('exposes the Search button role/label and fires onPress', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<HomeSearchBar onPress={onPress} />)
    fireEvent.press(getByLabelText('Search'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
