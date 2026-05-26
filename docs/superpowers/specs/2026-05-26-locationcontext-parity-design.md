# §DF-v2-j + §DF-v2-i — Location Context Parity + Top-of-App Status Label — Design Spec

**Version:** 1.1 — owner review amendments
**Status:** Locked — ready for implementation planning
**Tier:** 2 — plan-first (multi-file: backend resolver fix + 3 endpoint emits + shared schema hoist + new component + 3 surface mounts + atomic test-pin update)
**Brainstorm:** in-session 2026-05-26 (audit + scoping pass after §DF v1 ship; owner-approved package; Q1-Q6 locked verbatim; bundling §DF-v2-i decision locked).
**Trigger:** §DF v1 (PR #128) shipped saved-profile fallback on Home only. The remaining `locationContext` parity gap across Search / Map / Merchant Profile + the top-of-app status label were intentionally deferred per Task 0c audit. §DF v1 device QA confirmed the Home-only honesty hint works as designed but device-QA observation Round 1 finding R1-1 (Map locate-me jumping to London) surfaced the need for a unified location identity across Discovery surfaces.
**Sub-workstream:** §DF-v2-j (THIS spec) bundled with §DF-v2-i (resolver/wire-helper alignment). Voucher Detail is explicitly DEFERRED to §DF-v2-o per owner Q3 lock.

**v1.1 amendments (owner review 2026-05-26):**
1. Replaced all "Using saved area" copy with "Using profile location · {city}" / "Using profile location" fallback — owner-locked migration away from "saved area" / "saved location" wording.
2. Fixed Voucher Detail schema-hoist inconsistency — `apps/customer-app/src/lib/api/voucher.ts` is UNTOUCHED in this PR; Voucher Detail schema import belongs to §DF-v2-o.
3. Clarified Search emit scope — `locationContext` rides ONCE on the route-level response, not per inner service. Route shape audited in plan doc.
4. Softened request-scope memo sketch — plan doc audits the cleanest integration; pure service helpers should not gain `FastifyRequest` parameters just for memoization.
5. Added explicit `variant: 'strip' | 'chip'` distinction in §7.3 styling — strip on Home/Search, chip on Map.

---

## 1. Problem statement

Three concrete gaps remain after §DF v1:

### 1.1 Backend `locationContext` emit gap

Only Home's `getHomeFeed` emits the `locationContext` envelope today ([service.ts:1750](src/api/customer/discovery/service.ts#L1750)). Search (`searchBranches`), Map (`getInAreaBranches` + `getInAreaMerchants`), and Merchant Profile (`getCustomerMerchant`) all receive `userId + lat? + lng?` but DON'T compute or emit `locationContext`. Consequence: any client component that wants to render location-identity copy on those surfaces must compute it client-side from `useMe + useUserLocation`, which is exactly the duplication §DF v1 was supposed to retire.

### 1.2 No top-of-app status label

§DF v1 §6.4.3 specced a `<LocationStatusLabel>` ("Using current location" / "Using profile location · Huddersfield" / "No GPS · Set location ›" / "Set location ›") but deferred it as Task 8 per Task 0c — gated on the parity emit landing. The label is the always-visible location-identity affordance that complements Home's one-time honesty hint and gives Search + Map the same identity treatment.

### 1.3 §DF-v2-i resolver / wire-helper divergence

`resolveEffectiveLocation` ([effectiveLocation.ts:59-108](src/api/lib/effectiveLocation.ts#L59-L108)) requires ALL THREE of `User.localityId + User.latitude + User.longitude` for the SAVED_PROFILE branch. `resolveLocationContext` ([service.ts:109-151](src/api/customer/discovery/service.ts#L109-L151)) only requires `User.localityId` OR `User.city` text. Wire envelope can therefore say `source='profile'` while rails fall through to `effLoc=null`. §DF-7 backend pin LOCKS the current behaviour as the baseline. Today the divergence only matters on Home (only surface emitting the envelope). After §DF-v2-j adds emit on 3 more surfaces, the latent inconsistency multiplies — a user with `localityId` but null lat/lng would see "Using profile location · X" labels across all Discovery while every rail behaves like `effLoc=null`. **§DF-v2-i must ship atomically with §DF-v2-j** so the parity emit doesn't amplify a known-broken state.

---

## 2. Goal

After §DF-v2-j + §DF-v2-i ship:

- Every Discovery user-context surface (Home / Search / Map / Merchant Profile) emits a consistent `locationContext` envelope on its wire payload.
- A new `<LocationStatusLabel>` component renders the user's effective location identity at the top of Home / Search / Map. Tap routes to Your Location.
- The wire envelope and the underlying ranking anchor agree: when `locationContext.source === 'profile'`, the rails really are anchored on the saved profile (no latent fall-through to `effLoc=null`).
- §DF-7 backend pin updated atomically to reflect the tightened invariant.

**Non-goals (v1 of §DF-v2-j):**
- Voucher Detail location awareness — explicitly deferred to §DF-v2-o.
- Voucher Detail or Merchant Profile mounting the status label — they're entity-detail surfaces; deferred to §DF-v2-o.
- New saved-location source paths (town/city/place search) — separate §DF-v2-k.
- Saved Area card visual polish — separate §DF-v2-l.
- Success toast after save — separate §DF-v2-m.
- Search "London" place-intent copy refinement — separate §DF-v2-n.
- Customer-website parallel work — §DF-web (blocked on §BW test infra).

---

## 3. Locked decisions

| ID | Decision | Reasoning |
|---|---|---|
| **D1** | **Bundle §DF-v2-i with §DF-v2-j in one PR.** §DF-v2-i = tighten `resolveLocationContext` so its `source='profile'` invariants match `resolveEffectiveLocation`'s SAVED_PROFILE branch. §DF-v2-j = the parity emit + status label. Single atomic landing. | Shipping v2-j without v2-i amplifies the divergence across 3 new surfaces. v2-i fix is small (one helper function + atomic §DF-7 pin update). Bundling avoids a known-broken intermediate state in production. |
| **D2 (Q1)** | `<LocationStatusLabel>` lives at `apps/customer-app/src/lib/location/LocationStatusLabel.tsx` — alongside `<LocationRecoverySheet>` / `<PrePermissionExplainer>` / `<LocationPermissionProvider>` / `useUserLocation`. | Cross-surface primitive consumed by Home + Search + Map. NOT Home-specific. Co-locating with the other location-flow primitives keeps the location surface area discoverable. |
| **D3 (Q2)** | `permission='unavailable'` (no GPS hardware / native-module failure) renders the same label as `permission='denied'`: `No GPS · Set location ›`. | Spec §6.4.3 omitted `unavailable`; treating it as `denied` keeps the 4-state matrix collapsible to 3 visible states without adding a fifth case the user has to reason about. |
| **D4 (Q3a)** | **Do NOT mount `<LocationStatusLabel>` on Voucher Detail or Merchant Profile.** Only Home / Search / Map. | Voucher Detail + Merchant Profile are entity-detail surfaces; the user has already committed to "this voucher" / "this merchant". A top-of-screen location-identity intrudes on the entity hero. The label's job is to anchor location-relative discovery decisions; once the user's IN a specific entity, that anchor stops being load-bearing. |
| **D5 (Q3b)** | **Emit `locationContext` on `getCustomerMerchant`** (Merchant Profile) anyway. `getCustomerMerchant` already has `userId + lat/lng` plumbed — emit is one line. **DEFER `getCustomerVoucher` (Voucher Detail) entirely to §DF-v2-o** — its route signature has no `lat/lng` parameters today; plumbing them in isn't worth it without a consumer. | Merchant Profile emit costs ~5 lines + 1 schema field; future surfaces (e.g. a future "Merchants near you who match" carousel) inherit consistency for free. Voucher Detail has zero current location-aware consumers — defer until one materialises. |
| **D6 (Q4)** | **Home keeps BOTH the compact `<LocationStatusLabel>` AND the existing `<SavedAreaHonestyHint>`**. The label is always-visible compact identity ("Using profile location · Huddersfield"); the honesty hint card carries the caveat copy + Update affordance only when `source === 'profile'`. They do NOT collapse. | They serve different purposes: label = persistent identity-at-a-glance; hint = one-time-per-session call to action. Spec §6.4.3 already pre-locked this coexistence. |
| **D7 (Q5)** | **Add request-scope memoization for `resolveLocationContext`** inside §DF-v2-j scope so the same `(userId, lat, lng)` triple resolves once within a single Fastify request. Routes that call multiple location-aware services within a single request (e.g. `/in-area` → `getInAreaMerchants` + `getInAreaBranches`; `/search` → `searchMerchants` + `searchBranches`) share one resolution. Implementation shape is plan-doc territory — plan audits the cleanest integration and prefers smallest-blast-radius variants that don't push `FastifyRequest` into otherwise pure service helpers. | Contract = request-scoped uniqueness, not a specific helper signature. Saves 1 DB call per duplicated invocation. Future parity emits inherit the memo for free. |
| **D8 (Q6)** | **All `source='profile'` copy uses "profile location" wording (NOT "saved area" / "saved location"):** city present → `Using profile location · {city}`; city null (defensive fallback) → `Using profile location` (no city suffix). Owner-locked migration away from "saved area" terminology entirely — applies to label, honesty hint, Your Location screen, and any future surface. | Consistent with the §DF v1 Round 4-5 copy migration. Honest about source, doesn't promise a city we don't have. Single vocabulary across all `source='profile'` UX. |
| **D9** | **Hoist `locationContextSchema` into a shared client API schema file** at `apps/customer-app/src/lib/api/shared/location.ts`. Three client files in this PR import from this single source: `discovery.ts`, `merchant.ts`, and `shared/location.ts` itself. **`voucher.ts` is intentionally untouched in this PR** — Voucher Detail schema import belongs to §DF-v2-o per D11. | Prevents schema drift across surfaces. Wire-shape stability is load-bearing once 4 endpoints emit the same envelope. Voucher Detail consumes the shared schema once §DF-v2-o picks it up. |
| **D10** | **Map keeps BOTH `meta.effectiveLocality` (viewport-locality) AND `locationContext` (user-context).** They are NOT collapsed. | They answer different questions. `effectiveLocality` describes the locality the panned-to viewport sits in (changes as the user pans); `locationContext` describes the user's effective location identity (independent of pan). The new `<LocationStatusLabel>` reads `locationContext`; the existing `<ViewportLocalityBadge>` reads `meta.effectiveLocality`. Visual: label sits at top of safe area; badge sits in viewport corner. |
| **D11** | **Voucher Detail deferred entirely to a new follow-up: §DF-v2-o.** Includes (a) backend `lat/lng` plumbing on route + service signature; (b) backend `locationContext` emit; (c) decision on whether to mount the label there. | Decoupling Voucher Detail from this PR drops MEDIUM-complexity work without sacrificing the v2-j value. Future-flagged in `project_deferred_followups_index.md`. |

---

## 4. Server-side changes

### 4.1 §DF-v2-i — tighten `resolveLocationContext` invariants

**File:** `src/api/customer/discovery/service.ts:109-151`

**Today:** returns `source='profile'` when `User.localityId` is set OR when `User.city` (text) is set.

**Locked v2-i behaviour:** require all three of `User.localityId + User.latitude + User.longitude` (matching `resolveEffectiveLocation`'s SAVED_PROFILE invariant). If ANY is null, fall through to `source='none'`.

**Concrete diff sketch:**

```ts
// resolveLocationContext — after the GPS branch, before legacy fallback:
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
  // No longer fall back to User.city text — tightened invariant.
}
return { locality: null, city: null, lat: null, lng: null, source: 'none' }
```

**Legacy users impacted:** any user with `User.city` text but null `localityId/latitude/longitude` previously saw `source='profile'`; post-v2-i they see `source='none'`. The §DF v1 backfill script populated `localityId + lat + lng` for all `postcode IS NOT NULL` users at deploy time. Cohort affected: only users with `postcode = null` who had typed a free-text `city` value pre-PC2. Small, transient, and graceful — they see `Set location ›` and tap to set a real postcode.

**Atomic §DF-7 pin update:** `tests/api/customer/discovery/home-feed-rail-states.test.ts` §DF-7 pin currently locks "wire envelope can say `source='profile'` while `effLoc=null`". Post-v2-i this pin updates to assert the tightened behaviour: User with `localityId` set but `lat`/`lng` null → BOTH `effLoc=null` AND `locationContext.source='none'`. Pin renamed to capture the alignment.

### 4.2 Parity emit on 3 user-facing endpoints

The `locationContext` envelope rides ONCE on the route-level response root, NOT duplicated per inner service result. Each route below is one user-facing endpoint and one wire response.

| User-facing endpoint | Route file | Inner service calls | Caller args available? |
|---|---|---|---|
| `GET /api/v1/customer/discovery/search` | `src/api/customer/discovery/routes.ts` | combines `searchMerchants` + `searchBranches` into one response | YES — `userId`, `params.lat`, `params.lng` |
| `GET /api/v1/customer/discovery/in-area` | `src/api/customer/discovery/routes.ts` | combines `getInAreaMerchants` + `getInAreaBranches` (parallel) | YES — same (CALLER's coords, NOT the viewport bbox) |
| `GET /api/v1/customer/discovery/merchant/:id` | `src/api/customer/discovery/routes.ts` | `getCustomerMerchant` | YES — `userId`, `opts.lat`, `opts.lng` |

**Route-level emit shape (locked):** the envelope appears once at the response root, alongside (not inside) the merged `merchants` / `branches` / `meta` / etc. fields.

**Plan-doc audit required (per amendment 3).** The implementer audits the actual route handler shape and chooses the cleanest integration. Two viable variants:

(a) **Resolve in the route handler** + inject the envelope into the merged response object. Pure service functions stay free of `locationContext` concerns. Cleanest when route handlers already do the merge.

(b) **Resolve in an upper-most service** and thread through. Acceptable when one service already owns the merged shape (e.g. a `searchDiscovery` wrapper that internally fans out to `searchMerchants` + `searchBranches`).

Either variant is acceptable as long as: (i) envelope appears once at the response root; (ii) the schema field name + shape match §5.1; (iii) the variant doesn't push `FastifyRequest` into otherwise pure service helpers (per D7 + amendment 4).

**Map note:** the resolved `locationContext` describes the USER's location identity. It does NOT describe the panned-to viewport. `meta.effectiveLocality` continues to describe the viewport. Both fields ride the same `/in-area` response payload; consumers read whichever they need.

### 4.3 Request-scope memoization

**Goal (locked).** Within one Fastify request, repeated calls to resolve `locationContext` for the same `(userId, lat, lng)` triple resolve once. The contract is request-scoped uniqueness, not a specific helper signature.

**Plan-doc audit required (per amendment 4).** The sketch below is indicative only. The plan doc audits actual call sites and picks the cleanest integration. The hard rule: pure service helpers that don't currently receive `FastifyRequest` MUST NOT gain it just to satisfy memoization.

**Possible integrations (plan doc picks one):**

1. **Route-level resolve-once + thread.** Route handler computes `locationContext` once at the start, passes it as an explicit `opts.locationContext` argument to any service call that already accepts an `opts` object. Pure service helpers stay untouched. Cleanest if route handlers are the natural integration point — and route-level is also where the response envelope is assembled (§4.2), so the resolution naturally lives there.

2. **Helper with `FastifyRequest` argument.** Helper signature `(prisma, request, userId, lat, lng)` with the memo stored on the request. Only acceptable when the call site already has `request` in scope (i.e. inside a route handler or a middleware-style helper that already receives `request`). Do NOT thread `request` into pure service functions to enable this.

3. **Fastify `decorateRequest` + helper that reads the decorated slot.** Plumbs through `request` (slot lives on the request), but keeps the helper signature pure (`(prisma, userIdAndCoordsKey) => LocationContext` reading from the same slot). Cleanest when multiple downstream services genuinely need access from many points; over-engineering for the 2-route benefit case.

**Indicative sketch (variant 2 — illustration only, NOT the locked implementation):**

```ts
// Sketch — plan doc may pick variant 1 or 3 instead.
async function resolveLocationContextMemoized(
  prisma: PrismaClient,
  request: FastifyRequest,
  userId: string | null,
  lat: number | null,
  lng: number | null,
): Promise<LocationContext> {
  const key = `${userId ?? 'anon'}|${lat ?? 'null'}|${lng ?? 'null'}`
  const memo = (request as { __locationContextMemo?: Map<string, LocationContext> }).__locationContextMemo ??= new Map()
  const cached = memo.get(key)
  if (cached) return cached
  const fresh = await resolveLocationContext(prisma, userId, lat, lng)
  memo.set(key, fresh)
  return fresh
}
```

**Acceptance criteria (regardless of variant):**
- (a) Same request + same `(userId, lat, lng)` triple → DB called once.
- (b) Same request + different triple → DB called once per distinct triple.
- (c) Different request → no memo leakage.
- (d) `resolveLocationContext` itself stays pure + unit-testable as the underlying primitive.
- (e) Pure service helpers that don't currently take `FastifyRequest` don't gain it for memoization.

**Routes that benefit immediately:**
- `/in-area` (calls both `getInAreaMerchants` + `getInAreaBranches` in parallel) — 2 calls collapse to 1.
- `/search` (combines `searchMerchants` + `searchBranches`) — 2 calls collapse to 1.
- `/home` — currently 1 call, no benefit, but the contract is consistent.
- `/merchant/:id` — currently 1 call, no benefit, contract consistency.

---

## 5. Wire shape

### 5.1 Locked envelope (unchanged from §DF v1)

```ts
locationContext: {
  city: string | null              // e.g. "Huddersfield"
  source: 'coordinates' | 'profile' | 'none'
  locality: { id: string; name: string } | null
}
```

The Home payload already carries this shape ([discovery.ts:189-200](apps/customer-app/src/lib/api/discovery.ts#L189-L200)). §DF-v2-j adds it strictly-additively to 3 more endpoints — same shape, same semantics.

### 5.2 Schema hoist (D9)

**New file:** `apps/customer-app/src/lib/api/shared/location.ts`

Contents:
- Move `locationContextSchema` from `discovery.ts:189` into this file.
- Export `locationContextSchema` + `LocationContext` type.
- Update `discovery.ts` to import from `./shared/location` instead of defining inline.
- Update `merchant.ts` to import from `./shared/location` when it extends `merchantProfileSchema` (per §5.3).

**`apps/customer-app/src/lib/api/voucher.ts` is intentionally untouched in this PR.** Voucher Detail's schema import (and the whole `locationContext` plumbing for that surface) belongs to §DF-v2-o per D11. When §DF-v2-o picks up the work, it imports from the already-hoisted `./shared/location` — the hoist target is future-proof but the consumer wire-up is deferred.

The hoist is a pure refactor of the Home schema PLUS two additive new consumers (`discovery.ts` Search/in-area/category + `merchant.ts` profile) — no behaviour change for Home.

### 5.3 Per-endpoint Zod additions

| File | Schema | Field added |
|---|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | `searchResponseSchema` (~L364) | `locationContext: locationContextSchema.optional()` |
| `apps/customer-app/src/lib/api/discovery.ts` | `inAreaResponseSchema` (~L388) | `locationContext: locationContextSchema.optional()` |
| `apps/customer-app/src/lib/api/discovery.ts` | `categoryMerchantsResponseSchema` (~L381) | `locationContext: locationContextSchema.optional()` |
| `apps/customer-app/src/lib/api/merchant.ts` | `merchantProfileSchema` (~L218) | `locationContext: locationContextSchema.optional()` |

**All additions use `.optional()`** during the rollout window — matches the existing `homeRailMetaSchema.locality` pattern. Once backend ships, a follow-up tightens to required.

`apps/customer-app/src/lib/api/voucher.ts` is intentionally untouched in this PR — Voucher Detail schema work is §DF-v2-o (per D11). The shared hoist target is future-proof so §DF-v2-o can import without further refactor.

---

## 6. Customer-app surface impact

### 6.1 Home

- **Already consumes** `feed.locationContext.source` for `<SavedAreaHonestyHint>` render gate ([HomeScreen.tsx:109](apps/customer-app/src/features/home/screens/HomeScreen.tsx#L109)).
- **New:** mount `<LocationStatusLabel>` above the existing hero card area, reading the same `feed.locationContext`.
- **Coexistence per D6:** both label + hint render when `source === 'profile'`. Label is compact identity; hint carries Update.
- No schema work (Home schema already has `locationContextSchema`).

### 6.2 Search

- **New consumer** of `searchResponse.locationContext` (server-emitted) instead of the current client-computed `savedAreaCity` prop ([SearchScreen.tsx:119,125,132-133](apps/customer-app/src/features/search/screens/SearchScreen.tsx#L119)). This eliminates the client-side `useMe().data?.locality?.name ?? city ?? null` derivation — the backend now resolves it.
- **Mount `<LocationStatusLabel>`** above the existing `<SearchBar>` row.
- `<SearchEmptyState>` keeps its existing `savedAreaCity` prop but the parent reads it from the wire envelope now.

### 6.3 Map

- **New consumer** of `inAreaResponse.locationContext`.
- **Mount `<LocationStatusLabel>`** as an absolute-positioned chip at the top of the safe-area band, distinct from `<ViewportLocalityBadge>` (which stays as today, viewport-anchored).
- Map's two badges must not visually conflict — label = user identity at top centre / left; viewport-locality badge = viewport-anchored chip near the search-this-area button. Layout detail locked in the plan doc.

### 6.4 Merchant Profile

- **Backend emit only.** No client UI change in this PR.
- `merchantProfileSchema` gains `locationContext: locationContextSchema.optional()` — additive, no consumer in v2-j scope.
- Future consumers (e.g. a "nearby merchants" rail) inherit the field without a backend change.

### 6.5 Voucher Detail

- **Untouched in this PR.** Deferred to §DF-v2-o.

---

## 7. `<LocationStatusLabel>` component spec

### 7.1 File + signature

```ts
// apps/customer-app/src/lib/location/LocationStatusLabel.tsx
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  locationContext: LocationContext | undefined  // optional during rollout
  variant?: 'strip' | 'chip'                     // default 'strip'
}

export function LocationStatusLabel({ locationContext, variant = 'strip' }: Props): React.ReactElement | null {
  // ...renders per the state machine in §7.2 + variant-specific container shape per §7.3
}
```

The component consumes `LocationContext` from the wire schema + reads `permission` from `useUserLocation()` internally. It does NOT receive `permission` as a prop — that keeps consumers from having to wire the location hook through.

`variant` is per amendment 5 — `'strip'` is a full-width inline row (Home / Search); `'chip'` is a pill-shaped floating overlay (Map). Shared content row is identical; only container shape differs. See §7.3.

### 7.2 State matrix (locked)

| `locationContext.source` | `permission` (from useUserLocation) | Label rendered |
|---|---|---|
| `'coordinates'` | any | `Using current location` |
| `'profile'` (with city) | any | `Using profile location · {city}` |
| `'profile'` (city null — defensive) | any | `Using profile location` (D8 fallback) |
| `'none'` | `'denied'` or `'unavailable'` | `No GPS · Set location ›` |
| `'none'` | `'undetermined'` | `Set location ›` |
| `'none'` | `'granted'` (edge: granted but coords not yet received) | `Set location ›` (treat as undetermined-equivalent until coords arrive) |
| `undefined` (during initial load / unauth) | any | render `null` (no label) |

Tap target: every renderable state pushes `/saved-area` via `router.push('/saved-area' as any)`.

### 7.3 Typography + styling

The label has TWO visual variants determined by the `variant: 'strip' | 'chip'` prop (per amendment 5). Shared content row (icon + text + optional chevron) is identical between variants; only container shape differs. Consumers pick variant per surface (§8).

**Strip variant (`variant='strip'` — Home + Search):**
- Width: 100% of parent.
- Height: 36pt.
- Horizontal padding: `spacing[4]` (16px).
- Vertical padding: `spacing[1]` (4px).
- Background: `color.surface.tint` (`#FEF6F5`) — cream-of-brand identity surface.
- Border: 1px hairline `color.border.subtle` (`#E5E7EB`) on BOTTOM edge only (sits below header divider as an in-flow row).
- No border radius.
- No elevation.

**Chip variant (`variant='chip'` — Map):**
- Width: shrink-to-content (auto), max 80% of parent to allow truncation in long-city edge cases.
- Height: 32pt (slightly shorter than strip — compact pill).
- Horizontal padding: `spacing[3]` (12px).
- Vertical padding: `spacing[1.5]` (6px).
- Background: cream tint with translucent overlay feel — `rgba(254, 246, 245, 0.96)` (token-derived from `color.surface.tint` + 96% alpha) so it reads as cream over the map without being fully opaque.
- Border: 1px hairline `color.border.subtle` on ALL sides.
- Border radius: 999 (pill).
- Elevation: `shadow.sm` (opacity 0.08, offset y:1, radius 2) — subtle lift off the map.
- Positioning is the parent's responsibility (Map mounts via `{ position: 'absolute', top: insets.top + spacing[2], alignSelf: 'center' }`); the component itself is layout-agnostic.

**Shared content row (both variants):**
- Pin icon: lucide `MapPin` for `coordinates` + `profile` states, `MapPinOff` for `none` states. Size 14pt, `color.brandRose` (`#E20C04`). Brand-rose stays well below the 10% screen-area threshold.
- Label text: `label.md` Lato Medium 12pt, navy primary, letter-spacing +0.4 per the design-system variant.
- City emphasis: when `source='profile'` and city is present, render the city in `label.md` weight bumped to 600 (Lato Semibold inline override).
- Chevron: `ChevronRight` 14pt, `color.text.tertiary` — visible only when state is `'none'` (Set location call-to-action).
- A11y: `accessibilityRole="button"`, `accessibilityLabel` matching rendered text + ", opens your location".
- Reduced motion: no entrance animation. No state-transition animation. Hard render on state change.
- Hermes-compat: pure design-system tokens; no `Intl.DateTimeFormat`, no exotic timezone work.

### 7.4 Visual reference

**Strip variant (Home / Search) — full-width inline row, bottom hairline only:**

```
┌─────────────────────────────────────────────────────────┐
│  📍 Using profile location · Huddersfield               │
└─────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────┐
│  📍 Using current location                              │
└─────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────┐
│  📍❌  No GPS · Set location  ›                          │
└─────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────┐
│  📍  Set location  ›                                    │
└─────────────────────────────────────────────────────────┘
```

**Chip variant (Map) — pill-shaped overlay floating over the map view, centered, subtle elevation:**

```
        ╭──────────────────────────────────────────╮
        │  📍 Using profile location · Hudd…       │
        ╰──────────────────────────────────────────╯
```

```
        ╭──────────────────────────────────────────╮
        │  📍 Using current location               │
        ╰──────────────────────────────────────────╯
```

```
        ╭──────────────────────────────────────────╮
        │  📍❌  No GPS · Set location  ›           │
        ╰──────────────────────────────────────────╯
```

---

## 8. Mount points + behaviour per surface

### 8.1 Home (`apps/customer-app/src/features/home/screens/HomeScreen.tsx`)

- Mount as `<LocationStatusLabel variant="strip" locationContext={feed.locationContext} />` IMMEDIATELY above the existing `<HomeNoLocationBanner>` / `<SavedAreaHonestyHint>` slot — top of the scrollable content.
- Scrolls with content (NOT sticky). Owner Q4 lock — label is identity-at-a-glance, NOT a system bar.
- Coexists with `<SavedAreaHonestyHint>` per D6.

### 8.2 Search (`apps/customer-app/src/features/search/screens/SearchScreen.tsx`)

- Mount as `<LocationStatusLabel variant="strip" locationContext={searchResponse.locationContext} />` IMMEDIATELY above the `<SearchBar>` row.
- Scrolls with content.

### 8.3 Map (`apps/customer-app/src/features/map/screens/MapScreen.tsx`)

- Mount as `<LocationStatusLabel variant="chip" locationContext={inAreaResponse.locationContext} />` inside an absolute-positioned wrapper at the TOP of the safe-area band — `{ position: 'absolute', top: insets.top + spacing[2], left: 0, right: 0, alignItems: 'center' }`.
- The chip variant handles its own pill shape + elevation per §7.3; the Map screen only owns positioning.
- NOT sticky; stays at top of safe-area while map pans below.
- `<ViewportLocalityBadge>` stays in its existing viewport position — DO NOT collapse with the label per D10.

### 8.4 NOT mounted (per D4)

- Voucher Detail
- Merchant Profile
- All non-Discovery surfaces (Profile tab, Your Location screen itself, Subscription, etc.)

---

## 9. Testing strategy

### 9.1 Backend integration pins

Pattern: subset of `§DF-1`..`§DF-7` from `tests/api/customer/discovery/home-feed-rail-states.test.ts` mirrored to each new endpoint. Pin scope: 4 load-bearing pins per endpoint (not the full 7).

| Endpoint | New pins |
|---|---|
| `searchBranches` | `§DF-v2-j-S1` GPS wins / `§DF-v2-j-S2` SAVED_PROFILE resolves / `§DF-v2-j-S5` unauth → none / `§DF-v2-j-S7` incomplete profile → none |
| `getInAreaBranches` | `§DF-v2-j-IB1..IB7` (same 4, replicate) |
| `getInAreaMerchants` | `§DF-v2-j-IM1..IM7` (same 4) |
| `getCustomerMerchant` | `§DF-v2-j-MP1..MP7` (same 4) |
| **§DF-v2-i atomic update** | UPDATE existing `§DF-7` pin to assert tightened behaviour: `localityId` set + `lat`/`lng` null → `effLoc=null` AND `locationContext.source='none'` (was: `source='profile'` baseline). Rename to `§DF-7v2i` to mark the new contract. |

**Total: 16 new pins + 1 updated pin.**

Where to add: `tests/api/customer/discovery/home-feed-rail-states.test.ts` (Search + In-area + Merchant Profile pins added as new describe blocks) OR split out to per-endpoint files if the size gets unwieldy — implementer's call in the plan doc.

### 9.2 Component-level pins

`apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx` (new file). 10 pins covering the §7.2 state matrix + the §7.3 variants:

1. `source='coordinates'` → "Using current location" + no chevron.
2. `source='profile'` + city → "Using profile location · {city}" + city in semibold.
3. `source='profile'` + city null → "Using profile location" (D8 fallback, no city suffix).
4. `source='none'` + `permission='denied'` → "No GPS · Set location ›" + MapPinOff + chevron.
5. `source='none'` + `permission='unavailable'` → same as denied (D3).
6. `source='none'` + `permission='undetermined'` → "Set location ›" + MapPin (no slash) + chevron.
7. `locationContext={undefined}` → renders null.
8. Tap routes to `/saved-area` (every renderable state).
9. `variant='strip'` (default) → renders the strip container shape (full-width, bottom-only border, no radius). Snapshot or style-assertion pin.
10. `variant='chip'` → renders the chip container shape (pill radius, full border, shadow). Snapshot or style-assertion pin.

### 9.3 Surface integration pins

One per Home / Search / Map — three new test files OR additions to existing surface test files:

- Asserts `<LocationStatusLabel>` is rendered.
- Asserts it reads from the same `locationContext` envelope the surface already receives.
- Asserts existing `<SavedAreaHonestyHint>` / `<NearbyContextBanner>` / `<ViewportLocalityBadge>` behaviour is unchanged (no regression).

### 9.4 Request-scope memo pin

Backend test (`tests/api/lib/resolveLocationContextMemoized.test.ts` — new) asserts:
- Same `userId + lat + lng` triple within one request → DB called once.
- Different triple within the same request → DB called twice.
- Cross-request isolation → memo doesn't leak between requests.

---

## 10. Device-QA checklist

| Scenario | Expected behaviour |
|---|---|
| Huddersfield URBAN profile, GPS off, open Home / Search / Map | Home + Search show strip "Using profile location · Huddersfield" at top; Map shows the same copy in a pill chip floating at the top of the safe-area band. Tap on any → routes to Your Location screen. |
| GPS denied, no profile postcode | Each surface shows "No GPS · Set location ›". Tap → Your Location screen. |
| GPS undetermined (fresh install), no postcode | Each surface shows "Set location ›" (no GPS icon slash). |
| GPS granted mid-session (user taps "Use current location" in Your Location) | Label updates to "Using current location" on next focus of each surface. |
| Map viewport pan to a different locality | `<LocationStatusLabel>` (chip) stays the same (user-context unchanged); `<ViewportLocalityBadge>` updates to reflect the new viewport. Both visible, NOT overlapping — chip lives at top-centre, viewport badge at viewport corner. |
| Map chip visual over satellite / dense map tiles | Chip remains legible — translucent cream background + hairline border + subtle elevation gives sufficient contrast. No regression in pan/zoom performance from the chip overlay. |
| §DF-v2-i edge case: legacy user with only `city` text (no `localityId/lat/lng`) | Label shows "Set location ›". (Previously would have shown "Using profile location · X" while rails fell through to UK-wide.) |
| Defensive: `source='profile'` but `city=null` (data drift) | Label shows "Using profile location" (no city suffix). Honest about source. |
| Backgrounded → permission granted in OS → resume | Label updates from "No GPS · Set location" to "Using current location" on focus. |
| Voucher Detail / Merchant Profile / Profile tab / Your Location screen | Label is NOT visible. Per D4. |

---

## 11. Risks + mitigations

| ID | Risk | Mitigation |
|---|---|---|
| **R1** | §DF-v2-i breaks the legacy-`city`-text-only cohort. They previously saw `source='profile'`; now they see `source='none'`. | Graceful degradation: they see "Set location ›" and tap to set a real postcode via Your Location. No data loss. Cohort is small post-§DF v1 backfill. |
| **R2** | Visual conflict on Home — label + honesty hint stack. | D6 locks them as complementary. Device QA on Home (Huddersfield profile) to verify. Roll back to label-only if device QA flags ambiguity. |
| **R3** | Map's two badges (`<LocationStatusLabel>` user identity + `<ViewportLocalityBadge>` viewport locality) visually conflict. | Position locked: label at top-centre of safe area, badge at viewport corner. Different colours / different shape (label = pill, badge = chip). Device QA pan verification. |
| **R4** | Wire-shape additive emit increases response size by ~80 bytes per endpoint. | Negligible (< 0.5% of typical Home response). No client-side parse-cost concern. |
| **R5** | Backend memo holds a Map ref on the FastifyRequest — GC pressure if many concurrent requests. | Memo is request-scoped; GC reclaims when the request finishes. Map only holds 1-3 entries per request. Tested in load profile post-merge. |
| **R6** | `locationContext.source` semantics drift between Home (pre-§DF-v2-i) and the new surfaces (post-§DF-v2-i). | Bundling §DF-v2-i into the same PR makes this impossible — all 4 surfaces ship with the tightened helper at the same atomic moment. |
| **R7** | `<LocationStatusLabel>` adds vertical chrome on every Discovery surface — ~36pt. | Acceptable. Spec §6.4.3 pre-locked this as identity-at-a-glance. Device QA validates the visual rhythm. |
| **R8** | Hoisting `locationContextSchema` is a 3-file refactor; could break Home's existing 8 test pins if import path drift mishandles. | Refactor is pure import-path change. Existing Home pins should pass unchanged. Verify in PR review. |

---

## 12. In scope / out of scope

### In scope (this PR)

1. **§DF-v2-i atomic fix** — `resolveLocationContext` tightened to match `resolveEffectiveLocation` SAVED_PROFILE invariants + atomic `§DF-7` pin update.
2. **Backend additive `locationContext` emit** on `searchBranches`, `getInAreaBranches`, `getInAreaMerchants`, `getCustomerMerchant`.
3. **Request-scope memo helper** `resolveLocationContextMemoized` + 5 endpoint integrations.
4. **Hoist `locationContextSchema`** to `apps/customer-app/src/lib/api/shared/location.ts`.
5. **Customer-app Zod schema extensions** on `searchResponseSchema`, `inAreaResponseSchema`, `categoryMerchantsResponseSchema`, `merchantProfileSchema`.
6. **`<LocationStatusLabel>` component** at `apps/customer-app/src/lib/location/LocationStatusLabel.tsx` + 8 unit pins.
7. **Mount on Home / Search / Map** + 3 surface integration pins.
8. **16 new backend integration pins** + 1 updated `§DF-7` pin.
9. **Updates to `docs/customer-flow-current.md`** documenting the new label + tightened invariant.

### Out of scope (deferred / blocked / separate workstream)

| ID | Item | Defer to |
|---|---|---|
| **§DF-v2-o (NEW)** | Voucher Detail `lat/lng` plumbing + `locationContext` emit + label mount decision | Future Tier 1-2 follow-up |
| §DF-v2-k | Town/city/place search in Your Location | Tier 2 brainstorm-first |
| §DF-v2-l | Saved Area / Your Location card visual polish | Tier 1 |
| §DF-v2-m | Success acknowledgement toast after save | Tier 1 |
| §DF-v2-n | Search place-intent copy refinement ("London" treatment) | Tier 1-2 |
| §DF-v2-a..h | Multi-saved-locations / no-postcode prompt / GPS-vs-postcode reconciliation etc. | Recorded in spec §11 of §DF v1 |
| §DF-web | Customer-website parallel work | Tier 2, blocked on §BW |
| §DF-v2-g | Standalone Home-top "Use current location" pill | Tier 1 polish |

---

## 13. §DF-v2-o — new deferred follow-up (filed by this spec)

Captured here so it lands in `project_deferred_followups_index.md` during plan doc writing:

**§DF-v2-o — Voucher Detail location-context awareness (Tier 1-2, locked 2026-05-26 from §DF-v2-j audit Q3).**

Scope:
- Backend route `GET /api/v1/customer/discovery/voucher/:id` to accept optional `lat` / `lng` query params (today: rejected).
- Backend service `getCustomerVoucher` to accept `opts: { lat?, lng? }` and call `resolveLocationContextMemoized`.
- Customer-app `voucher.ts::voucherApi.getVoucher` to thread caller coords.
- Decision: mount `<LocationStatusLabel>` on Voucher Detail (would re-open D4), OR ship emit only.
- Atomic test pin coverage similar to other endpoints.

Pickup trigger: when a Voucher Detail consumer needs location-awareness (e.g. "estimated drive time", "branches nearest you", or a label-on-detail product decision).

---

## 14. Files touched (estimated)

### 14.1 Backend (~6 files)

- `src/api/customer/discovery/service.ts` — `resolveLocationContext` tighten (§DF-v2-i); new `resolveLocationContextMemoized`; 4 endpoint emit additions (Search + 2 in-area + Merchant Profile); Home migration to memoized variant.
- `tests/api/customer/discovery/home-feed-rail-states.test.ts` — §DF-7 pin update + 16 new pins (Search/In-area-branches/In-area-merchants/Merchant-Profile × 4 each).
- `tests/api/lib/resolveLocationContextMemoized.test.ts` — NEW.

### 14.2 Customer-app (~10 files)

- `apps/customer-app/src/lib/api/shared/location.ts` — NEW (hoist target).
- `apps/customer-app/src/lib/api/discovery.ts` — schema imports + 3 schema additions.
- `apps/customer-app/src/lib/api/merchant.ts` — schema addition.
- `apps/customer-app/src/lib/location/LocationStatusLabel.tsx` — NEW component.
- `apps/customer-app/src/features/home/screens/HomeScreen.tsx` — mount.
- `apps/customer-app/src/features/search/screens/SearchScreen.tsx` — mount + replace client-side `savedAreaCity` derivation with envelope read.
- `apps/customer-app/src/features/map/screens/MapScreen.tsx` — mount.
- `apps/customer-app/tests/lib/location/LocationStatusLabel.test.tsx` — NEW (8 pins).
- `apps/customer-app/tests/features/home/HomeScreen.statusLabel.test.tsx` — NEW (integration).
- `apps/customer-app/tests/features/search/SearchScreen.statusLabel.test.tsx` — NEW (integration).
- `apps/customer-app/tests/features/map/MapScreen.statusLabel.test.tsx` — NEW (integration).

### 14.3 Docs (~3 files)

- `docs/superpowers/plans/2026-05-26-locationcontext-parity.md` — NEW (plan doc derived from this spec).
- `docs/customer-flow-current.md` — add §15 (top-of-app status label + tightened `source='profile'` invariant).
- `docs/customer-flow-changelog.md` — dated entry for §DF-v2-j + §DF-v2-i.
- `CLAUDE.md` — Phase 3C.1m status entry (AWAITING MERGE during the PR; flipped to SHIPPED after merge).

Estimated total: ~19-21 files. Tier 2 plan-first.

---

## 15. Cross-references

- **§DF v1 spec:** `docs/superpowers/specs/2026-05-24-postcode-profile-fallback-design.md` v1.1 — the parent spec; §6.4.3 pre-locked the status label, deferred via §11.
- **§DF v1 plan:** `docs/superpowers/plans/2026-05-24-postcode-profile-fallback.md` v1.0 — Task 3 + Task 8 (skipped) become §DF-v2-j.
- **§DF v1 audit (Task 0c):** `docs/superpowers/audits/2026-05-24-location-hook-audit.md` — the ship/defer decision that scoped this workstream.
- **§DF-v2-j audit (this spec's brainstorm):** in-session 2026-05-26 audit + scoping package (Sections 1-9).
- **§DF-7 pin (atomic update target):** `tests/api/customer/discovery/home-feed-rail-states.test.ts` — the load-bearing baseline lock.
- **`resolveEffectiveLocation`:** `src/api/lib/effectiveLocation.ts:59-108` — invariant target for the §DF-v2-i fix.
- **`resolveLocationContext`:** `src/api/customer/discovery/service.ts:109-151` — the function being tightened by §DF-v2-i.
- **§DF v1 closure memory:** `~/.claude/projects/.../memory/project_df_postcode_profile_fallback_complete.md`.
- **Deferred followups index:** `~/.claude/projects/.../memory/project_deferred_followups_index.md` — §DF-v2-i / §DF-v2-j / §DF-v2-k..n entries.

---

## 16. Implementation tier + estimate

**Tier 2 — plan-first.** Multi-file backend + customer-app refactor + new component + new test matrix + atomic test-pin update.

| Track | Effort |
|---|---|
| §DF-v2-i resolver tighten + atomic §DF-7 pin update | ~0.5 day |
| Request-scope memo helper + integration | ~0.25 day |
| 4 backend endpoint emit additions | ~0.5 day |
| Backend integration pins (~16 new) | ~0.75 day |
| Hoist `locationContextSchema` shared file + 3 schema imports | ~0.25 day |
| 4 customer-app Zod schema extensions | ~0.25 day |
| `<LocationStatusLabel>` component + 8 unit pins | ~0.5 day |
| 3 surface mounts (Home / Search / Map) + 3 surface integration pins | ~0.5 day |
| Device-QA + docs (flow, changelog, CLAUDE.md) | ~0.5 day |
| **Total** | **~4-5 days** |

Ship via subagent-driven development. Tasks specced in the plan doc cover backend → schema → component → mounts → tests → device-QA, with §DF-v2-i as Task 1 (the prerequisite atomic fix).

---

**End of spec.** PAUSE for owner review before writing the plan.
