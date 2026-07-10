// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — hand-rolled grid
// clustering unit coverage. Pure function: (points, region) →
// { clusters, singles }. Covers grid edges, singletons, dedup
// (every input point appears exactly once in the output), and
// determinism (stable cluster ids across repeated calls).

import { clusterBranchPins, type ClusterPoint, type ClusterRegion } from '@/features/map/utils/mapClustering'

const LONDON_REGION: ClusterRegion = {
  latitude:       51.5074,
  longitude:      -0.1278,
  latitudeDelta:  0.05,
  longitudeDelta: 0.05,
}

// Matches the implementation's GRID_DIVISIONS = 8 (cellSize = delta / 8).
// Tests that need to reason about which grid cell a coordinate falls in
// use this to build boundary-safe fixture coordinates (mid-cell, well
// away from any floor() boundary) rather than "nice looking" numbers
// that can accidentally sit ON a cell edge (e.g. -0.100 is an exact
// multiple of 0.00625 and would be a bad fixture for a "same cell"
// assertion).
const CELL = LONDON_REGION.latitudeDelta / 8 // 0.00625

// Returns a coordinate at the CENTRE of grid cell `index` — as far as
// possible from either edge, so a small offset (well under half a
// cell) is guaranteed to stay in the same cell.
function cellCenter(index: number): number {
  return index * CELL + CELL / 2
}

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

  it('two points close together (same grid cell) merge into one cluster', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    // Offset well under half a cell (CELL/2 ≈ 0.003125) — stays in the
    // same cell regardless of where the centre sits.
    const result = clusterBranchPins(
      [point('a', lat, lng), point('b', lat + 0.0002, lng + 0.0002)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.singles).toHaveLength(0)
    expect(result.clusters[0]!.count).toBe(2)
    expect(result.clusters[0]!.points.map(p => p.id).sort()).toEqual(['a', 'b'])
  })

  it('two points far apart (different grid cells) stay as two singles', () => {
    const result = clusterBranchPins(
      [point('a', 51.0, -1.0), point('b', 53.0, 1.0)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(0)
    expect(result.singles).toHaveLength(2)
    expect(result.singles.map(s => s.id).sort()).toEqual(['a', 'b'])
  })

  it('cluster centroid is the arithmetic mean of its member coordinates', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    const a = { lat, lng }
    const b = { lat: lat + 0.001, lng: lng + 0.001 }
    const result = clusterBranchPins(
      [point('a', a.lat, a.lng), point('b', b.lat, b.lng)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    const cluster = result.clusters[0]!
    expect(cluster.latitude).toBeCloseTo((a.lat + b.lat) / 2, 10)
    expect(cluster.longitude).toBeCloseTo((a.lng + b.lng) / 2, 10)
  })

  it('grid edges: a point exactly on a cell boundary is assigned deterministically (floor convention)', () => {
    const boundary = CELL * 5
    const justBelow = boundary - 0.0000001
    const justAbove = boundary + 0.0000001
    const result = clusterBranchPins(
      [point('a', 51.5, justBelow), point('b', 51.5, justAbove)],
      LONDON_REGION,
    )
    // Different cells (boundary straddled) → both singles, not merged.
    expect(result.clusters).toHaveLength(0)
    expect(result.singles).toHaveLength(2)
  })

  it('grid edges: two points exactly at the same boundary value land in the same cell', () => {
    const boundary = CELL * 5
    const result = clusterBranchPins(
      [point('a', 51.5, boundary), point('b', 51.5, boundary)],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(2)
  })

  it('dedup: every input point appears exactly once across clusters + singles', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    const points = [
      point('a', lat, lng),
      point('b', lat + 0.0002, lng + 0.0002), // clusters with a
      point('c', 53.000, 1.000),              // lone single, far away
      point('d', lat, lng),                   // clusters with a/b again (exact duplicate coords)
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

  it('cluster ids are stable/deterministic across repeated calls with the same input', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    const points = [point('a', lat, lng), point('b', lat + 0.0002, lng + 0.0002)]
    const first = clusterBranchPins(points, LONDON_REGION)
    const second = clusterBranchPins(points, LONDON_REGION)
    expect(first.clusters[0]!.id).toBe(second.clusters[0]!.id)
  })

  it('cluster ids are grid-cell-keyed, not random (same cell → same id across calls even with a fresh point set)', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    const call1 = clusterBranchPins(
      [point('a', lat, lng), point('b', lat + 0.0001, lng + 0.0001)],
      LONDON_REGION,
    )
    const call2 = clusterBranchPins(
      [point('x', lat + 0.0002, lng + 0.0002), point('y', lat - 0.0001, lng - 0.0001)],
      LONDON_REGION,
    )
    // Both pairs fall in the same grid cell at this region → same
    // cluster id, even though the point ids differ entirely.
    expect(call1.clusters[0]!.id).toBe(call2.clusters[0]!.id)
  })

  it('zooming out (larger region delta → larger cells) can merge points that were separate when zoomed in', () => {
    // Grid cells are fixed-origin (floor(coord / cellSize)), so the
    // merge/split outcome depends on absolute alignment, not just
    // spread — pick coordinates that isolate the effect: same
    // latitude (cellY trivially identical either way), longitudes
    // 0.01deg apart. At a tight zoom the cell is much smaller than the
    // gap (separate cells); at a wide zoom the cell comfortably
    // contains both (same cell).
    const zoomedIn: ClusterRegion  = { ...LONDON_REGION, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    const zoomedOut: ClusterRegion = { ...LONDON_REGION, latitudeDelta: 2.0,  longitudeDelta: 2.0 }
    const points = [point('a', 0, 0.05), point('b', 0, 0.06)]

    const inResult  = clusterBranchPins(points, zoomedIn)
    const outResult = clusterBranchPins(points, zoomedOut)

    expect(inResult.clusters).toHaveLength(0)  // separate cells at tight zoom
    expect(outResult.clusters).toHaveLength(1) // merged into one cell zoomed out
    expect(outResult.clusters[0]!.count).toBe(2)
  })

  it('three points in one cell produce one cluster with count 3 (not 1+2 or 3 singles)', () => {
    const lat = cellCenter(1000)
    const lng = cellCenter(-100)
    const result = clusterBranchPins(
      [
        point('a', lat, lng),
        point('b', lat + 0.0001, lng + 0.0001),
        point('c', lat + 0.0002, lng + 0.0002),
      ],
      LONDON_REGION,
    )
    expect(result.clusters).toHaveLength(1)
    expect(result.clusters[0]!.count).toBe(3)
    expect(result.singles).toHaveLength(0)
  })
})
