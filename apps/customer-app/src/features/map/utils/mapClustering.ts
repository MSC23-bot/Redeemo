// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// hand-rolled deterministic grid clustering.
//
// NO new dependency (locked task constraint). A pure function:
// `(points, region) => { clusters, singles }`. Cell size is derived
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
  /** Stable across calls with the SAME cell size (i.e. the same
   *  region delta) — enables react-native-maps Marker reuse instead
   *  of unmount/remount churn on every viewport-driven re-cluster. */
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

// How many grid columns/rows span the current viewport. Higher =
// finer clustering granularity (more, smaller clusters); lower =
// coarser (fewer, bigger clusters). 8 is a reasonable starting
// density for a phone-sized map viewport — tune with device QA.
const GRID_DIVISIONS = 8

// A cell with fewer than this many points is NOT a cluster — it
// renders as an ordinary single pin. Matches the spec's "overlapping
// pins" framing (§7.3): a lone pin never becomes a 1-count cluster.
const MIN_POINTS_PER_CLUSTER = 2

// Defensive floor so an ultra-tight zoom (delta ~ 0) never produces a
// zero/negative cell size (which would make every point its own
// infinite-precision cell — division is still safe, but guards
// against NaN/Infinity from a malformed region prop).
const MIN_DELTA = 0.0001

function cellSizeFor(delta: number): number {
  return Math.max(Math.abs(delta), MIN_DELTA) / GRID_DIVISIONS
}

/**
 * Deterministic grid clustering. Pure — no mutation, no randomness,
 * no I/O. The SAME (points, region) input always produces the SAME
 * output, including cluster ids (grid-cell-coordinate keyed, not
 * random) — required for stable Marker `identifier`/`key` reuse
 * across re-renders (avoids react-native-maps unmount/remount churn,
 * the same §BC/§BF concern the pin layer already respects).
 *
 * Points with non-finite lat/lng are silently skipped (belt-and-
 * braces — callers should already filter null-coord branches per the
 * existing MapPins defensive contract).
 */
export function clusterBranchPins<T extends ClusterPoint>(
  points: readonly T[],
  region: ClusterRegion,
): ClusterResult<T> {
  const cellLat = cellSizeFor(region.latitudeDelta)
  const cellLng = cellSizeFor(region.longitudeDelta)

  const buckets = new Map<string, T[]>()
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue
    const cellX = Math.floor(point.longitude / cellLng)
    const cellY = Math.floor(point.latitude / cellLat)
    const key = `${cellX}:${cellY}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(point)
    else buckets.set(key, [point])
  }

  const clusters: PinCluster<T>[] = []
  const singles: PinSingle<T>[] = []

  // Map iteration order mirrors insertion order (points[] order) —
  // deterministic given the same input array.
  for (const [key, bucketPoints] of buckets) {
    if (bucketPoints.length >= MIN_POINTS_PER_CLUSTER) {
      const sumLat = bucketPoints.reduce((s, p) => s + p.latitude, 0)
      const sumLng = bucketPoints.reduce((s, p) => s + p.longitude, 0)
      clusters.push({
        type:      'cluster',
        id:        `cluster:${key}`,
        latitude:  sumLat / bucketPoints.length,
        longitude: sumLng / bucketPoints.length,
        count:     bucketPoints.length,
        points:    bucketPoints,
      })
    } else {
      for (const point of bucketPoints) {
        singles.push({ type: 'single', id: point.id, point })
      }
    }
  }

  return { clusters, singles }
}
