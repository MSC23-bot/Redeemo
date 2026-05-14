// src/api/customer/postcode/service.ts
//
// Plan 4 M1.19 — read-only preview of a postcode's resolved locality fields.
//
// Used by the customer-app PC2 (profile-completion step 2) during debounced
// typing: as the user enters a postcode, the app calls /postcode/preview to
// show "you'll be registered as <localityName>". The PREVIEW must NEVER
// auto-create database rows — otherwise a user typing "HD1 2P", "HD1 2PY",
// then deleting and typing again would create three needsReview Localities.
// The eventual SUBMIT (M1.20 PC2 + M1.21 Branch) is the only path that calls
// findOrCreateLocality, persisting at most one Locality per submit.
//
// Label agreement: preview's localityName uses the same pickRuntimeLocalityName
// path as submit's findOrCreateLocality, so the label the user sees during
// typing is exactly what gets persisted on submit.

import type { PrismaClient } from '../../../../generated/prisma/client'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findExistingLocality, pickRuntimeLocalityName } from '../../lib/findOrCreateLocality'

export type PostcodePreview = {
  postcode: string
  localityId: string | null     // null when no seeded Locality matches yet
  localityName: string          // derived from canonicalisation rule even with no Locality row
  postTown: string | null
  region: string | null
  country: string
}

export type PostcodePreviewResult =
  | { ok: true; preview: PostcodePreview }
  | { ok: false; error: 'POSTCODE_NOT_FOUND' | 'GAZETTEER_UNAVAILABLE' }

export async function previewPostcode(
  prisma: PrismaClient,
  rawCode: string,
): Promise<PostcodePreviewResult> {
  const result = await resolvePostcode(rawCode)
  if (!result.ok) return result

  // READ-ONLY lookup. If no Locality is seeded for this postcode yet, return
  // the derived name without persisting. Submit-time resolve-on-write does
  // the auto-create (M1.20 / M1.21).
  const locality = await findExistingLocality(prisma, result.snapshot)
  const localityName = locality?.name ?? pickRuntimeLocalityName(result.snapshot)
  return {
    ok: true,
    preview: {
      postcode: result.snapshot.postcode,
      localityId: locality?.id ?? null,
      localityName,
      postTown: result.snapshot.postTown ?? locality?.postTown ?? null,
      region: result.snapshot.region,
      country: result.snapshot.country,
    },
  }
}
