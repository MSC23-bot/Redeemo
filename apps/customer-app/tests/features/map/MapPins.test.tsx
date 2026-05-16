// Map contract / rebaseline-gap fix — MapPins must render markers when
// the backend exposes nearest-branch coordinates on a tile, and must
// skip merchants whose tile coords are null (POSTCODE_CENTROID and
// other non-MANUALLY_CONFIRMED branches, per the PR #81 redaction
// contract).
//
// The pre-fix state of MapPins read `(merchant as any).lat/.lng` which
// were always undefined → zero pins ever rendered. This suite pins the
// fixed contract.

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { MapPins } from '@/features/map/components/MapPins'
import { makeMerchantTile } from '../../fixtures/merchantTile'

// react-native-maps mock — capture every <Marker> render so we can
// assert that the right merchants get pins and the wrong ones don't.
type MarkerCall = {
  identifier: string
  coordinate: { latitude: number; longitude: number }
  tracksViewChanges?: boolean
}
const mockMarkerCalls: MarkerCall[] = []

jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: (props: any) => ReactLib.createElement(View, props, props.children),
    Marker: (props: any) => {
      mockMarkerCalls.push({
        identifier:        props.identifier,
        coordinate:        props.coordinate,
        tracksViewChanges: props.tracksViewChanges,
      })
      return ReactLib.createElement(View, { testID: `marker-${props.identifier}` })
    },
  }
})

describe('MapPins (Map tile coordinates contract)', () => {
  beforeEach(() => { mockMarkerCalls.length = 0 })

  it('renders a Marker for a merchant whose tile has both latitude and longitude', () => {
    const tile = makeMerchantTile({
      id: 'm-confirmed', businessName: 'Karaara',
      latitude: 53.6463, longitude: -1.7809,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(1)
    expect(mockMarkerCalls[0]!.identifier).toBe('m-confirmed')
    expect(mockMarkerCalls[0]!.coordinate).toEqual({ latitude: 53.6463, longitude: -1.7809 })
  })

  it('skips a merchant whose latitude is null (POSTCODE_CENTROID redaction)', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: -1.7809,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a merchant whose longitude is null (defensive)', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: 53.6463, longitude: null,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a merchant whose latitude AND longitude are both null', () => {
    const tile = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: null,
    })
    render(<MapPins merchants={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('renders only the confirmed pin when given a mixed list', () => {
    const confirmed = makeMerchantTile({
      id: 'm-confirmed', businessName: 'Karaara',
      latitude: 53.6463, longitude: -1.7809,
    })
    const approximate = makeMerchantTile({
      id: 'm-approx', businessName: 'Approximate',
      latitude: null, longitude: null,
    })
    render(<MapPins merchants={[confirmed, approximate]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(1)
    expect(mockMarkerCalls[0]!.identifier).toBe('m-confirmed')
  })

  // ──────────────────────────────────────────────────────────────────────
  // §BC — selection/tap flicker.
  //
  // Pre-fix: tracksViewChanges={false} on every Marker. When selectedId
  // toggles, the affected marker's <CustomPin> child renders with a
  // different size (34 → 42 or vice versa). react-native-maps caches
  // the marker bitmap and skips view-change refreshes, which in this
  // SDK version results in a stale-bitmap-then-remount cycle on the
  // affected pin → 2-second disappear-then-reappear flicker.
  //
  // Fix: track-then-freeze pattern. tracksViewChanges briefly flips
  // to true when selected toggles so the new bitmap captures cleanly,
  // then back to false to preserve the freeze for static markers
  // (perf — without freeze, every pin re-renders its bitmap on every
  // camera change, which is what tracksViewChanges={false} guards).
  // ──────────────────────────────────────────────────────────────────────

  it('§BC: every marker initially renders with tracksViewChanges=true so the first bitmap captures', () => {
    const a = makeMerchantTile({ id: 'a', latitude: 51, longitude: 0 })
    const b = makeMerchantTile({ id: 'b', latitude: 52, longitude: 1 })
    render(<MapPins merchants={[a, b]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(2)
    expect(mockMarkerCalls.every(c => c.tracksViewChanges === true)).toBe(true)
  })

  it('§BC: tracksViewChanges flips to false after the initial render burst (freeze restored)', () => {
    jest.useFakeTimers()
    try {
      const a = makeMerchantTile({ id: 'a', latitude: 51, longitude: 0 })
      render(<MapPins merchants={[a]} selectedId={null} onPress={jest.fn()} />)
      expect(mockMarkerCalls[mockMarkerCalls.length - 1]!.tracksViewChanges).toBe(true)
      // Advance past the freeze timeout — bitmap should now be frozen.
      act(() => { jest.advanceTimersByTime(500) })
      const aCalls = mockMarkerCalls.filter(c => c.identifier === 'a')
      expect(aCalls[aCalls.length - 1]!.tracksViewChanges).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BC: changing selectedId does NOT unmount the previously-selected marker', () => {
    jest.useFakeTimers()
    try {
      const a = makeMerchantTile({ id: 'a', latitude: 51, longitude: 0 })
      const b = makeMerchantTile({ id: 'b', latitude: 52, longitude: 1 })
      const { rerender, queryByTestId } = render(
        <MapPins merchants={[a, b]} selectedId="a" onPress={jest.fn()} />,
      )
      act(() => { jest.advanceTimersByTime(500) }) // settle the freeze

      // Marker 'a' is currently mounted (it's the selected one).
      expect(queryByTestId('marker-a')).toBeTruthy()
      expect(queryByTestId('marker-b')).toBeTruthy()

      // User taps a different pin. Both markers stay in the tree —
      // this is the §BC win. Pre-fix: react-native-maps would briefly
      // unmount + remount the affected marker(s) and the pin would
      // visually disappear for ~2s.
      rerender(<MapPins merchants={[a, b]} selectedId="b" onPress={jest.fn()} />)
      expect(queryByTestId('marker-a')).toBeTruthy()
      expect(queryByTestId('marker-b')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BC: changing selectedId re-enables tracksViewChanges=true briefly so the resize captures', () => {
    jest.useFakeTimers()
    try {
      const a = makeMerchantTile({ id: 'a', latitude: 51, longitude: 0 })
      const b = makeMerchantTile({ id: 'b', latitude: 52, longitude: 1 })
      const { rerender } = render(
        <MapPins merchants={[a, b]} selectedId={null} onPress={jest.fn()} />,
      )
      // Settle the initial freeze so we're past tracks=true.
      act(() => { jest.advanceTimersByTime(500) })
      mockMarkerCalls.length = 0

      // Select 'a' — its tracks should briefly flip back to true.
      rerender(<MapPins merchants={[a, b]} selectedId="a" onPress={jest.fn()} />)
      // Effect fires synchronously via state update → next render captures
      // with tracks=true again. Wait one frame.
      act(() => { jest.advanceTimersByTime(0) })
      const aTracksDuringTransition = mockMarkerCalls
        .filter(c => c.identifier === 'a')
        .some(c => c.tracksViewChanges === true)
      expect(aTracksDuringTransition).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  // §BF stable-marker-dimensions tests live in CustomPin.test.tsx so
  // they can render CustomPin directly without dragging the §BC track-
  // then-freeze setTimeout chain into every assertion. See sibling test
  // file in the same directory.
})
