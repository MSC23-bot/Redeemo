// src/api/lib/findOrCreateLocality.ts
//
// Plan 4 M1.18 — locality resolution helper. Takes a ResolvedPostcodeSnapshot
// (from postcodes.io via M1.17) and returns the matching Locality row, OR
// creates one with `needsReview: true` if no existing Locality fits.
//
// Used by M1.20 (PC2 consumer onboarding step 2) and M1.21 (Branch resolve-
// on-write) to wire postcode → Locality on every write that supplies a
// postcode. Preview endpoints (M1.19) MUST NOT call this — they're read-only.
//
// Two-stage match strategy (mirrors the M1.12 seed slug-uniquifier ladder):
//   1. primary slug   = slugify(runtimeName)
//      If a Locality exists at that slug AND its ladDistrict + country match
//      the snapshot, return it.
//   2. fallback slug  = slugify(runtimeName) + '-' + slugify(ladDistrict)
//      If a Locality exists at that slug, return it.
//   3. else create a new Locality at the fallback slug with
//      populationTier='UNKNOWN' + needsReview=true. The admin panel (Phase 5)
//      reviews these and either promotes them or merges them into an
//      existing canonical Locality.
//
// Runtime name picker mirrors M1.12's pickLocalityName (parish → London ward
// → constituency → ward → LAD) but operates on a snapshot, not ONSPD raw rows.
//
// M1.19 will refactor this module into separate exports (pickRuntimeLocalityName,
// buildLocalitySlug, findExistingLocality, findOrCreateLocality) so the
// /postcode/preview endpoint can reuse the read-only "find" path.

import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import type { ResolvedPostcodeSnapshot } from './postcodeResolver'

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

function pickRuntimeName(snap: ResolvedPostcodeSnapshot): string {
  const isLondon = snap.region === 'London'
  if (snap.parish && !isUnparishedPlaceholder(snap.parish)) return snap.parish
  if (isLondon && snap.adminWard) return snap.adminWard
  if (snap.parliamentaryConstituency) return snap.parliamentaryConstituency
  if (snap.adminWard) return snap.adminWard
  return snap.ladDistrict
}

function slugify(name: string, ladDistrict?: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!ladDistrict) return base
  const ladSuffix = ladDistrict.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base}-${ladSuffix}`
}

export async function findOrCreateLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality> {
  const name = pickRuntimeName(snap)
  const primarySlug = slugify(name)

  // 1) Primary slug match — accept only when LAD + country also match (defence
  // against same-name same-slug collisions across different LADs/countries).
  let existing = await prisma.locality.findUnique({ where: { slug: primarySlug } })
  if (existing && existing.ladDistrict === snap.ladDistrict && existing.country === snap.country) {
    return existing
  }

  // 2) Fallback slug — base + LAD suffix.
  const fallbackSlug = slugify(name, snap.ladDistrict)
  existing = await prisma.locality.findUnique({ where: { slug: fallbackSlug } })
  if (existing) return existing

  // 3) Auto-create with needsReview=true. populationTier defaults to UNKNOWN
  //    (admin panel — Phase 5 — promotes or merges).
  return prisma.locality.create({
    data: {
      name,
      slug: fallbackSlug,
      postTown: snap.postTown,
      ladDistrict: snap.ladDistrict,
      adminCounty: snap.adminCounty,
      region: snap.region,
      country: snap.country,
      centerLat: snap.latitude,
      centerLng: snap.longitude,
      populationTier: 'UNKNOWN',
      needsReview: true,
    },
  })
}
