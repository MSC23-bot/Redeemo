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

  // §BE 2026-05-17 — Huddersfield was missing from UK_CITIES, so the
  // dropdown returned no suggestions when the owner typed it during
  // the §AU Qatar-override QA. Pin the inclusion so a future
  // alphabetical re-sort or list trim doesn't quietly drop it.
  it('§BE: includes Huddersfield in the filtered results when query="Huddersfield"', () => {
    const { getByText } = render(
      <LocationSearch
        query="Huddersfield"
        onCitySelect={jest.fn()}
        onCurrentLocation={jest.fn()}
      />,
    )
    expect(getByText('Huddersfield')).toBeTruthy()
  })

  // §BE follow-up 2026-05-17 — the dropdown is rendered in NORMAL
  // FLOW inside MapScreen.searchContainer (directly below the
  // SearchBar) rather than absolutely positioned with a hardcoded
  // `top` offset. The previous constant-bump (top: 56 → 80) didn't
  // generalise across safe-area-top insets on real devices (e.g.
  // Dynamic Island iPhones rendered the dropdown ON TOP of the
  // SearchBar despite the constant being correct in theory).
  // Normal flow + the SearchBar's own marginBottom gives a stable
  // visual gap on every device. This pin guards against a future
  // restyle that reintroduces absolute positioning.
  it('§BE follow-up: container is NOT absolutely positioned (normal-flow placement)', () => {
    const { getByTestId } = render(
      <LocationSearch
        query=""
        onCitySelect={jest.fn()}
        onCurrentLocation={jest.fn()}
      />,
    )
    const container = getByTestId('location-search-container')
    const style     = container.props.style
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style
    expect(flat.position).not.toBe('absolute')
    expect(flat.top).toBeUndefined()
  })
})
