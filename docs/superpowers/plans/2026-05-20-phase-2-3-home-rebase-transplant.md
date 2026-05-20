# Phase 2.3 Home — Branch-First Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the customer-app Home tab (Featured + Trending + NearbyByCategory carousels) from consuming legacy `MerchantTile[]` to the new branch-first `BranchTile[]` contract emitted by Phase 1 backend (PR #110). The refined v7 Home UI/UX is **already on `main`** — this PR does **NOT** redesign, restyle, or re-polish Home.

**Architecture:** Three carousels flip to new `*Branches` response fields; each tile tap routes with `?branch=<id>&from=home` to Merchant Profile (matching Phase 2.1 Search + Phase 2.2 Map patterns). A scoped `branchToMerchantTile` adapter (mirroring Phase 2.2 Map's adapter) bridges the data shape without touching the shared `<MerchantTile>` component (Phase 2.5 will rename that). Two small additive items propagate locked patterns from neighbouring surfaces: §CA Save badge (`Save £X across N vouchers`) and §BY formatter audit (verify shared `formatDistance` usage; migrate any inline GBP / voucher-count strings if found low-risk).

**Tech Stack:** Expo SDK 54 + expo-router v4, React Query, Zod, Prisma 7 + driver-adapter, vitest (backend) + jest-expo (customer-app).

---

## 0. Owner-locked direction (2026-05-20)

| # | Decision | Locked value |
|---|---|---|
| **0.1** | Overall path | **Option C — branch-first migrate only.** No transplant. The refined v7 Home UI/UX on `main` is preserved. NO redesign, NO restyle, NO re-polish. |
| **0.2** | Empty handlers `onCampaignPress` / `onFilterPress` / `onSeeAll` | **OUT of Phase 2.3.** Do NOT add routes or screens. Record as deferred follow-up (§CL — see this plan's bookkeeping task). Visible no-op flagged in device-QA checklist. |
| **0.3** | §CA Home save badge | **IN if low-risk.** Add `totalEstimatedSaving` backend additive + Home `Save £X across N vouchers` copy mirroring Search PR #112 fixup-4. **Escalate** if implementation reveals broader scope. |
| **0.4** | §BY formatter audit | **IN as small audit.** Pin shared `formatDistance` reuse on Home in tests. GBP + voucher-count helper migration in-scope ONLY if low-risk + scoped to Home; do NOT broaden into Phase-2.5-territory shared-component cleanup. |
| **0.5** | Tier classification | **Tier 2 plan-first.** No Tier 3 brainstorm — locked Discovery rebaseline spec already covers Phase 2.3. |
| **0.6** | Branch + base | Base `main` (`93803ca`); branch `feature/discovery-rebaseline-phase-2-3-home-customer-app`. |
| **0.7** | Standing rules carry forward | Single-component carry-forward (§0.7 spec lock); `?branch=&from=home` URL contract; POSTCODE_CENTROID redaction passes through unchanged; no schema changes; no Map / Search / Category surface drift. |

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

1. **Backend additive — `totalEstimatedSaving` on the home-feed branch tile projection.** Mirror the projection logic locked at PR #112 fixup-4 (Search). One field, one service line, one schema entry, one test pin.
2. **Customer-app Zod schemas.** Extend `discovery.ts` with `branchTileSchema` + envelope fields for Home (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`). Preserve legacy field schemas for Phase 1 additive-compatibility.
3. **HomeScreen orchestrator update.** Read new `*Branches` fields from `useHomeFeed` payload; pass to the three carousels.
4. **FeaturedCarousel.tsx** — flip to `BranchTile[]` consumption via adapter. Preserve auto-scroll, rose star, FEATURED badge prop on shared `<MerchantTile>`.
5. **TrendingSection.tsx** — flip to `BranchTile[]` consumption via adapter. Preserve warm-gradient wrap + flame icon.
6. **NearbyByCategory.tsx** — flip to `nearbyByCategoryBranches[]` (list of `{ category, branches }`). Preserve tappable header + "See all" chevron.
7. **Scoped `branchToMerchantTile` adapter** under `src/features/home/utils/` — local to Home, deletable in Phase 2.5. Mirrors Phase 2.2 Map's `branchToMerchantTile` adapter.
8. **Navigation contract** — every tile tap routes to `/merchant/${tile.merchant.id}?branch=${tile.id}&from=home`. Matches Phase 2.1 + 2.2 precedent.
9. **§CA partial closure for Home** (per owner-locked 0.3) — `Save £X across N vouchers` badge copy on Home cards; backend `totalEstimatedSaving` field. Single-voucher case uses `Save up to £X` + `1 voucher` per locked wording.
10. **§BY partial closure for Home** (per owner-locked 0.4) — pin shared `formatDistance` reuse in tests; migrate any inline `£${n}` / `${n} offers` strings discovered during audit. Scope-cap: if migration broadens beyond Home, defer.
11. **Test coverage** — flip existing Home test fixtures to branch-first; add multi-branch fan-out pin (Covelum) + `?branch=&from=home` navigation pin + POSTCODE_CENTROID null-distance pin + Save badge copy pin (single + multi-voucher cases).
12. **Deferred-followups bookkeeping** — new §CL entry for the 3 Home empty handlers. Committed as part of the plan-lock commit so it doesn't get lost.
13. **Plan doc** — this file (`docs/superpowers/plans/2026-05-20-phase-2-3-home-rebase-transplant.md`) lands as the plan-lock commit.

### Out of scope (explicit)

- ❌ Home redesign / restyle / re-polish (locked 0.1).
- ❌ New routes for campaigns / filter / Featured "See all" (locked 0.2 — recorded in §CL).
- ❌ Phase 2.5 tile-rename sweep (`<MerchantTile>` → `<BranchTile>`) — separate PR.
- ❌ Stage 3 Google-Places work for Karaara / My Kerala / Covelum Colchester — paused.
- ❌ §CK Map polish bucket — paused.
- ❌ §CE / §CF / §CG / §CH Search filters / sort / recent / illustration assets — separate workstreams.
- ❌ Branch-level Favourites infra (§CI) — Home tile `isFavourited` continues merchant-keyed derivation per Spec Rev 2 §13.
- ❌ Plan 4 M4 place-match UX.
- ❌ Backend schema migrations. The only additive is `totalEstimatedSaving` on the existing projection.
- ❌ Touching `<MerchantTile.tsx>` props or rendering logic. All adaptation happens via the surface-local adapter.

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
- Carries `branch.merchant.voucherCount` + `branch.merchant.totalEstimatedSaving` → save badge copy (`Save £X across N vouchers` or single-voucher variant).
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

Backend projection adds `totalEstimatedSaving: number | null` to the home-feed branch-tile select. Computed as `sum(voucher.estimatedSaving) where voucher.status='ACTIVE' && voucher.approvalStatus='APPROVED' && belongs to merchant`. Same rounding rule as PR #112 fixup-4 (locked).

Home `<MerchantTile>` card render (Featured + Trending + NearbyByCategory) shows the save badge with:
- Multi-voucher case: `Save £X` (primary, large) + `across N vouchers` (secondary, small)
- Single-voucher case: `Save up to £X` (primary) + `1 voucher` (secondary)
- Word "voucher" / "vouchers" — NEVER "offer" or "offers" (locked at PR #112 fixup-4, §CA).

Pin both cases in tests so they don't regress to "offer".

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

### Backend (3 files, ~30 LOC net)

| File | Action | Notes |
|---|---|---|
| `src/api/customer/discovery/service.ts` (or wherever the home-feed projection lives) | MODIFY | Add `totalEstimatedSaving` to the branch-tile projection. Mirror PR #112 fixup-4 logic. |
| `src/api/customer/discovery/schemas.ts` (or wherever `BranchTile` Zod / TS shape lives backend-side) | MODIFY | Add `totalEstimatedSaving: number | null` to `BranchTile` shape. |
| `tests/api/customer/discovery/home-feed-branches.test.ts` | MODIFY | Add `totalEstimatedSaving` assertion to existing 4 pins. Test single-voucher + multi-voucher fixtures. |

### Customer-app (6-8 files, ~250-300 LOC net)

| File | Action | Notes |
|---|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | MODIFY | Add `branchTileSchema` (Zod) + extend `homeFeedResponseSchema` with `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`. Preserve legacy schema fields. |
| `apps/customer-app/src/features/home/utils/branchToMerchantTile.ts` | **NEW** | Surface-local adapter. ~50-80 LOC. |
| `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | MODIFY | Read new `*Branches` fields; pass to carousels. |
| `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx` | MODIFY | Accept `BranchTile[]`; loop through adapter. |
| `apps/customer-app/src/features/home/components/TrendingSection.tsx` | MODIFY | Same pattern. |
| `apps/customer-app/src/features/home/components/NearbyByCategory.tsx` | MODIFY | Accept `nearbyByCategoryBranches[]`; loop. |
| `apps/customer-app/tests/features/home/screens/HomeScreen.test.tsx` | MODIFY | Branch-first fixtures + multi-branch fan-out pin. |
| `apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx` | MODIFY | `?branch=&from=home` navigation pin + FEATURED badge pin. |
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

### Task B: Backend additive (`totalEstimatedSaving`)

**Files:** `src/api/customer/discovery/service.ts`, `src/api/customer/discovery/schemas.ts` (or equivalent), `tests/api/customer/discovery/home-feed-branches.test.ts`.

- [ ] Step B1: Locate the home-feed branch-tile projection. Confirm the Search projection pattern from PR #112 fixup-4 to mirror.
- [ ] Step B2: Add `totalEstimatedSaving` to the projection. SQL/Prisma: sum the merchant's active+approved voucher `estimatedSaving` values; return as number or null. Same rounding as PR #112.
- [ ] Step B3: Update the backend `BranchTile` shape (TS + Zod if present) to include `totalEstimatedSaving: number | null`.
- [ ] Step B4: Extend `home-feed-branches.test.ts` with a single-voucher and a multi-voucher fixture assertion. Pin: `Save £X` rounding rule. Pin: null when no vouchers.
- [ ] Step B5: Run `npx vitest run tests/api/customer/discovery/home-feed-branches.test.ts` — must pass.
- [ ] Step B6: Run `npx tsc --noEmit -p tsconfig.json` — must show only the 4 pre-existing §BV errors.

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
- [ ] Step J5: Pin Save badge copy: `Save £X across N vouchers` (multi) and `Save up to £X` + `1 voucher` (single).
- [ ] Step J6: Pin "voucher" / "vouchers" wording — banned: "offer" / "offers".
- [ ] Step J7: Run full Home jest suite — must pass.
- [ ] Step J8: Run targeted backend vitest — must pass.
- [ ] Step J9: Run `tsc --noEmit` both sides — 0 new errors.

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

### Backend vitest pins

1. `home-feed-branches.test.ts` carries `totalEstimatedSaving` on each branch tile.
2. Multi-voucher merchant → `totalEstimatedSaving` = sum of all active+approved voucher savings.
3. Single-voucher merchant → `totalEstimatedSaving` = that voucher's saving.
4. Zero-voucher merchant → `totalEstimatedSaving` = null.
5. Existing 4 Phase 1 pins remain green.

### Customer-app jest pins

1. HomeScreen renders 3 carousels populated from `*Branches` fields.
2. FeaturedCarousel tile tap → `router.push('/merchant/{id}?branch={branchId}&from=home')`.
3. TrendingSection same.
4. NearbyByCategory tile tap same.
5. NearbyByCategory section-header tap routes to `/category/:id` (existing behaviour preserved).
6. Multi-branch Featured merchant fans out: Covelum Brightlingsea + Colchester both render as separate tiles.
7. POSTCODE_CENTROID branch tile renders with null distance (no "X miles away" string).
8. Save badge copy multi-voucher: `Save £X` + `across N vouchers`.
9. Save badge copy single-voucher: `Save up to £X` + `1 voucher`.
10. Save badge wording: never contains "offer" / "offers".
11. Shared `formatDistance` is the only source of the "X miles away" string on Home (regression pin).

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
- [ ] No regressions in back-nav from Merchant Profile to Home (preserves `from=home`).

---

## 7. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Multi-branch fan-out renders unexpected duplicate tiles | Low | Medium | Backend pin in `home-feed-branches.test.ts` Phase 1 already enforces fan-out shape. Customer-app pin in this PR enforces correct render. Device QA on Covelum. |
| `totalEstimatedSaving` rounding diverges from Search PR #112 | Low | Low | Mirror exact rounding rule. Pin test compares against fixed fixture value. |
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
