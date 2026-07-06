// src/api/lib/effectiveLocation.ts
//
// Plan 4 M2.4 — EffectiveLocation resolver.
//
// Single chokepoint for combining a request's location signals into
// the contract every Discovery / Search / Map / Category surface will
// (in M3) read through. Resolves in this strict order per spec §4.4:
//
//   1. PLACE_QUERY (highest) — caller passes a `placeLocality` already
//      matched from a place search. The locality's centroid drives both
//      lat/lng and the ladder rung classification. Caller's GPS is
//      ignored. (Distance display in tiles is a separate concern; the
//      service layer can still show "X miles from you" using the GPS
//      query if it chooses.)
//
//   2. GPS — caller passes `?lat&lng` query params. `lat/lng` on the
//      result are the RAW query coords (spec wording: "lat, lng =
//      query params"); the locality is the indexed nearest match.
//      GPS beats saved profile because a user physically somewhere
//      different from their home address is browsing for "near me",
//      not for their saved area.
//
//   3. SAVED_PROFILE — no GPS, but `userId` is set and the user has
//      both `localityId` AND `latitude/longitude` populated. Reads the
//      User row + included locality in one query.
//
//   4. null — no signal at all. The caller decides intent-driven
//      fallback (LOCAL/MIXED categories show "Set your area"; the
//      DESTINATION lane can still surface national results).
//
// Pure read. No writes.
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §4.4
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.4

import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import { findNearestLocality } from './nearestLocality'
import { deriveDensityClass, type DensityClass } from './ladderProfiles'

export type EffectiveLocation = {
  lat: number
  lng: number
  locality: Locality
  densityClass: DensityClass
  source: 'GPS' | 'SAVED_PROFILE' | 'PLACE_QUERY'
}

export type EffectiveLocationQuery = {
  lat?: number
  lng?: number
  /**
   * When a place is matched via search (M4), the caller passes its
   * Locality directly. Wins over GPS and saved profile.
   */
  placeLocality?: Locality
}

export async function resolveEffectiveLocation(
  prisma: PrismaClient,
  query: EffectiveLocationQuery,
  userId: string | null,
): Promise<EffectiveLocation | null> {
  // DEV-ONLY screenshot/demo aid: when DEV_FORCE_CUSTOMER_LOCATION="lat,lng"
  // is set (never in production), incoming GPS coordinates are replaced before
  // resolution, so a device anywhere on earth renders the target city through
  // the normal GPS path (same source, same header typography). Fail-closed:
  // unset var = zero behaviour change; malformed value = ignored; only applies
  // when the request actually carried GPS coordinates.
  if (process.env.DEV_FORCE_CUSTOMER_LOCATION && process.env.NODE_ENV !== 'production') {
    const [fLat, fLng] = process.env.DEV_FORCE_CUSTOMER_LOCATION.split(',').map(Number)
    if (Number.isFinite(fLat) && Number.isFinite(fLng) && query.lat !== undefined && query.lng !== undefined) {
      query = { ...query, lat: fLat, lng: fLng }
    }
  }

  // Priority 1: place query.
  if (query.placeLocality) {
    return {
      lat: Number(query.placeLocality.centerLat),
      lng: Number(query.placeLocality.centerLng),
      locality: query.placeLocality,
      densityClass: deriveDensityClass(query.placeLocality.populationTier),
      source: 'PLACE_QUERY',
    }
  }

  // Priority 2: live GPS.
  if (query.lat !== undefined && query.lng !== undefined) {
    const nearest = await findNearestLocality(prisma, query.lat, query.lng)
    if (!nearest) return null
    return {
      lat: query.lat,
      lng: query.lng,
      locality: nearest,
      densityClass: deriveDensityClass(nearest.populationTier),
      source: 'GPS',
    }
  }

  // Priority 3: saved profile. Requires localityId AND lat/lng. A user
  // who has a localityId but null lat/lng is "incomplete" — fall
  // through to null rather than guess at the centroid.
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { locality: true },
    })
    if (user?.locality && user.latitude !== null && user.longitude !== null) {
      return {
        lat: Number(user.latitude),
        lng: Number(user.longitude),
        locality: user.locality,
        densityClass: deriveDensityClass(user.locality.populationTier),
        source: 'SAVED_PROFILE',
      }
    }
  }

  // Priority 4: nothing actionable.
  return null
}
