import { describe, it, expect } from 'vitest'
import { crossCheckGoogleLocation, LOCATION_TRUST_RADIUS_METRES } from '../../../src/api/merchant/branch/locationTrust'

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
