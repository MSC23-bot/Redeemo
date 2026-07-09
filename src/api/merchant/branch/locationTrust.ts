// src/api/merchant/branch/locationTrust.ts
//
// Branch Location Trust Slice 1 (spec 2026-07-09 §2.2): the pure cross-check
// that decides whether a merchant-picked Google pin is auto-trusted
// (ADDRESS_GEOCODED) or exception-queued (NEEDS_REVIEW). Both checks must pass:
//   (a) the postcode Google reports for the place matches the merchant-entered
//       postcode (normalised: uppercase, spaces stripped);
//   (b) the Google pin lies within LOCATION_TRUST_RADIUS_METRES of the entered
//       postcode's centroid (defence against a merchant picking a listing that
//       happens to share a postcode string but sits elsewhere, and against
//       Google returning an approximate/route-level geometry).
// Spec invariant L2: this module is the ONLY writer-authority for the
// ADDRESS_GEOCODED decision.
import { haversineMetres } from '../../shared/haversine'

export const LOCATION_TRUST_RADIUS_METRES = 1000

export type LocationTrustResult =
  | { trusted: true }
  | { trusted: false, reason: 'missing_postcode' | 'postcode_mismatch' | 'missing_centroid' | 'radius_exceeded' }

function normalisePostcode(pc: string): string {
  return pc.toUpperCase().replace(/\s+/g, '')
}

export function crossCheckGoogleLocation(input: {
  googleLat: number
  googleLng: number
  googlePostcode: string | null
  enteredPostcode: string
  centroidLat: number | null
  centroidLng: number | null
}): LocationTrustResult {
  if (input.googlePostcode === null) return { trusted: false, reason: 'missing_postcode' }
  if (normalisePostcode(input.googlePostcode) !== normalisePostcode(input.enteredPostcode)) {
    return { trusted: false, reason: 'postcode_mismatch' }
  }
  if (input.centroidLat === null || input.centroidLng === null) {
    return { trusted: false, reason: 'missing_centroid' }
  }
  const d = haversineMetres(
    input.googleLat, input.googleLng,
    input.centroidLat, input.centroidLng,
  )
  if (d > LOCATION_TRUST_RADIUS_METRES) return { trusted: false, reason: 'radius_exceeded' }
  return { trusted: true }
}
