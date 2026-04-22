import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FavouritesEmptyState } from '@/features/favourites/components/FavouritesEmptyState'

describe('FavouritesEmptyState', () => {
  it('renders "No favourites yet" title', () => {
    const { getByText } = render(<FavouritesEmptyState onDiscover={jest.fn()} />)
    expect(getByText('No favourites yet')).toBeTruthy()
  })

  it('renders instructions text', () => {
    const { getByText } = render(<FavouritesEmptyState onDiscover={jest.fn()} />)
    expect(getByText(/Tap the heart/)).toBeTruthy()
  })

  it('renders Discover merchants CTA', () => {
    const { getByText } = render(<FavouritesEmptyState onDiscover={jest.fn()} />)
    expect(getByText('Discover merchants')).toBeTruthy()
  })

  it('calls onDiscover when CTA is pressed', () => {
    const onDiscover = jest.fn()
    const { getByText } = render(<FavouritesEmptyState onDiscover={onDiscover} />)
    fireEvent.press(getByText('Discover merchants'))
    expect(onDiscover).toHaveBeenCalled()
  })
})
