// PR-3 Phase B (Discovery Rebaseline Phase 2.2) — MapPins consumes
// `BranchTile[]` and renders one marker per branch (one-pin-per-branch
// cardinality, Spec §4.1.1).  Backend `getInAreaBranches` is
// MANUALLY_CONFIRMED-only at the SQL predicate; this client-side
// filter is belt-and-braces against future regressions or fixture
// mistakes that inject null-coord rows directly into <MapPins>.
//
// Inherits and preserves the §BC track-then-freeze + §BI 1000ms
// window contracts from the pre-rebaseline MapPins (see assertions
// further down — pinned verbatim, with `branch.id` as the marker key
// instead of `merchant.id`).
//
// Fold 1 (PR-3 plan §1.5) — getPinColor() reads
// `branch.merchant.primaryCategory.pinColour` from the backend first
// and only falls through to the hardcoded palette when the backend
// field is null/undefined.  Closes a §7.2 visual-correctness gap
// where non-Big-Four categories all defaulted to brandRose.

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { MapPins } from '@/features/map/components/MapPins'
import { makeBranchTile } from '../../fixtures/branchTile'

// react-native-maps mock — capture every <Marker> render so we can
// assert that the right branches get pins and the wrong ones don't.
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

// Map P2 W2a round 2 (owner direction 2026-07-13) — the name-chip zoom gate
// loosened from 0.03 to 0.10 latitude delta, so MapPins' DEFAULT_REGION
// (0.05, used when tests pass no `region`) now ALSO renders a ticket-lockup
// chip Marker (identifier `chip:{branchId}`) beside each single pin. The
// PIN-cardinality assertions below filter the chip markers out rather than
// double-counting them (chip content/behaviour has its own suite:
// MapNameChipMarker.test.tsx; the gate itself: mapNameChipGate.test.ts).
function pinCalls(): MarkerCall[] {
  return mockMarkerCalls.filter(c => !String(c.identifier).startsWith('chip:'))
}

describe('MapPins (Map BranchTile contract)', () => {
  beforeEach(() => { mockMarkerCalls.length = 0 })

  it('renders a Marker for a branch with non-null branchLatitude + branchLongitude', () => {
    const tile = makeBranchTile({
      id:                       'brn-karaara',
      branchLatitude:           53.6463,
      branchLongitude:          -1.7809,
      branchLocationConfidence: 'MANUALLY_CONFIRMED',
      merchant: { id: 'm-karaara', businessName: 'Karaara' },
    })
    render(<MapPins branches={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(pinCalls()).toHaveLength(1)
    expect(pinCalls()[0]!.identifier).toBe('brn-karaara')
    expect(pinCalls()[0]!.coordinate).toEqual({ latitude: 53.6463, longitude: -1.7809 })
  })

  it('uses branch.id (not merchant.id) as the Marker identifier', () => {
    // Locks the one-pin-per-branch contract — two branches of the
    // same merchant must produce two markers, each keyed by branch.id.
    const tile = makeBranchTile({
      id:              'brn-distinct',
      branchLatitude:  53.0,
      branchLongitude: -1.0,
      merchant:        { id: 'm-shared', businessName: 'Shared' },
    })
    render(<MapPins branches={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls[0]!.identifier).toBe('brn-distinct')
    expect(mockMarkerCalls[0]!.identifier).not.toBe('m-shared')
  })

  // ──────────────────────────────────────────────────────────────────────
  // One-pin-per-branch cardinality (Covelum bug closure, §M).
  //
  // Same-merchant multi-branch fixture: Brightlingsea + Colchester
  // both belong to merchant `m-covelum`. Pre-rebaseline the Map
  // collapsed to one tile per merchant → only one Covelum pin
  // rendered. Phase B: each branch renders its own pin.
  // ──────────────────────────────────────────────────────────────────────

  it('§M: two branches of the same merchant render two distinct markers (Covelum bug closure)', () => {
    const brightlingsea = makeBranchTile({
      id:                       'brn-covelum-bri',
      branchName:               'Brightlingsea',
      branchLatitude:           51.8054,
      branchLongitude:          1.0244,
      branchLocationConfidence: 'MANUALLY_CONFIRMED',
      merchant:                 { id: 'm-covelum', businessName: 'Covelum Restaurant' },
    })
    const colchester = makeBranchTile({
      id:                       'brn-covelum-col',
      branchName:               'Colchester',
      branchLatitude:           51.8959,
      branchLongitude:          0.8919,
      branchLocationConfidence: 'MANUALLY_CONFIRMED',
      merchant:                 { id: 'm-covelum', businessName: 'Covelum Restaurant' },
    })
    render(<MapPins branches={[brightlingsea, colchester]} selectedId={null} onPress={jest.fn()} />)
    expect(pinCalls()).toHaveLength(2)
    const identifiers = pinCalls().map(c => c.identifier).sort()
    expect(identifiers).toEqual(['brn-covelum-bri', 'brn-covelum-col'])
  })

  // ──────────────────────────────────────────────────────────────────────
  // Defensive client-side null-coord filter (Phase B).
  //
  // Backend `getInAreaBranches` is MANUALLY_CONFIRMED-only at the SQL
  // predicate (service.ts:3555) — POSTCODE_CENTROID / NEEDS_REVIEW /
  // ADDRESS_GEOCODED branches never leave the database.  These tests
  // are belt-and-braces against (a) a future backend change that
  // loosens the predicate without updating the client, (b) a fixture
  // mistake injecting null-coord rows directly into <MapPins>,
  // (c) malformed wire data from a serialization bug.
  // ──────────────────────────────────────────────────────────────────────

  it('skips a branch whose branchLatitude is null (defensive)', () => {
    const tile = makeBranchTile({
      id:                       'brn-approx',
      branchLatitude:           null,
      branchLongitude:          -1.7809,
      branchLocationConfidence: 'POSTCODE_CENTROID',
    })
    render(<MapPins branches={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a branch whose branchLongitude is null (defensive)', () => {
    const tile = makeBranchTile({
      id:                       'brn-approx',
      branchLatitude:           53.6463,
      branchLongitude:          null,
      branchLocationConfidence: 'POSTCODE_CENTROID',
    })
    render(<MapPins branches={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('skips a branch whose branchLatitude AND branchLongitude are both null', () => {
    const tile = makeBranchTile({
      id:                       'brn-approx',
      branchLatitude:           null,
      branchLongitude:          null,
      branchLocationConfidence: 'POSTCODE_CENTROID',
    })
    render(<MapPins branches={[tile]} selectedId={null} onPress={jest.fn()} />)
    expect(mockMarkerCalls).toHaveLength(0)
  })

  it('renders only the exact-coord branches when given a mixed list', () => {
    const confirmed = makeBranchTile({
      id:                       'brn-confirmed',
      branchLatitude:           53.6463,
      branchLongitude:          -1.7809,
      branchLocationConfidence: 'MANUALLY_CONFIRMED',
    })
    const approximate = makeBranchTile({
      id:                       'brn-approx',
      branchLatitude:           null,
      branchLongitude:          null,
      branchLocationConfidence: 'POSTCODE_CENTROID',
    })
    render(<MapPins branches={[confirmed, approximate]} selectedId={null} onPress={jest.fn()} />)
    expect(pinCalls()).toHaveLength(1)
    expect(pinCalls()[0]!.identifier).toBe('brn-confirmed')
  })

  // ──────────────────────────────────────────────────────────────────────
  // §BC — selection/tap flicker (preserved from pre-Phase-B).
  //
  // Pre-§BC: tracksViewChanges={false} on every Marker. When selectedId
  // toggled, the affected marker's inner content rendered with a
  // different size → react-native-maps cached the marker bitmap and
  // skipped view-change refreshes → stale-bitmap-then-remount cycle
  // → 2-second disappear-then-reappear flicker on the affected pin.
  //
  // §BC fix: track-then-freeze pattern. `tracksViewChanges` briefly
  // flips to true when `selected` toggles so the new bitmap captures
  // cleanly, then back to false to preserve the freeze for static
  // markers (perf).
  //
  // §BI 2026-05-16 — widened the freeze window from 250ms to 1000ms
  // after EAS preview QA showed 250ms was sometimes too short for
  // iOS to commit the first bitmap on cold mount under heavy frames.
  // ──────────────────────────────────────────────────────────────────────

  it('§BC: every marker initially renders with tracksViewChanges=true so the first bitmap captures', () => {
    const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
    const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
    render(<MapPins branches={[a, b]} selectedId={null} onPress={jest.fn()} />)
    expect(pinCalls()).toHaveLength(2)
    // Every marker — pins AND the co-rendered lockup chips — must capture
    // its first bitmap with tracking on.
    expect(mockMarkerCalls.every(c => c.tracksViewChanges === true)).toBe(true)
  })

  it('§BC: tracksViewChanges flips to false after the initial render burst (freeze restored)', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      render(<MapPins branches={[a]} selectedId={null} onPress={jest.fn()} />)
      expect(mockMarkerCalls[mockMarkerCalls.length - 1]!.tracksViewChanges).toBe(true)
      // Advance past the freeze timeout — bitmap should now be frozen.
      act(() => { jest.advanceTimersByTime(1500) })
      const aCalls = mockMarkerCalls.filter(c => c.identifier === 'a')
      expect(aCalls[aCalls.length - 1]!.tracksViewChanges).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  // §BI — the freeze window is at least 1000ms long. Locked 2026-05-16
  // after post-§BF EAS preview QA. This test pins the constant so a
  // future "tune for perf" PR doesn't silently shrink the window below
  // the safe floor.
  it('§BI: tracksViewChanges STAYS true at 250ms (was the §BC value; §BI widened to 1000ms+)', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      render(<MapPins branches={[a]} selectedId={null} onPress={jest.fn()} />)
      // 250ms — the old §BC threshold. With §BI bumping the window,
      // tracks must still be true at this point.
      act(() => { jest.advanceTimersByTime(250) })
      const aCalls = mockMarkerCalls.filter(c => c.identifier === 'a')
      expect(aCalls[aCalls.length - 1]!.tracksViewChanges).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BI: tracksViewChanges still flips to false eventually (window has an upper bound, not infinite)', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      render(<MapPins branches={[a]} selectedId={null} onPress={jest.fn()} />)
      // Past the §BI 1000ms window. Freeze should be back on for perf.
      act(() => { jest.advanceTimersByTime(1500) })
      const aCalls = mockMarkerCalls.filter(c => c.identifier === 'a')
      expect(aCalls[aCalls.length - 1]!.tracksViewChanges).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BC: changing selectedId does NOT unmount the previously-selected marker', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      const { rerender, queryByTestId } = render(
        <MapPins branches={[a, b]} selectedId="a" onPress={jest.fn()} />,
      )
      act(() => { jest.advanceTimersByTime(1500) }) // settle past the §BI 1000ms freeze

      // Marker 'a' is currently mounted (it's the selected one).
      expect(queryByTestId('marker-a')).toBeTruthy()
      expect(queryByTestId('marker-b')).toBeTruthy()

      // User taps a different pin. Both markers stay in the tree —
      // this is the §BC win. Pre-fix: react-native-maps would briefly
      // unmount + remount the affected marker(s) and the pin would
      // visually disappear for ~2s.
      rerender(<MapPins branches={[a, b]} selectedId="b" onPress={jest.fn()} />)
      expect(queryByTestId('marker-a')).toBeTruthy()
      expect(queryByTestId('marker-b')).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it('§BC: changing selectedId re-enables tracksViewChanges=true briefly so the resize captures', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      const { rerender } = render(
        <MapPins branches={[a, b]} selectedId={null} onPress={jest.fn()} />,
      )
      // Settle the initial freeze so we're past tracks=true.
      act(() => { jest.advanceTimersByTime(1500) })
      mockMarkerCalls.length = 0

      // Select 'a' — its tracks should briefly flip back to true.
      rerender(<MapPins branches={[a, b]} selectedId="a" onPress={jest.fn()} />)
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

  // ──────────────────────────────────────────────────────────────────────
  // Map P2 W1 (F1) — no frozen-marker re-render churn on a pure pan.
  //
  // The teleport root cause: <MapPins> receives a FRESH `branches` array
  // reference on every region change (the accumulation store returns a new
  // `Array.from(...)`), which rebuilds the internal clusters/singles arrays
  // and re-runs the singles `.map`. WITHOUT memoization every frozen
  // (tracksViewChanges=false) marker re-rendered, and on iOS a frozen
  // annotation whose JS content re-renders relocates to the map ORIGIN —
  // the top-left teleport the owner saw. `MapPinMarker` is now `React.memo`
  // wrapped; this pins that a pure pan (new array, SAME branch objects,
  // stable onPress, same zoom) does not re-render the markers at all.
  // ──────────────────────────────────────────────────────────────────────
  it('F1: a pure pan (new branches array, same branch objects, stable onPress) does NOT re-render frozen pin markers', () => {
    jest.useFakeTimers()
    try {
      // Far apart so they stay two distinct SINGLE pins (not a cluster).
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      const onPress = jest.fn()
      const regionA = { latitude: 51.5, longitude: 0.5, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      const { rerender } = render(
        <MapPins branches={[a, b]} selectedId={null} onPress={onPress} region={regionA} />,
      )
      act(() => { jest.advanceTimersByTime(1500) }) // settle past the §BI freeze
      mockMarkerCalls.length = 0

      // Camera pans (same zoom deltas); accumulation store hands back a NEW
      // array reference holding the SAME branch objects.
      const regionB = { latitude: 51.51, longitude: 0.51, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      rerender(<MapPins branches={[a, b]} selectedId={null} onPress={onPress} region={regionB} />)

      expect(mockMarkerCalls).toHaveLength(0)
    } finally {
      jest.useRealTimers()
    }
  })

  // Map P2 W1.1 (F13) — belt-and-braces comparator hardening. The W1 memo
  // used the default shallow compare (branch OBJECT identity); the owner's
  // re-test showed the residual teleport because the accumulation store
  // rebuilds branch objects when a tile refreshes (same id, NEW reference).
  // The comparator now compares primitive fields, so even an unavoidable
  // fresh reference with identical content cannot re-render a frozen pin.
  it('F13: a rerender with content-identical CLONES of the branch objects (new references) does NOT re-render frozen markers', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      const onPress = jest.fn()
      const region = { latitude: 51.5, longitude: 0.5, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      const { rerender } = render(
        <MapPins branches={[a, b]} selectedId={null} onPress={onPress} region={region} />,
      )
      act(() => { jest.advanceTimersByTime(1500) }) // settle past the §BI freeze
      mockMarkerCalls.length = 0

      // A tile refresh delivered freshly parsed objects: same ids, same
      // content, NEW references (the exact F13 churn shape).
      const aClone = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const bClone = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      expect(aClone).not.toBe(a)
      rerender(<MapPins branches={[aClone, bClone]} selectedId={null} onPress={onPress} region={region} />)

      expect(mockMarkerCalls).toHaveLength(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('F13: a clone whose COORDINATE genuinely changed DOES re-render (comparator does not over-suppress)', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const onPress = jest.fn()
      const region = { latitude: 51.5, longitude: 0.5, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      const { rerender } = render(
        <MapPins branches={[a]} selectedId={null} onPress={onPress} region={region} />,
      )
      act(() => { jest.advanceTimersByTime(1500) })
      mockMarkerCalls.length = 0

      const aMoved = makeBranchTile({ id: 'a', branchLatitude: 51.001, branchLongitude: 0 })
      rerender(<MapPins branches={[aMoved]} selectedId={null} onPress={onPress} region={region} />)
      act(() => { jest.advanceTimersByTime(0) })
      expect(mockMarkerCalls.some(c => c.identifier === 'a')).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('F1: a genuine selection change STILL re-renders the affected marker (memo does not over-suppress)', () => {
    jest.useFakeTimers()
    try {
      const a = makeBranchTile({ id: 'a', branchLatitude: 51, branchLongitude: 0 })
      const b = makeBranchTile({ id: 'b', branchLatitude: 52, branchLongitude: 1 })
      const onPress = jest.fn()
      const region = { latitude: 51.5, longitude: 0.5, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      const { rerender } = render(
        <MapPins branches={[a, b]} selectedId={null} onPress={onPress} region={region} />,
      )
      act(() => { jest.advanceTimersByTime(1500) })
      mockMarkerCalls.length = 0

      // Select 'a' — its `selected` prop flips, so it MUST re-render (and
      // re-open its track window to recapture the selected bitmap).
      rerender(<MapPins branches={[a, b]} selectedId="a" onPress={onPress} region={region} />)
      act(() => { jest.advanceTimersByTime(0) })
      expect(mockMarkerCalls.some(c => c.identifier === 'a')).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  // §BF stable-marker-dimensions tests live in CustomPin.test.tsx so
  // they can render CustomPin directly without dragging the §BC track-
  // then-freeze setTimeout chain into every assertion. The Fold 1
  // backend-pinColour assertions also live in CustomPin.test.tsx for
  // the same reason — the react-native-maps Marker mock in this file
  // does NOT forward children, so MapPins-level renders can't inspect
  // CustomPin's inner-circle backgroundColor.
})
