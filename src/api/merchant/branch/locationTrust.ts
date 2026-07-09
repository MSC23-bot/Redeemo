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

// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum, APPROVED).
export type PinWithinPostcodeAreaResult =
  | { within: true }
  | { within: false, reason: 'missing_centroid' | 'radius_exceeded' }

/**
 * The pin-drop analogue of `crossCheckGoogleLocation`: the pure, radius-only
 * check that decides whether a MERCHANT-DROPPED pin is admitted as the branch's
 * exact coordinate (MERCHANT_CONFIRMED) or degraded to NEEDS_REVIEW.
 *
 * Deliberately has NO postcode-string check: a merchant pin-drop is the fallback
 * for a business that is NOT on Google (spec §0), so there is no Google place and
 * no reported postcode to match. The SOLE trust basis is that the dropped pin
 * lies within `LOCATION_TRUST_RADIUS_METRES` of the branch's re-resolved
 * postcode-area centroid. This is why MERCHANT_CONFIRMED is the WEAKEST member of
 * CONFIRMED_LOCATION_SET (one signal, entirely merchant-supplied) and is a
 * DISTINCT enum value so a fraud audit can always tell it apart from the
 * two-signal Google path.
 *
 * Spec invariant L2 (Slice 3 analogue): this radius check is the ONLY
 * writer-authority basis for the MERCHANT_CONFIRMED decision. `missing_centroid`
 * (the postcode could not be re-resolved to a centroid) is a FAIL, never a pass.
 * Reuses the SAME `LOCATION_TRUST_RADIUS_METRES` constant as the Google path for
 * single-source consistency (D-L3: reuse 1000 m in v1).
 */
export function pinWithinPostcodeArea(input: {
  pinLat: number
  pinLng: number
  centroidLat: number | null
  centroidLng: number | null
}): PinWithinPostcodeAreaResult {
  if (input.centroidLat === null || input.centroidLng === null) {
    return { within: false, reason: 'missing_centroid' }
  }
  const d = haversineMetres(
    input.pinLat, input.pinLng,
    input.centroidLat, input.centroidLng,
  )
  if (d > LOCATION_TRUST_RADIUS_METRES) return { within: false, reason: 'radius_exceeded' }
  return { within: true }
}
