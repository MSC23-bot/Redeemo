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

  // ──────────────────────────────────────────────────────────────────────
  // Map P2 W1 (F3 + F4) — chip tether geometry.
  //
  // The pin's outer marker box is a fixed 60x63 (MapPins CONTAINER_WIDTH x
  // CONTAINER_HEIGHT), tip-anchored at the coordinate, so it occupies the
  // 63px ABOVE the coordinate; the voucher-count badge lives INSIDE that
  // box (≤24px from its top). Both the chip and the pin are bottom-
  // anchored Markers at the SAME coordinate. These tests pin that the chip
  // is (F4) tethered directly above the pin — centred, lifted clear of the
  // 63px pin stack — and therefore (F3) can never re-enter the badge zone,
  // which is strictly inside that stack.
  // ──────────────────────────────────────────────────────────────────────
  const PIN_STACK_HEIGHT = 63 // mirrors MapPins CONTAINER_HEIGHT

  function chipOffsetTransform(testInstance: any): { translateX: number; translateY: number } {
    const style = Array.isArray(testInstance.props.style)
      ? Object.assign({}, ...testInstance.props.style.filter(Boolean))
      : testInstance.props.style
    const transform: any[] = style.transform ?? []
    const tx = transform.find((t) => 'translateX' in t)?.translateX ?? 0
    const ty = transform.find((t) => 'translateY' in t)?.translateY ?? 0
    return { translateX: tx, translateY: ty }
  }

  it('F4: the chip is lifted entirely above the pin stack (tethered above the head, not floating beside it)', () => {
    const { getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04" />,
    )
    const { translateY } = chipOffsetTransform(getByTestId('map-name-chip-brn1'))
    // Bottom-anchored, so a negative translateY lifts it upward. Its whole
    // box must clear the 63px pin stack (chip bottom sits ABOVE the pin's
    // top edge), so |translateY| >= PIN_STACK_HEIGHT.
    expect(translateY).toBeLessThanOrEqual(-PIN_STACK_HEIGHT)
  })

  it('F3: the chip is horizontally centred over the pin (translateX 0), so it never re-enters the top-right badge zone', () => {
    const { getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04" />,
    )
    const { translateX, translateY } = chipOffsetTransform(getByTestId('map-name-chip-brn1'))
    // The pre-W1 offset pushed the chip UP-AND-RIGHT (translateX 22,
    // translateY -44) into the badge zone. Centred + lifted-clear means the
    // chip box and the badge box (inside the 63px pin stack) are disjoint.
    expect(translateX).toBe(0)
    expect(translateY).toBeLessThan(-PIN_STACK_HEIGHT + 1) // strictly above the stack top
  })
})
