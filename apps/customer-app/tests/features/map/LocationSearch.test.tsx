import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { LocationSearch } from '@/features/map/components/LocationSearch'

jest.mock('@/lib/geocoding', () => ({
  geocodeCity: jest.fn().mockResolvedValue({ lat: 53.4808, lng: -2.2426 }),
}))

describe('LocationSearch', () => {
  it('renders "Use current location" option', () => {
    const onCitySelect = jest.fn()
    const onCurrentLocation = jest.fn()
    const { getByText } = render(
      <LocationSearch
        query=""
        onCitySelect={onCitySelect}
        onCurrentLocation={onCurrentLocation}
      />,
    )
    expect(getByText('Use current location')).toBeTruthy()
  })

  it('calls onCitySelect when a city is tapped', async () => {
    const onCitySelect = jest.fn()
    const onCurrentLocation = jest.fn()
    const { getByText } = render(
      <LocationSearch
        query="Manch"
        onCitySelect={onCitySelect}
        onCurrentLocation={onCurrentLocation}
      />,
    )
    const manchesterItem = getByText(/Manchester/)
    fireEvent.press(manchesterItem)
    await waitFor(() =>
      expect(onCitySelect).toHaveBeenCalledWith('Manchester', expect.any(Object)),
    )
  })

  it('calls onCurrentLocation when "Use current location" is tapped', () => {
    const onCitySelect = jest.fn()
    const onCurrentLocation = jest.fn()
    const { getByText } = render(
      <LocationSearch
        query=""
        onCitySelect={onCitySelect}
        onCurrentLocation={onCurrentLocation}
      />,
    )
    fireEvent.press(getByText('Use current location'))
    expect(onCurrentLocation).toHaveBeenCalledTimes(1)
  })
})
