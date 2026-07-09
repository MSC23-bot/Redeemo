# Branch Location Trust: Slice 3 Implementation Plan (merchant pin-drop)

**Status:** DRAFT. Do NOT execute until the DECISIONS in the addendum
(`docs/superpowers/specs/2026-07-09-loc-slice-3-pin-drop-addendum.md` §8) are
adjudicated: the lead-adjudicable set (D-L1..D-L8) and the owner-gated set (D-O1..D-O5,
notably the CSP/provider and billable-SKU decisions) gate different tasks below. Where a
task depends on a decision, it is marked.

> **For agentic workers:** REQUIRED SUB-SKILL after adjudication: use
> superpowers:subagent-driven-development or superpowers:executing-plans to run this
> task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A no-Google-listing merchant can assert an exact branch pin, server-verified to
sit within their postcode area, which becomes a customer-visible Map pin
(`MERCHANT_CONFIRMED`); an out-of-area pin degrades to `NEEDS_REVIEW` with the pin staged
for admin review.

**Architecture:** A new branch-scoped write endpoint accepts a zod-bounded client
`{ latitude, longitude }` (the scoped L1 amendment: the ONE endpoint that accepts client
coordinates); the server re-resolves the branch's postcode centroid and runs a radius-only
cross-check (reusing `LOCATION_TRUST_RADIUS_METRES` + `haversineMetres`); PASS writes
`MERCHANT_CONFIRMED` (new enum value, added to `CONFIRMED_LOCATION_SET`), FAIL stamps
`NEEDS_REVIEW` and stages the pin via the existing `locationSuggestionMetadata` lane with
`source: 'merchant_pin_drop'`. Map UI is a backend-proxied static map with an HTML
draggable-pin overlay (zero CSP change; recommended option (d)).

**Tech Stack:** Fastify + Prisma 7 (client `generated/prisma/client`), Redis, vitest
(`npm run test:unit` only). merchant-web: Next.js 15, jest. admin-web: Next.js 15, jest.

**Branches / PR split (D-L8):**
- PR-1 (backend + non-map clients): schema/migration, enum + set, cross-check helper,
  pin-drop endpoint, admin serializer source, admin-web provenance + zod, merchant-web +
  customer-app zod tolerance. Branch `feat/branch-location-trust-slice-3-backend`.
- PR-2 (merchant-web pin-drop UI): static-map proxy consumer, draggable-pin map, create/edit
  seam, `LocationCard` badge fix. Branch `feat/branch-location-trust-slice-3-web`.
- The static-map PROXY endpoint (backend) rides PR-1 but is DARK/unused until PR-2; it is
  gated by the owner SKU decision (D-O1/D-O2). If the owner declines option (d), PR-2's map
  layer is re-planned per the addendum §7.3 fallback (Leaflet + commercial tiles + a CSP
  change), which then needs its own owner CSP approval before PR-2.

Commit per task. NEVER `npx vitest run` (full); `npm run test:unit` only.

---

## PR-1: backend + non-map client tolerance

### Task 1: Schema: add `LocationConfidence.MERCHANT_CONFIRMED`  (needs D-L2, D-O4)

**Files:** `prisma/schema.prisma` (enum ~line 1866).

- [ ] Add `MERCHANT_CONFIRMED` to the `LocationConfidence` enum with a comment: merchant
  self-asserted pin, verified within the postcode-area sanity radius; weakest member of the
  customer-visible confirmed set; `googlePlaceId` stays null.
- [ ] `npx prisma migrate dev --name branch-merchant-confirmed-confidence` then
  `npx prisma generate`. Expect ONE additive migration (`ALTER TYPE ... ADD VALUE`).
- [ ] Verify the generated SQL is a single additive statement; do NOT hand-edit.
- [ ] Commit (`prisma/schema.prisma` + `prisma/migrations/**`). Deploy stays owner-gated
  (joins the §LOC-MIGRATE pending set; do not apply to staging/prod here).

### Task 2: Widen `CONFIRMED_LOCATION_SET` + the ranking type unions  (needs D-L2)

**Files:** `src/api/shared/location.ts` (line 33); `src/api/lib/ranking.ts` (union types
lines ~283, ~408). Tests: the existing `exposeBranchPosition`/redaction suites +
ranking suites.

- [ ] Failing test: `exposeBranchPosition({ locationConfidence: 'MERCHANT_CONFIRMED', ... })`
  returns real coords; `POSTCODE_CENTROID`/`NEEDS_REVIEW` still redacted (L3 unchanged).
- [ ] Add `'MERCHANT_CONFIRMED'` to `CONFIRMED_LOCATION_SET`. Add `| 'MERCHANT_CONFIRMED'`
  to the two `ranking.ts` `locationConfidence` union literal types.
- [ ] Update the doc comment in `location.ts` to list `MERCHANT_CONFIRMED` (customer-visible,
  weakest tier) alongside `MANUALLY_CONFIRMED`/`ADDRESS_GEOCODED`.
- [ ] Run discovery + redaction + ranking suites; confirm the four Map/bbox where-filters and
  `classifyRung` widen through the constant with NO per-site literal edit (grep to confirm
  no inlined `['MANUALLY_CONFIRMED','ADDRESS_GEOCODED']` literal remains in a gate site).
- [ ] Commit.

### Task 3: Pure radius-only cross-check helper  (needs D-L3)

**Files:** `src/api/merchant/branch/locationTrust.ts`. Test:
`tests/api/merchant/branch.locationTrust.test.ts` (extend).

- [ ] Failing tests: `pinWithinPostcodeArea` returns `{ within: true }` for a pin ~40 m from
  centroid; `{ within: false, reason: 'radius_exceeded' }` beyond 1000 m;
  `{ within: false, reason: 'missing_centroid' }` when centroid null.
- [ ] Implement `pinWithinPostcodeArea({ pinLat, pinLng, centroidLat, centroidLng })` reusing
  `haversineMetres` + `LOCATION_TRUST_RADIUS_METRES`. Comment: this is the pin-drop analogue
  of `crossCheckGoogleLocation`, with NO postcode-string check (a pin-drop has no Google
  place); the SOLE writer-authority basis for `MERCHANT_CONFIRMED`.
- [ ] Run; commit.

### Task 4: `dropBranchPin` service core + route + rate-limit tier  (needs D-L1, D-L4, D-L5)

**Files:** `src/api/merchant/branch/service.ts` (new `dropBranchPin`);
`src/api/merchant/branch/routes.ts` (new route + zod body); `src/api/plugins/rate-limit.ts`
(new `branchPinDrop` tier). Tests: extend the branch-service suite + a routes/rate-limit
test.

- [ ] Failing tests (adapt to suite fixtures):
  - inside radius: branch goes `MERCHANT_CONFIRMED`, coords = dropped pin, `googlePlaceId`
    null; no suggestion staged.
  - outside radius: branch stays `POSTCODE_CENTROID` coords, stamped `NEEDS_REVIEW`; a
    `locationSuggestionMetadata` with `source: 'merchant_pin_drop'` is staged (audit
    metadata), mirroring the Google FAIL shape (L4 degrade).
  - D-L5 guard: a branch already `ADDRESS_GEOCODED` or `MANUALLY_CONFIRMED` is REJECTED
    (e.g. `BRANCH_LOCATION_ALREADY_CONFIRMED`), never overwritten.
  - auth: STAFF denied; unassigned BRANCH_MANAGER denied; suspended merchant guarded.
- [ ] Implement `dropBranchPin(prisma, adminId, branchId, { latitude, longitude }, ctx)`:
  `resolveMerchantContext` + `assertCanManageBranch`; `resolveBranch`; D-L5 confirmed-state
  guard; `resolvePostcode(branch.postcode)` for the centroid (mirror
  `resolveBranchLocationFields`'s failure mapping: POSTCODE_NOT_FOUND / GAZETTEER_UNAVAILABLE
  before opening a tx); `pinWithinPostcodeArea`; write in ONE transaction with a
  `BRANCH_UPDATED` audit row carrying the pin + outcome; on FAIL stage
  `locationSuggestionMetadata({ ...pin, placeId: null?, source: 'merchant_pin_drop' })`.
  Note: `locationSuggestionMetadata` currently requires a `placeId`; add a pin-drop variant
  (or make placeId nullable in the staged shape) so the FAIL path can stage a
  placeId-less pin. Keep `MERCHANT_CONFIRMED` written ONLY here (writer authority).
- [ ] Route: `POST /api/v1/merchant/branches/:id/pin-drop`, body
  `z.object({ latitude: z.number().gte(49).lte(61), longitude: z.number().gte(-8.7).lte(2.0) })`,
  `config.rateLimit = routeRateLimit('branchPinDrop')` keyed per `req.user.sub`.
- [ ] `branchPinDrop` tier in `rate-limit.ts`: `prod { max: 10, timeWindow: '1 minute' }`,
  `dev { max: 100, '1 minute' }`, with a comment (postcodes.io-budget + self-placement
  fuzzing; per-user key). Confirm the route sets a per-user keyGenerator override.
- [ ] New AppError code(s) in `src/api/shared/errors.ts`
  (`BRANCH_LOCATION_ALREADY_CONFIRMED`, and reuse existing POSTCODE_* / permission codes).
- [ ] Run; commit.

### Task 5: Admin serializer source `merchant_pin_drop`  (needs D-L2)

**Files:** `src/api/admin/approvals/reviewBranchSerializer.ts`
(`ReviewLocationSuggestionSource` union + parse tolerance);
`src/api/admin/approvals/service.ts` (`locationSuggestionMetadata` source literal type).
Tests: extend the serializer suite.

- [ ] Failing test: a staged `merchant_pin_drop` suggestion surfaces on the admin review
  context with `source: 'merchant_pin_drop'` and null `placeId` tolerated.
- [ ] Add `'merchant_pin_drop'` to `ReviewLocationSuggestionSource`; ensure
  `parsePendingEditSuggestion`/audit parse tolerate a null placeId for this source (the
  panel shows a pin without a Google place). Add the panel source-line copy.
- [ ] Run; commit.

### Task 6: admin-web provenance + zod widening  (needs D-L2, D-L7)

**Files:** `apps/admin-web/features/shared/locationProvenance.tsx`;
`apps/admin-web/lib/api/{branches,review,merchants,branchLifecycleReview}.ts`. Tests: the
co-located `__tests__`.

- [ ] `locationProvenance`: add `MERCHANT_CONFIRMED` entry (label per D-L7, e.g.
  "Merchant-set pin"; tone `info`; icon `MapPin`/`MapPinned`); add it to `isLocationTrusted`
  (it is customer-visible / satisfies the go-live gate).
- [ ] Add `'MERCHANT_CONFIRMED'` to every confidence `z.enum` in the four `lib/api` files;
  add `'merchant_pin_drop'` to the `review.ts` `source` enum (line 89).
- [ ] Update/extend the provenance + api tests. Run `npx jest` in `apps/admin-web`; run
  `npx next build` (admin-web rule: catches Next15 errors jest/tsc miss).
- [ ] Commit.

### Task 7: merchant-web + customer-app zod tolerance (forward-compat)  (needs D-L2, D-L6)

**Files:** `apps/merchant-web/lib/api/branch.ts` (line 171 enum);
`apps/customer-app/src/lib/api/discovery.ts` (line 86 enum). Tests: co-located.

- [ ] merchant-web `branch.ts`: add `'MERCHANT_CONFIRMED'` to the `locationConfidence` enum.
- [ ] customer-app `discovery.ts` (D-L6 option A): loosen `branchLocationConfidenceSchema`
  to `z.string()` (matching `favourites.ts`) so unknown future values never break parse;
  OR add the explicit value. Recommend loosen + add. Update the derived
  `BranchLocationConfidence` type / any switch that assumed exhaustiveness.
- [ ] merchant-web: `npx jest` + `npx next build`. customer-app: `cd .worktrees/customer-app
  /apps/customer-app && fnm use && npx jest src/lib/api --forceExit` (Node 20.19.4).
- [ ] Commit. NOTE: this task ships the app parse tolerance that MUST be in the field before
  `MERCHANT_CONFIRMED` writes are enabled (addendum §3.3); if D-L6 option B (flag-gate) is
  also chosen, wire the flag in Task 4.

### Task 8: static-map PROXY endpoint (backend, DARK until PR-2)  (needs D-O1, D-O2)

**Files:** a new backend route (e.g. `src/api/merchant/location/staticMap` or under branch),
server-side provider call. Tests: route test with a mocked provider.

- [ ] ONLY if the owner approves option (d) (D-O1) + the static-map SKU (D-O2). Otherwise
  SKIP and re-plan the map layer per addendum §7.3 fallback.
- [ ] Endpoint returns a static map image centred on a given postcode centroid at a fixed
  zoom framing the ~1 km disc, fetched SERVER-SIDE with a server-restricted key (never
  exposed to the client). Rate-limited (reuse `branchPinDrop` or a dedicated tier); auth as
  a merchant read.
- [ ] Feature-flag/env-gate the provider call so it is DARK until the key is provisioned
  (mirror the `STORAGE_ENABLED`/`EMAIL_ENABLED` dark-by-default pattern).
- [ ] Run; commit.

### Task 9: PR-1 verification + push

- [ ] `npx prisma generate` then `npx tsc --noEmit` clean.
- [ ] `npm run test:unit` green (report exact file/test counts).
- [ ] `apps/admin-web`: `npx jest` + `npx next build`. `apps/merchant-web`: `npx jest` +
  `npx next build`. customer-app: targeted jest for the touched api modules.
- [ ] Push `feat/branch-location-trust-slice-3-backend`; open PR; do NOT merge. PR body:
  scope, the L1-amendment + enum decisions, the fraud summary, the deploy-ordering
  constraints (migration window + app parse tolerance), tests.

---

## PR-2: merchant-web pin-drop UI

Depends on PR-1 merged (enum + endpoint live in dev) and on D-O1/D-O2 (map approach).

### Task 10: draggable-pin static map component  (needs D-O1)

**Files:** new `apps/merchant-web/components/branches/PinDropMap.tsx` (+ test).

- [ ] Render the backend static-map image (same-origin / API origin: no CSP change), centred
  on the branch postcode centroid, with a visible shaded circle of radius
  `LOCATION_TRUST_RADIUS_METRES` and a draggable HTML pin marker.
- [ ] Client math: pixel offset to lat/lng via Web Mercator against the known centre, zoom,
  and image dimensions. Clamp drag to the shown disc so a valid pin cannot land outside.
- [ ] Never render raw numeric lat/lng. Copy per addendum §5.3 (no em-dashes, brand tone).
- [ ] Test the pixel-to-lat/lng conversion + the clamp. Run `npx jest`.
- [ ] Commit.

### Task 11: wire pin-drop into create + edit flows  (needs D-L5)

**Files:** `apps/merchant-web/components/branches/AddBranchModal.tsx`; the branch-details
edit modal; `apps/merchant-web/lib/api/branch.ts` (add a `dropBranchPin` client call);
`apps/merchant-web/components/branches/sections/LocationCard.tsx`.

- [ ] AddBranchModal: when the Google search yields no acceptable match, surface "Can't find
  your business on the map? Set your location pin manually", opening `PinDropMap`. CREATE
  chains: create the branch (POSTCODE_CENTROID) then call `POST .../:id/pin-drop` on the new
  branch id (§5.1).
- [ ] Edit / `LocationCard`: expose the pin-drop entry point ONLY when the branch is
  `POSTCODE_CENTROID`/`NEEDS_REVIEW` (D-L5). Fix the `LocationCard` `ConfidenceBadge`:
  treat `MERCHANT_CONFIRMED` (and `ADDRESS_GEOCODED`) as confirmed/green, not just
  `MANUALLY_CONFIRMED` (pre-existing gap this value surfaces).
- [ ] `branch.ts`: `dropBranchPin(branchId, { latitude, longitude })` client fn; handle the
  NEEDS_REVIEW response copy (§5.3) and the ALREADY_CONFIRMED / POSTCODE_* errors.
- [ ] Tests: modal flow (create-then-drop), LocationCard badge, error copy. `npx jest`.
- [ ] Commit.

### Task 12: PR-2 verification + push

- [ ] `apps/merchant-web`: `npx jest` green + `npx next build` clean. Playwright smoke lane
  (`npx playwright test`) if the pin-drop touches a smoke-covered route.
- [ ] Push `feat/branch-location-trust-slice-3-web`; open PR; do NOT merge.

---

## Docs to update on merge (same-PR, per docs-governance rule)

- [ ] `docs/deferrals/open-register.md` §LOC-3: flip to IMPLEMENTED with the PR SHAs; note
  the migration joins §LOC-MIGRATE and the app-parse-tolerance ordering.
- [ ] `docs/PROJECT-STATE.md`: status flip for the Branch Location Trust programme (claim-
  level: cite the PR SHAs + this plan + the addendum).
- [ ] Record the L1 amendment + the `MERCHANT_CONFIRMED` value as an as-shipped addendum
  note in the parent spec (or confirm the addendum is the canonical record).
- [ ] Merchant Portal roadmap (coordinated pair with PROJECT-STATE) if it tracks Slice 3.

## Self-review notes

- L1 amendment scope: exactly ONE new endpoint accepts client coordinates; placeId still
  never client-sent; create/edit bodies still carry no coordinates.
- L2 analogue: `MERCHANT_CONFIRMED` has exactly one writer (`dropBranchPin`).
- L3 unchanged: `POSTCODE_CENTROID`/`NEEDS_REVIEW` still redact lat/lng (Task 2 test pins).
- L4 shape preserved: a FAIL keeps centroid coords + stamps `NEEDS_REVIEW` + stages the pin;
  no partial application of the dropped pin.
- Ordering hazards flagged in two tasks: Task 1/9 (migration in the owner-gated window) and
  Task 7 (app parse tolerance before the write is enabled).
- Zero-CSP map path (Task 8/10) means PR-2 needs no CSP owner decision IF option (d) is
  approved; the owner decision is the billable SKU, not the security header.
