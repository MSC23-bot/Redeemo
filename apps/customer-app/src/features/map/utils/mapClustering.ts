// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// hand-rolled deterministic clustering. REWRITTEN by Map P2 W2a round 3
// (owner device review 2026-07-13) from grid-bucket to DISTANCE-BASED
// agglomerative clustering (union-find single-linkage).
//
// Why the rewrite: the original implementation bucketed points into
// fixed-origin grid cells (`floor(coord / cellSize)`), so whether two
// points merged depended on the grid PHASE, not just their separation:
// two fixed points could share a cell at size S, straddle a boundary at
// a LARGER size, and share a cell again at a larger size still (e.g.
// longitudes 1.9 and 2.1: merged at cell 4, split at cell 2, merged at
// some sizes in between). On device that rendered as the owner's round-3
// bug: zooming OUT repeatedly alternated cluster(2) -> individual pins ->
// cluster(2). (The W1 addendum documented cluster/single transition
// artifacts as a revisit-on-device-QA trigger; device QA has now shown
// it.)
//
// The fix removes grid phase from the pair criterion entirely: two
// points merge when their SEPARATION is below a threshold derived from
// the viewport span (the same effective cell size the grid used, so the
// clustering granularity is unchanged), and clusters are the connected
// components of that "close enough" relation (single-linkage via
// union-find), centroid = arithmetic mean of members. This is MONOTONIC
// in zoom BY CONSTRUCTION: a pair whose separation is below the
// threshold at span X is below it at every larger span (the threshold
// scales linearly with the span while the separation is fixed), and
// single-linkage connectivity is monotone in the threshold — edges only
// get ADDED as the threshold grows, so components only ever merge,
// never split, as the user zooms out. No phase, no oscillation.
//
// COMPLEXITY: O(n^2) pair checks + near-linear union-find. n on this
// map is SMALL — tens of pins, bounded by the in-area route's result
// cap and the region-accumulation store's tile cap — so the quadratic
// pair loop is deliberately chosen over a spatial index for legibility.
//
// NO new dependency (locked task constraint). A pure function:
// `(points, region) => { clusters, singles }`. The threshold is derived
// from the current viewport zoom (react-native-maps reports zoom via
// `region.latitudeDelta` / `region.longitudeDelta` — smaller delta =
// more zoomed in — there is no cross-provider numeric "zoom level" on
// `Region` itself, so deltas are the standard proxy; `bboxQuantize.ts`
// in this same folder uses the same delta-based approach for its own
// quantization grid).
//
// SWAP-IN POINT: if pin density ever demands smarter clustering
// (e.g. thousands of concurrent markers, non-uniform density hot
// spots), `supercluster` (KD-tree based, hierarchical) is the natural
// replacement — it has the same conceptual input/output shape
// (points + viewport → clusters), so swapping the implementation
// behind `clusterBranchPins` would not require touching call sites.
// Not needed at current/expected Redeemo density (LEAD-adjudicated,
// programme decision register — clustering is client-side only).

export type ClusterPoint = {
  id: string
  latitude: number
  longitude: number
}

export type ClusterRegion = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export type PinCluster<T extends ClusterPoint> = {
  type: 'cluster'
  /** MEMBERSHIP-KEYED (W2a round 3): `cluster:` + the sorted member ids.
   *  Stable across recomputes whenever the membership is unchanged —
   *  including across ZOOM changes (the old scheme was grid-cell-keyed,
   *  so the same pair got a NEW id whenever the cell size or cell
   *  alignment changed, forcing react-native-maps Marker unmount/remount
   *  churn). Identity now follows the CONTENT the marker renders. */
  id: string
  latitude: number
  longitude: number
  count: number
  points: T[]
}

export type PinSingle<T extends ClusterPoint> = {
  type: 'single'
  id: string
  point: T
}

export type ClusterResult<T extends ClusterPoint> = {
  clusters: PinCluster<T>[]
  singles: PinSingle<T>[]
}

// How many merge-threshold units span the current viewport. Higher =
// finer clustering granularity (more, smaller clusters); lower =
// coarser (fewer, bigger clusters). Preserved from the grid
// implementation (GRID_DIVISIONS = 8): the merge threshold below IS the
// old effective cell size, so the on-screen clustering granularity is
// unchanged by the round-3 rewrite — only the phase artifact is gone.
const GRID_DIVISIONS = 8

// A component with fewer than this many points is NOT a cluster — it
// renders as an ordinary single pin. Matches the spec's "overlapping
// pins" framing (§7.3): a lone pin never becomes a 1-count cluster.
const MIN_POINTS_PER_CLUSTER = 2

// Defensive floor so an ultra-tight zoom (delta ~ 0) never produces a
// zero/negative threshold (division is still safe, but this guards
// against NaN/Infinity from a malformed region prop).
const MIN_DELTA = 0.0001

function thresholdFor(delta: number): number {
  return Math.max(Math.abs(delta), MIN_DELTA) / GRID_DIVISIONS
}

// Union-find with path compression (no union-by-rank — n is tens, and
// path compression alone keeps the walk effectively constant).
function findRoot(parent: number[], i: number): number {
  let root = i
  while (parent[root] !== root) root = parent[root]!
  while (parent[i] !== root) {
    const next = parent[i]!
    parent[i] = root
    i = next
  }
  return root
}

/**
 * Deterministic distance-based clustering. Pure — no mutation of the
 * input, no randomness, no I/O. The SAME (points, region) input always
 * produces the SAME output: clusters are emitted in first-member input
 * order, members within a cluster keep input order, and cluster ids are
 * membership-keyed (sorted member ids), so identical membership yields
 * an identical id across recomputes — required for stable Marker
 * `identifier`/`key` reuse across re-renders (avoids react-native-maps
 * unmount/remount churn, the same §BC/§BF concern the pin layer already
 * respects).
 *
 * Merge criterion: two points are directly linked when their separation,
 * measured in per-axis units of the viewport-derived threshold
 * (delta / GRID_DIVISIONS, the old grid's effective cell size), is below
 * 1 — i.e. normalized Euclidean distance
 * sqrt((dLat/thrLat)^2 + (dLng/thrLng)^2) < 1. Clusters are the
 * connected components of that relation (single-linkage). Because both
 * per-axis thresholds scale linearly with the viewport span (zooming
 * preserves the aspect ratio, so both deltas scale together), the link
 * set at any span is a SUBSET of the link set at every larger span:
 * clustering is monotone in zoom-out (see the header comment).
 *
 * Points with non-finite lat/lng are silently skipped (belt-and-braces —
 * callers should already filter null-coord branches per the existing
 * MapPins defensive contract).
 */
export function clusterBranchPins<T extends ClusterPoint>(
  points: readonly T[],
  region: ClusterRegion,
): ClusterResult<T> {
  const thrLat = thresholdFor(region.latitudeDelta)
  const thrLng = thresholdFor(region.longitudeDelta)

  const valid: T[] = []
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue
    valid.push(point)
  }

  const n = valid.length
  const parent = Array.from({ length: n }, (_, i) => i)

  // O(n^2) pair sweep — see the complexity note in the header comment.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dLat = (valid[i]!.latitude - valid[j]!.latitude) / thrLat
      const dLng = (valid[i]!.longitude - valid[j]!.longitude) / thrLng
      if (dLat * dLat + dLng * dLng < 1) {
        const rootI = findRoot(parent, i)
        const rootJ = findRoot(parent, j)
        if (rootI !== rootJ) parent[rootJ] = rootI
      }
    }
  }

  // Group members by component root, preserving input order for both
  // the components themselves (keyed by first-member index) and the
  // members within each component — deterministic given the same input.
  const componentsByRoot = new Map<number, T[]>()
  for (let i = 0; i < n; i++) {
    const root = findRoot(parent, i)
    const members = componentsByRoot.get(root)
    if (members) members.push(valid[i]!)
    else componentsByRoot.set(root, [valid[i]!])
  }

  const clusters: PinCluster<T>[] = []
  const singles: PinSingle<T>[] = []

  for (const members of componentsByRoot.values()) {
    if (members.length >= MIN_POINTS_PER_CLUSTER) {
      const sumLat = members.reduce((s, p) => s + p.latitude, 0)
      const sumLng = members.reduce((s, p) => s + p.longitude, 0)
      clusters.push({
        type:      'cluster',
        id:        `cluster:${members.map((p) => p.id).sort().join('+')}`,
        latitude:  sumLat / members.length,
        longitude: sumLng / members.length,
        count:     members.length,
        points:    members,
      })
    } else {
      for (const point of members) {
        singles.push({ type: 'single', id: point.id, point })
      }
    }
  }

  return { clusters, singles }
}
