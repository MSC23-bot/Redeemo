// Map Phase 2 S5b Task 4b — savings suffix on the close-zoom name chips.
// No dedicated unit-test file existed pre-S5b (chip rendering was only
// exercised indirectly through MapPins/mapNameChipGate); this file adds
// direct coverage for <MapNameChipMarker> itself, including the new
// "Save £X" suffix.

import React from 'react'
import { render } from '@testing-library/react-native'
import {
  MapNameChipMarker,
  CHIP_LIFT,
  CHIP_GAP_ABOVE_HEAD,
  PIN_SCALED_HEAD_TOP,
  PIN_SELECTED_HEAD_TOP,
  PIN_CONTAINER_HEIGHT_FOR_TESTS,
} from '@/features/map/components/MapNameChipMarker'

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
  // Map P2 W1.1 (F15, revising W1 F3/F4) — chip tether geometry.
  //
  // Pinned-test supersession record: the W1 F3/F4 tests asserted the chip
  // cleared the ENTIRE 63pt pin container (|translateY| >= 63) so it could
  // never collide with the voucher badge. The badge is now REMOVED (F14,
  // owner W2-D6) and the owner still found the container-top lift too
  // detached (the container's upper band is mostly pulse-ring headroom),
  // so those two assertions are REPLACED by head-clearance assertions:
  // the chip's bottom sits a small pocket of air (~4-6pt) above the
  // VISIBLE resting head top, derived from the scaled-head geometry (see
  // MapNameChipMarker.tsx's CHIP_LIFT derivation comment). The badge-
  // disjointness claim is moot: there is no badge.
  // ──────────────────────────────────────────────────────────────────────

  function chipOffsetTransform(testInstance: any): { translateX: number; translateY: number } {
    const style = Array.isArray(testInstance.props.style)
      ? Object.assign({}, ...testInstance.props.style.filter(Boolean))
      : testInstance.props.style
    const transform: any[] = style.transform ?? []
    const tx = transform.find((t) => 'translateX' in t)?.translateX ?? 0
    const ty = transform.find((t) => 'translateY' in t)?.translateY ?? 0
    return { translateX: tx, translateY: ty }
  }

  it('F15: the rendered offset is centred (translateX 0) and lifts by exactly CHIP_LIFT', () => {
    const { getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" dotColor="#E20C04" />,
    )
    const { translateX, translateY } = chipOffsetTransform(getByTestId('map-name-chip-brn1'))
    expect(translateX).toBe(0)
    expect(translateY).toBe(-CHIP_LIFT)
  })

  it('F15: the chip bottom sits 4-6pt above the VISIBLE resting head top (tight tether, not container-top float)', () => {
    // All in pin-container coords (y grows downward; the container bottom
    // is the shared anchor). Chip bottom y = CONTAINER_HEIGHT - CHIP_LIFT.
    const chipBottomY = PIN_CONTAINER_HEIGHT_FOR_TESTS - CHIP_LIFT
    const airAboveRestingHead = PIN_SCALED_HEAD_TOP - chipBottomY
    // Float-tolerant bounds (the derivation legitimately lands on 6 with
    // an epsilon of floating-point noise).
    expect(airAboveRestingHead).toBeGreaterThanOrEqual(4)
    expect(airAboveRestingHead).toBeLessThanOrEqual(6.001)
    expect(airAboveRestingHead).toBeCloseTo(CHIP_GAP_ABOVE_HEAD, 10)
  })

  it('F15: the chip never overlaps the teardrop itself even when SELECTED (scale 1 head top)', () => {
    // Selected state scales the teardrop to 1.0: its head top rises to
    // PIN_SELECTED_HEAD_TOP (y=9). The chip bottom must stay ABOVE it
    // (smaller y). Sitting close to / fractionally over the faint OUTER
    // ring circle is owner-accepted; overlapping the teardrop is not.
    const chipBottomY = PIN_CONTAINER_HEIGHT_FOR_TESTS - CHIP_LIFT
    expect(chipBottomY).toBeLessThan(PIN_SELECTED_HEAD_TOP)
  })

  it('F15: constant-parity guard: the derived scaled head top matches the MapPins pin geometry (63 / 54 / 0.81)', () => {
    // The chip file duplicates the pin constants (module-scope
    // decoupling); this recomputes the derivation from first principles
    // so silent drift in either file fails loudly.
    const CONTAINER_HEIGHT = 63
    const PIN_HEIGHT = 54
    const TEARDROP_TOP = CONTAINER_HEIGHT - PIN_HEIGHT       // 9
    const WRAP_CENTER_Y = TEARDROP_TOP + PIN_HEIGHT / 2      // 36
    const SCALE = 0.81
    const expectedScaledHeadTop = WRAP_CENTER_Y + (TEARDROP_TOP - WRAP_CENTER_Y) * SCALE
    expect(PIN_SCALED_HEAD_TOP).toBeCloseTo(expectedScaledHeadTop, 10)
    expect(PIN_CONTAINER_HEIGHT_FOR_TESTS).toBe(CONTAINER_HEIGHT)
  })
})
