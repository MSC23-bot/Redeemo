/**
 * Great-circle distance between two coordinates in METRES.
 *
 * Same formula the backend uses (`src/api/shared/haversine.ts`), kept
 * intentionally tiny + side-effect-free so the customer-app can
 * compute distances client-side without an extra backend roundtrip
 * (e.g. on the Favourites > Merchants card where lat/lng is already
 * exposed on the payload).
 *
 * Returns null when either pair is missing — callers should treat
 * this as "distance unavailable", matching the existing
 * `formatDistance(null)` contract.
 */
export function haversineMetres(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null
  const R = 6_371_000  // Earth radius in metres
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2
          + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}
