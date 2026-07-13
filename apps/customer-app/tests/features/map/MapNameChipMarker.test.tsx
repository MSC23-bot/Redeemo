// Map P2 W2a (owner decisions W2-D2 + W2-D6, board direction 2026-07-12) —
// the close-zoom name chip is now the TICKET LOCKUP: a white rounded card
// with a full-height category-colour icon block, the branch name, "Save £X",
// and the voucher count laid out as a red ticket mark + the WORD
// "voucher(s)" (never a bare figure — pins carry no count at all, so the
// count only ever appears here, always explained).
//
// This file supersedes the S5b Task 4b name-pill suite. What it pins:
//   - the branch name renders (line 1);
//   - "Save £X" renders via the shared compact-currency formatter, and is
//     omitted for absent / null / zero savings;
//   - "N vouchers" renders WITH the ticket mark, and the count is NEVER a
//     bare number on its own (W2-D2/D6);
//   - the perforation divider appears only when BOTH save and count show;
//   - the marker-bitmap discipline: tracksViewChanges freezes after the
//     capture window and RE-OPENS on a genuine content change (W1.1
//     content-change re-track), and the memo bails out on an identical
//     re-render (no frozen-marker teleport);
//   - the tether geometry: the lockup's downward tail tip lands just above
//     the pin's visible resting head (W1.1 F15, TIGHTENED to ~2pt by W2a
//     round 3 — see the tether describe block's supersession note).

import React from 'react'
import { render, act } from '@testing-library/react-native'
import {
  MapNameChipMarker,
  CHIP_LIFT,
  CHIP_GAP_ABOVE_HEAD,
  PIN_SCALED_HEAD_TOP,
  PIN_SELECTED_HEAD_TOP,
  PIN_CONTAINER_HEIGHT_FOR_TESTS,
} from '@/features/map/components/MapNameChipMarker'

// react-native-maps mock — forwards children (so we can inspect the lockup
// content) and records each <Marker> render's tracksViewChanges (so we can
// assert the freeze/re-track + memo-bail behaviour).
const chipMarkerCalls: { identifier: any; tracksViewChanges: any }[] = []
jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    Marker: (props: any) => {
      chipMarkerCalls.push({ identifier: props.identifier, tracksViewChanges: props.tracksViewChanges })
      return ReactLib.createElement(View, props, props.children)
    },
  }
})

describe('MapNameChipMarker — W2a ticket lockup', () => {
  beforeEach(() => { chipMarkerCalls.length = 0 })

  it('renders the branch name (line 1)', () => {
    const { getByText, getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04" />,
    )
    expect(getByText('Bella Italia')).toBeTruthy()
    expect(getByTestId('map-name-chip-name-brn1')).toBeTruthy()
  })

  it('fills the icon block with the provided pinColor (same colour the pin uses)', () => {
    const { getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#7C4DFF" />,
    )
    // The icon block is the immediate first child of the card row; its
    // backgroundColor carries the category colour.
    const root = getByTestId('map-name-chip-brn1')
    const findColored = (node: any): boolean => {
      const style = Array.isArray(node?.props?.style)
        ? Object.assign({}, ...node.props.style.filter(Boolean))
        : node?.props?.style
      if (style && style.backgroundColor === '#7C4DFF') return true
      const kids = node?.props?.children
      const arr = Array.isArray(kids) ? kids : [kids]
      return arr.some((k: any) => k && typeof k === 'object' && findColored(k))
    }
    expect(findColored(root)).toBe(true)
  })

  // ── "Save £X" ────────────────────────────────────────────────────────

  it('does NOT render a "Save" fragment when maxEstimatedSaving is absent', () => {
    const { queryByTestId, getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04" />,
    )
    expect(getByTestId('map-name-chip-brn1')).toBeTruthy()
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('does NOT render a "Save" fragment when maxEstimatedSaving is null', () => {
    const { queryByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={null}
      />,
    )
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('does NOT render a "Save" fragment when maxEstimatedSaving is zero (nothing to save)', () => {
    const { queryByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={0}
      />,
    )
    expect(queryByTestId('map-name-chip-save-brn1')).toBeNull()
  })

  it('renders "Save £X" using the shared compact-currency formatter for a whole-pound saving', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={20}
      />,
    )
    expect(getByTestId('map-name-chip-save-brn1').props.children).toBe('Save £20')
  })

  it('keeps pence for a sub-pound saving (matches formatGbpCompact — no nonsensical "£0")', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={0.4}
      />,
    )
    expect(getByTestId('map-name-chip-save-brn1').props.children).toBe('Save £0.40')
  })

  // ── Voucher count: ticket mark + word, NEVER a bare number ─────────────

  it('does NOT render the voucher fragment when voucherCount is 0 / absent', () => {
    const { queryByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={20} voucherCount={0}
      />,
    )
    expect(queryByTestId('map-name-chip-ticket-brn1')).toBeNull()
    expect(queryByTestId('map-name-chip-vouchers-brn1')).toBeNull()
  })

  it('renders "N vouchers" WITH the ticket mark when voucherCount > 0', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={20} voucherCount={3}
      />,
    )
    expect(getByTestId('map-name-chip-ticket-brn1')).toBeTruthy()
    expect(getByTestId('map-name-chip-vouchers-brn1').props.children).toBe('3 vouchers')
  })

  it('pluralises correctly for a single voucher (still carries the word, never a bare figure)', () => {
    const { getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        voucherCount={1}
      />,
    )
    expect(getByTestId('map-name-chip-vouchers-brn1').props.children).toBe('1 voucher')
  })

  it('the count is NEVER rendered as a bare number on its own (W2-D2/D6)', () => {
    const { queryByText, getByTestId } = render(
      <MapNameChipMarker
        id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04"
        maxEstimatedSaving={20} voucherCount={5}
      />,
    )
    // The word-bearing label exists; a bare "5" text node does not.
    expect(getByTestId('map-name-chip-vouchers-brn1').props.children).toBe('5 vouchers')
    expect(queryByText('5')).toBeNull()
  })

  // ── Perforation divider: only when BOTH save and count show ────────────

  it('renders the perforation divider only when BOTH a saving and a voucher count are present', () => {
    const both = render(
      <MapNameChipMarker
        id="a" latitude={51.5} longitude={-0.1} label="Bella" pinColor="#E20C04"
        maxEstimatedSaving={20} voucherCount={3}
      />,
    )
    expect(both.getByTestId('map-name-chip-perforation-a')).toBeTruthy()

    const countOnly = render(
      <MapNameChipMarker
        id="b" latitude={51.5} longitude={-0.1} label="Bella" pinColor="#E20C04"
        voucherCount={3}
      />,
    )
    // No saving to separate from → no divider, but the voucher fragment still shows.
    expect(countOnly.queryByTestId('map-name-chip-perforation-b')).toBeNull()
    expect(countOnly.getByTestId('map-name-chip-vouchers-b')).toBeTruthy()
  })

  // ── Marker-bitmap discipline (LOCKED) ──────────────────────────────────

  it('freezes tracksViewChanges to false after the capture window', () => {
    jest.useFakeTimers()
    try {
      render(
        <MapNameChipMarker
          id="brn1" latitude={51.5} longitude={-0.1} label="Bella" pinColor="#E20C04" voucherCount={3}
        />,
      )
      expect(chipMarkerCalls[chipMarkerCalls.length - 1]!.tracksViewChanges).toBe(true)
      act(() => { jest.advanceTimersByTime(1500) })
      expect(chipMarkerCalls[chipMarkerCalls.length - 1]!.tracksViewChanges).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('RE-OPENS tracksViewChanges when the voucher count changes post-mount (content-change re-track)', () => {
    jest.useFakeTimers()
    try {
      const { rerender } = render(
        <MapNameChipMarker
          id="brn1" latitude={51.5} longitude={-0.1} label="Bella" pinColor="#E20C04" voucherCount={3}
        />,
      )
      act(() => { jest.advanceTimersByTime(1500) }) // settle to frozen
      expect(chipMarkerCalls[chipMarkerCalls.length - 1]!.tracksViewChanges).toBe(false)
      chipMarkerCalls.length = 0

      // A tile refetch moved the voucher count — the bitmap must recapture.
      rerender(
        <MapNameChipMarker
          id="brn1" latitude={51.5} longitude={-0.1} label="Bella" pinColor="#E20C04" voucherCount={7}
        />,
      )
      act(() => { jest.advanceTimersByTime(0) })
      expect(chipMarkerCalls.some(c => c.tracksViewChanges === true)).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('memo bails out on an identical re-render (frozen lockup never re-renders/teleports)', () => {
    jest.useFakeTimers()
    try {
      const props = { id: 'brn1', latitude: 51.5, longitude: -0.1, label: 'Bella', pinColor: '#E20C04', voucherCount: 3 }
      const { rerender } = render(<MapNameChipMarker {...props} />)
      act(() => { jest.advanceTimersByTime(1500) })
      chipMarkerCalls.length = 0

      // Same primitive values, fresh props object — the custom comparator
      // bails, so the Marker (recorded from inside the memoized base) is
      // never rendered again.
      rerender(<MapNameChipMarker {...{ ...props }} />)
      expect(chipMarkerCalls).toHaveLength(0)
    } finally {
      jest.useRealTimers()
    }
  })

  // ── Tether geometry — W1.1 F15, TIGHTENED by W2a round 3 ──────────────
  //
  // Pinned-test supersession record: the F15 tests asserted 4-6pt of air
  // above the visible resting head top AND strict clearance of the
  // SELECTED (scale 1) head. The owner's round-3 device review found the
  // lockup still detached, so the gap tightens to ~2pt above the visible
  // resting head top — which by arithmetic places the tail tip ~3.1pt
  // BELOW the selected head top (owner-accepted trade-off: slight contact
  // with the selected pin's outer ring / head-top arc reads as attached;
  // the resting state keeps clean air). The old strict selected-clearance
  // assertion is therefore REPLACED by a bounded-intrusion assertion, not
  // deleted silently.

  function chipOffsetTransform(testInstance: any): { translateX: number; translateY: number } {
    const style = Array.isArray(testInstance.props.style)
      ? Object.assign({}, ...testInstance.props.style.filter(Boolean))
      : testInstance.props.style
    const transform: any[] = style.transform ?? []
    const tx = transform.find((t) => 'translateX' in t)?.translateX ?? 0
    const ty = transform.find((t) => 'translateY' in t)?.translateY ?? 0
    return { translateX: tx, translateY: ty }
  }

  it('tether: the rendered offset is centred (translateX 0) and lifts by exactly CHIP_LIFT', () => {
    const { getByTestId } = render(
      <MapNameChipMarker id="brn1" latitude={51.5} longitude={-0.1} label="Bella Italia" pinColor="#E20C04" />,
    )
    const { translateX, translateY } = chipOffsetTransform(getByTestId('map-name-chip-brn1'))
    expect(translateX).toBe(0)
    expect(translateY).toBe(-CHIP_LIFT)
  })

  it('R3 tether: the lockup tail tip sits ~2pt above the VISIBLE resting head top (tight tether, not container-top float)', () => {
    // All in pin-container coords (y grows downward; the container bottom is
    // the shared anchor). The lockup's bottom-most point is its tail tip, at
    // container y = CONTAINER_HEIGHT - CHIP_LIFT.
    const tailTipY = PIN_CONTAINER_HEIGHT_FOR_TESTS - CHIP_LIFT
    const airAboveRestingHead = PIN_SCALED_HEAD_TOP - tailTipY
    expect(airAboveRestingHead).toBeGreaterThanOrEqual(1.5)
    expect(airAboveRestingHead).toBeLessThanOrEqual(2.5)
    expect(airAboveRestingHead).toBeCloseTo(CHIP_GAP_ABOVE_HEAD, 10)
  })

  it('R3 tether: the tail never reaches into the RESTING teardrop (tip strictly above the resting head top)', () => {
    const tailTipY = PIN_CONTAINER_HEIGHT_FOR_TESTS - CHIP_LIFT
    expect(tailTipY).toBeLessThan(PIN_SCALED_HEAD_TOP)
  })

  it('R3 tether: SELECTED-state intrusion is the documented, BOUNDED trade-off (tail tip at most ~3.2pt below the scale-1 head top)', () => {
    // Supersedes the F15 strict selected-clearance pin (see the block
    // comment above). The selected head top is y = 9; the tail tip at
    // y = 12.13 intrudes by (14.13 - 2) - 9 = 3.13pt. Pin the bound so a
    // future gap tweak cannot silently push the tail deep into the
    // selected teardrop.
    const tailTipY = PIN_CONTAINER_HEIGHT_FOR_TESTS - CHIP_LIFT
    const selectedIntrusion = tailTipY - PIN_SELECTED_HEAD_TOP
    expect(selectedIntrusion).toBeGreaterThan(0)       // the accepted contact exists
    expect(selectedIntrusion).toBeLessThanOrEqual(3.2) // and stays fractional
  })

  it('tether: constant-parity guard: the derived scaled head top matches the MapPins pin geometry (63 / 54 / 42 / 0.81)', () => {
    // The chip file duplicates the pin constants (module-scope
    // decoupling); this recomputes the derivation from first principles —
    // head-centre + scaled-radius, the W1 F2 shoulder maths — so silent
    // drift in either file fails loudly.
    const CONTAINER_HEIGHT = 63
    const PIN_HEIGHT = 54
    const PIN_WIDTH = 42
    const TEARDROP_TOP = CONTAINER_HEIGHT - PIN_HEIGHT       // 9
    const WRAP_CENTER_Y = TEARDROP_TOP + PIN_HEIGHT / 2      // 36
    const HEAD_CENTER_Y = TEARDROP_TOP + PIN_WIDTH / 2       // 30
    const HEAD_RADIUS = PIN_WIDTH / 2                        // 21
    const SCALE = 0.81
    const scaledHeadCenterY = WRAP_CENTER_Y + (HEAD_CENTER_Y - WRAP_CENTER_Y) * SCALE // 31.14
    const expectedScaledHeadTop = scaledHeadCenterY - HEAD_RADIUS * SCALE             // 14.13
    expect(PIN_SCALED_HEAD_TOP).toBeCloseTo(expectedScaledHeadTop, 10)
    // The head-centre derivation must agree with the wrapper-top shortcut
    // the F15 comment used — one geometry, two routes.
    expect(expectedScaledHeadTop).toBeCloseTo(WRAP_CENTER_Y + (TEARDROP_TOP - WRAP_CENTER_Y) * SCALE, 10)
    expect(PIN_CONTAINER_HEIGHT_FOR_TESTS).toBe(CONTAINER_HEIGHT)
  })
})
