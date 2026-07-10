import {
  latLngToPixel,
  pixelToLatLng,
  haversineMetres,
  clampToRadius,
  radiusMetresToPixels,
  STATIC_MAP_WIDTH_PX,
  STATIC_MAP_HEIGHT_PX,
  STATIC_MAP_ZOOM,
  LOCATION_TRUST_RADIUS_METRES,
} from '@/lib/branches/pinDropMercator'

// Branch Location Trust Slice 3 (plan Task 10): pure Web Mercator pixel<->lat/lng
// math. Cambridge (52.2053, 0.1218) is used as a representative UK centroid
// throughout (matches the LocationCard test fixtures elsewhere in this app).
const CAMBRIDGE = { lat: 52.2053, lng: 0.1218 }
const PARAMS = { centerLat: CAMBRIDGE.lat, centerLng: CAMBRIDGE.lng }

describe('pinDropMercator constants', () => {
  it('mirrors the backend static-map + radius constants', () => {
    expect(STATIC_MAP_ZOOM).toBe(14)
    expect(STATIC_MAP_WIDTH_PX).toBe(640)
    expect(STATIC_MAP_HEIGHT_PX).toBe(400)
    expect(LOCATION_TRUST_RADIUS_METRES).toBe(1000)
  })
})

describe('latLngToPixel / pixelToLatLng round-trip', () => {
  it('maps the centre lat/lng to the exact centre pixel', () => {
    const px = latLngToPixel(CAMBRIDGE, PARAMS)
    expect(px.x).toBeCloseTo(STATIC_MAP_WIDTH_PX / 2, 6)
    expect(px.y).toBeCloseTo(STATIC_MAP_HEIGHT_PX / 2, 6)
  })

  it('maps the centre pixel back to the exact centre lat/lng', () => {
    const latLng = pixelToLatLng({ x: STATIC_MAP_WIDTH_PX / 2, y: STATIC_MAP_HEIGHT_PX / 2 }, PARAMS)
    expect(latLng.lat).toBeCloseTo(CAMBRIDGE.lat, 6)
    expect(latLng.lng).toBeCloseTo(CAMBRIDGE.lng, 6)
  })

  it('round-trips lat/lng -> pixel -> lat/lng for points across the viewport', () => {
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: 40, dy: 0 },
      { dx: -40, dy: 0 },
      { dx: 0, dy: 40 },
      { dx: 0, dy: -40 },
      { dx: 120, dy: 90 },
      { dx: -200, dy: -150 },
      { dx: 319, dy: 199 }, // near the viewport edge
    ]
    for (const { dx, dy } of offsets) {
      const px = { x: STATIC_MAP_WIDTH_PX / 2 + dx, y: STATIC_MAP_HEIGHT_PX / 2 + dy }
      const latLng = pixelToLatLng(px, PARAMS)
      const roundTripped = latLngToPixel(latLng, PARAMS)
      expect(roundTripped.x).toBeCloseTo(px.x, 6)
      expect(roundTripped.y).toBeCloseTo(px.y, 6)
    }
  })

  it('round-trips pixel -> lat/lng -> pixel for a set of nearby real-world points', () => {
    const points = [
      CAMBRIDGE,
      { lat: CAMBRIDGE.lat + 0.005, lng: CAMBRIDGE.lng + 0.005 },
      { lat: CAMBRIDGE.lat - 0.005, lng: CAMBRIDGE.lng - 0.005 },
      { lat: CAMBRIDGE.lat + 0.003, lng: CAMBRIDGE.lng - 0.004 },
    ]
    for (const point of points) {
      const px = latLngToPixel(point, PARAMS)
      const roundTripped = pixelToLatLng(px, PARAMS)
      expect(roundTripped.lat).toBeCloseTo(point.lat, 6)
      expect(roundTripped.lng).toBeCloseTo(point.lng, 6)
    }
  })

  it('a pixel offset EAST of centre yields a larger longitude (never inverted)', () => {
    const east = pixelToLatLng({ x: STATIC_MAP_WIDTH_PX / 2 + 50, y: STATIC_MAP_HEIGHT_PX / 2 }, PARAMS)
    expect(east.lng).toBeGreaterThan(CAMBRIDGE.lng)
  })

  it('a pixel offset NORTH (smaller y) of centre yields a larger latitude', () => {
    const north = pixelToLatLng({ x: STATIC_MAP_WIDTH_PX / 2, y: STATIC_MAP_HEIGHT_PX / 2 - 50 }, PARAMS)
    expect(north.lat).toBeGreaterThan(CAMBRIDGE.lat)
  })
})

describe('haversineMetres', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMetres(CAMBRIDGE, CAMBRIDGE)).toBe(0)
  })

  it('returns a small positive distance for a nearby point', () => {
    const nearby = { lat: CAMBRIDGE.lat + 0.001, lng: CAMBRIDGE.lng }
    const distance = haversineMetres(CAMBRIDGE, nearby)
    // ~0.001 degrees latitude is ~111 metres.
    expect(distance).toBeGreaterThan(100)
    expect(distance).toBeLessThan(120)
  })
})

describe('clampToRadius', () => {
  it('leaves a point inside the radius unchanged', () => {
    const nearby = { lat: CAMBRIDGE.lat + 0.001, lng: CAMBRIDGE.lng }
    const clamped = clampToRadius(nearby, CAMBRIDGE, LOCATION_TRUST_RADIUS_METRES)
    expect(clamped).toEqual(nearby)
  })

  it('leaves the exact centre unchanged (zero-distance edge case)', () => {
    const clamped = clampToRadius(CAMBRIDGE, CAMBRIDGE, LOCATION_TRUST_RADIUS_METRES)
    expect(clamped).toEqual(CAMBRIDGE)
  })

  it('pulls a far-away point back onto the radius boundary, preserving bearing', () => {
    // ~0.05 degrees latitude north is roughly 5.5km away: well outside 1km.
    const far = { lat: CAMBRIDGE.lat + 0.05, lng: CAMBRIDGE.lng }
    const clamped = clampToRadius(far, CAMBRIDGE, LOCATION_TRUST_RADIUS_METRES)
    const clampedDistance = haversineMetres(CAMBRIDGE, clamped)
    expect(clampedDistance).toBeCloseTo(LOCATION_TRUST_RADIUS_METRES, 0)
    // Bearing preserved: still due north (same lng, larger lat).
    expect(clamped.lng).toBeCloseTo(CAMBRIDGE.lng, 6)
    expect(clamped.lat).toBeGreaterThan(CAMBRIDGE.lat)
  })

  it('a point exactly on the boundary is left unchanged', () => {
    // Construct a point at exactly the radius by going due east.
    const metresPerDegreeLng = 111_320 * Math.cos((CAMBRIDGE.lat * Math.PI) / 180)
    const lngOffset = LOCATION_TRUST_RADIUS_METRES / metresPerDegreeLng
    const onBoundary = { lat: CAMBRIDGE.lat, lng: CAMBRIDGE.lng + lngOffset }
    const clamped = clampToRadius(onBoundary, CAMBRIDGE, LOCATION_TRUST_RADIUS_METRES)
    expect(haversineMetres(CAMBRIDGE, clamped)).toBeLessThanOrEqual(LOCATION_TRUST_RADIUS_METRES + 1)
  })
})

describe('radiusMetresToPixels', () => {
  it('returns a positive pixel radius for the 1km disc at a UK latitude', () => {
    const px = radiusMetresToPixels(LOCATION_TRUST_RADIUS_METRES, PARAMS)
    expect(px).toBeGreaterThan(0)
    // At zoom 14 the disc should be a modest fraction of the 640px viewport,
    // not the whole frame and not a speck.
    expect(px).toBeLessThan(STATIC_MAP_WIDTH_PX / 2)
    expect(px).toBeGreaterThan(10)
  })

  it('grows with the requested radius', () => {
    const small = radiusMetresToPixels(200, PARAMS)
    const large = radiusMetresToPixels(1000, PARAMS)
    expect(large).toBeGreaterThan(small)
  })
})
