// Branch Location Trust Slice 3 (pin-drop addendum §7 option (d) / plan Task 10):
// pure client-side Web Mercator pixel<->lat/lng math for the draggable pin
// overlaid on the backend-proxied static map image. This module has ZERO
// network and ZERO DOM dependency so it is independently unit-testable; the
// map component (PinDropMap) is the only consumer.
//
// The three STATIC_MAP_* constants MIRROR the backend's request params
// (src/api/lib/googleStaticMap.ts: STATIC_MAP_ZOOM / _WIDTH_PX / _HEIGHT_PX).
// They must be kept in sync by hand: the backend builds the image at
// zoom 14 / 640x400 (scale=2 only doubles the BACKING pixel density for a
// retina display; it does not change the CSS viewport or the projection
// math, so 640x400 is the correct coordinate space for this module).
// LOCATION_TRUST_RADIUS_METRES mirrors src/api/merchant/branch/locationTrust.ts.
//
// SECURITY NOTE: none of this module is a trust boundary. The server
// independently re-resolves the branch's postcode centroid and re-runs its
// OWN haversine radius check (pinWithinPostcodeArea) on whatever
// { latitude, longitude } this module computes and the client submits. If
// this module's assumed centre ever drifts from the server's freshly
// resolved centroid (e.g. a stale `branch.latitude/longitude` on the client),
// the WORST outcome is a slightly misleading disc overlay or an honest
// NEEDS_REVIEW outcome on submit -- never an incorrectly-admitted pin.

export const STATIC_MAP_ZOOM = 14
export const STATIC_MAP_WIDTH_PX = 640
export const STATIC_MAP_HEIGHT_PX = 400
export const LOCATION_TRUST_RADIUS_METRES = 1000

const TILE_SIZE = 256
const EARTH_RADIUS_METRES = 6_371_000
const MAX_MERCATOR_LAT = 85.05112878

export interface LatLng {
  lat: number
  lng: number
}

export interface PixelPoint {
  x: number
  y: number
}

export interface ProjectionParams {
  centerLat: number
  centerLng: number
  /** Defaults to STATIC_MAP_ZOOM. */
  zoom?: number
  /** Defaults to STATIC_MAP_WIDTH_PX. */
  widthPx?: number
  /** Defaults to STATIC_MAP_HEIGHT_PX. */
  heightPx?: number
}

function resolveParams(params: ProjectionParams) {
  return {
    centerLat: params.centerLat,
    centerLng: params.centerLng,
    zoom: params.zoom ?? STATIC_MAP_ZOOM,
    widthPx: params.widthPx ?? STATIC_MAP_WIDTH_PX,
    heightPx: params.heightPx ?? STATIC_MAP_HEIGHT_PX,
  }
}

function clampMercatorLat(lat: number): number {
  return Math.max(Math.min(lat, MAX_MERCATOR_LAT), -MAX_MERCATOR_LAT)
}

// Standard "world point" projection (the same one Google Maps / Leaflet use):
// maps a lat/lng to a point in a TILE_SIZE x TILE_SIZE square at zoom 0.
function toWorldPoint(lat: number, lng: number): PixelPoint {
  const sinLat = Math.sin(clampMercatorLat(lat) * (Math.PI / 180))
  const x = TILE_SIZE * (0.5 + lng / 360)
  const y = TILE_SIZE * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI))
  return { x, y }
}

function fromWorldPoint(point: PixelPoint): LatLng {
  const lng = (point.x / TILE_SIZE - 0.5) * 360
  const n = Math.PI - (2 * Math.PI * point.y) / TILE_SIZE
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lat, lng }
}

/**
 * Convert a lat/lng to a pixel offset within the STATIC MAP viewport, given
 * the viewport's centre + zoom + size. (0,0) is the top-left corner; the
 * centre point always resolves to (widthPx/2, heightPx/2).
 */
export function latLngToPixel(target: LatLng, params: ProjectionParams): PixelPoint {
  const { centerLat, centerLng, zoom, widthPx, heightPx } = resolveParams(params)
  const scale = 2 ** zoom
  const centerWorld = toWorldPoint(centerLat, centerLng)
  const targetWorld = toWorldPoint(target.lat, target.lng)
  return {
    x: (targetWorld.x - centerWorld.x) * scale + widthPx / 2,
    y: (targetWorld.y - centerWorld.y) * scale + heightPx / 2,
  }
}

/**
 * Inverse of latLngToPixel: a pixel offset within the viewport back to a
 * lat/lng, given the SAME centre + zoom + size the viewport was rendered at.
 */
export function pixelToLatLng(pixel: PixelPoint, params: ProjectionParams): LatLng {
  const { centerLat, centerLng, zoom, widthPx, heightPx } = resolveParams(params)
  const scale = 2 ** zoom
  const centerWorld = toWorldPoint(centerLat, centerLng)
  const targetWorld: PixelPoint = {
    x: centerWorld.x + (pixel.x - widthPx / 2) / scale,
    y: centerWorld.y + (pixel.y - heightPx / 2) / scale,
  }
  return fromWorldPoint(targetWorld)
}

/**
 * Great-circle distance in metres (mirrors src/api/shared/haversine.ts's
 * formula so the client-side "is this still inside the disc" preview agrees
 * with the server's authoritative check to floating-point precision).
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Clamp a candidate point to within radiusMetres of centre, preserving
 * bearing (linear interpolation in lat/lng space, an acceptable approximation
 * at this <=1km scale). This is a UX aid only -- a merchant cannot drag the
 * on-screen pin outside the shown disc -- it is NOT the admission gate. The
 * server always re-derives its own centroid and re-runs the real haversine
 * radius check (pinWithinPostcodeArea) regardless of what a client sends.
 */
export function clampToRadius(candidate: LatLng, center: LatLng, radiusMetres: number): LatLng {
  const distance = haversineMetres(center, candidate)
  if (distance <= radiusMetres || distance === 0) return candidate
  const fraction = radiusMetres / distance
  return {
    lat: center.lat + (candidate.lat - center.lat) * fraction,
    lng: center.lng + (candidate.lng - center.lng) * fraction,
  }
}

/**
 * Approximate on-screen pixel radius for a given real-world radius, for
 * drawing the shaded constraint disc. Offsets due EAST from the centre
 * (longitude only) and measures the resulting pixel delta: a reasonable
 * approximation at UK latitudes for a ~1km disc. VISUAL AID ONLY.
 */
export function radiusMetresToPixels(radiusMetres: number, params: ProjectionParams): number {
  const { centerLat, centerLng } = resolveParams(params)
  const metresPerDegreeLng = 111_320 * Math.cos((centerLat * Math.PI) / 180)
  if (metresPerDegreeLng <= 0) return 0
  const lngOffset = radiusMetres / metresPerDegreeLng
  const centerPx = latLngToPixel({ lat: centerLat, lng: centerLng }, params)
  const edgePx = latLngToPixel({ lat: centerLat, lng: centerLng + lngOffset }, params)
  return Math.abs(edgePx.x - centerPx.x)
}
