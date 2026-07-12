// Map P2 W2a (owner decision W2-D1, 2026-07-12) — cluster markers are now
// Redeemo RED (color.brandRose, #E20C04), superseding the S3 navy, with the
// white ~3px ring and white count preserved. Red is THE brand colour and
// must stand out as the primary map signal.
//
// No dedicated cluster-marker unit-test file existed pre-W2a (cluster
// rendering was exercised only indirectly through MapPins, whose Marker
// mock does not forward children so it cannot inspect the circle fill).
// This file renders <MapClusterMarker> directly (same pattern as the
// CustomPin fill tests) and pins: the brand-red fill, the white ring, the
// white count text, and the §BC/§BF track-then-freeze discipline (freeze
// after the capture window; re-open on a count change; constant bounds).

import React from 'react'
import { render, act } from '@testing-library/react-native'

const clusterMarkerCalls: { identifier: any; tracksViewChanges: any }[] = []
jest.mock('react-native-maps', () => {
  const ReactLib = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    Marker: (props: any) => {
      clusterMarkerCalls.push({ identifier: props.identifier, tracksViewChanges: props.tracksViewChanges })
      return ReactLib.createElement(View, props, props.children)
    },
  }
})

import { MapClusterMarker } from '@/features/map/components/MapClusterMarker'
import { color } from '@/design-system'

function flatten(style: any): any {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatten))
  return style
}

describe('MapClusterMarker — W2a Redeemo-red cluster', () => {
  beforeEach(() => { clusterMarkerCalls.length = 0 })

  it('W2-D1: fills the cluster circle with the brand red token (#E20C04), not navy', () => {
    const { getByTestId } = render(
      <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b', 'c', 'd']} />,
    )
    const circle = flatten(getByTestId('map-cluster-c1').props.style)
    expect(circle.backgroundColor).toBe(color.brandRose)
    expect(color.brandRose).toBe('#E20C04') // brand-red guard
    expect(circle.backgroundColor).not.toBe(color.navy)
  })

  it('keeps the white ~3px ring', () => {
    const { getByTestId } = render(
      <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b', 'c', 'd']} />,
    )
    const circle = flatten(getByTestId('map-cluster-c1').props.style)
    expect(circle.borderColor).toBe('#FFFFFF')
    expect(circle.borderWidth).toBe(3)
  })

  it('renders the count in white', () => {
    const { getByText } = render(
      <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={7} branchIds={['a', 'b']} />,
    )
    const countText = getByText('7')
    const style = flatten(countText.props.style)
    expect(style.color).toBe('#FFFFFF')
  })

  it('§BC/§BF: freezes tracksViewChanges to false after the capture window', () => {
    jest.useFakeTimers()
    try {
      render(
        <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b']} />,
      )
      expect(clusterMarkerCalls[clusterMarkerCalls.length - 1]!.tracksViewChanges).toBe(true)
      act(() => { jest.advanceTimersByTime(1500) })
      expect(clusterMarkerCalls[clusterMarkerCalls.length - 1]!.tracksViewChanges).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BC: re-opens tracksViewChanges when the member count changes', () => {
    jest.useFakeTimers()
    try {
      const { rerender } = render(
        <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b']} />,
      )
      act(() => { jest.advanceTimersByTime(1500) })
      expect(clusterMarkerCalls[clusterMarkerCalls.length - 1]!.tracksViewChanges).toBe(false)
      clusterMarkerCalls.length = 0

      rerender(
        <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={6} branchIds={['a', 'b', 'c']} />,
      )
      act(() => { jest.advanceTimersByTime(0) })
      expect(clusterMarkerCalls.some(c => c.tracksViewChanges === true)).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('memo ignores the per-render branchIds array identity (bails on pan with a fresh array)', () => {
    jest.useFakeTimers()
    try {
      const onPress = jest.fn()
      const { rerender } = render(
        <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b']} onPress={onPress} />,
      )
      act(() => { jest.advanceTimersByTime(1500) })
      clusterMarkerCalls.length = 0

      // Pure pan: same count / coords / onPress, a FRESH branchIds array
      // (rebuilt every parent render). The comparator ignores branchIds, so
      // the memoized cluster bails and never re-renders.
      rerender(
        <MapClusterMarker id="c1" latitude={51.5} longitude={-0.1} count={4} branchIds={['a', 'b']} onPress={onPress} />,
      )
      expect(clusterMarkerCalls).toHaveLength(0)
    } finally {
      jest.useRealTimers()
    }
  })
})
