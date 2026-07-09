import { describe, it, expect } from 'vitest'
import {
  crossCheckGoogleLocation,
  pinWithinPostcodeArea,
  LOCATION_TRUST_RADIUS_METRES,
} from '../../../src/api/merchant/branch/locationTrust'

const CENTROID = { lat: 53.6458, lng: -1.7850 } // Huddersfield-ish
const NEARBY   = { lat: 53.6460, lng: -1.7845 } // ~40m away
const FAR      = { lat: 53.7458, lng: -1.7850 } // ~11km away

describe('crossCheckGoogleLocation', () => {
  it('trusts when postcode matches (case/space-insensitive) and pin is within radius', () => {
    expect(crossCheckGoogleLocation({
      googleLat: NEARBY.lat, googleLng: NEARBY.lng, googlePostcode: 'hd11aa',
      enteredPostcode: 'HD1 1AA', centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ trusted: true })
  })
  it('rejects on postcode mismatch', () => {
    expect(crossCheckGoogleLocation({
      googleLat: NEARBY.lat, googleLng: NEARBY.lng, googlePostcode: 'HD2 2BB',
      enteredPostcode: 'HD1 1AA', centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ trusted: false, reason: 'postcode_mismatch' })
  })
  it('rejects when the Google postcode is null', () => {
    expect(crossCheckGoogleLocation({
      googleLat: NEARBY.lat, googleLng: NEARBY.lng, googlePostcode: null,
      enteredPostcode: 'HD1 1AA', centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ trusted: false, reason: 'missing_postcode' })
  })
  it('rejects when the pin is outside the sanity radius', () => {
    expect(crossCheckGoogleLocation({
      googleLat: FAR.lat, googleLng: FAR.lng, googlePostcode: 'HD1 1AA',
      enteredPostcode: 'HD1 1AA', centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ trusted: false, reason: 'radius_exceeded' })
  })
  it('rejects when the centroid is unresolvable', () => {
    expect(crossCheckGoogleLocation({
      googleLat: NEARBY.lat, googleLng: NEARBY.lng, googlePostcode: 'HD1 1AA',
      enteredPostcode: 'HD1 1AA', centroidLat: null, centroidLng: null,
    })).toEqual({ trusted: false, reason: 'missing_centroid' })
  })
  it('exports a 1000m radius constant', () => {
    expect(LOCATION_TRUST_RADIUS_METRES).toBe(1000)
  })
})

describe('pinWithinPostcodeArea (Slice 3 merchant pin-drop)', () => {
  // ~1 deg latitude ≈ 111,320 m, so 0.0089 deg ≈ 991 m (inside) and 0.0092 deg
  // ≈ 1024 m (outside): a cross-boundary matrix around the 1000 m sanity radius.
  const INSIDE_BOUNDARY  = { lat: CENTROID.lat + 0.0089, lng: CENTROID.lng }
  const OUTSIDE_BOUNDARY = { lat: CENTROID.lat + 0.0092, lng: CENTROID.lng }

  it('admits a pin ~40 m from the centroid (well inside)', () => {
    expect(pinWithinPostcodeArea({
      pinLat: NEARBY.lat, pinLng: NEARBY.lng,
      centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ within: true })
  })

  it('admits a pin just INSIDE the 1000 m boundary', () => {
    expect(pinWithinPostcodeArea({
      pinLat: INSIDE_BOUNDARY.lat, pinLng: INSIDE_BOUNDARY.lng,
      centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ within: true })
  })

  it('rejects a pin just OUTSIDE the 1000 m boundary (radius_exceeded)', () => {
    expect(pinWithinPostcodeArea({
      pinLat: OUTSIDE_BOUNDARY.lat, pinLng: OUTSIDE_BOUNDARY.lng,
      centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ within: false, reason: 'radius_exceeded' })
  })

  it('rejects a pin far outside the radius (radius_exceeded)', () => {
    expect(pinWithinPostcodeArea({
      pinLat: FAR.lat, pinLng: FAR.lng,
      centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })).toEqual({ within: false, reason: 'radius_exceeded' })
  })

  it('rejects (never admits) when the centroid is unresolvable (missing_centroid)', () => {
    expect(pinWithinPostcodeArea({
      pinLat: NEARBY.lat, pinLng: NEARBY.lng,
      centroidLat: null, centroidLng: null,
    })).toEqual({ within: false, reason: 'missing_centroid' })
  })

  it('does NOT run a postcode-string check (radius alone decides): no postcode inputs exist', () => {
    // The signature deliberately omits any postcode field — proven structurally by
    // this call type-checking with only pin + centroid coordinates.
    const r = pinWithinPostcodeArea({
      pinLat: NEARBY.lat, pinLng: NEARBY.lng,
      centroidLat: CENTROID.lat, centroidLng: CENTROID.lng,
    })
    expect(r.within).toBe(true)
  })
})
