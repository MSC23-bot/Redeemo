# §DF Postcode / Profile-Location Fallback Implementation Plan (customer-app v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Version:** 1.0

**Goal:** Customer-app users with GPS denied/unavailable see a fully-anchored Discovery (Featured / Popular / Trending / NBC all firing) anchored on their saved postcode, with a visible honesty hint disclosing the fallback source and a branded permission-education + recovery surface so users who DO want GPS can grant cleanly. Seed and legacy users are backfilled so the existing `resolveEffectiveLocation` SAVED_PROFILE branch actually fires.

**Architecture:** Backend resolver + wire envelope are already shipped (Plan 4 M2.4 + PR #126 §BB). §DF v1 is overwhelmingly data + customer-app UI work: (1) populate `User.latitude / User.longitude / User.localityId` for seed + legacy users; (2) consolidate the two existing location hooks into one with explainer + recovery; (3) add the Home saved-area honesty hint; (4) add a Saved Area sub-screen reachable from the Profile surface; (5) optionally add a top-of-app status label. Customer-app wire-schema gains the existing `locationContext` envelope on read.

**Tech Stack:** Backend Prisma 7 + vitest. Customer-app: Expo SDK 54 + expo-router v4 + expo-location + React Query + Zod. Existing patterns: `apps/customer-app/src/hooks/useLocation.ts::useUserLocation` for GPS coords; `src/lib/api/profile.ts` for profile fetch/PATCH; `src/design-system/motion/BottomSheet` for sheets.

**Locked spec:** [`docs/superpowers/specs/2026-05-24-postcode-profile-fallback-design.md`](../specs/2026-05-24-postcode-profile-fallback-design.md) v1.1.

**Branch:** `feature/df-postcode-profile-fallback` (already carries the §DF spec commit `0fcb120`).

**§DF-web (customer-website) is OUT OF SCOPE for this plan.** It is a separate Tier 2 follow-up workstream — see spec §13. This plan ships customer-app v1 only.

---

## Mandatory pre-implementation audits (Tasks 0a / 0b / 0c)

Three audits must complete and report findings BEFORE any code task. They lock the architectural decisions that the rest of the plan rests on. If any audit surfaces a finding the plan didn't anticipate, PAUSE and bring the finding back to the owner before continuing.

---

## Task 0a: Location hook consolidation audit

**Files (read-only audit):**
- Read: `apps/customer-app/src/hooks/useLocation.ts` (existing `useUserLocation`)
- Read: `apps/customer-app/src/lib/location.ts` (existing `useLocationAssist`)
- Grep: all call sites of both hooks across `apps/customer-app/src` + `apps/customer-app/app`.
- Read: `apps/customer-app/src/lib/devLocationOverride.ts` (existing §AU dev override — must keep working).

### Steps

- [ ] **Step 1: Inventory current behaviour.** Report what each hook does (return shape, side effects, OS calls), where it's called, and what each call site needs. Expected (pre-audit reading): `useUserLocation` powers live GPS for Home/Search/Map/Voucher/Merchant (7 call sites); `useLocationAssist` powers PC2 reverse-geocode postcode autofill (1 call site, different purpose).

- [ ] **Step 2: Identify gaps relative to §DF UX requirements.** For each requirement, mark which hook currently covers it, partially covers it, or doesn't:
  - Permission-state read (`granted | denied | undetermined | unavailable`)
  - GPS coords
  - `request()` that shows §6.4.1 branded pre-permission explainer BEFORE the native prompt
  - Recovery sheet trigger on deny
  - `openSettings()` action (Linking.openSettings / IntentLauncher)
  - Dev location override (§AU) preserved
  - Hermes-compat (no Intl traps from §reference_london_clock_helper memory)

- [ ] **Step 3: Lock the consolidation decision.** Pick one:
  - **Option A (preferred): extend `useUserLocation`** with the missing capabilities. Leave `useLocationAssist` alone (different purpose: reverse-geocode for onboarding; not GPS-permission lifecycle).
  - **Option B: replace `useUserLocation` with a new hook** (e.g. `useLocation`) that wraps the same underlying expo-location plumbing + adds explainer/recovery. Migrate all 7 call sites.
  - **Option C: NEW** — only if Options A/B both create worse APIs. Must justify why the audit found this necessary.

  **Hard guardrail:** §DF must NOT ship with 3 parallel location-permission abstractions. If Option C, one of the existing hooks MUST be deleted or wrapped, not run alongside.

- [ ] **Step 4: Write a 1-page audit report** at `docs/superpowers/audits/2026-05-24-location-hook-audit.md` capturing findings + locked decision. Commit. Halt here for owner ack before continuing.

```bash
git add docs/superpowers/audits/2026-05-24-location-hook-audit.md
git commit -m "docs(audit): §DF Task 0a — location hook consolidation audit + decision"
```

---

## Task 0b: Profile / Settings route audit

**Files (read-only audit):**
- Read: `apps/customer-app/app/(app)/profile.tsx` (existing minimal Profile shell)
- Read: `apps/customer-app/app/(app)/_layout.tsx` (route registration)
- List: `apps/customer-app/app/(app)/` directory (flat vs nested check)
- Read: any existing sub-route patterns (`merchant/[id].tsx`, `voucher/[id].tsx`, `redemption/[id].tsx`) for the established convention.

### Steps

- [ ] **Step 1: Confirm Profile shell state.** Report (a) what's currently mounted in `app/(app)/profile.tsx`; (b) whether it has any settings sub-routes; (c) the established route convention for sub-screens (Tabs.Screen with `href: null` + hidden tab bar — same pattern as `merchant/[id]`).

- [ ] **Step 2: Lock the Saved Area route shape.** Pick one:
  - **Option A (likely preferred): flat sub-route** at `app/(app)/saved-area.tsx`, registered in `_layout.tsx` as a `Tabs.Screen` with `href: null` + hidden tab bar (mirrors `merchant/[id]` / `voucher/[id]` pattern). Lowest blast radius; no new stack needed.
  - **Option B: new Settings stack** at `app/(app)/settings/_layout.tsx` + `app/(app)/settings/saved-area.tsx`. Only justified if other settings sub-screens are imminent (Profile rebaseline §Phase 3C.1h is queued but not in §DF scope).
  - **Option C: NEW** — anything else discovered during audit.

- [ ] **Step 3: Lock the Profile cross-link insertion point.** Identify the cleanest place in `app/(app)/profile.tsx` (line range) to add a "Saved Area · {locality} ›" row that won't conflict with the Profile rebaseline.

- [ ] **Step 4: Update the audit doc** at `docs/superpowers/audits/2026-05-24-location-hook-audit.md` to append Task 0b findings (one combined audit doc — no need for a second file). Commit.

```bash
git add docs/superpowers/audits/2026-05-24-location-hook-audit.md
git commit -m "docs(audit): §DF Task 0b — Profile/Settings route shape audit + decision"
```

---

## Task 0c: locationContext wire-shape parity audit

**Files (read-only audit):**
- Grep: `locationContext` across `src/api/customer/discovery/`, `src/api/customer/search/`, `src/api/customer/map/` (if exists) — find every endpoint that emits OR fails to emit it.
- Read: each Discovery endpoint return shape (Home, Search, NBC, Map bbox, Voucher Detail, Merchant Profile).
- Read: `apps/customer-app/src/lib/api/discovery.ts` + adjacent API clients to identify Zod schemas that need to gain `locationContext`.

### Steps

- [ ] **Step 1: Build a parity table.** For each customer-facing read endpoint, mark whether the response currently includes `locationContext: { city, source, locality }`:

| Endpoint | Emits `locationContext`? |
|---|---|
| Home (`getHomeFeed`) | Expected: YES (PR #126 §BB) |
| Search (`searchBranches`) | TBD by audit |
| NBC rails (separate?) | TBD by audit |
| Map (`getInArea` / bbox-default) | TBD by audit |
| Voucher Detail | TBD by audit |
| Merchant Profile | TBD by audit |

- [ ] **Step 2: Decide the minimum additive emit needed for §DF v1.**
  - **If §6.4.3 top-of-app status label SHIPS in v1** (per §6.4.5 scope guard): every Discovery surface that mounts the label needs `locationContext`. Add additive emit on each missing endpoint.
  - **If §6.4.3 status label DEFERS to §DF-v2-j**: Home-only honesty hint is enough; Search/NBC/Map/Voucher/Merchant parity is OUT OF SCOPE for §DF v1.

- [ ] **Step 3: Lock the §6.4.3 ship/defer decision** now. Recommend SHIP-in-v1 if the audit shows ≤2 endpoints need the additive emit; recommend DEFER if ≥3. Either is acceptable per spec §6.4.5.

- [ ] **Step 4: Update the audit doc** with the parity table + ship/defer decision. Commit.

```bash
git add docs/superpowers/audits/2026-05-24-location-hook-audit.md
git commit -m "docs(audit): §DF Task 0c — locationContext parity audit + status-label ship/defer decision"
```

---

## Task 1: Seed customer postcode enrichment

**Files:**
- Modify: `prisma/seed.ts` — populate `postcode`, `latitude`, `longitude`, `localityId` for `customer@redeemo.com` and any other seeded customer accounts.

### Steps

- [ ] **Step 1: Locate the `customer@redeemo.com` upsert** in `prisma/seed.ts`. Note the current state of postcode/latitude/longitude/localityId fields.

- [ ] **Step 2: Add Locality-aware enrichment.** Before the User upsert, resolve `HD1 1AA` via `findOrCreateLocality` (Plan 4 M1 helper). Use the returned `locality.id`, `locality.centerLat`, `locality.centerLng`.

```ts
// Inside prisma/seed.ts main()
const { findOrCreateLocality } = await import('../src/api/lib/findOrCreateLocality')
const huddersfieldLocality = await findOrCreateLocality(prisma, 'HD1 1AA')
if (!huddersfieldLocality) {
  throw new Error('Seed: HD1 1AA did not resolve via findOrCreateLocality — ONSPD data missing?')
}

// Then in the customer@redeemo.com upsert:
await prisma.user.upsert({
  where: { email: 'customer@redeemo.com' },
  update: {
    postcode:   'HD1 1AA',
    latitude:   huddersfieldLocality.centerLat,
    longitude:  huddersfieldLocality.centerLng,
    localityId: huddersfieldLocality.id,
  },
  create: {
    // ... existing create fields,
    postcode:   'HD1 1AA',
    latitude:   huddersfieldLocality.centerLat,
    longitude:  huddersfieldLocality.centerLng,
    localityId: huddersfieldLocality.id,
  },
})
```

- [ ] **Step 3: Run seed against local dev DB.** `npx prisma db seed`. Expect success; verify via `npx tsx prisma/check-user.ts` that customer@redeemo.com has all four location fields populated.

- [ ] **Step 4: Audit other seeded customer accounts.** Grep `prisma/seed.ts` for `prisma.user.upsert`. For any other customer-role account being seeded, apply the same pattern with a contextually appropriate UK postcode (cover a seeded-supply locality — e.g. Brightlingsea for the Covelum test fixture if that customer exists). If no other customer accounts, note it.

- [ ] **Step 5: Commit.**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): §DF Task 1 — seed customer postcode + Locality enrichment"
```

---

## Task 2: Backfill script for legacy + incomplete users

**Files:**
- Create: `prisma/backfill-user-locality.ts`
- Create: `tests/scripts/backfill-user-locality.test.ts`

### Steps

- [ ] **Step 1: Write a failing test.** The test must cover (a) post-PC2 user no-op; (b) legacy postcode-only user populated; (c) seed user populated; (d) no-postcode user no-op; (e) idempotency on re-run.

```ts
// tests/scripts/backfill-user-locality.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { backfillUserLocality } from '../../prisma/backfill-user-locality'

describe('backfillUserLocality', () => {
  const prisma = new PrismaClient()
  const PREFIX = 'BACKFILL-'

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1` // warm Neon
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
    await prisma.$disconnect()
  })

  it('no-ops when user already has all three location fields', async () => {
    const user = await prisma.user.create({
      data: { email: `${PREFIX}done@x.test`, postcode: 'HD1 1AA',
              latitude: 53.6, longitude: -1.8, localityId: 'some-existing-id' },
    })
    const before = user.updatedAt
    await backfillUserLocality(prisma)
    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.updatedAt).toEqual(before)
  })

  it('populates lat/lng/localityId for postcode-only user', async () => {
    // ... write fixture; run script; assert all three populated
  })

  it('no-ops when user has no postcode at all', async () => {
    // ... write fixture; run script; assert all three still null
  })

  it('is idempotent on re-run', async () => {
    // ... write fixture; run; capture state; run again; assert state unchanged
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails** (script doesn't exist yet). `npx vitest run tests/scripts/backfill-user-locality.test.ts` → expect FAIL with "module not found".

- [ ] **Step 3: Write the script.**

```ts
// prisma/backfill-user-locality.ts
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { findOrCreateLocality } from '../src/api/lib/findOrCreateLocality'

dotenv.config()

export async function backfillUserLocality(prisma: PrismaClient): Promise<{ processed: number; populated: number; skipped: number }> {
  const incompleteUsers = await prisma.user.findMany({
    where: {
      postcode: { not: null },
      OR: [{ localityId: null }, { latitude: null }, { longitude: null }],
    },
    select: { id: true, postcode: true },
  })

  let populated = 0
  for (const u of incompleteUsers) {
    if (!u.postcode) continue
    const locality = await findOrCreateLocality(prisma, u.postcode)
    if (!locality) {
      console.warn(`Skipping user ${u.id}: postcode ${u.postcode} did not resolve`)
      continue
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        localityId: locality.id,
        latitude:   locality.centerLat,
        longitude:  locality.centerLng,
      },
    })
    populated++
  }

  return { processed: incompleteUsers.length, populated, skipped: incompleteUsers.length - populated }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter } as any)
  backfillUserLocality(prisma)
    .then((r) => { console.log(`Backfill complete:`, r); return prisma.$disconnect() })
    .then(() => pool.end())
    .catch((e) => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 4: Run the test, expect PASS.** `npx vitest run tests/scripts/backfill-user-locality.test.ts`.

- [ ] **Step 5: Commit.**

```bash
git add prisma/backfill-user-locality.ts tests/scripts/backfill-user-locality.test.ts
git commit -m "feat(scripts): §DF Task 2 — backfill-user-locality script + tests"
```

---

## Task 3: Backend locationContext parity emit (CONDITIONAL on Task 0c)

**Run this task ONLY if Task 0c locked §6.4.3 status label to SHIP-in-v1 AND identified endpoints missing `locationContext`.**

**Files (depends on audit findings):**
- Modify: each endpoint identified in Task 0c parity table that doesn't currently emit `locationContext`.
- Modify: corresponding integration test files to pin the new emit.
- Modify: `apps/customer-app/src/lib/api/*.ts` Zod schemas to allow the additive field.

### Steps

- [ ] **Step 1: For each endpoint missing emit:** call existing `resolveLocationContext` (at `src/api/customer/discovery/service.ts:109`) — it's already a usable helper, no need to duplicate logic. Add the field to the response object.

- [ ] **Step 2: Integration pin per endpoint** — verify the response contains `locationContext` with the same shape as Home.

- [ ] **Step 3: Customer-app Zod additive update** — extend each affected schema with `locationContext: z.object({ city: z.string().nullable(), source: z.enum(['coordinates','profile','none']), locality: z.object({ id: z.string(), name: z.string() }).nullable() })`.

- [ ] **Step 4: Commit per endpoint OR single batch commit** — implementer's call based on size.

```bash
git add src/api/... tests/api/... apps/customer-app/src/lib/api/...
git commit -m "feat(backend): §DF Task 3 — locationContext parity emit on <endpoints>"
```

**If Task 0c locked the status label to DEFER (§DF-v2-j):** skip Task 3 entirely. Add a follow-up note to the deferred-followups index referencing §DF-v2-j with the parity gap details.

---

## Task 4: Location hook consolidation

**Files (depends on Task 0a locked option):**
- Modify or replace one of: `apps/customer-app/src/hooks/useLocation.ts` or new equivalent.
- Update all 7 call sites identified in Task 0a inventory.
- Tests: `apps/customer-app/src/hooks/__tests__/useLocation.test.tsx` (or equivalent path).

### Steps

- [ ] **Step 1: Write failing tests for the new capabilities.** Cover: permission grant flow, deny flow, `openSettings()` action, `coords` returned on grant, `request()` triggers explainer-callback registered by consumer, dev override (§AU) preserved.

```tsx
// Example for Option A (extend useUserLocation):
import { renderHook, act } from '@testing-library/react-native'
import { useUserLocation } from '@/hooks/useLocation'

it('exposes permission state and openSettings action', async () => {
  const { result } = renderHook(() => useUserLocation())
  expect(result.current.permission).toBe('undetermined')
  expect(typeof result.current.openSettings).toBe('function')
})

it('fires onShowExplainer callback before native prompt when permission is undetermined', async () => {
  const onShowExplainer = jest.fn()
  const { result } = renderHook(() => useUserLocation({ onShowExplainer }))
  await act(async () => { await result.current.request() })
  expect(onShowExplainer).toHaveBeenCalled()
})
```

- [ ] **Step 2: Implement the consolidated hook per Task 0a locked option.** Add: `permission` state, `coords` (existing `location` keeps for back-compat OR migrate call sites), `request()` with explainer hook, `openSettings()`. Preserve §AU dev override.

- [ ] **Step 3: Migrate any call sites** affected by interface changes. Each call site update is a small mechanical edit. If Option A (extend), call sites that read only `{ location, requestPermission }` are unchanged.

- [ ] **Step 4: Run customer-app tests** — `cd apps/customer-app && npx jest --forceExit src/hooks/`. All pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/customer-app/src/hooks/ apps/customer-app/src/features/ apps/customer-app/app/
git commit -m "refactor(location): §DF Task 4 — consolidate location hooks per Task 0a decision"
```

---

## Task 5: Permission pre-prompt explainer + recovery sheet

**Files:**
- Create: `apps/customer-app/src/lib/location/PrePermissionExplainer.tsx` (or path per Task 0a/0b)
- Create: `apps/customer-app/src/lib/location/RecoverySheet.tsx`
- Tests for both.

### Steps

- [ ] **Step 1: Write a failing test for `<PrePermissionExplainer>`.** Renders branded copy ("Show offers near you", body text, Continue / Not now CTAs); Continue triggers `onContinue`; Not now triggers `onDismiss`; uses shared `<BottomSheet>` pattern.

- [ ] **Step 2: Implement the explainer component.** Reuse `apps/customer-app/src/design-system/motion/BottomSheet.tsx`. Brand-rose pin icon. Copy per spec §6.4.1.

- [ ] **Step 3: Write a failing test for `<RecoverySheet>`.** Renders "Location is off" copy; "Open settings" CTA calls `Linking.openSettings()` (mockable); "Use saved area" calls `onDismiss`.

- [ ] **Step 4: Implement the recovery sheet.** Brand-rose slashed-pin icon. Copy per spec §6.4.2. iOS: `Linking.openSettings()`. Android: `Linking.openSettings()` also works (RN cross-platform).

- [ ] **Step 5: Wire the consolidated location hook (Task 4)** to mount these sheets at appropriate trigger points. Likely a thin provider (`<LocationPermissionProvider>`) wrapping the (app) layout that owns the mount state for both sheets and exposes their show actions via context to the hook.

- [ ] **Step 6: Run all new tests.** `npx jest --forceExit src/lib/location/`. All pass.

- [ ] **Step 7: Commit.**

```bash
git add apps/customer-app/src/lib/location/ apps/customer-app/app/(app)/_layout.tsx
git commit -m "feat(location): §DF Task 5 — pre-permission explainer + denied/off recovery sheet"
```

---

## Task 6: Home saved-area honesty hint

**Files:**
- Create: `apps/customer-app/src/features/home/components/SavedAreaHonestyHint.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Modify: `apps/customer-app/src/lib/api/discovery.ts` — extend Home response Zod schema with `locationContext` if not already there.
- Tests for the new component + the HomeScreen integration.

### Steps

- [ ] **Step 1: Audit Home response schema** — confirm `locationContext` field is in the Zod schema; add it if missing.

- [ ] **Step 2: Write failing tests for `<SavedAreaHonestyHint>`.** Renders nothing when `source === 'coordinates'` OR `'none'`. Renders cream-tinted row with pin icon + "Showing offers near {city} · based on your saved postcode · Update ›" when `source === 'profile'`. Tap routes to `/(app)/saved-area` (or whatever route Task 0b locked).

```tsx
it('renders nothing when source is coordinates', () => {
  const { queryByTestId } = render(
    <SavedAreaHonestyHint locationContext={{ source: 'coordinates', city: 'London', locality: null }} />
  )
  expect(queryByTestId('saved-area-honesty-hint')).toBeNull()
})

it('renders hint with city name when source is profile', () => {
  const { getByTestId } = render(
    <SavedAreaHonestyHint locationContext={{ source: 'profile', city: 'Huddersfield', locality: null }} />
  )
  expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()
  expect(getByText(/Huddersfield/)).toBeTruthy()
})
```

- [ ] **Step 3: Implement the component.** Cream-tinted background (`color.surface.tint`), brand-rose hairline border, body.sm copy, brand-rose pin icon, chevron, no card shadow. Tap target = whole row + chevron. No mount animation. testID `saved-area-honesty-hint`.

- [ ] **Step 4: Mount in `HomeScreen.tsx`** at the top above Featured. Read `locationContext` from the Home response (now available via Zod schema).

- [ ] **Step 5: Add transition behaviour** — when `source` flips `'profile' → 'coordinates'` (user grants GPS), the hint slides up (300ms ease-out). Reduced-motion: instant.

- [ ] **Step 6: Run tests.** `npx jest --forceExit src/features/home/`. All pass.

- [ ] **Step 7: Commit.**

```bash
git add apps/customer-app/src/features/home/ apps/customer-app/src/lib/api/discovery.ts
git commit -m "feat(home): §DF Task 6 — Saved Area honesty hint on Home"
```

---

## Task 7: Saved Area sub-screen + Profile cross-link

**Files (paths per Task 0b locked option):**
- Create: route file at the path Task 0b chose (likely `apps/customer-app/app/(app)/saved-area.tsx`).
- Create: screen component (likely `apps/customer-app/src/features/profile/screens/SavedAreaScreen.tsx`).
- Modify: `apps/customer-app/app/(app)/_layout.tsx` — register the new route as `Tabs.Screen` with `href: null` + hidden tab bar.
- Modify: `apps/customer-app/app/(app)/profile.tsx` — add Saved Area cross-link row per Task 0b insertion-point lock.
- Tests for the screen.

### Steps

- [ ] **Step 1: Register the route** in `_layout.tsx`. Mirror the `merchant/[id]` registration pattern.

```tsx
<Tabs.Screen
  name="saved-area"
  options={{ href: null, tabBarStyle: { display: 'none' } }}
/>
```

- [ ] **Step 2: Write failing tests for `<SavedAreaScreen>`.** Cover:
  - Renders current postcode + locality from profile.
  - "Update postcode" opens the PC2-style lookup component (mock the component).
  - "Update postcode" confirm calls `PATCH /api/v1/customer/profile` with `{ postcode }`; on success invalidates Discovery caches; navigates back.
  - "Use current location" routes through the consolidated location hook (Task 4): explainer when `'undetermined'`, native prompt on Continue, recovery sheet on deny, invalidate + back-nav on grant.

- [ ] **Step 3: Implement the screen** per spec §7. Layout:
  - Header: "Saved Area" (heading.lg)
  - Body: current postcode + locality (read from `useProfile()` query)
  - "Update postcode" CTA → opens postcode lookup (reuse PC2 component — Task 7's audit confirms exact import path)
  - "Use current location" CTA → calls `locationHook.request()`
  - Caveat copy per spec §7.1

- [ ] **Step 4: Implement the route file** at `app/(app)/saved-area.tsx` — single-line wrapper:

```tsx
import { SavedAreaScreen } from '@/features/profile/screens/SavedAreaScreen'
export default SavedAreaScreen
```

- [ ] **Step 5: Add the cross-link row** in `app/(app)/profile.tsx` at the Task 0b insertion point:

```tsx
<TouchableOpacity onPress={() => router.push('/saved-area')}>
  <Text>Saved Area · {profile.locality?.name ?? profile.postcode ?? 'Set location'} ›</Text>
</TouchableOpacity>
```

- [ ] **Step 6: Verify cache invalidation list** — `['home']`, `['discovery']`, `['search']`, `['map']`, `['nbc']`. Reconcile with the customer-app actual query-key conventions.

- [ ] **Step 7: Run all tests.** `npx jest --forceExit src/features/profile/`. All pass.

- [ ] **Step 8: Commit.**

```bash
git add apps/customer-app/app/(app)/ apps/customer-app/src/features/profile/
git commit -m "feat(profile): §DF Task 7 — Saved Area sub-screen + Profile cross-link"
```

---

## Task 8: Top-of-app location status label (CONDITIONAL on Task 0c)

**Run this task ONLY if Task 0c locked §6.4.3 status label to SHIP-in-v1.**

**Files:**
- Create: `apps/customer-app/src/features/home/components/LocationStatusLabel.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx` (and Search/Map/NBC/etc. per Task 0c parity scope).
- Tests.

### Steps

- [ ] **Step 1: Write failing tests** covering each `(source × permission)` state per spec §6.4.3 table:

| Test case | `locationContext.source` | Permission | Expected label |
|---|---|---|---|
| Coords+granted | `coordinates` | `granted` | `Using current location` |
| Profile | `profile` | any | `Using saved area · {city}` |
| None+denied | `none` | `denied` | `No GPS · Set location ›` |
| None+undetermined | `none` | `undetermined` | `Set location ›` |

- [ ] **Step 2: Implement the component.** 12pt label.eyebrow, brand-rose pin icon, thin row, tap target → `/saved-area`.

- [ ] **Step 3: Mount above the honesty hint on Home.** Mount on other surfaces per Task 0c parity scope.

- [ ] **Step 4: Run tests.** All pass.

- [ ] **Step 5: Commit.**

```bash
git add apps/customer-app/src/features/home/components/LocationStatusLabel.tsx apps/customer-app/src/features/home/screens/HomeScreen.tsx
git commit -m "feat(home): §DF Task 8 — top-of-app location status label"
```

**If Task 0c deferred:** skip Task 8. Add §DF-v2-j entry to deferred-followups index noting it must follow soon after §DF v1.

---

## Task 9: Backend integration pins for §DF-1 through §DF-7

**Files:**
- Modify: `tests/api/customer/discovery/home-feed-rail-states.test.ts` — add 7 new pins per spec §9.1.

### Steps

- [ ] **Step 1: Add §DF-1 pin** — GPS coords win over saved profile. Authenticated user with `postcode=HD1` AND request lat/lng=51.5 (London) → response `locationContext.source = 'coordinates'`, `city = "London"`.

- [ ] **Step 2: Add §DF-2 pin** — SAVED_PROFILE resolves when no GPS. Backfilled user (all 4 location fields populated), no request coords → `source = 'profile'`, `city = "Huddersfield"`.

- [ ] **Step 3: Add §DF-3 pin** — PLACE_QUERY beats GPS AND SAVED_PROFILE. (Note: PLACE_QUERY may not be reachable from Home today; if so, this pin moves to the Search/Category test file. Verify against Task 0c findings.)

- [ ] **Step 4: Add §DF-4 pin** — Identical ranking on same coords regardless of source. Two requests, same lat/lng, one GPS one SAVED_PROFILE → identical V3 ranking output.

- [ ] **Step 5: Add §DF-5 pin** — Unauthenticated request → `source = 'none'`, existing no-location behaviour.

- [ ] **Step 6: Add §DF-6 pin** — Authenticated, postcode/lat/lng/localityId all null → `source = 'none'`.

- [ ] **Step 7: Add §DF-7 pin** — Incomplete profile (`localityId` set but `latitude=null`) → `effLoc = null` (resolver invariant); `locationContext.source` may still be `'profile'`. Pin documents current behaviour for §DF-v2-i baseline.

- [ ] **Step 8: Run full backend suite.** `npx vitest run`. All pre-existing pass + 7 new pass.

- [ ] **Step 9: Commit.**

```bash
git add tests/api/customer/discovery/home-feed-rail-states.test.ts
git commit -m "test(home): §DF Task 9 — 7 integration pins §DF-1..§DF-7"
```

---

## Task 10: Customer-app unit + integration test sweep

**Files:**
- Verify: every component/hook from Tasks 4-8 has unit tests; gaps closed here.

### Steps

- [ ] **Step 1: Run the customer-app full suite.** `cd apps/customer-app && npx jest --forceExit`. Capture failures.

- [ ] **Step 2: Identify any new code path without test coverage** — particularly the `(source × permission)` matrix for the location hook + status label.

- [ ] **Step 3: Close coverage gaps.** Add missing pins.

- [ ] **Step 4: Confirm no regression on the pre-existing baseline failure** in `tests/lib/api/profile.test.ts` (per CLAUDE.md known-state — 1 baseline failure pre-§DF).

- [ ] **Step 5: Commit.**

```bash
git add apps/customer-app/
git commit -m "test(app): §DF Task 10 — close coverage gaps on location hook + UI surfaces"
```

---

## Task 11: Device-QA checklist + spec/plan/CLAUDE.md closure

**Files:**
- Document: device-QA results inline in plan as a §11 addendum.
- Modify: `docs/customer-flow-current.md` — add saved-area fallback + permission-education behaviour.
- Modify: `docs/customer-flow-changelog.md` — dated entry for §DF v1.
- Modify: `CLAUDE.md` — add §DF to "Next planned work" pre-merge; move to shipped on merge.

### Steps

- [ ] **Step 1: Run device-QA scenarios per spec §9.4** on iOS + Android dev clients:
  - Huddersfield URBAN (HD1) silent profile-fallback
  - Builth Wells RURAL (LD2) silent profile-fallback
  - GPS granted mid-session — honesty hint disappears
  - GPS denied + no profile postcode — no honesty hint; recovery sheet fires on "Use current location" tap
  - First "Use current location" tap in Settings → explainer fires
  - App backgrounded → permission granted in OS → returns → top label updates (if §6.4.3 shipped)

- [ ] **Step 2: Capture findings.** Any blockers → fix-as-you-go; any deferrable → note in §DF-v2-* list.

- [ ] **Step 3: Update `customer-flow-current.md`** — add a §"Saved Area fallback" section describing the new behaviour. Bump version.

- [ ] **Step 4: Update `customer-flow-changelog.md`** — dated entry.

- [ ] **Step 5: Update `CLAUDE.md`** — under "Next planned work" change §DF status to "AWAITING MERGE — head <sha> on feature/df-postcode-profile-fallback, PR #<N>".

- [ ] **Step 6: Update memory** — add `project_df_postcode_profile_fallback_complete.md` capturing locked decisions + baseline.

- [ ] **Step 7: Commit closure docs.**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(closure): §DF Task 11 — device-QA results + flow docs + memory baseline"
```

---

## PR + merge gate

- [ ] **Open PR** with comprehensive description covering: locked decisions D1-D8, Task 0a/0b/0c audit findings, §DF-v2-* deferred follow-ups, device-QA results, test counts.

- [ ] **Verify PR scope via live `gh api compare`** before requesting merge per the standing project rule (feedback_pr_scope_verification.md).

- [ ] **SHA-bound merge** per the project hook contract:

```bash
REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view <N> --json headRefOid --jq .headRefOid) \
  gh pr merge <N> --merge
```

- [ ] **Post-merge:** delete the local branch; update memory to "✅ §DF SHIPPED" with merge SHA.

---

## §DF-web — out of scope for this plan

§DF-web (customer-website) is a separate Tier 2 follow-up workstream. See spec §13 for the locked architecture (5 location sources, Option C source precedence, shared `effectiveLocation` contract reuse, visible location control near top of discovery). Do NOT pull any §DF-web work into this plan execution. After §DF v1 ships, the next Tier 2 brainstorm will spec §DF-web using the shared resolver this plan validates.

---

## Total task count

11 implementation tasks + 3 mandatory audits = 14 tasks. Estimated 4-5 days end-to-end per spec §16, including device-QA + closure docs.
