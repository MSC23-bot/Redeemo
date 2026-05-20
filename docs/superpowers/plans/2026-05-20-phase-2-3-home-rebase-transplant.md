# Phase 2.3 Home — Branch-First Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the customer-app Home tab (Featured + Trending + NearbyByCategory carousels) from consuming legacy `MerchantTile[]` to the new branch-first `BranchTile[]` contract emitted by Phase 1 backend (PR #110). The refined v7 Home UI/UX is **already on `main`** — this PR does **NOT** redesign, restyle, or re-polish Home.

**Architecture:** Three carousels flip to new `*Branches` response fields; each tile tap routes with `?branch=<id>&from=home` to Merchant Profile (matching Phase 2.1 Search + Phase 2.2 Map patterns). A scoped `branchToMerchantTile` adapter (mirroring Phase 2.2 Map's adapter) bridges the data shape without touching the shared `<MerchantTile>` component (Phase 2.5 will rename that). Two small additive items: §CA wire-verification of `totalEstimatedSaving` (pill-level UI migration deferred per Step I2) and §BY formatter audit pinning shared `formatDistance` reuse (pill-level migration deferred per Step I2).

**Tech Stack:** Expo SDK 54 + expo-router v4, React Query, Zod, Prisma 7 + driver-adapter, vitest (backend) + jest-expo (customer-app).

---

## 0. Owner-locked direction (2026-05-20)

| # | Decision | Locked value |
|---|---|---|
| **0.1** | Overall path | **Option C — branch-first migrate only.** No transplant. The refined v7 Home UI/UX on `main` is preserved. NO redesign, NO restyle, NO re-polish. |
| **0.2** | Empty handlers `onCampaignPress` / `onFilterPress` / `onSeeAll` | **OUT of Phase 2.3.** Do NOT add routes or screens. Record as deferred follow-up (§CL — see this plan's bookkeeping task). Visible no-op flagged in device-QA checklist. |
| **0.3** | §CA Home save badge | **IN if low-risk.** Add `totalEstimatedSaving` backend additive + Home `Save £X across N vouchers` copy mirroring Search PR #112 fixup-4. **Escalate** if implementation reveals broader scope. (See §0-amend below — backend field already exists; only consumer-side work remains.) |
| **0.4** | §BY formatter audit | **IN as small audit.** Pin shared `formatDistance` reuse on Home in tests. GBP + voucher-count helper migration in-scope ONLY if low-risk + scoped to Home; do NOT broaden into Phase-2.5-territory shared-component cleanup. |
| **0.5** | Tier classification | **Tier 2 plan-first.** No Tier 3 brainstorm — locked Discovery rebaseline spec already covers Phase 2.3. |
| **0.6** | Branch + base | Base `main` (`93803ca`); branch `feature/discovery-rebaseline-phase-2-3-home-customer-app`. |
| **0.7** | Standing rules carry forward | Single-component carry-forward (§0.7 spec lock); `?branch=&from=home` URL contract; POSTCODE_CENTROID redaction passes through unchanged; no schema changes; no Map / Search / Category surface drift. |

---

## 0-amend. Pre-implementation amendment (2026-05-21, owner-approved)

Owner reviewed the plan against current `main` and caught two contract mismatches BEFORE implementation started. Both confirmed via direct code inspection. The original §0 directives stand; this amendment refines the implementation specifics.

### Amendment A — `totalEstimatedSaving` already shipped end-to-end

**Original Task B claim (incorrect):** "Add `totalEstimatedSaving` to backend home-feed branch-tile projection."

**Reality on `main` at `93803ca`:**
- `src/api/customer/discovery/branchTileSchema.ts:69` — `totalEstimatedSaving: z.number().nullable()` is part of `branchTileSchema` already.
- `src/api/customer/discovery/service.ts:1028-1033, 1100` — `enrichBranchTile()` computes and emits `totalEstimatedSaving` with the locked rounding rule (mirrors PR #112 fixup-4).
- `src/api/customer/discovery/service.ts:1427-1429` — `enrichBranchTiles` already runs over `featuredBranchInputs`, `trendingBranchInputs`, AND the per-category nearby inputs in parallel. So Home's branch tiles ALREADY carry `totalEstimatedSaving` on the wire.
- `apps/customer-app/src/lib/api/discovery.ts:183-201` — customer-app `branchTileMerchantGroupingSchema` already carries `totalEstimatedSaving` at the nested `merchant.*` level (line 200).
- `apps/customer-app/src/lib/api/discovery.ts:203-223` — `branchTileSchema` (line 222) references that grouping schema, so the field flows through to Home tiles.

**The residual gap is one Zod schema extension:** `homeFeedResponseSchema` at `apps/customer-app/src/lib/api/discovery.ts:275-284` does NOT currently include `featuredBranches`, `trendingBranches`, or `nearbyByCategoryBranches`. The backend emits them; Zod silently strips them on parse today.

**Reframed Task B:**
- Verify (via grep + code-read) that `branch.merchant.totalEstimatedSaving` already flows through backend → wire → customer-app `BranchTile.merchant.totalEstimatedSaving`.
- Extend `homeFeedResponseSchema` (customer-app only) with `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches` fields typed as `z.array(branchTileSchema)`.
- NO backend changes.
- Add or extend a customer-app test pinning the parsed `HomeFeedResponse` includes the `*Branches` fields with `merchant.totalEstimatedSaving` populated.
- ONLY make backend changes if a focused test proves the field is missing from Home branch tiles — none expected, but pause + escalate if a probe reveals one.

### Amendment B — `resolveBackNavigation` needs `from=home`

**Original plan claim (incorrect):** "`MerchantProfileScreen.handleBack` already recognises `from === 'home'` via `resolveBackNavigation` helper (locked PR #113 fixup). Phase 2.3 just provides the URL param."

**Reality on `main` at `93803ca`:** `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts` handles ONLY `from=search` (with optional `q`) and `from=map`. Any other `from` value returns `null` (default `router.back()` fallback). The existing test at `apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts` explicitly pins `resolveBackNavigation('home', undefined).toBeNull()` under "unrecognised from values" (line 35).

**Canonical Home route:** `/(app)/` — used at 3 existing call sites: `SavingsScreen.tsx:239`, `SubscribePromptScreen.tsx:270`, `VoucherDetailScreen.tsx:1001`. All use `router.push('/(app)/' as never)` or `router.replace('/(app)/' as never)`.

**New in-scope work for Phase 2.3:**
- Update `resolveBackNavigation.ts` to recognise `from=home`, returning `/(app)/`.
- Update `resolveBackNavigation.test.ts` to:
  - REMOVE the `expect(resolveBackNavigation('home', undefined)).toBeNull()` line from the "unrecognised from values" describe block.
  - ADD a new `describe('from=home (Phase 2.3 contract)', ...)` block with a positive pin: `expect(resolveBackNavigation('home', undefined)).toBe('/(app)/')` + a second pin asserting `q` is ignored (mirrors the `from=map` pattern).
- Verify `MerchantProfileScreen.handleBack` already calls `resolveBackNavigation(from, q)` (it does, per PR #113); no screen-level edit needed.

### Scope clarification on the out-of-scope list

The original §2 Out-of-scope said "Map, Search, Category, Voucher Detail, or Merchant Profile surfaces" must NOT be touched. The `resolveBackNavigation.ts` helper LIVES under `apps/customer-app/src/features/merchant/utils/` but is a shared pure-function helper, not a Merchant Profile screen edit. Amendment B narrows the out-of-scope to specifically: do NOT touch `MerchantProfileScreen.tsx` or any other component file under `src/features/merchant/` — only the helper + its test. See §2 update below.

---

## 0-amend-C. Pre-implementation amendment C (2026-05-21, owner-flagged)

Owner referenced the supply-aware design spec — passive Home rails should automatically widen scope to avoid empty/sparse rails and honestly communicate the resolved scope in the section header. Audit confirms this behaviour is **NOT shipped today**. The gap is substantial — backend ranker integration + new response fields + client header logic. **OUT of Phase 2.3 scope.** Recorded as new deferred entry §CM.

### Spec the owner cited

From `docs/superpowers/specs/2026-04-29-supply-aware-correction-design.md`:
- User-initiated screens (Search / Category) MUST NOT silently widen scope.
- **Passive Home rails MAY widen scope automatically to avoid empty/sparse rails.**
- If a Home rail widens, the section header MUST communicate the resolved scope honestly: "Featured near you" → "Featured across {city}" → "Featured across {region}" → wider/platform wording.
- If even the widest scope has no supply, the rail SHOULD be suppressed rather than rendered empty.

### Current Home backend behaviour (audited 2026-05-21 at `93803ca`)

| Rail | Current source | Scope behaviour | Honesty in header |
|---|---|---|---|
| **Featured** | `prisma.featuredMerchant.findMany` at `service.ts:1221` — date-filtered, ACTIVE merchants, ordered by `startDate ASC`, take 10. **No location/scope filter at all.** | Platform-wide. Whatever admin curates appears for every user regardless of location. No cascade. | Static literal `Featured` in `FeaturedCarousel.tsx:76`. |
| **Trending** | Counts redemptions this calendar month at `service.ts:1240-1267`, **city-filtered** at line 1249 (`if locationCtx.city && branch.city !== locationCtx.city: skip`). Top 10. **Single-attempt city filter; NO widening.** If city has 0 trending, returns empty. | None — city-only or unfiltered. Empty array possible. | Static literal `Trending near you` in `TrendingSection.tsx:42`. **Mismatch:** if zero supply in user's city, the section is client-suppressed (`merchants.length === 0` returns null) but no widening is attempted. |
| **NearbyByCategory** | `prisma.merchant.findMany` at `service.ts:1283-1295`, **city-filtered** at line 1289. Up to 60 merchants, grouped into 6 categories × 5. **Single-attempt city filter; NO widening.** | None. Categories without 5 merchants in-city stay sparse; categories with 0 are dropped client-side. | Static literal `{CategoryName} near you` in `NearbyByCategory.tsx:51`. **Mismatch:** sparse categories render with implicitly-misleading "near you" wording even if the merchants are technically in-city but few. |
| **Response shape** | `homeFeedResponseSchema` carries `featuredBranches[]`, `trendingBranches[]`, `nearbyByCategoryBranches[]` per Phase 1 additive. | **No per-rail `scope` field.** No `resolvedScope` / `scopeExpanded` / `effectiveLocality` per section. | — |

**Critical context from `service.ts:1385-1390` ("Option A — no ranking pass for Home"):**

> Home's inclusion + order is curatorial (FeaturedMerchant table priority, trending = redemption count, nearbyByCategory = city-filtered grouping). Rank-then-paginate doesn't apply the same way as Map/Search. Each fan-out tile passes `supplyRung: null, proximityBand: null` into enrichBranchTiles; the V3 ranker can be wired in a later Phase if a Home redesign requires it.

This is an EXPLICIT carve-out — the backend was deliberately wired to skip `rankBranchesV3` for Home. The supply-aware scope-cascade primitive (`rankBranchesV3` + the `scopeResolution.resolvedScope` machinery at `service.ts:425-426, 3100`) exists but is wired into Search/Category, NOT Home.

### Scope assessment for closing this gap

| Work | Estimated cost |
|---|---|
| Backend: rewire Featured query to support scope cascade (currently no scope concept at all — needs a design call too) | ~80-150 LOC + decision: should Featured cascade at all, given it's admin-curated? |
| Backend: rewire Trending query to do nearby → city → region → platform cascade | ~100-150 LOC |
| Backend: rewire NearbyByCategory query to cascade per category | ~150-200 LOC |
| Backend: extend `homeFeedResponseSchema` with per-rail scope metadata (e.g. `{ branches, scope: 'nearby'|'city'|'region'|'platform', scopeExpanded: bool, resolvedAreaLabel: string }`) | ~30 LOC schema + plumbing |
| Backend tests: cascade pins for each rail at each scope level + suppression at widest-empty | ~200-300 LOC |
| Customer-app: extend `homeFeedResponseSchema` Zod with the new metadata | ~20 LOC |
| Customer-app: header copy logic per resolved scope on 3 components (`FeaturedCarousel`, `TrendingSection`, `NearbyByCategory`) | ~100-150 LOC + product copy decisions on exact wording per scope level |
| Customer-app tests for header variants × 3 rails × 4 scope levels | ~150-200 LOC |
| **Total** | **~700-1100 LOC + 3-4 product decisions** |

**This is a substantial product-feature workstream, not a contract-migration item.** It has:
- Backend ranker integration (the same work that Search + Category did in Plan 1.5)
- Product decisions on exact header copy per scope level
- Response-shape changes (new metadata fields per rail)
- Significant test coverage

### Decision

**OUT of Phase 2.3. Recorded as deferred §CM.** Phase 2.3 stays focused on:
- Branch-first contract migration (3 carousels flip)
- `?branch=&from=home` navigation
- `resolveBackNavigation` `from=home` (Amendment B)
- Schema envelope extension (Amendment A)
- Save badge wire-verification ONLY (Amendment A — pill UI deferred per Step I2)
- Scoped formatter audit (low-risk only)

### Regression pins added in this PR (preserve current literal headers)

To make §CM closure unambiguous later, Phase 2.3 adds these pins:
- `FeaturedCarousel` header reads `Featured` (literal, no dynamic scope token today).
- `TrendingSection` header reads `Trending near you` (literal).
- `NearbyByCategory` header reads `{section.category.name} near you` (literal pattern; cite a Covelum-category seed fixture for the value).

These pins lock the current state. When §CM ships, those pins WILL fail and the §CM PR will update them with the new scope-aware copy. The failure is intentional — it forces the §CM PR to acknowledge every header change.

### Device-QA note (preserve current behaviour)

If a rail has 0 supply in the user's current city, the rail is suppressed client-side via the existing `merchants.length === 0` early return in each component. This is **the same behaviour as today** — Phase 2.3 changes nothing here. Owner-facing QA copy in the PR body will explicitly call out: "Rails do not widen scope yet. Empty rails are suppressed silently. Honesty headers + cascade ship in §CM."

### Cross-references

- New deferred entry §CM in `project_deferred_followups_index.md` — captures the full audit + scope estimate + dependencies.
- Spec source: `docs/superpowers/specs/2026-04-29-supply-aware-correction-design.md` §5.3 + §5.4 (scope-cascade primitive) and the locked passive-rail-widening rule cited by the owner.

---

## 1. Goal & non-goals

**Goal:** Make Home a fully branch-first surface end-to-end on the consumer side. Each Featured / Trending / NearbyByCategory tile renders one branch; each tap carries `?branch=<id>&from=home`; multi-branch merchants (Covelum Brightlingsea + Colchester) fan out to multiple tiles per the locked spec §5.2 interim behaviour.

**Non-goals (explicit, not just out-of-scope):**
- ❌ Redesign Home. Do NOT touch typography, spacing, colour, gradient, animation, or layout. The v7 lockdown is the source of truth and is already on `main`.
- ❌ Add new routes or screens. Empty handlers stay empty.
- ❌ Migrate the shared `<MerchantTile>` component to a new name or new props (Phase 2.5 owns the rename).
- ❌ Touch Map, Search, Category, Voucher Detail, or Merchant Profile surfaces.
- ❌ Backend schema changes. Only ONE additive field on the projection (`totalEstimatedSaving`).
- ❌ Stage 3 real-merchant media/hours/Places work. Karaara/My Kerala may render with placeholder media — acceptable.

---

## 2. Locked scope

### In scope (single PR)

1. **Customer-app schema envelope extension** (per Amendment A) — extend `homeFeedResponseSchema` in `apps/customer-app/src/lib/api/discovery.ts` with `featuredBranches: z.array(branchTileSchema)`, `trendingBranches: z.array(branchTileSchema)`, and `nearbyByCategoryBranches: z.array({ category, branches })` fields. Reuse the existing `branchTileSchema` (line 203) — do NOT redefine. Preserve legacy `featured` / `trending` / `nearbyByCategory` fields for Phase 1 additive-compatibility.
2. **HomeScreen orchestrator update.** Read new `*Branches` fields from `useHomeFeed` payload; pass to the three carousels.
3. **FeaturedCarousel.tsx** — flip to `BranchTile[]` consumption via adapter. Preserve auto-scroll, rose star, FEATURED badge prop on shared `<MerchantTile>`.
4. **TrendingSection.tsx** — flip to `BranchTile[]` consumption via adapter. Preserve warm-gradient wrap + flame icon.
5. **NearbyByCategory.tsx** — flip to `nearbyByCategoryBranches[]` (list of `{ category, branches }`). Preserve tappable header + "See all" chevron.
6. **Scoped `branchToMerchantTile` adapter** under `src/features/home/utils/` — local to Home, deletable in Phase 2.5. Mirrors Phase 2.2 Map's `branchToMerchantTile` adapter.
7. **Navigation contract** — every tile tap routes to `/merchant/${tile.merchant.id}?branch=${tile.id}&from=home`. Matches Phase 2.1 + 2.2 precedent.
8. **`resolveBackNavigation` helper update** (per Amendment B) — add `from=home` handling. Returns `/(app)/` (canonical Home route used by 3 existing call sites). Update the helper + its dedicated test file. The Merchant Profile screen itself is NOT touched — only the pure-function helper at `src/features/merchant/utils/resolveBackNavigation.ts` + its test.
9. **§CA wire-verification only** (per owner-locked 0.3, refined by Amendment A + Step I2 deferral 2026-05-21) — verify `branch.merchant.totalEstimatedSaving` flows through end-to-end. **NO UI-side closure in this PR.** The Home save badge still renders `Save up to £{Math.round(maxEstimatedSaving)}` via the unchanged shared `<SavePill>`. The `Save £X across N vouchers` UI copy migration touches shared components (`<SavePill>`, `<VoucherCountPill>`, `formatGbp`, `formatVoucherCount`) and propagates beyond Home — deferred to the §BY pill-level extension entry per Step I2 escalation. See §3.4 for full split.
10. **§BY partial closure for Home** (per owner-locked 0.4) — pin shared `formatDistance` reuse in tests; migrate any inline `£${n}` / `${n} offers` strings discovered during audit. Scope-cap: if migration broadens beyond Home, defer.
11. **Test coverage** — flip existing Home test fixtures to branch-first; add multi-branch fan-out pin (Covelum) + `?branch=&from=home` navigation pin + POSTCODE_CENTROID null-distance pin + verification pin that `branch.merchant.totalEstimatedSaving` is parsed by the extended `homeFeedResponseSchema` (wire only) + `resolveBackNavigation('home', ...)` positive-case pin. **NO UI-side save-badge copy assertions** — that's a regression pin for the §BY pill closure PR, not this one (Step I2 deferral).
12. **Deferred-followups bookkeeping** — new §CL entry for the 3 Home empty handlers. Committed as part of the plan-lock commit so it doesn't get lost. (DONE in commit `70a763c`.)
13. **Plan doc** — this file lands as the plan-lock commit. (DONE in commit `70a763c`.)

### Out of scope (explicit)

- ❌ Home redesign / restyle / re-polish (locked 0.1).
- ❌ New routes for campaigns / filter / Featured "See all" (locked 0.2 — recorded in §CL).
- ❌ Phase 2.5 tile-rename sweep (`<MerchantTile>` → `<BranchTile>`) — separate PR.
- ❌ Stage 3 Google-Places work for Karaara / My Kerala / Covelum Colchester — paused.
- ❌ §CK Map polish bucket — paused.
- ❌ §CE / §CF / §CG / §CH Search filters / sort / recent / illustration assets — separate workstreams.
- ❌ Branch-level Favourites infra (§CI) — Home tile `isFavourited` continues merchant-keyed derivation per Spec Rev 2 §13.
- ❌ Plan 4 M4 place-match UX.
- ❌ **All backend changes** (per Amendment A — `totalEstimatedSaving` already shipped end-to-end; no backend additive remaining for this PR). Unless a focused test proves a missing field, in which case PAUSE + escalate.
- ❌ Touching `<MerchantTile.tsx>` props or rendering logic. All adaptation happens via the surface-local adapter.
- ❌ Touching `MerchantProfileScreen.tsx` or any other component under `apps/customer-app/src/features/merchant/`. **Exception (per Amendment B):** the pure-function helper `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts` + its test file are IN scope for the `from=home` recognition. No screen-level edits.
- ❌ **Supply-aware Home rail cascade + honesty headers (per Amendment C).** Backend rail queries stay as-is (Featured platform-wide, Trending + NearbyByCategory single-attempt city filter). Section headers stay as literal `Featured` / `Trending near you` / `{Category} near you`. Deferred to §CM. Phase 2.3 adds regression pins on the current literal copy so §CM closure is unambiguous later.

---

## 3. Approach

### 3.1 — Wire shape (per locked Phase 1 contract)

`GET /api/v1/customer/home` returns:

```jsonc
{
  "locationContext": { city, source },

  // Legacy (will be dropped in Phase 3 rebaseline cleanup; preserved through Phase 2.x)
  "featured":         MerchantTile[],
  "trending":         MerchantTile[],
  "nearbyByCategory": [ { category, merchants: MerchantTile[] } ],

  // Phase 1 additive (Phase 2.3 consumes these)
  "featuredBranches":         BranchTile[],
  "trendingBranches":         BranchTile[],
  "nearbyByCategoryBranches": [ { category, branches: BranchTile[] } ],

  // Unchanged (banner-level, NOT tile list — locked at home-feed-branches.test.ts negative pin)
  "campaigns": CampaignTile[]
}
```

### 3.2 — Adapter pattern (scoped, deletable)

The shared `<MerchantTile>` component already accepts the props Home needs. To bridge the `BranchTile` shape without changing the shared component, introduce a local adapter:

```ts
// apps/customer-app/src/features/home/utils/branchToMerchantTile.ts
//
// Phase 2.3 scoped adapter — bridges the new `BranchTile` shape from the
// home-feed branch fields to the shape the shared `<MerchantTile>`
// component already accepts.  Phase 2.5 tile-rename sweep deletes this.
//
// Mirrors the Phase 2.2 Map adapter at apps/customer-app/src/features/map/
// utils/mapDataView.ts (similar bridging intent).

import type { BranchTile } from '../../../lib/api/discovery'
import type { MerchantTileProps } from '../../shared/MerchantTile'

export function branchToMerchantTileProps(branch: BranchTile): MerchantTileProps {
  // [Full mapping — every BranchTile field to MerchantTileProps field.
  //  Carries branch.id as the navigation token; merchant.id flows through
  //  for the route path.]
}
```

The adapter:
- Carries `branch.id` → navigation `?branch=<branchId>` URL param.
- Carries `branch.merchant.id` → route path `/merchant/<merchantId>`.
- Carries `branch.merchant.businessName` + `branch.branchName` → tile copy (matches §M one-pin-per-branch locked principle).
- Carries `branch.distance` + `branch.branchLocationConfidence` — POSTCODE_CENTROID branches have null distance per the redaction contract.
- Carries `branch.merchant.voucherCount` + `branch.merchant.maxEstimatedSaving` (passed through to the shared `<MerchantTile>` for the current `Save up to £X` rendering). `totalEstimatedSaving` is on the wire and parsed but NOT consumed by the shared component today — pill-level UI migration deferred per Step I2.
- Carries `branch.isOpenNow` → open-status indicator.
- Carries `branch.merchant.isFavourited` (merchant-keyed per Spec Rev 2 §13).

### 3.3 — Navigation contract

Every tile tap on Home routes to:

```
/merchant/${tile.merchant.id}?branch=${tile.id}&from=home
```

Three call sites (`FeaturedCarousel`, `TrendingSection`, `NearbyByCategory`) — same handler shape, same URL pattern.

`MerchantProfileScreen.handleBack` already recognises `from === 'home'` via `resolveBackNavigation` helper (locked PR #113 fixup). Phase 2.3 just provides the URL param.

### 3.4 — §CA Save badge

> **Implementation reality (locked 2026-05-21 by Step I2 escalation):** §CA in Phase 2.3 is **wire-verified ONLY — NOT UI-closed**. Below details the exact split.

**Wire side (✅ closed):**
- Backend already computes `totalEstimatedSaving` via `enrichBranchTile()` at `src/api/customer/discovery/service.ts:1028-1100` and emits it on every Home branch tile via `enrichBranchTiles` at `service.ts:1428-1429`.
- Customer-app `branchTileMerchantGroupingSchema` at `discovery.ts:200` parses it under `branch.merchant.totalEstimatedSaving`.
- Phase 2.3 verification pin at `tests/api/customer/discovery/home-feed-branches.test.ts` asserts the rounded sum (5.00 + 7.50 = 12.50) lands on a multi-voucher fixture (commit `d68aaa0`).

**UI side (❌ DEFERRED to §BY pill-level migration):**
- The shared `<MerchantTile>` component at `MerchantTile.tsx:150` reads `merchant.maxEstimatedSaving` (NOT `totalEstimatedSaving`) and feeds it into `<SavePill>`.
- `<SavePill>` at `SavePill.tsx:15` renders the literal `Save up to £{Math.round(amount)}` — the OLD pre-PR-#112-fixup-4 copy.
- The Phase 2.3 `branchToMerchantTile` adapter at `branchToMerchantTile.ts:70` passes `maxEstimatedSaving` through and does NOT include `totalEstimatedSaving` in its output (because the shared component doesn't read it).
- Phase 2.3 does NOT add the new `Save £X across N vouchers` UI copy on Home tiles. That UI-side migration touches `<SavePill>`, `<VoucherCountPill>`, `formatGbp`, and `formatVoucherCount` — all shared components that propagate to Map / Search / Category surfaces too. Step I2 escalation (2026-05-21, owner-approved) deferred this work under the §BY pill-level extension entry in `project_deferred_followups_index.md`.

**What Phase 2.3 actually does for §CA:**
- ✅ Verify wire shape (Task B, Amendment A).
- ✅ Pin `branch.merchant.totalEstimatedSaving` parse + flow-through.
- ❌ Do NOT modify `<MerchantTile.tsx>`, `<SavePill.tsx>`, `<VoucherCountPill.tsx>`, `formatGbp`, or `formatVoucherCount`.
- ❌ Do NOT add UI tests asserting the new `Save £X across N vouchers` wording — that's a regression pin for the §BY pill closure PR, not this one.

When the §BY pill-level closure PR lands, the migration will:
1. Decide the £-rounding rule for the discovery card pill (integer vs two-decimal).
2. Fix `formatVoucherCount` to return `voucher(s)` (standing-rule remediation).
3. Update `<SavePill>` to consume `merchant.totalEstimatedSaving` + render the new copy.
4. Update the adapter to pass `totalEstimatedSaving` through.
5. Add UI regression pins asserting the new copy across Home + Map + Search + Category.

Until that PR ships, Home save-pill rendering remains identical to current `main` (no visible change to users from Phase 2.3).

### 3.5 — §BY formatter audit

In-scope:
- Pin shared `formatDistance` reuse on Home tiles (regression assertion: distance string format must come from the shared helper).
- Audit for inline `£${n.toFixed(2)}` or `${n} offers` / `${n} voucher${...}` patterns in the 7 Home files.
- If found: migrate to the existing shared helpers (`formatPrice`, `formatVoucherCount`) **only if it's a 1-2 line edit per site**.

Out-of-scope (must NOT do in this PR):
- Touching `<MerchantTile.tsx>` shared component itself.
- Migrating non-Home surfaces (Search / Category / Map).
- Creating new shared helpers.
- Renaming `MerchantTile` or its types.

If the audit reveals broader changes needed, PAUSE and escalate. Defer to a separate §BY closure PR.

---

## 4. File structure

### Backend (0 files — REMOVED per Amendment A)

Per the 2026-05-21 amendment, `totalEstimatedSaving` is already wired end-to-end on `main`. No backend changes are required for Phase 2.3. Verify-only check: read `src/api/customer/discovery/branchTileSchema.ts:69` + `service.ts:1028-1100` + `service.ts:1428-1429` to confirm the field is emitted for Featured / Trending / NearbyByCategory branch tiles. If a focused test discovers a field is missing, PAUSE + escalate before any backend edit.

### Customer-app (7-9 files, ~250-300 LOC net)

| File | Action | Notes |
|---|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | MODIFY | Extend `homeFeedResponseSchema` (line 275) with `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches` — reuse the existing `branchTileSchema` (line 203). DO NOT redefine `branchTileSchema`. Preserve legacy schema fields. |
| `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` | **NEW** | Surface-local adapter. ~50-80 LOC. |
| `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | MODIFY | Read new `*Branches` fields; pass to carousels. |
| `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` | MODIFY | Accept `BranchTile[]`; loop through adapter. |
| `apps/customer-app/src/features/home/components/TrendingSection.tsx` | MODIFY | Same pattern. |
| `apps/customer-app/src/features/home/components/NearbyByCategory.tsx` | MODIFY | Accept `nearbyByCategoryBranches[]`; loop. |
| `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts` | MODIFY (per Amendment B) | Add `if (from === 'home') return '/(app)/'`. ~3 LOC. |
| `apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts` | MODIFY (per Amendment B) | Remove the existing `'home' → null` pin from the "unrecognised from values" block. Add a new positive describe block for `from=home`. |
| `apps/customer-app/tests/features/home/screens/HomeScreen.test.tsx` | MODIFY | Branch-first fixtures + multi-branch fan-out pin. |
| `apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx` | MODIFY | `?branch=&from=home` navigation pin + FEATURED badge pin + save badge wording pin. |
| `apps/customer-app/tests/features/home/components/TrendingSection.test.tsx` | MODIFY OR ADD if missing | Same navigation pin + warm-gradient render pin. |
| `apps/customer-app/tests/features/home/components/NearbyByCategory.test.tsx` | MODIFY | Same navigation pin + multi-category render. |

### Docs (1 file)

| File | Action |
|---|---|
| `docs/superpowers/plans/2026-05-20-phase-2-3-home-rebase-transplant.md` | NEW (this file, lands in plan-lock commit) |

### Memory / bookkeeping (1 file)

| File | Action |
|---|---|
| `project_deferred_followups_index.md` (in user memory dir) | MODIFY — add new §CL entry for 3 empty Home handlers. Lands in plan-lock commit alongside this plan doc. |

### Out-of-scope files (must NOT be touched in this PR)

- `apps/customer-app/src/features/shared/MerchantTile.tsx` — shared component; Phase 2.5 owns the rename.
- `apps/customer-app/src/features/map/**` — Map surface, separate PR.
- `apps/customer-app/src/features/search/**` — Search surface, separate PR.
- `apps/customer-app/src/features/category/**` — Category surface, separate PR (Phase 2.4).
- `apps/customer-app/src/features/merchant/**` — Merchant Profile surface; consumes the `?branch=` URL but no changes needed (already locked).
- `prisma/schema.prisma` — no schema changes.
- `prisma/audit-seed-state.ts` — unchanged (out of Discovery rebaseline scope).

---

## 5. Task breakdown

### Task A: Plan-lock commit (this commit)

- [x] Step A1: Create branch `feature/discovery-rebaseline-phase-2-3-home-customer-app` off `main` (`93803ca`).
- [ ] Step A2: Save this plan doc.
- [ ] Step A3: Add §CL entry to `project_deferred_followups_index.md`.
- [ ] Step A4: Commit both as a single plan-lock commit.
- [ ] Step A5: PAUSE for owner approval before any further work.

### Task B: Verify `totalEstimatedSaving` end-to-end (per Amendment A — verify, do NOT add)

**Files (read-only):** `src/api/customer/discovery/branchTileSchema.ts`, `src/api/customer/discovery/service.ts`, `tests/api/customer/discovery/home-feed-branches.test.ts`, `apps/customer-app/src/lib/api/discovery.ts`.

- [ ] Step B1: Read `src/api/customer/discovery/branchTileSchema.ts:69` — confirm `totalEstimatedSaving: z.number().nullable()` is present in the backend `branchTileSchema`.
- [ ] Step B2: Read `src/api/customer/discovery/service.ts:1028-1033, 1100` — confirm `enrichBranchTile()` computes and assigns `totalEstimatedSaving` with the locked rounding rule.
- [ ] Step B3: Read `src/api/customer/discovery/service.ts:1427-1449` — confirm `enrichBranchTiles` runs over `featuredBranchInputs` AND `trendingBranchInputs` AND the per-category nearby inputs.
- [ ] Step B4: Read `apps/customer-app/src/lib/api/discovery.ts:183-201, 203-223` — confirm customer-app `branchTileMerchantGroupingSchema` carries `totalEstimatedSaving` (line 200) and `branchTileSchema` references it (line 222).
- [ ] Step B5: Read `tests/api/customer/discovery/home-feed-branches.test.ts` — confirm at least one existing pin asserts `totalEstimatedSaving` on a multi-voucher fixture. If no such pin exists, ADD a minimal pin asserting the field is non-null + matches the rounding rule on a Covelum-style multi-voucher merchant.
- [ ] Step B6: If a focused test in Step B5 reveals a missing/zero `totalEstimatedSaving` for any Home branch tile, **PAUSE + escalate**. Backend edits are out-of-scope without owner approval.
- [ ] Step B7 (commit): if Step B5 only added a verification test, commit it with a clear message: "test(home): pin totalEstimatedSaving flows through home-feed branch tiles (Phase 2.3 Amendment A verification)".

### Task C: Customer-app schema update

**Files:** `apps/customer-app/src/lib/api/discovery.ts`.

- [ ] Step C1: Add `branchTileSchema` Zod definition (matching the Phase 1 backend shape — see `tests/api/customer/discovery/home-feed-branches.test.ts` for the full field list).
- [ ] Step C2: Extend `homeFeedResponseSchema` with `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`. Keep legacy fields for Phase 1 compat.
- [ ] Step C3: Export `BranchTile` TypeScript type alongside the schema.
- [ ] Step C4: Run customer-app `npx tsc --noEmit -p tsconfig.json` — 0 new errors.

### Task D: Adapter helper (NEW file)

**File:** `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts`.

- [ ] Step D1: Write the adapter mapping every `BranchTile` field to the shared `<MerchantTile>` props.
- [ ] Step D2: Header comment cites Phase 2.5 tile-rename as the deletion point.
- [ ] Step D3: Surface-local scope only — do NOT export to shared/.

### Task E: Featured carousel migration

**File:** `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`.

- [ ] Step E1: Accept `branches: BranchTile[]` instead of `merchants: MerchantTile[]` (or alongside, if dual-keyed safety preferred — recommend straight flip per locked Phase 2 approach).
- [ ] Step E2: Map each branch through `branchToMerchantTileProps()`.
- [ ] Step E3: Navigation handler routes to `/merchant/${branch.merchant.id}?branch=${branch.id}&from=home`.
- [ ] Step E4: Preserve all visual treatment: 260pt width, 10s auto-scroll, rose star, FEATURED badge prop on shared `<MerchantTile>`.

### Task F: Trending section migration

**File:** `apps/customer-app/src/features/home/components/TrendingSection.tsx`.

- [ ] Step F1: Same pattern as Task E (240pt width, no auto-scroll, warm-gradient wrap unchanged).

### Task G: NearbyByCategory migration

**File:** `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`.

- [ ] Step G1: Accept `categories: { category, branches: BranchTile[] }[]` instead of `{ category, merchants: MerchantTile[] }[]`.
- [ ] Step G2: Preserve tappable header + "See all ›" chevron (both route to `/category/:id`).
- [ ] Step G3: Each branch tile renders via adapter; tap routes with `?branch=&from=home`.

### Task H: HomeScreen orchestrator

**File:** `apps/customer-app/src/features/home/screens/HomeScreen.tsx`.

- [ ] Step H1: Read `feed.featuredBranches`, `feed.trendingBranches`, `feed.nearbyByCategoryBranches` from `useHomeFeed`.
- [ ] Step H2: Pass to the three carousels via the new prop name (`branches` / `categories`).
- [ ] Step H3: Loading skeletons unchanged.

### Task I: §BY formatter audit + low-risk migrations

- [ ] Step I1: Grep Home files for inline `£${...}`, `${...} offer`, `${...} voucher` patterns.
- [ ] Step I2: For each find: if migrating to a shared helper is a 1-2 line edit per site, migrate. If broader, PAUSE and report.
- [ ] Step I3: Pin shared `formatDistance` reuse in tests (regression assertion).

### Task J: Tests

- [ ] Step J1: Update fixtures in `tests/features/home/screens/HomeScreen.test.tsx` to branch-first shape.
- [ ] Step J2: Add multi-branch Featured fan-out pin using Covelum (`tax-branch-covelum-001` + `tax-branch-covelum-002`).
- [ ] Step J3: Pin `?branch=&from=home` navigation URL on tap (all three carousels).
- [ ] Step J4: Pin POSTCODE_CENTROID null-distance rendering (use a low-confidence seed fixture or mock).
- [ ] Step J5: ~~Pin Save badge copy~~ — **REMOVED per Step I2 deferral 2026-05-21.** Save badge UI copy migration is deferred to the §BY pill-level closure PR. Phase 2.3 only pins the wire-side `totalEstimatedSaving` value via the backend test (Step B5).
- [ ] Step J6: Pin "voucher" / "vouchers" wording — banned: "offer" / "offers".
- [ ] Step J7: **Amendment C regression pins.** Add 3 assertions locking current literal section-header copy: `FeaturedCarousel` → `Featured`; `TrendingSection` → `Trending near you`; `NearbyByCategory` → `{category.name} near you` (cite a Covelum-category fixture for the resolved string). These pins WILL fail when §CM ships its honesty cascade — by design.
- [ ] Step J8: Run full Home jest suite — must pass.
- [ ] Step J9: Run targeted backend vitest — must pass.
- [ ] Step J10: Run `tsc --noEmit` both sides — 0 new errors.

### Task M: `resolveBackNavigation` adds `from=home` (per Amendment B)

**Files:** `apps/customer-app/src/features/merchant/utils/resolveBackNavigation.ts`, `apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts`.

- [ ] Step M1: Update the helper to add a `from=home` case BEFORE the final `return null`:
  ```ts
  if (from === 'home') {
    // Canonical Home route — matches the pattern used by
    // SavingsScreen.tsx:239, SubscribePromptScreen.tsx:270,
    // VoucherDetailScreen.tsx:1001.  `q` is ignored.
    return '/(app)/'
  }
  ```
- [ ] Step M2: Update the helper's header doc comment to add `from=home` to the "Surfaces that stamp `from=<surface>`" list with the cross-reference `Phase 2.3 Home (this PR)`.
- [ ] Step M3: Edit `resolveBackNavigation.test.ts`:
  - REMOVE the line `expect(resolveBackNavigation('home', undefined)).toBeNull()` from the existing `describe('default fallback', ...)` block's "unrecognised from values" test (currently line 35).
  - ADD a new `describe('from=home (Phase 2.3 contract)', ...)` block matching the `from=map` pattern, with two pins:
    - `expect(resolveBackNavigation('home', undefined)).toBe('/(app)/')`
    - `expect(resolveBackNavigation('home', 'ignored')).toBe('/(app)/')` (q is ignored, mirroring from=map)
- [ ] Step M4: Run `npx jest apps/customer-app/tests/features/merchant/utils/resolveBackNavigation.test.ts` — all tests pass.
- [ ] Step M5: Verify `MerchantProfileScreen.handleBack` already calls `resolveBackNavigation(from, q)` (it does, per PR #113); no screen-level edit needed.

### Task K: Open PR + pause

- [ ] Step K1: Push branch + open PR with detailed body (mirror Stage 2 / Stage 4 PR-body convention).
- [ ] Step K2: Include the Phase 2.3 pre-merge package: file list + diff stats + audit/test results + scope confirmation.
- [ ] Step K3: PAUSE for owner device-QA approval.

### Task L: Post-merge memory close-out

- [ ] Step L1: Update `project_active_workstream_seed_enrichment.md` (no change expected; Phase 2.3 doesn't touch seed enrichment).
- [ ] Step L2: Update `project_current_state.md` with new main HEAD + Phase 2.3 SHIPPED marker.
- [ ] Step L3: Update `MEMORY.md` top-line pointer.
- [ ] Step L4: Update `project_deferred_followups_index.md` Discovery rebaseline section to mark Phase 2.3 SHIPPED.
- [ ] Step L5: Create `project_discovery_rebaseline_phase2_3_complete.md` baseline memory (mirror Phase 2.1 + 2.2 templates).

---

## 6. Tests + QA checklist

### Backend vitest pins (verification-only per Amendment A)

1. `home-feed-branches.test.ts` has at least one pin asserting `totalEstimatedSaving` is present + correctly summed on a multi-voucher merchant's Home branch tile. If not present, ADD this pin (Step B5). If the pin reveals a missing field, PAUSE + escalate (Step B6).
2. Existing Phase 1 pins remain green.

### Customer-app jest pins

1. `homeFeedResponseSchema` parses a fixture containing `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches` and exposes `branch.merchant.totalEstimatedSaving` end-to-end (positive pin for Amendment A consumer-side gap).
2. HomeScreen renders 3 carousels populated from `*Branches` fields.
3. FeaturedCarousel tile tap → `router.push('/merchant/{id}?branch={branchId}&from=home')`.
4. TrendingSection same.
5. NearbyByCategory tile tap same.
6. NearbyByCategory section-header tap routes to `/category/:id` (existing behaviour preserved).
7. Multi-branch Featured merchant fans out: Covelum Brightlingsea + Colchester both render as separate tiles.
8. POSTCODE_CENTROID branch tile renders with null distance (no "X miles away" string).
9. Save badge copy multi-voucher: `Save £X` + `across N vouchers`.
10. Save badge copy single-voucher: `Save up to £X` + `1 voucher`.
11. Save badge wording: never contains "offer" / "offers".
12. Shared `formatDistance` is the only source of the "X miles away" string on Home (regression pin).
13. **`resolveBackNavigation('home', undefined)` returns `/(app)/`** (Amendment B positive pin).
14. **`resolveBackNavigation('home', 'ignored')` returns `/(app)/`** (Amendment B — q is ignored, mirrors `from=map`).
15. The "unrecognised from values" test no longer includes `'home'` (Amendment B regression guard — that line moved to the new positive describe block).
16. **`FeaturedCarousel` header renders literal `Featured`** (Amendment C regression pin — preserves current copy; §CM closure WILL flip this to dynamic scope-aware copy).
17. **`TrendingSection` header renders literal `Trending near you`** (Amendment C regression pin).
18. **`NearbyByCategory` section header renders `{category.name} near you`** (Amendment C regression pin; cite a Covelum-category seed fixture for the resolved string).

### tsc

- Backend: 4 pre-existing §BV errors only.
- Customer-app: 0 new errors.

### Device-QA checklist (owner-run on EAS build)

- [ ] Home loads with location enabled; locality header shows correct city.
- [ ] Featured carousel auto-scrolls every 10s; manual swipe resets timer; tile tap opens Merchant Profile with correct branch context.
- [ ] Trending section: warm gradient wrap visible; flame icon present; tile tap preserves branch.
- [ ] NearbyByCategory: each visible category renders; section-header tap AND "See all ›" tap both route to `/category/:id`; individual tile tap preserves branch.
- [ ] **Covelum multi-branch test:** if user is near Colchester, both Brightlingsea + Colchester tiles render. Each tile leads to the correct branch view on Merchant Profile.
- [ ] **Karaara + My Kerala visible** but with placeholder media (Stage 3 will fix — acceptable residual).
- [ ] Campaign carousel auto-slides 12s; gradient banners + Learn More CTA visible. **Tap still no-op (per owner-locked 0.2).** Document in QA notes.
- [ ] Filter button on header: visible, **tap still no-op (per owner-locked 0.2).** Document in QA notes.
- [ ] Featured "See all" link: visible, **tap still no-op (per owner-locked 0.2).** Document in QA notes.
- [ ] Save badges show correct wording across multi-voucher and single-voucher merchants.
- [ ] Pull-to-refresh works with brand-rose tint.
- [ ] No visual regressions on spacing, fonts, colours, gradient treatments.
- [ ] **Back-nav from Merchant Profile to Home routes back to Home tab** (NOT to whatever tab was last active under expo-router Tabs default). Tests pin the helper at `/(app)/`; device QA confirms end-to-end UX (Amendment B). Mirrors the Search + Map back-nav fix pattern from PR #112 fixup-6 + PR-3 Phase D.
- [ ] **Home rails do NOT widen scope yet (Amendment C deferral).** Empty rails are suppressed silently as today; the literal headers `Featured` / `Trending near you` / `{Category} near you` remain unchanged. If you observe an empty Trending or Nearby category in a city with limited supply, that's expected — honesty cascade ships in §CM, not this PR. Confirm: no header copy has changed vs current main.

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Multi-branch fan-out renders unexpected duplicate tiles | Low | Medium | Backend pin in `home-feed-branches.test.ts` Phase 1 already enforces fan-out shape. Customer-app pin in this PR enforces correct render. Device QA on Covelum. |
| `totalEstimatedSaving` rounding diverges from Search PR #112 | **Closed** | — | Backend logic already shipped; Phase 2.3 verifies only. Risk removed by Amendment A. |
| `from=home` back-nav silently falls back to default router.back() because helper not updated | Low | Medium | Amendment B makes the helper edit + test pin in-scope (Task M). Without it, Home tile → Merchant Profile → back would route to last-active tab instead of Home, mirroring the bug class PR #112 fixup-6 + PR-3 Phase D fixed for Search/Map. |
| Empty / sparse Home rails in a sparsely-seeded city without honesty header (e.g. Trending = 0 in user's city → suppressed; user sees no signal that wider supply exists) | Medium | **Acceptable until §CM** | Amendment C explicitly defers the cascade + honesty headers to §CM. Current behaviour suppresses empty rails silently — same as today's main. Device-QA note + PR-body call-out make the deferred state explicit. Regression pins in tests lock current literal headers so §CM closure is unambiguous. |
| Adapter pattern leaks shape into shared `<MerchantTile>` | Low | Medium | Adapter strictly surface-local. Code reviewer enforces no edits to `<MerchantTile.tsx>` in this PR. Phase 2.5 cleanup deletes adapter. |
| §BY audit widens scope mid-implementation | Medium | Low | Owner-locked at 0.4: PAUSE + escalate if non-trivial. Hard cap: 1-2 lines per migration site, Home-scoped only. |
| Karaara/My Kerala null-media tiles crash render | Low | High | Verify `<MerchantTile>` already has logo/banner null-safety (pre-existing — dev-merchant-001 era). Add explicit pin if missing. |
| Empty handlers create QA confusion | Low | Low | Document in device-QA checklist; record §CL deferred entry; PR description explicitly notes the deferral. |
| Phase 1 backend additive fields not yet flowing through `getHomeFeed` for all sections | Low | Medium | Confirmed via `home-feed-branches.test.ts` — 4 sections covered. Verify Zod schema parses cleanly against a live backend response (manual probe). |
| Navigation `from=home` collides with existing back-nav resolver | Very low | Low | `resolveBackNavigation` already handles `from=search` + `from=map`; pattern is consistent. Add `from=home` case if not already present. |
| Save badge copy regresses to "offer" wording from old code | Low | Low | Explicit banned-string pin in tests. |

---

## 8. Self-review checklist (run by Claude before saving)

Run with fresh eyes against the spec:

1. **Spec coverage:** Every locked Discovery rebaseline spec §5 (Home sections) and spec §4 (navigation contract) item has a task above. ✅
2. **Placeholder scan:** No "TBD", no "implement later", no "similar to Task X". All steps are concrete. ✅
3. **Type consistency:** `BranchTile`, `MerchantTile`, `branchToMerchantTileProps` all referenced consistently. ✅
4. **Scope check:** Single PR, single surface, no schema changes, no cross-surface drift. ✅
5. **Honour owner locks 0.1-0.7:** verified inline at each task. ✅
6. **Deferred-followups bookkeeping:** §CL entry committed as part of plan-lock, not after. ✅
7. **PAUSE points marked:** Step A5 (plan-lock), Step I2 (§BY scope), Step K3 (pre-merge owner gate). ✅

---

## 9. Open follow-ups (post-merge, captured for memory)

These are explicitly OUT of Phase 2.3 but recorded so they don't get lost:

- **§CL** — Three Home empty handlers (`onCampaignPress` / `onFilterPress` / `onSeeAll` on Featured). Need separate UX brainstorm before implementation. Recorded as new deferred entry in plan-lock commit.
- **§CM** — Supply-aware Home rail cascade + honesty headers (Amendment C). Backend ranker integration for Featured / Trending / NearbyByCategory + per-rail scope metadata on the response + dynamic header copy on 3 components. ~700-1100 LOC + product-decision sub-questions on exact per-scope copy. Cross-ref: `docs/superpowers/specs/2026-04-29-supply-aware-correction-design.md` §5.3 + §5.4. Recorded as new deferred entry in the Amendment C commit.
- **Phase 2.4** — Category surface customer-app migration (next in Discovery rebaseline order per spec §10.2).
- **Phase 2.5** — Tile-component rename sweep (`<MerchantTile>` → `<BranchTile>`); deletes the Home adapter introduced by this PR.
- **Phase 3** — Discovery rebaseline cleanup (drop legacy `merchants` / `featured` / `trending` / `nearbyByCategory` fields from the wire entirely).
- **§SE Stage 3** — Real-merchant Google-Places polish for Karaara + My Kerala (closes R2/R3/R9 in the seed guardrail).
- **§BY** broader cross-surface formatter / copy propagation — what wasn't fixed in Phase 2.3 Home stays open.
- **§CA** broader Save badge propagation — Category surface still needs the badge anatomy update; Phase 2.4 will close.
- **§CK** Map polish bucket.
- **§CI** branch-level Favourites infra.

---

## Plan-lock signature

- **Owner approval:** locked 2026-05-20 per chat directive on PR-3 / Phase 2.3 framing.
- **Base:** `main` at `93803cace53b2b41f2fc4af0c418325990526026` (Stage 4 merge).
- **Branch:** `feature/discovery-rebaseline-phase-2-3-home-customer-app`.
- **Tier:** 2 plan-first per Redeemo workflow tier calibration.
- **Execution mode:** subagent-driven per `superpowers:subagent-driven-development`.
- **First action after owner approves this plan:** dispatch implementer subagent for Task B (backend additive).

PAUSE for owner approval before implementation starts.
