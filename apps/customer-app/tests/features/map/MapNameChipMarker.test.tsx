// Map Phase 2 S5b Task 4b — savings suffix on the close-zoom name chips.
// No dedicated unit-test file existed pre-S5b (chip rendering was only
// exercised indirectly through MapPins/mapNameChipGate); this file adds
// direct coverage for <MapNameChipMarker> itself, including the new
// "Save £X" suffix.

import React from 'react'
import { render } from '@testing-library/react-native'
import { MapNameChipMarker } from '@/features/map/components/MapNameChipMarker'

jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    Marker: (props: any) => ReactLib.createElement(View, props, props.children),
  }
})

describe('MapNameChipMarker', () => {
  it('renders the branch label', () => {
    const { getByText } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04" />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
  })

  it('does NOT render a saving suffix when maxEstimatedSaving is absent', () => {
    const { queryByTestId, getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04" />,
    )
    expect(getByTestId('map-name-chip-brn1')).toBeTruthy()
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('does NOT render a saving suffix when maxEstimatedSaving is null', () => {
    const { queryByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04"
        maxEstimatedSaving={null}
      />,
    )
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('does NOT render a saving suffix when maxEstimatedSaving is zero (nothing to save)', () => {
    const { queryByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04"
        maxEstimatedSaving={0}
      />,
    )
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('renders "· Save £X" using the shared compact-currency formatter for a whole-pound saving', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04"
        maxEstimatedSaving={20}
      />,
    )
    expect(getByTestId('map-name-chip-save-brn1').props.children).toBe(' · Save £20')
  })

  it('keeps pence for a sub-pound saving (matches formatGbpCompact — no nonsensical "£0")', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04"
        maxEstimatedSaving={0.4}
      />,
    )
    expect(getByTestId('map-name-chip-save-brn1').props.children).toBe(' · Save £0.40')
  })
})
