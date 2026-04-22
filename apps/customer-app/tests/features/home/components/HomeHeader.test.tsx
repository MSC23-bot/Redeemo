import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeHeader } from '@/features/home/components/HomeHeader'

describe('HomeHeader', () => {
  it('renders greeting with first name', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/Shebin/)).toBeTruthy()
  })

  it('renders location label', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/Shoreditch/)).toBeTruthy()
  })

  it('shows morning greeting before noon', () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(/morning/)).toBeTruthy()
    jest.restoreAllMocks()
  })
})
