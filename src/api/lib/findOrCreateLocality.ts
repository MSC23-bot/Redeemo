// src/api/lib/findOrCreateLocality.ts
//
// Plan 4 M1.18 + M1.19 — locality resolution helpers.
//
// Exports (in dependency order):
//   1. pickRuntimeLocalityName(snap)  — pure name picker (mirrors M1.12).
//   2. buildLocalitySlug(name, lad?)  — pure slugify (mirrors M1.12).
//   3. findExistingLocality(prisma, snap)  — READ-ONLY lookup. Returns the
//      matching Locality if seeded; null otherwise. NEVER writes. Used by
//      /postcode/preview (M1.19) so PC2 debounced typing never auto-creates
//      database rows.
//   4. findOrCreateLocality(prisma, snap) — find-or-create. Delegates to
//      findExistingLocality for the lookup half, then creates with
//      needsReview=true on miss. Used by PC2 submit (M1.20), Branch
//      resolve-on-write (M1.21).
//
// The preview / submit separation guarantees label agreement: both surfaces
// run the same pickRuntimeLocalityName + findExistingLocality path, so the
// localityName a user sees during typing is exactly what gets persisted on
// submit. Preview NEVER persists; submit always does.
//
// Two-stage match strategy (mirrors the M1.12 seed slug-uniquifier ladder):
//   1. primary slug   = slugify(runtimeName)
//      Match accepted only when Locality.ladDistrict + .country also align
//      with the snapshot — defence against same-name same-slug collisions
//      across different LADs/countries.
//   2. fallback slug  = slugify(runtimeName) + '-' + slugify(ladDistrict)
//      If a Locality exists at that slug, return it (any country/LAD).

import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import type { ResolvedPostcodeSnapshot } from './postcodeResolver'

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

/**
 * Pure name picker used by preview + submit + seed. Single source of truth
 * for the canonicalisation rule (Plan 4 spec §4.1.1):
 *   parish (non-unparished) → London ward (region==='London') → constituency
 *   → ward → LAD.
 */
export function pickRuntimeLocalityName(snap: ResolvedPostcodeSnapshot): string {
  const isLondon = snap.region === 'London'
  if (snap.parish && !isUnparishedPlaceholder(snap.parish)) return snap.parish
  if (isLondon && snap.adminWard) return snap.adminWard
  if (snap.parliamentaryConstituency) return snap.parliamentaryConstituency
  if (snap.adminWard) return snap.adminWard
  return snap.ladDistrict
}

/**
 * Pure slugify. With no ladDistrict argument returns the primary slug
 * (base name only). With ladDistrict returns the fallback slug
 * (base + '-' + ladSuffix).
 *
 * Matches the M1.12 seed slug-uniquifier output for the first two rungs
 * of the escalation ladder (base, base+LAD). The country+numeric rungs
 * are only needed at seed time to disambiguate cross-country / parenthetical
 * collisions across the full UK gazetteer — at runtime, postcode + LAD +
 * country pin the match uniquely.
 */
export function buildLocalitySlug(name: string, ladDistrict?: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!ladDistrict) return base
  const ladSuffix = ladDistrict.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base}-${ladSuffix}`
}

/**
 * Read-only lookup. Returns the matching Locality if seeded; null if no match.
 * NEVER writes. Used by /postcode/preview during PC2 debounced typing so we
 * don't auto-create rows on every keystroke (Plan 4a §M1.19 read-only fix).
 *
 * Identity is (name, ladDistrict, country) — backed by the
 * @@unique([name, ladDistrict, country]) constraint on Locality (PR #81
 * review fix; see Locality model comment in schema.prisma).
 *
 * The earlier slug-based lookup had a real correctness bug: slugify
 * ('Langley (Uttlesford)') collapses to the same primary slug as
 * 'Langley' + LAD-suffix ('langley-uttlesford'), so a postcode for the
 * bare 'Langley' parish could resolve to the parenthetical disambiguator's
 * Locality row (or vice versa). Tuple match closes this entirely — the
 * seed generator groups Localities by (country, ladName, name) already,
 * so this is exactly the natural identity.
 */
export async function findExistingLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality | null> {
  const name = pickRuntimeLocalityName(snap)
  return prisma.locality.findUnique({
    where: {
      name_ladDistrict_country: {
        name,
        ladDistrict: snap.ladDistrict,
        country: snap.country,
      },
    },
  })
}

/**
 * Find-or-create: returns the matching Locality, OR creates a new one with
 * `needsReview: true` if the postcodes.io admin hierarchy doesn't match a
 * seeded Locality. Used by PC2 submit (M1.20), Branch create / pending-edit
 * approval (M1.21).
 *
 * Auto-created rows surface to the Phase 5 admin panel (§AP in
 * project_deferred_followups_index.md) via the `needsReview` flag for human
 * review / promote / merge.
 */
export async function findOrCreateLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality> {
  const existing = await findExistingLocality(prisma, snap)
  if (existing) return existing
  const name = pickRuntimeLocalityName(snap)
  const slug = buildLocalitySlug(name, snap.ladDistrict)
  return prisma.locality.create({
    data: {
      name,
      slug,
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
