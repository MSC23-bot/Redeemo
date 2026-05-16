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

  // §BE 2026-05-17 — the dropdown container's absolute `top` offset
  // must clear the SearchBar's full footprint
  // (MapScreen.searchContainer paddingTop 8 + SearchBar inner ~50
  // + paddingBottom 8 = ~66pt). Pre-fix `top: 56` overlapped the
  // input; the locked value is 80. This pin catches a future style
  // refactor that drifts the constant back into overlap territory.
  it('§BE: container positions BELOW the SearchBar footprint (top >= 70)', () => {
    const { getByTestId } = render(
      <LocationSearch
        query=""
        onCitySelect={jest.fn()}
        onCurrentLocation={jest.fn()}
      />,
    )
    const container = getByTestId('location-search-container')
    const style     = container.props.style
    // RN flattens style arrays at render time; the `top` may live
    // on the object or in the flattened result depending on the
    // platform.  Both shapes are fine — we only care that the
    // effective top clears the SearchBar.
    const flat = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style
    expect(flat.top).toBeGreaterThanOrEqual(70)
  })
})
