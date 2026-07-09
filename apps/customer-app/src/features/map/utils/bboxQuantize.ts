// Map in-area reliability slice — bbox quantization.
//
// The Map viewport bbox is continuous (driven by the native map's camera
// region, which reports slightly different bounds on every render even
// when the user hasn't meaningfully moved). Feeding the raw bbox straight
// into `useInAreaBranches`'s React Query key means panning back to an
// area the user already saw a moment ago still produces a brand-new key —
// no cache hit, a fresh network round-trip, and a brief re-render of the
// pins even though the answer hasn't changed.
//
// `quantizeBbox` snaps the bbox onto a coarse grid (3 decimal places,
// roughly 110m at UK latitudes) BEFORE it is used for either the request
// or the query key, so two viewports that land in the same grid cell
// collapse onto the same key/request. Mins are floored and maxs are
// ceiled — not rounded — so the quantized bbox always grows outward and
// fully covers the caller's real viewport; a round() could shrink an edge
// inward and silently drop in-viewport branches near the boundary.

export type BoundingBox = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const DECIMAL_PLACES = 3
const GRID = 10 ** DECIMAL_PLACES

export function quantizeBbox(bbox: BoundingBox): BoundingBox {
  return {
    minLat: Math.floor(bbox.minLat * GRID) / GRID,
    maxLat: Math.ceil(bbox.maxLat * GRID) / GRID,
    minLng: Math.floor(bbox.minLng * GRID) / GRID,
    maxLng: Math.ceil(bbox.maxLng * GRID) / GRID,
  }
}
