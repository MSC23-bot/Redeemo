# §DF-v2-j + §DF-v2-i — Location Context Parity + Top-of-App Status Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atomically (a) tighten `resolveLocationContext` so `source='profile'` requires the same invariants as `resolveEffectiveLocation`'s SAVED_PROFILE branch (§DF-v2-i); (b) emit the `locationContext` envelope on 3 additional Discovery routes (Search / In-area / Merchant Profile); (c) ship a new `<LocationStatusLabel>` component mounted on Home + Search + Map.

**Architecture:** Bundled atomic PR. Route handlers own `locationContext` resolution (variant a from spec §4.2); pure service helpers stay free of `FastifyRequest`; envelope rides once at each route's response root. Customer-app schema for `locationContext` hoists into one shared file (`apps/customer-app/src/lib/api/shared/location.ts`); Home / Search / Merchant Profile schemas import from it. New `<LocationStatusLabel>` component has two visual variants (`'strip'` for Home + Search, `'chip'` for Map) sharing one content row.

**Tech Stack:** TypeScript / Fastify / Prisma 7 / Vitest (backend). React Native / Expo / React Query / Zod / Jest-Expo (customer-app). Lucide icons / design-system tokens for the new component.

**Spec:** `docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md` v1.1.

**Tier:** 2 — plan-first multi-file. Subagent-driven execution after owner plan approval. Pause for owner re-review at the gate after Task 0 audit findings (if Task 0 returns surprises that affect downstream tasks) AND after the full plan before implementation begins.

---

## File structure

### Backend (5 files)
- `src/api/customer/discovery/service.ts` — tighten `resolveLocationContext` (§DF-v2-i); accept `locationContext` opt arg on `getHomeFeed` (Task 3 — migrate the existing internal resolve to route-level pattern).
- `src/api/customer/discovery/routes.ts` — resolve `locationContext` at the top of `/home`, `/search`, `/discovery/in-area`, `/merchants/:id`; inject into each response root.
- `tests/api/customer/discovery/home-feed-rail-states.test.ts` — atomic §DF-7 pin update + 16 new pins.
- `tests/api/customer/discovery/locationcontext-parity.test.ts` — NEW. Search / in-area / merchant-profile integration pins (split out from the home-feed file to keep it manageable).
- `tests/api/customer/discovery/resolveLocationContext.test.ts` — NEW unit pins on the helper post-§DF-v2-i (4 pins covering the tightened invariant).

### Customer-app (10 files)
- `apps/customer-app/src/lib/api/shared/location.ts` — NEW (hoisted shared schema + type).
- `apps/customer-app/src/lib/api/discovery.ts` — import hoist + 3 schema additions.
- `apps/customer-app/src/lib/api/merchant.ts` — import hoist + 1 schema addition.
- `apps/customer-app/src/lib/location/LocationStatusLabel.tsx` — NEW component (strip + chip variants).
- `apps/customer-app/src/features/home/screens/HomeScreen.tsx` — mount strip.
- `apps/customer-app/src/features/search/screens/SearchScreen.tsx` — mount strip + retire client-side `savedAreaCity` derivation.
- `apps/customer-app/src/features/map/screens/MapScreen.tsx` — mount chip (absolute-positioned wrapper).
- `apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx` — NEW (10 pins).
- `apps/customer-app/tests/features/home/HomeScreen.statusLabel.test.tsx` — NEW (1 integration pin).
- `apps/customer-app/tests/features/search/SearchScreen.statusLabel.test.tsx` — NEW (1 integration pin).
- `apps/customer-app/tests/features/map/MapScreen.statusLabel.test.tsx` — NEW (1 integration pin).

### Docs (4 files)
- `docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md` — NEW (Task 0 findings).
- `docs/customer-flow-current.md` — append §15 (top-of-app status label + tightened invariant).
- `docs/customer-flow-changelog.md` — dated 2026-05-26 entry.
- `CLAUDE.md` — add Phase 3C.1m section (AWAITING MERGE during PR; flip to SHIPPED after merge).

Estimated total: ~22 files (3 NEW backend + 7 NEW customer-app + 4 modified backend + 3 modified customer-app + 1 NEW audit + 2 modified docs + 1 modified CLAUDE.md + 1 NEW closure memory in the post-merge step).

---

## Task 0 — Route boundary + memo integration audit

**Why first:** §4.2 + §4.3 of the spec require the implementer to audit the actual route shapes and pick the cleanest `locationContext` resolution pattern. Owner amendment 3 + 4 explicitly require this audit before implementation. This task produces a written audit deliverable that locks the variant for Tasks 1-7.

**Files:**
- Create: `docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md`
- Read-only: `src/api/customer/discovery/routes.ts` (handlers at L48, L65, L116, L216).
- Read-only: `src/api/customer/discovery/service.ts:1421-1427` (current `getHomeFeed` internal resolve at L1427).

- [ ] **Step 1: Read all 4 affected route handlers + the current `getHomeFeed` resolve site**

Run:
```bash
sed -n '48,75p;116,140p;216,260p' src/api/customer/discovery/routes.ts
sed -n '1420,1430p' src/api/customer/discovery/service.ts
```

Expected: confirms the patterns observed in spec drafting — `/search` and `/in-area` use `Promise.all([merchantService, branchService])` then spread into reply; `/merchants/:id` calls a single service then sends the result directly; `/home` calls `getHomeFeed` which resolves `locationContext` INTERNALLY at line 1.

- [ ] **Step 2: Decide the integration variant**

Write the audit doc at `docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md` with this structure:

```markdown
# §DF-v2-j Route Boundary + Memo Audit

**Date:** 2026-05-26
**Author:** [implementer]
**Decision lock:** variant (a) — route-level resolve.

## Route inventory

| Route | Handler shape | Merge shape |
|---|---|---|
| GET /api/v1/customer/home | single service call (`getHomeFeed`) | service returns top-level object, sent as-is |
| GET /api/v1/customer/search | `Promise.all([searchMerchants, searchBranches])` | route handler spreads + merges |
| GET /api/v1/customer/discovery/in-area | `Promise.all([getInAreaMerchants, getInAreaBranches])` | route handler spreads + merges |
| GET /api/v1/customer/merchants/:id | single service call (`getCustomerMerchant`) | service returns top-level object, sent as-is |

## Variant decision

**Locked variant: (a) — route-level resolve + envelope injection at response root.**

Rationale:
- All 4 routes already own response assembly at the handler level (3 of 4 already spread/merge; the 4th is a 1-line `reply.send(merchant)`).
- Variant (a) keeps `resolveLocationContext` pure (no `FastifyRequest` parameter on the helper or downstream services).
- Each route resolves `locationContext` ONCE at the top of the handler, then injects into the response root. Request-scoped uniqueness (spec D7 contract) is satisfied trivially — no memo helper needed.

## Memo helper decision

**No standalone memo helper is built in this PR.**

Rationale:
- Variant (a) resolves once per request at the route handler. Request-scoped uniqueness is satisfied by construction, not by memoization.
- The spec D7 contract is "same request + same (userId, lat, lng) triple → resolves once". Variant (a) achieves this without an additional helper.
- Building a memo helper purely for the contract criteria — when no current call path duplicates the resolution — is YAGNI.

**Future-flag:** if a future feature introduces a code path where the same request resolves `locationContext` twice (e.g. a middleware + a service both resolve), revisit the memo helper. Tracked as no new follow-up — variant (a) is robust to this future case because the middleware can pass the resolved value forward.

## `getHomeFeed` migration

Move the `resolveLocationContext` call from `getHomeFeed:1427` UP into the `/home` route handler. `getHomeFeed` gains a required `locationContext: LocationContext` opt arg. This makes Home consistent with the other 3 routes (envelope resolved at route boundary, passed into service).

Backwards compat: not a concern. `getHomeFeed` is only called from one route handler.

## Acceptance criteria for downstream tasks

1. Routes resolve `locationContext` exactly once via `resolveLocationContext(prisma, userId, lat, lng)`.
2. `getHomeFeed`, `getCustomerMerchant`, and route handlers for `/search` + `/discovery/in-area` all receive the resolved value (Home + Merchant Profile pass it into the service; Search + In-area route handler injects directly).
3. Response root includes `locationContext: LocationContext` on all 4 routes.
4. No service helper gains a `FastifyRequest` parameter.
5. No standalone memo helper is created.
```

- [ ] **Step 3: Commit the audit doc**

```bash
git add docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md
git commit -m "docs(locationcontext-parity): Task 0 route boundary + memo audit"
```

**Gate:** if the audit lands on a different variant than (a) above (e.g. one of the routes turns out to have a shape that variant (a) can't handle cleanly), PAUSE and surface to owner before continuing. If variant (a) holds, proceed to Task 1.

---

## Task 1 — §DF-v2-i: tighten `resolveLocationContext` + atomic §DF-7 pin update

**Why second:** the resolver tighten must land before parity emit amplification (spec §1.3). §DF-7 pin atomic update lives in the same commit so the test suite never sees a state where the old invariant + new resolver coexist.

**Files:**
- Modify: `src/api/customer/discovery/service.ts:109-151` (the `resolveLocationContext` helper).
- Modify: `tests/api/customer/discovery/home-feed-rail-states.test.ts` (find the existing §DF-7 pin, update to assert the tightened invariant, rename to §DF-7v2i).
- Create: `tests/api/customer/discovery/resolveLocationContext.test.ts` (4 unit pins on the helper).

- [ ] **Step 1: Write the failing unit pins for the tightened invariant**

Create `tests/api/customer/discovery/resolveLocationContext.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { resolveLocationContext } from '../../../../src/api/customer/discovery/service'

const prisma = new PrismaClient()

describe('§DF-v2-i resolveLocationContext tightened invariants', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'df-v2-i-' } } })
  })

  it('§DF-v2-i-U1 source=coordinates when lat+lng provided', async () => {
    const result = await resolveLocationContext(prisma, null, 53.6458, -1.7850)
    expect(result.source).toBe('coordinates')
    expect(result.lat).toBe(53.6458)
    expect(result.lng).toBe(-1.7850)
  })

  it('§DF-v2-i-U2 source=profile when User has localityId + lat + lng', async () => {
    const locality = await prisma.locality.findFirst({ where: { name: 'Huddersfield' } })
    if (!locality) throw new Error('seed missing Huddersfield locality')
    const user = await prisma.user.create({
      data: {
        email:      'df-v2-i-u2@test.local',
        passwordHash: 'x',
        firstName:  'df', lastName: 'u2',
        latitude:   53.6458,
        longitude:  -1.7850,
        localityId: locality.id,
      },
    })
    const result = await resolveLocationContext(prisma, user.id, null, null)
    expect(result.source).toBe('profile')
    expect(result.locality?.name).toBe('Huddersfield')
  })

  it('§DF-v2-i-U3 source=none when User has localityId but lat is null (tightened)', async () => {
    const locality = await prisma.locality.findFirst({ where: { name: 'Huddersfield' } })
    if (!locality) throw new Error('seed missing Huddersfield locality')
    const user = await prisma.user.create({
      data: {
        email:      'df-v2-i-u3@test.local',
        passwordHash: 'x',
        firstName:  'df', lastName: 'u3',
        latitude:   null,
        longitude:  -1.7850,
        localityId: locality.id,
      },
    })
    const result = await resolveLocationContext(prisma, user.id, null, null)
    expect(result.source).toBe('none')
    expect(result.locality).toBeNull()
  })

  it('§DF-v2-i-U4 source=none when User has city text only (no localityId/lat/lng)', async () => {
    const user = await prisma.user.create({
      data: {
        email:      'df-v2-i-u4@test.local',
        passwordHash: 'x',
        firstName:  'df', lastName: 'u4',
        city:       'Huddersfield', // text only, no localityId
        latitude:   null,
        longitude:  null,
        localityId: null,
      },
    })
    const result = await resolveLocationContext(prisma, user.id, null, null)
    expect(result.source).toBe('none')
    expect(result.city).toBeNull()
  })
})
```

- [ ] **Step 2: Run pins to verify they fail against the current helper**

```bash
npx vitest run tests/api/customer/discovery/resolveLocationContext.test.ts
```

Expected: §DF-v2-i-U3 and §DF-v2-i-U4 FAIL (current helper would return `source='profile'` for U3 and `source='profile'` with city text for U4).

- [ ] **Step 3: Tighten the helper**

In `src/api/customer/discovery/service.ts`, locate the `resolveLocationContext` function around L109. Replace the `User` branch with the tightened invariant per spec §4.1:

```typescript
// After the coordinates branch, before the legacy fallback:
if (userId) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      latitude:   true,
      longitude:  true,
      localityId: true,
    },
  })
  if (
    user?.localityId &&
    user.latitude !== null &&
    user.longitude !== null
  ) {
    const loc = await prisma.locality.findUnique({
      where:  { id: user.localityId },
      select: { id: true, name: true },
    })
    if (loc) return { locality: loc, city: loc.name, lat: null, lng: null, source: 'profile' }
  }
  // Tightened §DF-v2-i: do NOT fall back to User.city text.
}
return { locality: null, city: null, lat: null, lng: null, source: 'none' }
```

(Preserve the existing coordinates branch ABOVE this block.)

- [ ] **Step 4: Run unit pins to verify they pass**

```bash
npx vitest run tests/api/customer/discovery/resolveLocationContext.test.ts
```

Expected: all 4 pins PASS.

- [ ] **Step 5: Update the atomic §DF-7 pin in home-feed-rail-states.test.ts**

Find the existing §DF-7 pin in `tests/api/customer/discovery/home-feed-rail-states.test.ts`. The current pin asserts "wire envelope can say `source='profile'` while `effLoc=null`" for a user with `localityId` but null `lat`/`lng`. Update it to assert the tightened post-v2-i behaviour:

```typescript
it('§DF-7v2i (formerly §DF-7) user with localityId but null lat/lng → effLoc=null AND locationContext.source=none', async () => {
  // ... build the user fixture with localityId set + lat:null + lng:null
  const result = await getHomeFeed(prisma, { userId: user.id, lat: null, lng: null })
  // Tightened invariant: BOTH effLoc=null AND envelope source=none.
  expect(result.locationContext.source).toBe('none')
  expect(result.locationContext.locality).toBeNull()
  // Rails behaviour stays the same — UK-wide fallback because effLoc=null.
  expect(/* rails-are-UK-wide-fallback assertion identical to old pin */).toBe(true)
})
```

Rename the `it()` description and the comment block to mark it as §DF-7v2i — the atomic post-v2-i lock.

- [ ] **Step 6: Run the home-feed-rail-states suite to confirm §DF-7v2i passes + all other §DF-N pins still pass**

```bash
npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts
```

Expected: all §DF-1 through §DF-6 + the renamed §DF-7v2i PASS. Total pins unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/discovery/service.ts \
        tests/api/customer/discovery/resolveLocationContext.test.ts \
        tests/api/customer/discovery/home-feed-rail-states.test.ts
git commit -m "feat(locationcontext-parity): §DF-v2-i — tighten resolveLocationContext invariants + atomic §DF-7 pin update"
```

---

## Task 2 — Migrate `getHomeFeed` to receive `locationContext` from route handler

**Why now:** Task 0 audit locked variant (a) — services receive `locationContext` from route handlers. Migrate Home before adding parity emit elsewhere so all 4 routes follow one pattern.

**Files:**
- Modify: `src/api/customer/discovery/service.ts:1421-1427` (`getHomeFeed` signature + internal resolve removal).
- Modify: `src/api/customer/discovery/routes.ts` (`/home` route handler).

- [ ] **Step 1: Update `getHomeFeed` signature to accept `locationContext`**

In `src/api/customer/discovery/service.ts`, find `getHomeFeed` (L1421):

```typescript
export async function getHomeFeed(
  prisma: PrismaClient,
  options: {
    userId:          string | null
    lat:             number | null
    lng:             number | null
    locationContext: LocationContext // NEW — resolved by route handler
  },
) {
  const now = new Date()
  const { userId, lat, lng, locationContext: locationCtx } = options
  // REMOVED: const locationCtx = await resolveLocationContext(prisma, userId, lat, lng)
  // ... rest of function unchanged, still uses `locationCtx`.
}
```

Export the `LocationContext` type from the service module if not already exported.

- [ ] **Step 2: Update the `/home` route handler**

In `src/api/customer/discovery/routes.ts` (around L48):

```typescript
app.get('/api/v1/customer/home', async (req: FastifyRequest, reply) => {
  const params = locationQuery.parse(req.query)
  const userId = optionalUserId(req)
  const lat = params.lat ?? null
  const lng = params.lng ?? null
  const locationContext = await resolveLocationContext(app.prisma, userId, lat, lng)
  const feed = await getHomeFeed(app.prisma, { userId, lat, lng, locationContext })
  return reply.send(feed)
})
```

(Import `resolveLocationContext` from the service module if not already imported.)

- [ ] **Step 3: Run the home-feed-rail-states suite to verify migration is non-breaking**

```bash
npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts
```

Expected: all §DF-1 through §DF-6 + §DF-7v2i PASS (envelope shape unchanged at response root).

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/customer/discovery/routes.ts
git commit -m "refactor(locationcontext-parity): migrate getHomeFeed to receive locationContext from route handler"
```

---

## Task 3 — Customer-app shared schema hoist

**Why before backend emit lands:** the customer-app schema lives in the same monorepo and ships together. Hoist first so backend emit tasks have a stable import path to reference.

**Files:**
- Create: `apps/customer-app/src/lib/api/shared/location.ts`
- Modify: `apps/customer-app/src/lib/api/discovery.ts` (remove inline `locationContextSchema` definition, import from `./shared/location`).

- [ ] **Step 1: Read the current inline schema in discovery.ts**

```bash
grep -n "locationContextSchema\|locationContext:" apps/customer-app/src/lib/api/discovery.ts
```

Expected: find the inline `locationContextSchema = z.object({ ... })` declaration and the `locationContext: locationContextSchema.optional()` usage inside `homeFeedSchema`.

- [ ] **Step 2: Create the shared file**

Create `apps/customer-app/src/lib/api/shared/location.ts`:

```typescript
/**
 * Shared `locationContext` wire schema + type.
 *
 * Used by every Discovery surface that emits an effective location identity:
 * Home / Search / Map (via in-area) / Merchant Profile.  Hoisted from
 * `discovery.ts` to a shared file so all consumers parse the same shape.
 *
 * `voucher.ts` does NOT consume this in §DF-v2-j — Voucher Detail location
 * awareness is deferred to §DF-v2-o, which will import from this file once
 * the consumer materialises.
 */
import { z } from 'zod'

export const locationContextSchema = z.object({
  city:     z.string().nullable(),
  source:   z.enum(['coordinates', 'profile', 'none']),
  locality: z.object({ id: z.string(), name: z.string() }).nullable(),
})

export type LocationContext = z.infer<typeof locationContextSchema>
```

- [ ] **Step 3: Update `discovery.ts` to import from the shared file**

In `apps/customer-app/src/lib/api/discovery.ts`:

1. Add the import at the top: `import { locationContextSchema, type LocationContext } from './shared/location'`.
2. Delete the inline `locationContextSchema = z.object({ ... })` declaration.
3. Delete the inline `LocationContext` type alias if present (keep re-exports if anything depends on them; otherwise remove).
4. The `homeFeedSchema` reference to `locationContext: locationContextSchema.optional()` stays — the symbol now resolves to the import.

- [ ] **Step 4: Run jest to confirm no regression on existing Home schema parse**

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts --forceExit
```

Expected: existing Home schema parse pins PASS unchanged.

- [ ] **Step 5: Run tsc to confirm no type drift**

```bash
cd apps/customer-app && npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/lib/api/shared/location.ts \
        apps/customer-app/src/lib/api/discovery.ts
git commit -m "refactor(locationcontext-parity): hoist locationContextSchema to shared/location.ts"
```

---

## Task 4 — Backend emit: `/search` route

**Files:**
- Modify: `src/api/customer/discovery/routes.ts` (`/search` handler around L116).
- Create: `tests/api/customer/discovery/locationcontext-parity.test.ts` (with `§DF-v2-j-S1..S7` pins — 4 pins for Search in this task; in-area + merchant-profile pins added in later tasks).

- [ ] **Step 1: Write failing pins for Search emit**

Create `tests/api/customer/discovery/locationcontext-parity.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../../../../src/api/app'
import { signCustomerJwt } from '../../_helpers/auth'

const prisma = new PrismaClient()

describe('§DF-v2-j-S Search /search locationContext emit', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'df-v2-j-s-' } } })
  })

  it('§DF-v2-j-S1 GPS coords present → source=coordinates', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/search?q=cafe&lat=53.6458&lng=-1.7850',
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.locationContext).toBeDefined()
    expect(body.locationContext.source).toBe('coordinates')
  })

  it('§DF-v2-j-S2 authenticated user with full profile (localityId+lat+lng) → source=profile', async () => {
    const locality = await prisma.locality.findFirst({ where: { name: 'Huddersfield' } })
    if (!locality) throw new Error('seed missing Huddersfield locality')
    const user = await prisma.user.create({
      data: {
        email:      'df-v2-j-s-s2@test.local',
        passwordHash: 'x',
        firstName:  'df', lastName: 's2',
        latitude:   53.6458,
        longitude:  -1.7850,
        localityId: locality.id,
      },
    })
    const token = signCustomerJwt(user.id)
    const app = await createApp()
    const response = await app.inject({
      method:  'GET',
      url:     '/api/v1/customer/search?q=cafe',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.locationContext.source).toBe('profile')
    expect(body.locationContext.locality?.name).toBe('Huddersfield')
  })

  it('§DF-v2-j-S5 unauthenticated, no coords → source=none', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    '/api/v1/customer/search?q=cafe',
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.locationContext.source).toBe('none')
  })

  it('§DF-v2-j-S7 authenticated user with incomplete profile (localityId only, no lat/lng) → source=none', async () => {
    const locality = await prisma.locality.findFirst({ where: { name: 'Huddersfield' } })
    if (!locality) throw new Error('seed missing Huddersfield locality')
    const user = await prisma.user.create({
      data: {
        email:      'df-v2-j-s-s7@test.local',
        passwordHash: 'x',
        firstName:  'df', lastName: 's7',
        latitude:   null,
        longitude:  null,
        localityId: locality.id,
      },
    })
    const token = signCustomerJwt(user.id)
    const app = await createApp()
    const response = await app.inject({
      method:  'GET',
      url:     '/api/v1/customer/search?q=cafe',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.locationContext.source).toBe('none')
  })
})
```

(Adjust import paths for `createApp` and `signCustomerJwt` to match the existing project conventions — refer to other tests in the same dir.)

- [ ] **Step 2: Run pins to verify they fail**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-S"
```

Expected: all 4 pins FAIL with `body.locationContext` being `undefined`.

- [ ] **Step 3: Add `locationContext` resolution + emit to `/search` handler**

In `src/api/customer/discovery/routes.ts`, locate the `/search` handler (around L116). Add resolution at the top and merge into the response:

```typescript
app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
  const params = searchQuery.parse(req.query)
  const userId = optionalUserId(req)
  const lat = params.lat ?? null
  const lng = params.lng ?? null
  const locationContext = await resolveLocationContext(app.prisma, userId, lat, lng)
  const [merchantResult, branchResult] = await Promise.all([
    searchMerchants(app.prisma, { ...params, userId }),
    searchBranches(app.prisma, { ...params, userId }),
  ])
  return reply.send({
    ...merchantResult,
    branches:      branchResult.branches,
    totalBranches: branchResult.totalBranches,
    branchMeta:    branchResult.meta,
    locationContext, // §DF-v2-j additive
  })
})
```

(Import `resolveLocationContext` if not already in scope.)

- [ ] **Step 4: Run pins to verify they pass**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-S"
```

Expected: all 4 pins PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/routes.ts \
        tests/api/customer/discovery/locationcontext-parity.test.ts
git commit -m "feat(locationcontext-parity): emit locationContext on /api/v1/customer/search (§DF-v2-j-S1..S7)"
```

---

## Task 5 — Backend emit: `/discovery/in-area` route

**Files:**
- Modify: `src/api/customer/discovery/routes.ts` (`/discovery/in-area` handler around L216).
- Modify: `tests/api/customer/discovery/locationcontext-parity.test.ts` (add `§DF-v2-j-I1..I7` pins — 4 pins covering the same matrix).

- [ ] **Step 1: Append failing pins for In-area emit**

Append a new `describe` block to `tests/api/customer/discovery/locationcontext-parity.test.ts`:

```typescript
describe('§DF-v2-j-I In-area /discovery/in-area locationContext emit', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'df-v2-j-i-' } } })
  })

  const bbox = 'minLat=53.5&maxLat=53.7&minLng=-1.9&maxLng=-1.6'

  it('§DF-v2-j-I1 GPS coords present → source=coordinates', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?${bbox}&lat=53.6458&lng=-1.7850`,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().locationContext.source).toBe('coordinates')
  })

  it('§DF-v2-j-I2 authenticated user with full profile → source=profile', async () => {
    // ... build user with localityId + lat + lng (mirror §DF-v2-j-S2 pattern)
    // ... call /discovery/in-area with bbox only, auth header
    // ... assert source=profile
  })

  it('§DF-v2-j-I5 unauthenticated, no coords → source=none', async () => {
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/discovery/in-area?${bbox}`,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().locationContext.source).toBe('none')
  })

  it('§DF-v2-j-I7 authenticated user with incomplete profile → source=none', async () => {
    // ... mirror §DF-v2-j-S7 pattern
  })
})
```

Fill in I2 + I7 bodies following the same fixture pattern as S2 + S7 in Task 4.

- [ ] **Step 2: Run pins to verify they fail**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-I"
```

Expected: all 4 pins FAIL with `body.locationContext` being `undefined`.

- [ ] **Step 3: Add `locationContext` resolution + emit to `/discovery/in-area` handler**

In `src/api/customer/discovery/routes.ts`, locate the `/discovery/in-area` handler (around L216). Add resolution at the top and merge into the response:

```typescript
app.get('/api/v1/customer/discovery/in-area', async (req: FastifyRequest, reply) => {
  const query = z.object({
    // ... existing bbox + lat/lng/limit schema unchanged
  }).parse(req.query)
  if (query.minLat > query.maxLat || query.minLng > query.maxLng) {
    return reply.status(400).send({ error: { code: 'INVALID_BBOX', message: '...' } })
  }
  const userId = optionalUserId(req)
  const lat = query.lat ?? null
  const lng = query.lng ?? null
  const locationContext = await resolveLocationContext(app.prisma, userId, lat, lng)
  const bbox = { minLat: query.minLat, maxLat: query.maxLat, minLng: query.minLng, maxLng: query.maxLng }
  const [merchantResult, branchResult] = await Promise.all([
    getInAreaMerchants(app.prisma, { /* ... */ }),
    getInAreaBranches(app.prisma, { /* ... */ }),
  ])
  return reply.send({
    ...merchantResult,
    branches:        branchResult.branches,
    locationContext, // §DF-v2-j additive
  })
})
```

- [ ] **Step 4: Run pins to verify they pass**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-I"
```

Expected: all 4 pins PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/routes.ts \
        tests/api/customer/discovery/locationcontext-parity.test.ts
git commit -m "feat(locationcontext-parity): emit locationContext on /api/v1/customer/discovery/in-area (§DF-v2-j-I1..I7)"
```

---

## Task 6 — Backend emit: `/merchants/:id` route

**Files:**
- Modify: `src/api/customer/discovery/routes.ts` (`/merchants/:id` handler around L65).
- Modify: `tests/api/customer/discovery/locationcontext-parity.test.ts` (add `§DF-v2-j-M1..M7` pins — 4 pins).

- [ ] **Step 1: Append failing pins for Merchant Profile emit**

Append a new `describe` block to `tests/api/customer/discovery/locationcontext-parity.test.ts`:

```typescript
describe('§DF-v2-j-M Merchant Profile /merchants/:id locationContext emit', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'df-v2-j-m-' } } })
  })

  // Look up an active merchant id from seed for fixture inputs.
  async function pickMerchantId(): Promise<string> {
    const m = await prisma.merchant.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } })
    if (!m) throw new Error('seed missing active merchant')
    return m.id
  }

  it('§DF-v2-j-M1 GPS coords present → source=coordinates', async () => {
    const merchantId = await pickMerchantId()
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/merchants/${merchantId}?lat=53.6458&lng=-1.7850`,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().locationContext.source).toBe('coordinates')
  })

  it('§DF-v2-j-M2 authenticated user with full profile → source=profile', async () => {
    // ... mirror S2/I2 pattern, hit /merchants/:id with auth + no coords
  })

  it('§DF-v2-j-M5 unauthenticated, no coords → source=none', async () => {
    const merchantId = await pickMerchantId()
    const app = await createApp()
    const response = await app.inject({
      method: 'GET',
      url:    `/api/v1/customer/merchants/${merchantId}`,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().locationContext.source).toBe('none')
  })

  it('§DF-v2-j-M7 authenticated user with incomplete profile → source=none', async () => {
    // ... mirror S7/I7 pattern
  })
})
```

- [ ] **Step 2: Run pins to verify they fail**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-M"
```

Expected: all 4 pins FAIL.

- [ ] **Step 3: Add `locationContext` resolution + emit to `/merchants/:id` handler**

In `src/api/customer/discovery/routes.ts`, locate the handler (around L65):

```typescript
app.get('/api/v1/customer/merchants/:id', async (req: FastifyRequest, reply) => {
  const { id } = idParam.parse(req.params)
  const { lat, lng, branch } = locationQuery.parse(req.query)
  const userId = optionalUserId(req)
  const locationContext = await resolveLocationContext(app.prisma, userId, lat ?? null, lng ?? null)
  const merchant = await getCustomerMerchant(app.prisma, id, userId, {
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    branchId: branch,
  })
  return reply.send({ ...merchant, locationContext }) // §DF-v2-j additive
})
```

**Schema collision check.** Before merging, audit `merchant` payload shape for an existing `locationContext` key. If the merchant payload already has a top-level field with that name, the merge collides. Grep:

```bash
grep -n "locationContext" src/api/customer/discovery/service.ts
```

Expected: only `resolveLocationContext` + the Home internal usage match. No collision in merchant payload.

- [ ] **Step 4: Run pins to verify they pass**

```bash
npx vitest run tests/api/customer/discovery/locationcontext-parity.test.ts -t "§DF-v2-j-M"
```

Expected: all 4 pins PASS.

- [ ] **Step 5: Verify full backend suite is green**

```bash
npx vitest run tests/api/customer/discovery/
```

Expected: all Discovery tests PASS (existing + new). 16 new pins total across S/I/M + the §DF-v2-i unit pins + atomic §DF-7v2i update.

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/discovery/routes.ts \
        tests/api/customer/discovery/locationcontext-parity.test.ts
git commit -m "feat(locationcontext-parity): emit locationContext on /api/v1/customer/merchants/:id (§DF-v2-j-M1..M7)"
```

---

## Task 7 — Customer-app Zod schema additions

**Files:**
- Modify: `apps/customer-app/src/lib/api/discovery.ts` — add `locationContext` to `searchResponseSchema`, `inAreaResponseSchema`, `categoryMerchantsResponseSchema`.
- Modify: `apps/customer-app/src/lib/api/merchant.ts` — add `locationContext` to `merchantProfileSchema`, import from shared.

- [ ] **Step 1: Locate the schemas in discovery.ts**

```bash
grep -n "searchResponseSchema\|inAreaResponseSchema\|categoryMerchantsResponseSchema" apps/customer-app/src/lib/api/discovery.ts
```

Expected: confirms approximate line numbers from spec §5.3.

- [ ] **Step 2: Add `locationContext: locationContextSchema.optional()` to each schema**

In `apps/customer-app/src/lib/api/discovery.ts`:

For each of `searchResponseSchema`, `inAreaResponseSchema`, `categoryMerchantsResponseSchema`, add the field at the same indent level as existing schema fields:

```typescript
export const searchResponseSchema = z.object({
  // ... existing fields
  locationContext: locationContextSchema.optional(),
})
```

`locationContextSchema` is already imported from `./shared/location` after Task 3.

Note: `categoryMerchantsResponseSchema` is included in v2-j scope per spec §5.3 even though §4.2 doesn't add backend emit for `/categories/:id/merchants` yet. The schema field stays `.optional()` so it tolerates payloads without the envelope; if a future PR adds backend emit, no client-side schema work is needed.

- [ ] **Step 3: Locate the schema in merchant.ts**

```bash
grep -n "merchantProfileSchema" apps/customer-app/src/lib/api/merchant.ts
```

Expected: confirms ~L218.

- [ ] **Step 4: Add the import + field to merchant.ts**

In `apps/customer-app/src/lib/api/merchant.ts`:

1. Add the import at the top: `import { locationContextSchema } from './shared/location'`.
2. Add `locationContext: locationContextSchema.optional()` to `merchantProfileSchema`.

- [ ] **Step 5: Run jest to confirm schemas parse current + future payloads**

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts tests/lib/api/merchant.test.ts --forceExit
```

Expected: all existing pins PASS (schemas are additive `.optional()`).

- [ ] **Step 6: Run tsc**

```bash
cd apps/customer-app && npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts \
        apps/customer-app/src/lib/api/merchant.ts
git commit -m "feat(locationcontext-parity): add locationContext to search/in-area/category/merchant-profile schemas"
```

---

## Task 8 — `<LocationStatusLabel>` component (strip + chip variants) + 10 unit pins

**Files:**
- Create: `apps/customer-app/src/lib/location/LocationStatusLabel.tsx`
- Create: `apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx`

- [ ] **Step 1: Write failing unit pins**

Create `apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { router } from 'expo-router'
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import { useUserLocation } from '@/hooks/useUserLocation'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/hooks/useUserLocation')

const mockedUseUserLocation = useUserLocation as jest.MockedFunction<typeof useUserLocation>

function mockPermission(permission: 'granted' | 'denied' | 'unavailable' | 'undetermined') {
  mockedUseUserLocation.mockReturnValue({
    permission, coords: null, request: jest.fn(), openSettings: jest.fn(),
  } as any)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LocationStatusLabel — state matrix', () => {
  it('§LSL-1 source=coordinates → "Using current location"', () => {
    mockPermission('granted')
    const { getByText, queryByTestId } = render(
      <LocationStatusLabel
        locationContext={{ source: 'coordinates', city: null, locality: null }}
      />
    )
    expect(getByText('Using current location')).toBeTruthy()
    expect(queryByTestId('location-status-chevron')).toBeNull()
  })

  it('§LSL-2 source=profile with city → "Using profile location · {city}"', () => {
    mockPermission('granted')
    const { getByText } = render(
      <LocationStatusLabel
        locationContext={{ source: 'profile', city: 'Huddersfield', locality: { id: 'l1', name: 'Huddersfield' } }}
      />
    )
    expect(getByText(/Using profile location · Huddersfield/)).toBeTruthy()
  })

  it('§LSL-3 source=profile city null → "Using profile location" (no suffix)', () => {
    mockPermission('granted')
    const { getByText, queryByText } = render(
      <LocationStatusLabel
        locationContext={{ source: 'profile', city: null, locality: null }}
      />
    )
    expect(getByText('Using profile location')).toBeTruthy()
    expect(queryByText(/·/)).toBeNull()
  })

  it('§LSL-4 source=none permission=denied → "No GPS · Set location ›"', () => {
    mockPermission('denied')
    const { getByText, getByTestId } = render(
      <LocationStatusLabel
        locationContext={{ source: 'none', city: null, locality: null }}
      />
    )
    expect(getByText(/No GPS · Set location/)).toBeTruthy()
    expect(getByTestId('location-status-chevron')).toBeTruthy()
  })

  it('§LSL-5 source=none permission=unavailable → same as denied', () => {
    mockPermission('unavailable')
    const { getByText } = render(
      <LocationStatusLabel
        locationContext={{ source: 'none', city: null, locality: null }}
      />
    )
    expect(getByText(/No GPS · Set location/)).toBeTruthy()
  })

  it('§LSL-6 source=none permission=undetermined → "Set location ›"', () => {
    mockPermission('undetermined')
    const { getByText, queryByText } = render(
      <LocationStatusLabel
        locationContext={{ source: 'none', city: null, locality: null }}
      />
    )
    expect(getByText('Set location')).toBeTruthy()
    expect(queryByText(/No GPS/)).toBeNull()
  })

  it('§LSL-7 locationContext undefined → renders null', () => {
    mockPermission('granted')
    const { toJSON } = render(<LocationStatusLabel locationContext={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('§LSL-8 tap routes to /saved-area', () => {
    mockPermission('granted')
    const { getByTestId } = render(
      <LocationStatusLabel
        locationContext={{ source: 'coordinates', city: null, locality: null }}
      />
    )
    fireEvent.press(getByTestId('location-status-label'))
    expect(router.push).toHaveBeenCalledWith('/saved-area' as any)
  })

  it('§LSL-9 variant=strip default → strip container shape', () => {
    mockPermission('granted')
    const { getByTestId } = render(
      <LocationStatusLabel
        locationContext={{ source: 'coordinates', city: null, locality: null }}
      />
    )
    const label = getByTestId('location-status-label')
    // Strip: no border radius; full-width container; bottom-only border.
    expect(label.props.style).toMatchObject({ borderRadius: 0 })
  })

  it('§LSL-10 variant=chip → chip container shape', () => {
    mockPermission('granted')
    const { getByTestId } = render(
      <LocationStatusLabel
        variant="chip"
        locationContext={{ source: 'coordinates', city: null, locality: null }}
      />
    )
    const label = getByTestId('location-status-label')
    expect(label.props.style).toMatchObject({ borderRadius: 999 })
  })
})
```

(Adjust imports to match the project's actual `useUserLocation` path. Use existing test fixtures for `LocationContext` shape if any are already factored out.)

- [ ] **Step 2: Run pins to verify they fail**

```bash
cd apps/customer-app && npx jest tests/lib/location/LocationStatusLabel.test.tsx --forceExit
```

Expected: all 10 pins FAIL (component doesn't exist yet).

- [ ] **Step 3: Implement the component**

Create `apps/customer-app/src/lib/location/LocationStatusLabel.tsx`:

```tsx
import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { MapPin, MapPinOff, ChevronRight } from '@/design-system/icons'
import { color, spacing } from '@/design-system/tokens'
import { useUserLocation } from '@/hooks/useUserLocation'
import type { LocationContext } from '@/lib/api/shared/location'

type Variant = 'strip' | 'chip'

type Props = {
  locationContext: LocationContext | undefined
  variant?: Variant
}

type RenderedState =
  | { kind: 'coordinates' }
  | { kind: 'profile-with-city'; city: string }
  | { kind: 'profile-no-city' }
  | { kind: 'no-gps' }
  | { kind: 'undetermined' }
  | { kind: 'hidden' }

function deriveState(
  locationContext: LocationContext | undefined,
  permission: 'granted' | 'denied' | 'unavailable' | 'undetermined',
): RenderedState {
  if (!locationContext) return { kind: 'hidden' }
  if (locationContext.source === 'coordinates') return { kind: 'coordinates' }
  if (locationContext.source === 'profile') {
    if (locationContext.city) return { kind: 'profile-with-city', city: locationContext.city }
    return { kind: 'profile-no-city' }
  }
  // source === 'none'
  if (permission === 'denied' || permission === 'unavailable') return { kind: 'no-gps' }
  return { kind: 'undetermined' }
}

export function LocationStatusLabel({ locationContext, variant = 'strip' }: Props): React.ReactElement | null {
  const { permission } = useUserLocation()
  const state = deriveState(locationContext, permission)

  if (state.kind === 'hidden') return null

  const showChevron = state.kind === 'no-gps' || state.kind === 'undetermined'
  const Icon = state.kind === 'no-gps' ? MapPinOff : MapPin

  const labelText = (() => {
    switch (state.kind) {
      case 'coordinates':        return 'Using current location'
      case 'profile-with-city':  return `Using profile location · ${state.city}`
      case 'profile-no-city':    return 'Using profile location'
      case 'no-gps':             return 'No GPS · Set location'
      case 'undetermined':       return 'Set location'
    }
  })()

  const a11yLabel = `${labelText}, opens your location`

  const containerStyle = variant === 'chip' ? styles.chip : styles.strip

  return (
    <Pressable
      testID="location-status-label"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={containerStyle}
      onPress={() => router.push('/saved-area' as any)}
    >
      <View style={styles.row}>
        <Icon size={14} color={color.brandRose} />
        <Text style={styles.label} numberOfLines={1}>
          {state.kind === 'profile-with-city' ? (
            <>
              Using profile location · <Text style={styles.cityEmphasis}>{state.city}</Text>
            </>
          ) : (
            labelText
          )}
        </Text>
        {showChevron ? (
          <ChevronRight
            testID="location-status-chevron"
            size={14}
            color={color.text.tertiary}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  strip: {
    width:        '100%',
    height:       36,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[1],
    backgroundColor:   color.surface.tint,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
    borderRadius:      0,
    justifyContent:    'center',
  },
  chip: {
    height:        32,
    paddingHorizontal: spacing[3],
    paddingVertical:   6,
    backgroundColor:   'rgba(254, 246, 245, 0.96)',
    borderWidth:       1,
    borderColor:       color.border.subtle,
    borderRadius:      999,
    alignSelf:         'center',
    shadowColor:       '#000',
    shadowOpacity:     0.08,
    shadowOffset:      { width: 0, height: 1 },
    shadowRadius:      2,
    elevation:         1,
    justifyContent:    'center',
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
  },
  label: {
    fontSize:      12,
    fontWeight:    '500',
    letterSpacing: 0.4,
    color:         color.text.primary,
    flex:          1,
  },
  cityEmphasis: {
    fontWeight: '600',
  },
})
```

(Verify all design-system token paths against the actual project structure. If `color.brandRose` is not a direct token, use the existing brand-rose import path. Use `color.text.primary` / `color.text.tertiary` / `color.surface.tint` / `color.border.subtle` if those exist; substitute concrete project tokens otherwise.)

- [ ] **Step 4: Run pins to verify they pass**

```bash
cd apps/customer-app && npx jest tests/lib/location/LocationStatusLabel.test.tsx --forceExit
```

Expected: all 10 pins PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/location/LocationStatusLabel.tsx \
        apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx
git commit -m "feat(locationcontext-parity): <LocationStatusLabel> component (strip + chip variants) + 10 unit pins"
```

---

## Task 9 — Mount on Home (strip variant) + integration pin

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Create: `apps/customer-app/tests/features/home/HomeScreen.statusLabel.test.tsx`

- [ ] **Step 1: Write failing integration pin**

Create `apps/customer-app/tests/features/home/HomeScreen.statusLabel.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HomeScreen from '@/features/home/screens/HomeScreen'

jest.mock('@/lib/api/discovery', () => ({
  ...jest.requireActual('@/lib/api/discovery'),
  discoveryApi: {
    getHomeFeed: jest.fn().mockResolvedValue({
      featured: [], trending: [], rails: [],
      locationContext: {
        source: 'profile',
        city: 'Huddersfield',
        locality: { id: 'l1', name: 'Huddersfield' },
      },
    }),
  },
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

it('§LSL-Home Home renders strip <LocationStatusLabel> with the feed locationContext', async () => {
  const { findByTestId, findByText } = render(wrap(<HomeScreen />))
  await findByTestId('location-status-label')
  await findByText(/Using profile location · Huddersfield/)
})
```

(Adjust mocks + imports to match the project's actual data fetching path — refer to the existing HomeScreen test files for patterns.)

- [ ] **Step 2: Run pin to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/home/HomeScreen.statusLabel.test.tsx --forceExit
```

Expected: FAIL (label not mounted yet).

- [ ] **Step 3: Mount the label on Home**

In `apps/customer-app/src/features/home/screens/HomeScreen.tsx`, locate where `<HomeNoLocationBanner>` or `<SavedAreaHonestyHint>` is mounted (top of scrollable content). Add `<LocationStatusLabel>` immediately above:

```tsx
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'

// ... inside the scrollable content, ABOVE the existing banner / honesty hint slot:
<LocationStatusLabel variant="strip" locationContext={feed?.locationContext} />
```

The label scrolls with content per D6. It coexists with `<SavedAreaHonestyHint>`.

- [ ] **Step 4: Run pin to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/home/HomeScreen.statusLabel.test.tsx --forceExit
```

Expected: PASS.

- [ ] **Step 5: Run the full Home test suite to verify no regression**

```bash
cd apps/customer-app && npx jest tests/features/home/ --forceExit
```

Expected: all existing Home tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/home/screens/HomeScreen.tsx \
        apps/customer-app/tests/features/home/HomeScreen.statusLabel.test.tsx
git commit -m "feat(locationcontext-parity): mount <LocationStatusLabel variant=strip> on HomeScreen"
```

---

## Task 10 — Mount on Search (strip variant) + retire client-side `savedAreaCity` derivation + integration pin

**Files:**
- Modify: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`
- Create: `apps/customer-app/tests/features/search/SearchScreen.statusLabel.test.tsx`

- [ ] **Step 1: Audit the current client-side derivation**

```bash
grep -n "savedAreaCity\|useMe().data?.locality\|useMe()?.data?.locality" apps/customer-app/src/features/search/screens/SearchScreen.tsx
```

Expected: confirm SearchScreen currently derives `savedAreaCity` client-side (per spec §6.2 references at SearchScreen.tsx:119,125,132-133) using `useMe()` + `useUserLocation`.

- [ ] **Step 2: Write failing integration pin**

Create `apps/customer-app/tests/features/search/SearchScreen.statusLabel.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchScreen from '@/features/search/screens/SearchScreen'

jest.mock('@/lib/api/discovery', () => ({
  ...jest.requireActual('@/lib/api/discovery'),
  discoveryApi: {
    search: jest.fn().mockResolvedValue({
      merchants: [], total: 0, branches: [], totalBranches: 0,
      branchMeta: { /* whatever the existing shape expects */ },
      locationContext: {
        source: 'profile',
        city: 'Huddersfield',
        locality: { id: 'l1', name: 'Huddersfield' },
      },
    }),
  },
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

it('§LSL-Search Search renders strip <LocationStatusLabel> with response locationContext', async () => {
  const { findByTestId, findByText } = render(wrap(<SearchScreen />))
  await findByTestId('location-status-label')
  await findByText(/Using profile location · Huddersfield/)
})
```

- [ ] **Step 3: Run pin to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/SearchScreen.statusLabel.test.tsx --forceExit
```

Expected: FAIL.

- [ ] **Step 4: Mount label + retire client-side derivation**

In `apps/customer-app/src/features/search/screens/SearchScreen.tsx`:

1. Add the import: `import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'`.
2. Mount above the `<SearchBar>`:
   ```tsx
   <LocationStatusLabel variant="strip" locationContext={searchResponse?.locationContext} />
   <SearchBar ... />
   ```
3. Replace the client-side `savedAreaCity` derivation. Today (per spec §6.2): `const savedAreaCity = useMe().data?.locality?.name ?? city ?? null`. Replace with: `const savedAreaCity = searchResponse?.locationContext?.city ?? null`.
4. The `<SearchEmptyState>` component prop signature is unchanged — it still receives `savedAreaCity` as a string-or-null. Only the source of that value changes.

- [ ] **Step 5: Run pin + full Search suite**

```bash
cd apps/customer-app && npx jest tests/features/search/ --forceExit
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/search/screens/SearchScreen.tsx \
        apps/customer-app/tests/features/search/SearchScreen.statusLabel.test.tsx
git commit -m "feat(locationcontext-parity): mount <LocationStatusLabel variant=strip> on Search + retire client-side savedAreaCity derivation"
```

---

## Task 11 — Mount on Map (chip variant) + integration pin

**Files:**
- Modify: `apps/customer-app/src/features/map/screens/MapScreen.tsx`
- Create: `apps/customer-app/tests/features/map/MapScreen.statusLabel.test.tsx`

- [ ] **Step 1: Write failing integration pin**

Create `apps/customer-app/tests/features/map/MapScreen.statusLabel.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MapScreen from '@/features/map/screens/MapScreen'

jest.mock('@/lib/api/discovery', () => ({
  ...jest.requireActual('@/lib/api/discovery'),
  discoveryApi: {
    getInArea: jest.fn().mockResolvedValue({
      merchants: [], branches: [], meta: { /* viewport meta */ },
      locationContext: {
        source: 'profile',
        city: 'Huddersfield',
        locality: { id: 'l1', name: 'Huddersfield' },
      },
    }),
  },
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

it('§LSL-Map Map renders chip <LocationStatusLabel> with inArea locationContext + has chip styling (borderRadius=999)', async () => {
  const { findByTestId } = render(wrap(<MapScreen />))
  const label = await findByTestId('location-status-label')
  expect(label.props.style).toMatchObject({ borderRadius: 999 })
})
```

- [ ] **Step 2: Run pin to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/map/MapScreen.statusLabel.test.tsx --forceExit
```

Expected: FAIL.

- [ ] **Step 3: Mount chip on Map**

In `apps/customer-app/src/features/map/screens/MapScreen.tsx`:

1. Add the import: `import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'`.
2. Mount inside an absolute-positioned wrapper at the top of the safe-area band:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from '@/design-system/tokens'

// inside the MapScreen render, alongside other overlays:
const insets = useSafeAreaInsets()

<View
  style={{
    position:   'absolute',
    top:        insets.top + spacing[2],
    left:       0,
    right:      0,
    alignItems: 'center',
    pointerEvents: 'box-none', // chip itself catches taps, map below stays interactive
    zIndex:     10,
  }}
>
  <LocationStatusLabel variant="chip" locationContext={inAreaResponse?.locationContext} />
</View>
```

- [ ] **Step 4: Verify `<ViewportLocalityBadge>` does not overlap**

Visually inspect the screen file. `<LocationStatusLabel variant="chip">` lives at `top: insets.top + spacing[2]`, centered. `<ViewportLocalityBadge>` lives wherever it currently lives (viewport corner near the search-this-area button). If they collide on small screens, the layout decision is to keep the chip at top-centre and the viewport badge in its current position — they should not collide because the chip is at the very top and the viewport badge is lower. If device-QA flags overlap, adjust positions in Task 13.

- [ ] **Step 5: Run pin + full Map suite**

```bash
cd apps/customer-app && npx jest tests/features/map/ --forceExit
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/map/screens/MapScreen.tsx \
        apps/customer-app/tests/features/map/MapScreen.statusLabel.test.tsx
git commit -m "feat(locationcontext-parity): mount <LocationStatusLabel variant=chip> on MapScreen"
```

---

## Task 12 — Docs (customer-flow + changelog + CLAUDE.md AWAITING MERGE entry)

**Files:**
- Modify: `docs/customer-flow-current.md` (append §15).
- Modify: `docs/customer-flow-changelog.md` (dated entry).
- Modify: `CLAUDE.md` (add Phase 3C.1m section with AWAITING MERGE state).

- [ ] **Step 1: Append §15 to customer-flow-current.md**

Append to `docs/customer-flow-current.md`:

```markdown
## §15. Top-of-app location identity (§DF-v2-j + §DF-v2-i)

**Version:** v1.1 (locked 2026-05-26)

### 15.1 Status label

A compact `<LocationStatusLabel>` renders at the top of Home, Search, and Map. It reflects the user's effective location identity:

- `Using current location` — when GPS coords drive ranking.
- `Using profile location · {city}` — when the user's saved profile postcode drives ranking.
- `Using profile location` — defensive fallback if city is null but source is profile.
- `No GPS · Set location ›` — when GPS is denied / unavailable AND no profile location is set.
- `Set location ›` — when permission is undetermined AND no profile location is set.

Tapping any state routes to Your Location (`/saved-area`).

Home/Search use the strip variant (full-width row, bottom hairline). Map uses the chip variant (pill-shaped floating overlay, top-centre of safe area).

### 15.2 Tightened `source='profile'` invariant

The wire envelope `locationContext.source === 'profile'` now requires the user to have ALL of `User.localityId`, `User.latitude`, and `User.longitude` populated. Users with only a `city` text field (no postcode/locality/coords) now see `source='none'` and a "Set location" prompt.

### 15.3 Surfaces NOT mounted

Voucher Detail, Merchant Profile, Profile tab, and Your Location screen do NOT mount the status label. Merchant Profile receives the envelope additively on its wire payload for future consumers.
```

- [ ] **Step 2: Append dated entry to customer-flow-changelog.md**

Append to `docs/customer-flow-changelog.md`:

```markdown
## 2026-05-26 — §DF-v2-j + §DF-v2-i: location-context parity + status label

- New `<LocationStatusLabel>` component on Home (strip), Search (strip), Map (chip).
- Backend additive `locationContext` emit on `/search`, `/discovery/in-area`, `/merchants/:id`.
- Tightened `resolveLocationContext`: `source='profile'` now requires `localityId + latitude + longitude` (was: `localityId OR city` text).
- Atomic `§DF-7v2i` backend pin (formerly `§DF-7`).
- Voucher Detail untouched; deferred to §DF-v2-o.
```

- [ ] **Step 3: Append Phase 3C.1m AWAITING MERGE section to CLAUDE.md**

In `CLAUDE.md`, insert immediately after the Phase 3C.1l Discovery Rebaseline section:

```markdown
### 🚧 Phase 3C.1m — Location Context Parity + Top-of-App Status Label (§DF-v2-j + §DF-v2-i) — AWAITING MERGE (PR # TBD)

Tier 2 plan-first. Bundles §DF-v2-i (tighten `resolveLocationContext` invariants to match `resolveEffectiveLocation`'s SAVED_PROFILE branch) with §DF-v2-j (parity emit on Search / Map / Merchant Profile + new `<LocationStatusLabel>` component on Home / Search / Map).

Locked product copy: "Using profile location · {city}" / "Using profile location" / "No GPS · Set location ›" / "Set location ›" — the "saved area" / "saved location" vocabulary is fully retired per owner direction.

Voucher Detail is explicitly deferred to §DF-v2-o (new follow-up filed in the deferred-followups index).

Spec: `docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md` v1.1.
Plan: `docs/superpowers/plans/2026-05-26-locationcontext-parity.md`.
Audit: `docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/customer-flow-current.md docs/customer-flow-changelog.md CLAUDE.md
git commit -m "docs(locationcontext-parity): customer-flow §15 + changelog + CLAUDE.md Phase 3C.1m AWAITING MERGE"
```

---

## Task 13 — Device-QA pass

**No code changes by default.** Device-QA either confirms behaviour or surfaces device-only adjustments captured as follow-up commits.

- [ ] **Step 1: Run all 9 device-QA scenarios from spec §10**

Per spec §10:

1. Huddersfield URBAN profile, GPS off → strip on Home/Search shows "Using profile location · Huddersfield"; chip on Map shows same copy.
2. GPS denied, no profile postcode → all surfaces show "No GPS · Set location ›".
3. GPS undetermined, no postcode → all surfaces show "Set location ›".
4. GPS granted mid-session → label updates to "Using current location" on next focus.
5. Map viewport pan → label stays unchanged; ViewportLocalityBadge updates; no overlap.
6. Map chip visual over satellite / dense tiles → legible, no perf regression.
7. §DF-v2-i edge case (city text only) → label shows "Set location ›".
8. Defensive `source='profile'` + `city=null` → "Using profile location" (no suffix).
9. Backgrounded → permission granted in OS → resume → label updates on focus.
10. Voucher Detail / Merchant Profile / Profile tab / Your Location screen → label NOT visible.

- [ ] **Step 2: Document findings**

For each scenario: PASS / FAIL / NOTE. If any FAILs, file a fix sub-commit referencing the spec section, then re-run the failing scenario.

If only NOTE-level observations (e.g. minor copy ambiguity, no functional break), capture as either: (a) inline polish before merge if trivial; or (b) a new deferred follow-up in `project_deferred_followups_index.md` if non-trivial.

- [ ] **Step 3: Confirm no source code changes were introduced silently**

```bash
git status
```

Expected: clean working tree (any device-QA-triggered changes were committed in step 2).

---

## Task 14 — Open PR + closure

**Files:**
- N/A (PR + closure ops, no source changes).

- [ ] **Step 1: Open the PR**

```bash
git push -u origin feature/locationcontext-parity
gh pr create --base main --title "§DF-v2-j + §DF-v2-i — locationContext parity + top-of-app status label" --body "$(cat <<'EOF'
## Summary

- §DF-v2-i (atomic): tighten `resolveLocationContext` so `source='profile'` requires `localityId + lat + lng` (matches `resolveEffectiveLocation` SAVED_PROFILE invariants). Atomic `§DF-7v2i` pin update.
- §DF-v2-j: additive `locationContext` emit on `/search`, `/discovery/in-area`, `/merchants/:id`.
- New `<LocationStatusLabel>` component (strip variant on Home/Search, chip variant on Map). Locked copy uses "profile location" wording (owner-locked retirement of "saved area" / "saved location" vocabulary).
- Schema hoist to `apps/customer-app/src/lib/api/shared/location.ts`.
- 16 new backend pins (4 each for Search / In-area / Merchant Profile + 4 unit pins on `resolveLocationContext`) + atomic `§DF-7v2i` update + 10 component pins + 3 surface integration pins.
- Voucher Detail untouched; deferred to new §DF-v2-o.

## Spec / Plan / Audit
- Spec: `docs/superpowers/specs/2026-05-26-locationcontext-parity-design.md` v1.1
- Plan: `docs/superpowers/plans/2026-05-26-locationcontext-parity.md`
- Audit: `docs/superpowers/audits/2026-05-26-locationcontext-route-audit.md`

## Test plan
- [x] Backend vitest: `npx vitest run tests/api/customer/discovery/`
- [x] Customer-app jest: voucher / merchant / home / search / map / lib/location suites
- [x] Customer-app tsc clean
- [x] Device-QA 9 scenarios per spec §10
EOF
)"
```

- [ ] **Step 2: Verify PR scope before merge**

Per Redeemo project rule (CLAUDE.md "PR scope verification"), confirm GitHub's live `compare` endpoint matches expectation:

```bash
gh api repos/MSC23-bot/Redeemo/compare/main...feature/locationcontext-parity --jq '{commits: .commits|length, files: .files|length, additions: .additions, deletions: .deletions}'
```

Expected: ~14-15 commits (one per task), ~22 files changed, ~600-1000 additions, ~50-150 deletions.

- [ ] **Step 3: SHA-bound merge once approved**

```bash
HEAD_SHA=$(gh pr view <PR#> --json headRefOid --jq .headRefOid)
echo "Head SHA: $HEAD_SHA"
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge <PR#> --merge
```

(Replace `<PR#>` with the actual PR number. Capture `$HEAD_SHA` as a literal in the second command, not as `$()` shell expansion, since the hook validates the env-var string against the literal SHA.)

- [ ] **Step 4: Post-merge — flip CLAUDE.md from AWAITING MERGE → SHIPPED**

```bash
git checkout main && git pull origin main
```

Edit `CLAUDE.md` Phase 3C.1m section: change "🚧 AWAITING MERGE (PR # TBD)" → "✅ SHIPPED YYYY-MM-DD (PR #<n> merge `<sha>`)". Add 1-line summary of what shipped + file counts.

Commit:

```bash
git add CLAUDE.md
git commit -m "docs: flip Phase 3C.1m §DF-v2-j+§DF-v2-i to SHIPPED post-merge"
git push origin main
```

- [ ] **Step 5: Post-merge — local memory updates**

Write closure memory at `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_df_v2_j_locationcontext_parity_complete.md` with:
- Status: SHIPPED, merge SHA, date.
- One-line summary.
- Files touched count.
- Test counts at merge.
- New deferred §DF-v2-o filed.

Update `~/.claude/projects/.../memory/MEMORY.md`:
- New top-of-index entry for §DF-v2-j SHIPPED.
- Demote §DF v1 entry one row.

Update `~/.claude/projects/.../memory/project_current_state.md`:
- Frontmatter: latest-shipped → §DF-v2-j.
- Body: latest-shipped section rewrites to §DF-v2-j; next-up shifts to §DF-v2-o or next workstream candidate.

Update `~/.claude/projects/.../memory/project_deferred_followups_index.md`:
- §DF-v2-i: flip to ✅ CLOSED.
- §DF-v2-j: flip to ✅ CLOSED.
- §DF-v2-o: NEW entry (Voucher Detail location-context awareness) per spec §13.

---

## Self-review notes (writing-plans skill)

**Spec coverage (cross-referenced against spec v1.1):**
- §DF-v2-i tighten → Task 1.
- §DF-v2-j backend emit (Search / In-area / Merchant Profile) → Tasks 4-6.
- Schema hoist → Task 3.
- Customer-app Zod additions → Task 7.
- `<LocationStatusLabel>` with both variants → Task 8.
- Home / Search / Map mounts → Tasks 9-11.
- Atomic §DF-7v2i pin update → Task 1 step 5.
- 16 new backend pins → Tasks 1 (4 helper pins) + 4 (4 Search pins) + 5 (4 In-area pins) + 6 (4 Merchant Profile pins).
- 10 component pins → Task 8.
- 3 surface integration pins → Tasks 9 / 10 / 11.
- Device-QA 9 scenarios → Task 13.
- Docs updates → Task 12.
- Voucher Detail explicitly deferred (no task touches `voucher.ts`) ✅.

**Placeholder scan:** no TBD, no "implement later", no "similar to Task N" without showing code. The few `// ... existing X` annotations in code blocks reference real surrounding code the implementer reads from the actual files; they are pointers, not placeholders.

**Type consistency:** `LocationContext` type used in service signatures (Task 2), in shared schema (Task 3), in component prop (Task 8). Matches the wire schema in spec §5.1. Helper signature `resolveLocationContext(prisma, userId, lat, lng)` matches both spec §4.1 and the existing helper at service.ts:109 — no signature drift.

---

**End of plan.** PAUSE for owner review before starting implementation.
