// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — clustering unit coverage.
// Pure function: (points, region) → { clusters, singles }.
//
// W2a round 3 (owner device review 2026-07-13) — REWRITTEN alongside the
// module: grid-bucket clustering is replaced by distance-based
// agglomerative clustering (union-find single-linkage), because grid
// PHASE made cluster/single membership oscillate while zooming out
// (merged at cell size S, split at a LARGER size, merged again). Test
// supersessions ("the fixed behaviour was itself the pin"):
//   - the two 'grid edges' tests asserted the phase artifact itself
//     (points 0.0000002deg apart straddling a cell boundary stayed
//     SEPARATE) — replaced by separation-based assertions (near-
//     coincident points always merge, wherever they sit);
//   - the 'grid-cell-keyed ids' test asserted two DIFFERENT point sets
//     sharing a cell got the SAME cluster id — ids are now MEMBERSHIP-
//     keyed (sorted member ids), so identity follows the content the
//     marker renders; replaced by membership-identity assertions,
//     including id stability across ZOOM changes (impossible under
//     cell-keyed ids).
// Everything else (empty/singleton, centroid, dedup, non-finite skip,
// determinism, count-3 component) carries over unchanged in intent.
// New: an explicit MONOTONICITY regression for the owner's zoom-out
// oscillation.

import { clusterBranchPins, type ClusterPoint, type ClusterRegion } from '@/features/map/utils/mapClustering'

const LONDON_REGION: ClusterRegion = {
  latitude:       51.5074,
  longitude:      -0.1278,
  latitudeDelta:  0.05,
  longitudeDelta: 0.05,
}

// Matches the implementation's GRID_DIVISIONS = 8: the merge threshold
// is delta / 8 per axis (the old grid's effective cell size, preserved
// so the round-3 rewrite keeps the same clustering granularity).
const THRESHOLD = LONDON_REGION.latitudeDelta / 8 // 0.00625

function point(id: string, latitude: number, longitude: number): ClusterPoint {
  return { id, latitude, longitude }
}

describe('clusterBranchPins', () => {
  it('returns empty clusters and singles for an empty input', () => {
    const result = clusterBranchPins([], LONDON_REGION)
    expect(result.clusters).toEqual([])
    expect(result.singles).toEqual([])
  })

  it('a single point is a single, never a cluster', () => {
    const result = clusterBranchPins([point('a', 51.5, -0.1)], LONDON_REGION)
    expect(result.clusters).toHaveLength(0)
    expect(result.singles).toHaveLength(1)
    expect(result.singles[0]!.id).toBe('a')
  })

  it('two points closer than the merge threshold form one cluster', () => {
    const result = clusterBranchPins(
      [point('a', 51.5, -0.1), point('b', 51.5 + 0.0002, -0.1 + 0.0002)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.singles).toHaveLength(0)
    expect(result.clusters[0]!.count).toBe(2)
    expect(result.clusters[0]!.points.map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('two points far apart stay as two singles', () => {
    const result = clusterBranchPins(
      [point('a', 51.0, -1.0), point('b', 53.0, 1.0)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(0)
    expect(result.singles).toHaveLength(2)
    expect(result.singles.map(s => s.id).sort()).toEqual(['a', 'b'])
  })

  it('cluster centroid is the arithmetic mean of its member coordinates', () => {
    const a = { lat: 51.5, lng: -0.1 }
    const b = { lat: 51.501, lng: -0.099 }
    const result = clusterBranchPins(
      [point('a', a.lat, a.lng), point('b', b.lat, b.lng)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    const cluster = result.clusters[0]!
    expect(cluster.latitude).toBeCloseTo((a.lat + b.lat) / 2, 10)
    expect(cluster.longitude).toBeCloseTo((a.lng + b.lng) / 2, 10)
  })

  // W2a round 3 — supersedes the old 'grid edges: boundary straddle stays
  // separate' test, which pinned the phase artifact itself. The criterion
  // is now pure separation: near-coincident points merge WHEREVER they
  // sit (there is no boundary to straddle).
  it('near-coincident points always merge, regardless of absolute position (no grid phase)', () => {
    // The exact fixture that stayed SPLIT under the old grid (straddling
    // the cell-5 boundary by a hair): 0.0000002deg apart.
    const oldBoundary = THRESHOLD * 5
    const result = clusterBranchPins(
      [point('a', 51.5, oldBoundary - 0.0000001), point('b', 51.5, oldBoundary + 0.0000001)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(2)
  })

  it('two points at exactly the same coordinate merge (separation 0)', () => {
    const result = clusterBranchPins(
      [point('a', 51.5, -0.1), point('b', 51.5, -0.1)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(2)
  })

  it('dedup: every input point appears exactly once across clusters + singles', () => {
    const points = [
      point('a', 51.5, -0.1),
      point('b', 51.5 + 0.0002, -0.1 + 0.0002), // clusters with a
      point('c', 53.000, 1.000),                // lone single, far away
      point('d', 51.5, -0.1),                   // clusters with a/b again (exact duplicate coords)
    ]
    const result = clusterBranchPins(points, LONDON_REGION)
    const allIds = [
      ...result.clusters.flatMap(c => c.points.map(p => p.id)),
      ...result.singles.map(s => s.id),
    ]
    expect(allIds.sort()).toEqual(['a', 'b', 'c', 'd'])
    // No id appears twice.
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('skips points with non-finite latitude/longitude (defensive, belt-and-braces)', () => {
    const result = clusterBranchPins(
      [point('a', NaN, -0.1), point('b', 51.5, Infinity), point('c', 51.5, -0.1)],
      LONDON_REGION,
    )
    const allIds = [
      ...result.clusters.flatMap(c => c.points.map(p => p.id)),
      ...result.singles.map(s => s.id),
    ]
    expect(allIds).toEqual(['c'])
  })

  // ── W2a round 3 — membership-keyed cluster identity ────────────────────

  it('cluster ids are stable/deterministic across repeated calls with the same input', () => {
    const points = [point('a', 51.5, -0.1), point('b', 51.5 + 0.0002, -0.1 + 0.0002)]
    const first = clusterBranchPins(points, LONDON_REGION)
    const second = clusterBranchPins(points, LONDON_REGION)
    expect(first.clusters[0]!.id).toBe(second.clusters[0]!.id)
  })

  it('cluster ids are MEMBERSHIP-keyed: unchanged membership keeps its id across ZOOM changes', () => {
    // The marker-layer win over the old cell-keyed scheme: the same pair
    // keeps the same Marker identifier/key while the user zooms (as long
    // as membership is unchanged), so react-native-maps reuses the
    // annotation instead of unmount/remount churn.
    const points = [point('a', 51.5, -0.1), point('b', 51.5 + 0.0002, -0.1 + 0.0002)]
    const zoomA = clusterBranchPins(points, LONDON_REGION)
    const zoomB = clusterBranchPins(points, { ...LONDON_REGION, latitudeDelta: 0.4, longitudeDelta: 0.4 })
    expect(zoomA.clusters).toHaveLength(1)
    expect(zoomB.clusters).toHaveLength(1)
    expect(zoomA.clusters[0]!.id).toBe(zoomB.clusters[0]!.id)
  })

  it('cluster ids are membership-keyed: input ORDER does not change the id (sorted member ids)', () => {
    const forward  = clusterBranchPins([point('a', 51.5, -0.1), point('b', 51.5, -0.1)], LONDON_REGION)
    const reversed = clusterBranchPins([point('b', 51.5, -0.1), point('a', 51.5, -0.1)], LONDON_REGION)
    expect(forward.clusters[0]!.id).toBe(reversed.clusters[0]!.id)
  })

  it('cluster ids differ when the membership differs (identity follows content)', () => {
    const ab = clusterBranchPins([point('a', 51.5, -0.1), point('b', 51.5, -0.1)], LONDON_REGION)
    const xy = clusterBranchPins([point('x', 51.5, -0.1), point('y', 51.5, -0.1)], LONDON_REGION)
    expect(ab.clusters[0]!.id).not.toBe(xy.clusters[0]!.id)
  })

  // ── W2a round 3 — MONOTONICITY regression (owner zoom-out oscillation) ─

  it('zooming out (larger region delta) can merge points that were separate when zoomed in', () => {
    const zoomedIn: ClusterRegion  = { ...LONDON_REGION, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    const zoomedOut: ClusterRegion = { ...LONDON_REGION, latitudeDelta: 2.0,  longitudeDelta: 2.0 }
    const points = [point('a', 0, 0.05), point('b', 0, 0.06)]

    const inResult  = clusterBranchPins(points, zoomedIn)
    const outResult = clusterBranchPins(points, zoomedOut)

    expect(inResult.clusters).toHaveLength(0)  // separation 8x threshold at tight zoom
    expect(outResult.clusters).toHaveLength(1) // separation 0.04x threshold zoomed out
    expect(outResult.clusters[0]!.count).toBe(2)
  })

  it('MONOTONIC in zoom-out: once a pair clusters at some span, it stays clustered at every larger span (the round-3 oscillation fix)', () => {
    // The exact phase-bug fixture from the round-3 brief: longitudes 1.9
    // and 2.1 (separation 0.2, same latitude). Under the OLD fixed-origin
    // grid (cell = span / 8) this pair OSCILLATED while zooming out:
    //   span  8.8 (cell 1.1): floor(1.9/1.1)=1, floor(2.1/1.1)=1 -> MERGED
    //   span 16.0 (cell 2.0): floor(1.9/2.0)=0, floor(2.1/2.0)=1 -> SPLIT
    //   span 32.0 (cell 4.0): floor(1.9/4.0)=0, floor(2.1/4.0)=0 -> MERGED
    // i.e. cluster(2) -> individual pins -> cluster(2), the owner's bug.
    // Distance-based clustering merges iff separation < span/8, i.e. iff
    // span > 1.6 — monotone by construction. Sweep spans across the old
    // oscillation points and assert clustered(spanA) implies
    // clustered(spanB) for every larger span.
    const points = [point('a', 0, 1.9), point('b', 0, 2.1)]
    const spans = [0.4, 0.8, 1.6, 1.7, 8.8, 16, 32]
    const clustered = spans.map((span) => {
      const region: ClusterRegion = { latitude: 0, longitude: 2, latitudeDelta: span, longitudeDelta: span }
      return clusterBranchPins(points, region).clusters.length === 1
    })

    // Once true, never false again at a larger span.
    for (let i = 1; i < clustered.length; i++) {
      if (clustered[i - 1]) expect(clustered[i]).toBe(true)
    }
    // And the sweep genuinely exercises both regimes (guards against a
    // vacuously-monotone all-false/all-true fixture) — including span 16,
    // where the old grid SPLIT this pair between two merged spans.
    expect(clustered[0]).toBe(false)                      // span 0.4: far apart
    expect(clustered[spans.indexOf(8.8)]).toBe(true)      // old grid: merged
    expect(clustered[spans.indexOf(16)]).toBe(true)       // old grid: SPLIT (the bug)
    expect(clustered[spans.indexOf(32)]).toBe(true)       // old grid: merged again
  })

  it('three mutually-close points produce one cluster with count 3 (not 1+2 or 3 singles)', () => {
    const result = clusterBranchPins(
      [
        point('a', 51.5, -0.1),
        point('b', 51.5 + 0.0001, -0.1 + 0.0001),
        point('c', 51.5 + 0.0002, -0.1 + 0.0002),
      ],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(3)
    expect(result.singles).toHaveLength(0)
  })

  it('single-linkage chaining: a chain of pairwise-close points forms ONE component even when its ends are far apart', () => {
    // a-b and b-c are each within the threshold; a-c is not. Single-
    // linkage (connected components) merges all three — documents the
    // deliberate linkage semantics rather than leaving them implicit.
    const step = THRESHOLD * 0.9
    const result = clusterBranchPins(
      [
        point('a', 51.5, -0.1),
        point('b', 51.5, -0.1 + step),
        point('c', 51.5, -0.1 + step * 2),
      ],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(3)
  })
})
