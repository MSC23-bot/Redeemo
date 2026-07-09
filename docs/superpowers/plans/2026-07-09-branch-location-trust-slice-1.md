# Branch Location Trust — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google-picked branch locations become customer-visible map pins automatically when they pass server-side cross-checks; failures degrade to today's behaviour plus a NEEDS_REVIEW stamp.

**Architecture:** Extend the existing candidate-token flow (coords never cross the wire) so the resolved Google pin is APPLIED at branch create when two cross-checks pass (postcode match + centroid sanity radius), stamping `ADDRESS_GEOCODED`; widen every customer exposure gate from `MANUALLY_CONFIRMED`-only to the pre-existing `CONFIRMED_LOCATION_SET` (`MANUALLY_CONFIRMED` + `ADDRESS_GEOCODED`). Spec: `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md` (invariants L1-L4).

**Tech Stack:** Fastify + Prisma 7 (client at `generated/prisma/client`), Redis candidate stash, vitest (`npm run test:unit` only; NEVER plain `npx vitest run`).

**Branch:** `feat/branch-location-trust-slice-1` off `main`. Commit per task.

---

### Task 1: Schema — `Branch.googlePlaceId`

**Files:**
- Modify: `prisma/schema.prisma` (Branch model, next to `locationConfidence` ~line 564)

- [ ] **Step 1: Add the column**

```prisma
  // Branch Location Trust Slice 1 (spec 2026-07-09): provenance of an
  // ADDRESS_GEOCODED pin — the Google Place the merchant picked. Null for
  // manual/centroid locations. Never exposed to customers.
  googlePlaceId      String?
```

- [ ] **Step 2: Migrate + regenerate**

Run: `npx prisma migrate dev --name branch-google-place-id` then `npx prisma generate`
Expected: one additive migration; client regenerates cleanly.

- [ ] **Step 3: Commit** (`git add prisma/schema.prisma prisma/migrations && git commit -m "feat(schema): Branch.googlePlaceId for location-trust provenance"`)

### Task 2: Layer-1 stash carries the candidate's parsed postcode

**Files:**
- Modify: `src/api/merchant/location/service.ts` (interface `ResolvedLocationCandidate`; stash write in `searchMerchantLocations`; validation in `resolveLocationCandidate`)
- Test: `tests/api/merchant/location.service.test.ts` (extend the existing suite)

- [ ] **Step 1: Failing test — stash round-trips the parsed postcode**

```ts
it('stashes the candidate postcode and returns it on resolve', async () => {
  // arrange: mock searchPlaces to return one candidate whose
  // formattedAddress ends in a UK postcode (reuse the suite's mock pattern)
  const [cand] = await searchMerchantLocations(redis, ctx, 'Iron Forge Gym')
  const resolved = await resolveLocationCandidate(redis, ctx.merchantId, cand.candidateToken)
  expect(resolved).toMatchObject({ postcode: 'HD1 1AA' })
})
```

- [ ] **Step 2: Run to verify it fails** (`npx vitest run --project unit tests/api/merchant/location.service.test.ts`)

- [ ] **Step 3: Implement**

```ts
export interface ResolvedLocationCandidate {
  placeId: string
  latitude: number
  longitude: number
  /** Slice 1: postcode parsed from the Google formattedAddress at stash time
   *  (parseFormattedAddress). Null when Google's address had no parseable UK
   *  postcode — the trust pipeline treats null as a failed postcode check. */
  postcode: string | null
}
```

In `searchMerchantLocations`, parse once and reuse for both the stash and the DTO:

```ts
    const addressParts = parseFormattedAddress(c.formattedAddress)
    const stash: ResolvedLocationCandidate = {
      placeId: c.placeId,
      latitude: c.latitude,
      longitude: c.longitude,
      postcode: addressParts.postcode,
    }
```

In `resolveLocationCandidate`'s shape validation, accept string-or-null with a
back-compat default (an in-flight pre-deploy stash entry lacks the field):

```ts
  const postcode = typeof obj.postcode === 'string' ? obj.postcode : null
```

and include `postcode` in the returned object.

- [ ] **Step 4: Run tests, verify pass; run the whole file's suite**
- [ ] **Step 5: Commit**

### Task 3: Pure cross-check helper

**Files:**
- Create: `src/api/merchant/branch/locationTrust.ts`
- Test: `tests/api/merchant/branch.locationTrust.test.ts`

- [ ] **Step 1: Failing tests (full matrix)**

```ts
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
```

- [ ] **Step 2: Run to verify fail**
- [ ] **Step 3: Implement**

```ts
// src/api/merchant/branch/locationTrust.ts
//
// Branch Location Trust Slice 1 (spec 2026-07-09 §2.2) — the pure cross-check
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
    { lat: input.googleLat, lng: input.googleLng },
    { lat: input.centroidLat, lng: input.centroidLng },
  )
  if (d > LOCATION_TRUST_RADIUS_METRES) return { trusted: false, reason: 'radius_exceeded' }
  return { trusted: true }
}
```

(Check `haversineMetres`'s actual signature in `src/api/shared/haversine.ts` first and adapt the call: it may take positional args.)

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit**

### Task 4: Wire the pipeline into `createBranchCore`

**Files:**
- Modify: `src/api/merchant/branch/service.ts` (`createBranchCore` ~line 239; `BranchLocationSuggestion` gains `postcode: string | null` since `resolveLocationCandidate` now returns it)
- Test: extend the existing branch-create suite under `tests/api/merchant/` (find the suite that exercises `createBranch` with a `locationSuggestion`; follow its mocking pattern)

- [ ] **Step 1: Failing tests**

Three cases (adapt arrange/act to the suite's existing fixtures):

```ts
it('applies the Google pin + ADDRESS_GEOCODED + googlePlaceId when cross-checks pass', async () => {
  // suggestion postcode === body.postcode; suggestion coords within 1km of the
  // mocked postcode-resolver centroid
  const branch = await createBranch(prisma, ownerUserId, body, auditCtx, {
    placeId: 'place-123', latitude: 53.6460, longitude: -1.7845, postcode: body.postcode,
  })
  const row = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })
  expect(row.locationConfidence).toBe('ADDRESS_GEOCODED')
  expect(row.googlePlaceId).toBe('place-123')
  expect(Number(row.latitude)).toBeCloseTo(53.6460, 4)
})

it('stamps NEEDS_REVIEW and keeps centroid coords on postcode mismatch', async () => {
  const branch = await createBranch(prisma, ownerUserId, body, auditCtx, {
    placeId: 'place-123', latitude: 53.6460, longitude: -1.7845, postcode: 'ZZ9 9ZZ',
  })
  const row = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })
  expect(row.locationConfidence).toBe('NEEDS_REVIEW')
  expect(row.googlePlaceId).toBeNull()
  // coords remain the centroid the postcode resolver produced (L4)
})

it('keeps POSTCODE_CENTROID untouched when no suggestion rides along', async () => {
  const branch = await createBranch(prisma, ownerUserId, body, auditCtx, undefined)
  const row = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } })
  expect(row.locationConfidence).toBe('POSTCODE_CENTROID')
})
```

- [ ] **Step 2: Run to verify fail**
- [ ] **Step 3: Implement**

In `createBranchCore`, after `resolveBranchLocationFields` produces `locationFields`:

```ts
  // Branch Location Trust Slice 1 (spec 2026-07-09) — auto-trust pipeline.
  // SUPERSEDES the PR-6 "metadata only" invariant by owner direction: a
  // Google-picked pin that passes both cross-checks is APPLIED with
  // ADDRESS_GEOCODED; any failure degrades to exactly the legacy behaviour
  // plus a NEEDS_REVIEW stamp so the branch enters the admin exception
  // queue (L4). The staged audit metadata (locationSuggestionMetadata)
  // continues in BOTH outcomes so admins always see provenance.
  let trustedLocation: { latitude: number; longitude: number; googlePlaceId: string } | null = null
  let confidenceOverride: 'ADDRESS_GEOCODED' | 'NEEDS_REVIEW' | null = null
  if (locationSuggestion) {
    const verdict = crossCheckGoogleLocation({
      googleLat:       locationSuggestion.latitude,
      googleLng:       locationSuggestion.longitude,
      googlePostcode:  locationSuggestion.postcode,
      enteredPostcode: input.postcode,
      centroidLat:     locationFields.latitude,
      centroidLng:     locationFields.longitude,
    })
    if (verdict.trusted) {
      trustedLocation = {
        latitude:      locationSuggestion.latitude,
        longitude:     locationSuggestion.longitude,
        googlePlaceId: locationSuggestion.placeId,
      }
      confidenceOverride = 'ADDRESS_GEOCODED'
    } else {
      confidenceOverride = 'NEEDS_REVIEW'
    }
  }
```

and in the `Branch.create` data spread (where `...locationFields` lands):

```ts
      ...locationFields,
      ...(trustedLocation ? {
        latitude:      trustedLocation.latitude,
        longitude:     trustedLocation.longitude,
        googlePlaceId: trustedLocation.googlePlaceId,
      } : {}),
      ...(confidenceOverride ? { locationConfidence: confidenceOverride } : {}),
```

Adapt names to the actual local variables in `createBranchCore` (read it fully first: the create payload may be assembled differently; keep the audit-metadata staging exactly as-is in both outcomes). Update the `BranchLocationSuggestion` interface to include `postcode: string | null` and let TypeScript surface every construction site.

- [ ] **Step 4: Run the branch service suites, verify pass**
- [ ] **Step 5: Commit**

### Task 5: Widen the customer exposure gates

**Files (every backend gate site, verified by grep on 2026-07-09):**
- Modify: `src/api/customer/discovery/service.ts:75` (`exposeBranchPosition`), `:99` (server-side companion gate), `:2868`, `:3585`, `:3861`, `:4461` (query filters / per-branch null-outs)
- Use: `CONFIRMED_LOCATION_SET` from `src/api/shared/location.ts:33` (already `['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED']`)
- Test: extend the existing exposeBranchPosition / redaction suites (find them via `grep -rl exposeBranchPosition tests/`)

- [ ] **Step 1: Failing tests**

```ts
it('exposes coordinates for ADDRESS_GEOCODED branches', () => {
  const out = exposeBranchPosition({ locationConfidence: 'ADDRESS_GEOCODED', latitude: 53.6, longitude: -1.8 })
  expect(out.latitude).toBeCloseTo(53.6)
})
it('still redacts POSTCODE_CENTROID and NEEDS_REVIEW', () => {
  for (const c of ['POSTCODE_CENTROID', 'NEEDS_REVIEW']) {
    const out = exposeBranchPosition({ locationConfidence: c, latitude: 53.6, longitude: -1.8 })
    expect(out.latitude).toBeNull()
  }
})
```

- [ ] **Step 2: Run to verify fail**
- [ ] **Step 3: Implement**

Pattern per site (read each site's context first; some search paths may already union ADDRESS_GEOCODED — do not double-widen):

```ts
import { CONFIRMED_LOCATION_SET } from '../../shared/location'
// exposeBranchPosition:
if (!CONFIRMED_LOCATION_SET.includes(confidence as never)) { ... redact ... }
// where-clauses:
locationConfidence: { in: [...CONFIRMED_LOCATION_SET] },
```

Update the stale comments at each site (they say "MANUALLY_CONFIRMED-only"), plus the two customer-app comment references (`apps/customer-app/src/features/map/components/MapPins.tsx:150-152`, `apps/customer-app/src/lib/api/favourites.ts:55`) — comments only, no app logic change expected; verify by grep that no customer-app RUNTIME logic branches on `MANUALLY_CONFIRMED`.

- [ ] **Step 4: Run the discovery + redaction suites, verify pass; check every existing redaction test still passes (L3)**
- [ ] **Step 5: Commit**

### Task 6: Full verification + push

- [ ] `npx tsc --noEmit` (clean after `npx prisma generate`)
- [ ] `npm run test:unit` (full lane green; report exact counts)
- [ ] `cd apps/customer-app && fnm use && npx jest tests/features/map tests/features/favourites --forceExit` (no app-logic change expected; this guards the comment-only edits)
- [ ] Push `feat/branch-location-trust-slice-1`; do NOT create a PR and do NOT merge.

---

## Self-review notes

- Spec §2.1/2.2/2.3 → Tasks 1-5. Spec §2.4 (admin badge UI) = Slice 2; §2.5 pin-drop = Slice 3; §2.6 backfill = Slice 4; edit-lane pipeline = Slice 1b (all intentionally out of scope here).
- L1 preserved: no wire-shape change anywhere (`candidateToken` in, DTO out, unchanged).
- L4 test = Task 4 case 2 (mismatch keeps centroid coords).
- Type thread: `ResolvedLocationCandidate.postcode` (Task 2) → `BranchLocationSuggestion.postcode` (Task 4) → `crossCheckGoogleLocation.googlePostcode` (Task 3). Names match.
