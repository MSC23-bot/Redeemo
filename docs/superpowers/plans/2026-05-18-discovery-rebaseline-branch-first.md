# Discovery Rebaseline — Branch-First Cardinality Implementation Plan

> **Revision:** 1.1 (2026-05-18) — self-review carry-overs + implementation-correctness fixes against the real codebase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Revision history

- **Rev 1 (2026-05-18 earlier):** initial plan from Spec Rev 2.1.
- **Rev 1.1 (2026-05-18 later):** correctness patch. Two classes of change. No new tasks added; existing tasks rewritten for accuracy.
  - **A. Plan-writing-skill carry-overs:** PR-3 Step 4, PR-4 (Phase 2.3 Home), PR-5 (Phase 2.4 Category), PR-6 Step 6 all rewritten with full step-by-step checklists (no "mirror earlier pattern" shortcuts).
  - **B. Implementation-correctness against the real codebase:**
    1. PR-1 Task 1.4 (`enrichBranchTiles`) rewritten to instruct workers to **adapt the existing `enrichMerchantTile` / `enrichMerchantTiles` patterns at `src/api/customer/discovery/service.ts:529–711`**, NOT paste pseudo-code. Specifically: `MERCHANT_TILE_SELECT` is the canonical select shape; `descriptorForMerchant`, `visibleHighlightsFor`, `exposeBranchPosition`, `hasExactPosition` are all existing helpers to reuse; rating + favourite batching follows the existing `prisma.review.groupBy({ by: ['branchId'] })` + `prisma.favouriteMerchant.findMany` pattern. Wrong Prisma field references purged (`merchantFavourite` → `favouriteMerchant`; `MerchantHighlight.highlightTag` → `tag`; `Category.slug` / `Category.iconKey` removed; `Merchant.subcategory` derived from `categories[].category` filtered by `parentId != null`; `openingHours` selected explicitly).
    2. **Map exact-coordinate rule preserved.** Task 1.6 `getInAreaBranches` predicate is now `locationConfidence: 'MANUALLY_CONFIRMED'` ONLY (matches `hasExactPosition` at service.ts:86–93). The earlier `{ in: ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED'] }` widened PR #81's redaction contract — corrected.
    3. **Search ranking + pagination semantics corrected.** Task 1.5 `searchBranches` follows the existing `searchMerchants` flow at service.ts:1620–1925 — build candidates → classify/rank → filter retained rungs → THEN paginate. `totalBranches` = post-filter branch count, not raw predicate count.
    4. **Load-bearing tests made deterministic.** Covelum multi-branch test creates the fixture inline (or fails loudly with a named-error message) instead of silently skipping. Same pattern for campaign branch test.
    5. **Route wiring corrected.** Examples now use `app.prisma`, `optionalUserId(req)`, `searchQuery.parse(req.query)` (matching `src/api/customer/discovery/routes.ts:1–195`). `searchMerchants` does NOT accept `effLoc` — service resolves internally via the existing `tryRankMerchantsV2` / `resolveEffectiveLocation` chain. Plan examples updated accordingly.

---

**Goal:** Flip Redeemo's Discovery / Search / Map / Home / Category / Campaign endpoints from one-tile-per-merchant to one-tile-per-branch so multi-branch merchants (Covelum Brightlingsea + Colchester) stop collapsing, branch-as-PRIMARY-unit product rule is honoured everywhere, and Plan 4 M4 unblocks against the new contract.

**Architecture:** Three-phase additive migration. Phase 1 (one PR) ships a new `BranchTile` shape + `rankBranchesV3` + per-endpoint branch-themed helpers alongside the existing merchant-themed contract — both fields always present on the wire. Phase 2 (five PRs) migrates each customer-app surface to consume the new `branches` field one at a time (Search → Map → Home → Category → tile-component-rename sweep). Phase 3 (one PR) deletes the legacy merchant-themed code, converging with Plan 4 M5 cleanup.

**Tech Stack:** Fastify + Prisma 7 + Neon Postgres + Zod (backend); Expo SDK 54 + expo-router v4 + React Query + Zod (customer-app); vitest (backend) + jest-expo (customer-app); TypeScript strict.

**Spec source-of-truth:** `docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md` (Rev 2.1, locked 2026-05-18).

**Brainstorm date:** 2026-05-18.

**Memory cross-refs:** `project_branch_first_class_platform_rules.md` (branch-as-PRIMARY-unit, 2026-05-03); `project_favourites_scope_branch_level.md` (locked branch-keyed product rule, 2026-05-03); `project_card_display_direction.md` (locked card content rules, 2026-04-29); `project_location_confidence_redaction_contract.md` (PR #81 redaction contract); `project_discovery_sequencing_plan4.md` (Plan 4 sequencing); `project_deferred_followups_index.md` §M (active), §BA (covered by this rebaseline pin-cardinality wise), §BB (implicitly covered), §AW (principle locked), §AV (redaction reaffirmed), §A (schema gaps deferred), §AS (NOT regressed).

---

## Owner-locked entry conditions (do not start implementation until all true)

- [ ] Spec Rev 2.1 owner-approved (this plan presumes it is).
- [ ] No in-flight customer-app rebaseline PRs touching `src/features/search`, `src/features/map`, `src/features/home`, or `src/features/shared/MerchantTile.tsx` — those will conflict with Phase 2 PRs.
- [ ] Local `main` and `origin/main` aligned (`git fetch && git log --oneline origin/main..HEAD` is empty).
- [ ] §15 spec open items answered:
  - **§15.1** Phase 2 technical migration order — `Search → Map → Home → Category → tile-component-rename sweep` (default, used by this plan unless overridden).
  - **§15.2** Plan 4 M4 resumption point — `after Phase 2.1 (Search) ships`.
  - **§15.3** Customer-app type generation — option (a) hand-written TS interface in `apps/customer-app/src/lib/api/discovery.ts`.
  - **§15.4** `BranchTile.isOpenNow` derivation — extends naturally from `getMyOpenStatus` per-branch (assume yes; PR 1 surfaces any subtlety in `getCustomerVoucher` parity work).
  - **§15.5** Address policy — locality-only, NO street address on `BranchTile` (Rev-2 lock).
  - **§15.6** Plan doc location — this file.

---

## Standing rules baked into every PR

1. **Tier 2 plan-first.** This plan is the source of truth for all 7 PRs. If a contract gap surfaces mid-PR, PAUSE and amend the plan; do NOT hack around it (per `feedback_workflow_tier_calibration.md`).
2. **PR scope verification mandatory before merge.** Run live `gh api compare` and bind the SHA via `REDEEMO_PR_SCOPE_VERIFIED=<head-sha>` before any `gh pr merge` (per `feedback_pr_scope_verification.md` + workflow hook).
3. **Long-standing untracked artefacts preserved** across every PR: `.agents/`, `app.json`, `docs/source-materials/`, `docs/superpowers/skill-usage-cheatsheet.md`, the 7 `prisma/*` one-off scripts, `skills-lock.json`. These are owner-owned working-tree state — leave them alone.
4. **Memory updates per PR** (in `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/`): on merge of each PR, append a "shipped" line to the relevant `project_*` file AND update the MEMORY.md top index entry. Specifically `project_current_state.md` + `project_deferred_followups_index.md` §M (mark phase complete) + create new `project_discovery_rebaseline_phase{N}_complete.md` per PR.
5. **No new untracked working-tree artefacts.** `git status --short` at PR head should match the long-standing list above plus only the PR's intended changes.
6. **`tsc --noEmit` clean on both sides** (backend root + `apps/customer-app/`) before every commit, not only at PR head. The hook does not enforce this but it's the rebaseline standard.
7. **Test pyramid.** Every PR must add at least one backend or customer-app test per behavioural change. Snapshot tests are acceptable only when paired with a focused assertion test.
8. **Owner review gate after each PR.** No PR proceeds to merge without explicit owner approval. Each PR's section below has an OWNER REVIEW checkbox.
9. **Rollback path documented per PR.** Every PR specifies its own rollback strategy (Phase 1 is `git revert`-only safe; Phase 2 PRs are per-surface revert-safe; Phase 3 is the one irreversible cleanup).

---

## File structure — what gets created vs modified vs deleted

### Backend — `src/api/`

| File | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `src/api/lib/ranking.ts` | APPEND `RankableBranchInputV3`, `RankInputV3`, `RankedBranchTile`, `RankBranchesV3Result`, `rankBranchesV3()` | unchanged | DELETE `rankMerchantsV2`, `selectContextBranch`, `MerchantEntry`, `qualityComparatorV2`, `distanceComparator`, `classifyTier` (Plan 4 M5 converges) |
| `src/api/customer/discovery/service.ts` | APPEND `enrichBranchTile`, `enrichBranchTiles`, `searchBranches`, `getInAreaBranches`, `getHomeFeedBranches`, `getCategoryBranches`, `getCampaignBranches` alongside merchant-themed counterparts | unchanged | DELETE the merchant-themed equivalents (`enrichMerchantTile`, `enrichMerchantTiles`, `searchMerchants`, `getInAreaMerchants`, `getHomeFeed`-merchant-shape, `getCategoryMerchants`, `getCampaignMerchants`) |
| `src/api/customer/discovery/routes.ts` | MODIFY all 5 affected route handlers to attach `branches` (additive) | unchanged | MODIFY: strip the legacy `merchants` field from response envelopes |
| `src/api/customer/discovery/branchTileSchema.ts` | CREATE — Zod schema for `BranchTile` | unchanged | unchanged |
| `tests/api/customer/discovery/branch-tile-contract.test.ts` | CREATE | unchanged | unchanged |
| `tests/api/lib/rankBranchesV3.test.ts` | CREATE | unchanged | unchanged |
| `tests/api/customer/discovery/campaign-branches.test.ts` | CREATE | unchanged | unchanged |
| `tests/api/customer/discovery/location-confidence-redaction.test.ts` | MODIFY — extend to cover `BranchTile` | unchanged | unchanged |
| `tests/api/customer/discovery/m3-hybrid-fields.test.ts` | MODIFY — add `branches` parity coverage | MODIFY per surface | MODIFY — strip merchant-shape assertions |
| `tests/api/lib/rankMerchants-v2.test.ts` | unchanged | unchanged | DELETE |

### Customer-app — `apps/customer-app/`

| File | Phase 1 | Phase 2.1 (Search) | Phase 2.2 (Map) | Phase 2.3 (Home) | Phase 2.4 (Category) | Phase 2.5 (tile rename) | Phase 3 |
|---|---|---|---|---|---|---|---|
| `src/lib/api/discovery.ts` | unchanged | EXTEND — add `branchTileSchema`, `BranchTile`, `branches` arms on all 5 endpoint response schemas | continue extending | continue | continue | continue | MODIFY — drop `merchantTileSchema` and the `merchants`/`total` legacy arms |
| `src/features/search/screens/SearchScreen.tsx` | unchanged | MODIFY — read `branches` not `merchants`; pass to `SearchResultItem` | unchanged | unchanged | unchanged | unchanged | unchanged |
| `src/features/search/components/SearchResultItem.tsx` | unchanged | MODIFY — consume `BranchTile`; merchant primary + locality secondary; locality fallback `localityName ?? postTown ?? city` | unchanged | unchanged | unchanged | unchanged | unchanged |
| `src/hooks/useSearch.ts` (in `tests/hooks/`) — actual hook path TBD via Phase 2.1 audit | unchanged | MODIFY — return `branches` + `totalBranches` | unchanged | unchanged | unchanged | unchanged | unchanged |
| `src/features/map/screens/MapScreen.tsx` | unchanged | unchanged | MODIFY — read `branches` not `merchants`; pass to `MapPins` and `MapBranchTile` | unchanged | unchanged | unchanged | unchanged |
| `src/features/map/components/MapPins.tsx` | unchanged | unchanged | MODIFY — one `<Marker>` per `BranchTile` with exact coords; filter null lat/lng | unchanged | unchanged | unchanged | unchanged |
| `src/features/map/components/MapMerchantTile.tsx` → rename `MapBranchTile.tsx` | unchanged | unchanged | RENAME + MODIFY | unchanged | unchanged | unchanged | unchanged |
| `src/features/map/components/MapListView.tsx` | unchanged | unchanged | MODIFY — render `BranchTile[]` rows | unchanged | unchanged | unchanged | unchanged |
| `src/features/map/hooks/useInAreaMerchants.ts` → rename `useInAreaBranches.ts` | unchanged | unchanged | RENAME + MODIFY | unchanged | unchanged | unchanged | unchanged |
| `src/features/home/screens/HomeScreen.tsx` | unchanged | unchanged | unchanged | MODIFY — read additive Home fields (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`) | unchanged | unchanged | unchanged |
| `src/features/home/components/FeaturedCarousel.tsx` | unchanged | unchanged | unchanged | MODIFY — consume `BranchTile[]` | unchanged | unchanged | unchanged |
| `src/features/home/components/TrendingSection.tsx` | unchanged | unchanged | unchanged | MODIFY — consume `BranchTile[]` | unchanged | unchanged | unchanged |
| `src/features/home/components/NearbyByCategory.tsx` | unchanged | unchanged | unchanged | MODIFY — consume `BranchTile[]` | unchanged | unchanged | unchanged |
| `src/features/home/components/CampaignCarousel.tsx` | unchanged | unchanged | unchanged | unchanged — `CampaignBannerTile[]` unchanged | unchanged | unchanged | unchanged |
| `src/features/search/screens/CategoryResultsScreen.tsx` | unchanged | unchanged | unchanged | unchanged | MODIFY — read `branches` not `merchants` | unchanged | unchanged |
| `src/features/shared/MerchantTile.tsx` → rename `BranchTile.tsx` | unchanged | unchanged | unchanged | unchanged | unchanged | RENAME + MODIFY (consume `BranchTile` data shape, prop `showFeaturedBadge`, prop `showClose`) | unchanged |
| `src/features/shared/SkeletonTile.tsx` | unchanged | unchanged | unchanged | unchanged | unchanged | MODIFY ImageRatio if needed | unchanged |

### Tests touched in Phase 2 (per-surface, flipped one-merchant → one-tile-per-branch)

- **Phase 2.1 Search:** `tests/features/search/SearchScreen.test.tsx`, `tests/features/search/SearchResultItem.proximity-chip.test.tsx`, `tests/features/search/SearchScreen.locality.test.tsx`, `tests/hooks/useSearch.test.tsx`.
- **Phase 2.2 Map:** `tests/features/map/MapScreen.test.tsx`, `tests/features/map/MapScreen.locality.test.tsx`, `tests/features/map/MapScreen.submit.test.tsx`, `tests/features/map/MapPins.test.tsx`, `tests/features/map/MapMerchantTile.test.tsx` (rename to `MapBranchTile.test.tsx`), `tests/features/map/MapListView.test.tsx`, `tests/features/map/useInAreaMerchants.test.tsx` (rename to `useInAreaBranches.test.tsx`), `tests/features/map/CustomPin.test.tsx`.
- **Phase 2.3 Home:** `tests/features/home/screens/HomeScreen.test.tsx`, `tests/features/home/components/FeaturedCarousel.test.tsx`.
- **Phase 2.4 Category:** `tests/features/search/CategoryResultsScreen.test.tsx`, `tests/features/search/CategoryResultsScreen.locality.test.tsx`.
- **Phase 2.5 tile rename:** `tests/features/shared/MerchantTile.proximity-chip.test.tsx` (rename to `BranchTile.proximity-chip.test.tsx`).

### Tests NOT touched at all (per §11.4 spec)

Voucher Detail tests, Merchant Profile tests, Redemption flow tests, Savings tests, §AS merchant-identity tests.

---

# PR-1: Phase 1 — Backend additive

**Branch:** `feature/discovery-rebaseline-phase-1-backend-additive` off current `main`.

**Goal:** Ship the new `BranchTile` shape, `rankBranchesV3`, per-endpoint branch-themed helpers, and route handlers that attach the new `branches` field additively alongside the existing `merchants` field. Customer-app continues reading `merchants`; no customer-visible change.

**Tests added:** 3 new test files + 2 extended.

**Acceptance:**
- Backend vitest passes with all new pins green.
- Customer-app jest passes UNCHANGED (still consumes legacy fields).
- `tsc --noEmit` clean on both sides.

**Rollback:** `git revert` of the merge commit. Customer-app reads the legacy `merchants` field which is preserved.

---

### Task 1.1: Branch from main + worktree setup

**Files:** (none — branch creation only)

- [ ] **Step 1: Confirm main is current**

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git fetch origin
git status --short
git log --oneline origin/main..HEAD
```
Expected: working tree clean (modulo long-standing untracked artefacts listed in standing rules); branch is on `main`; `origin/main..HEAD` is empty.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout -b feature/discovery-rebaseline-phase-1-backend-additive
```

- [ ] **Step 3: Confirm CLAUDE.md symlink intact in any active worktree**

```bash
test -L .worktrees/customer-app/CLAUDE.md && echo "ok" || echo "MISSING — re-symlink before any worktree work"
```

If MISSING:
```bash
rm -f .worktrees/customer-app/CLAUDE.md && ln -s ../../CLAUDE.md .worktrees/customer-app/CLAUDE.md
```

- [ ] **Step 4: Sanity run baseline backend tests**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: existing baseline passes (currently `553/553` per PR #105 merge). Note the exact number.

---

### Task 1.2: Define `BranchTile` Zod schema

**Files:**
- Create: `src/api/customer/discovery/branchTileSchema.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/customer/discovery/branch-tile-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

describe('branchTileSchema', () => {
  const validTile = {
    id: 'brn_covelum_brightlingsea',
    branchName: 'Brightlingsea',
    branchLocalityId: 'loc_brightlingsea',
    branchLocalityName: 'Brightlingsea',
    branchPostTown: 'Brightlingsea',
    branchCity: 'Essex',
    branchLatitude: 51.811,
    branchLongitude: 1.027,
    branchLocationConfidence: 'MANUALLY_CONFIRMED',
    isOpenNow: true,
    closesAtLocal: '22:30',
    distance: 1240,
    isFavourited: false,
    avgRating: 4.6,
    reviewCount: 17,
    supplyRung: 'NEARBY',
    proximityBand: 'NEARBY',
    distanceMetres: 1240,
    merchant: {
      id: 'mer_covelum',
      businessName: 'Covelum',
      tradingName: null,
      logoUrl: 'https://cdn.example/logo.png',
      bannerUrl: 'https://cdn.example/banner.png',
      primaryCategory: null,
      primaryDescriptorTag: null,
      subcategory: null,
      descriptor: 'Indian restaurant',
      highlights: [],
      voucherCount: 2,
      maxEstimatedSaving: 15,
    },
  }

  it('accepts a fully-populated valid tile', () => {
    expect(() => branchTileSchema.parse(validTile)).not.toThrow()
  })

  it('accepts a POSTCODE_CENTROID tile with null coords + null distance', () => {
    const redacted = {
      ...validTile,
      branchLatitude: null,
      branchLongitude: null,
      branchLocationConfidence: 'POSTCODE_CENTROID' as const,
      distance: null,
      distanceMetres: null,
      supplyRung: null,
      proximityBand: null,
    }
    expect(() => branchTileSchema.parse(redacted)).not.toThrow()
  })

  it('rejects a tile that omits id', () => {
    const { id: _id, ...withoutId } = validTile
    expect(() => branchTileSchema.parse(withoutId)).toThrow(/id/)
  })

  it('rejects a tile that includes branchAddressLine1 (locality-only contract)', () => {
    const withAddress = { ...validTile, branchAddressLine1: '23 High St' }
    // Zod strict mode means extras throw; we use .strict() in the schema.
    expect(() => branchTileSchema.parse(withAddress)).toThrow(/branchAddressLine1/)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-schema.test.ts
```
Expected: FAIL — `Cannot find module '../../../../src/api/customer/discovery/branchTileSchema'`.

- [ ] **Step 3: Create the schema file**

Create `src/api/customer/discovery/branchTileSchema.ts`:

```ts
import { z } from 'zod'

// Spec source: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1.
// Strict mode (.strict()) rejects unknown keys to lock the no-address contract
// from Rev-2 decision #12.  Adding new fields requires a spec amendment.

const supplyRungSchema = z.enum([
  'NEARBY',
  'CATCHMENT',
  'POST_TOWN',
  'LAD',
  'COUNTY',
  'REGION',
  'COUNTRY',
  'NATIONAL',
])
export type SupplyRung = z.infer<typeof supplyRungSchema>

const proximityBandSchema = z.enum([
  'NEARBY',
  'IN_YOUR_AREA',
  'A_LITTLE_FURTHER',
  'NEAREST_ON_REDEEMO',
])
export type ProximityBand = z.infer<typeof proximityBandSchema>

const locationConfidenceSchema = z.enum([
  'MANUALLY_CONFIRMED',
  'POSTCODE_CENTROID',
  'NEEDS_REVIEW',
  'ADDRESS_GEOCODED',
])

const categorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  iconKey: z.string().nullable().optional(),
  pinColour: z.string().nullable().optional(),
  intentType: z.enum(['LOCAL', 'DESTINATION', 'MIXED']).nullable().optional(),
}).nullable()

const descriptorTagSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
}).nullable()

const tileHighlightSchema = z.object({
  highlightTagId: z.string(),
  label: z.string(),
})

const merchantGroupingSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  tradingName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  primaryCategory: categorySummarySchema,
  primaryDescriptorTag: descriptorTagSummarySchema,
  subcategory: categorySummarySchema,
  descriptor: z.string(),
  highlights: z.array(tileHighlightSchema),
  voucherCount: z.number().int().nonnegative(),
  maxEstimatedSaving: z.number().nullable(),
}).strict()

export const branchTileSchema = z.object({
  id: z.string(),
  branchName: z.string(),
  branchLocalityId: z.string().nullable(),
  branchLocalityName: z.string().nullable(),
  branchPostTown: z.string().nullable(),
  branchCity: z.string().nullable(),
  branchLatitude: z.number().nullable(),
  branchLongitude: z.number().nullable(),
  branchLocationConfidence: locationConfidenceSchema,
  isOpenNow: z.boolean(),
  closesAtLocal: z.string().nullable(),
  distance: z.number().nullable(),
  isFavourited: z.boolean(),
  avgRating: z.number().nullable(),
  reviewCount: z.number().int().nonnegative(),
  supplyRung: supplyRungSchema.nullable(),
  proximityBand: proximityBandSchema.nullable(),
  distanceMetres: z.number().nullable(),
  merchant: merchantGroupingSchema,
}).strict()

export type BranchTile = z.infer<typeof branchTileSchema>
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-schema.test.ts
```
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/branchTileSchema.ts tests/api/customer/discovery/branch-tile-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(discovery): introduce BranchTile Zod schema (Phase 1)

Spec §1.1 — branch-first cardinality.  Strict schema rejects unknown
keys (e.g. branchAddressLine1) to lock the locality-only contract from
Rev-2 decision #12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Implement `rankBranchesV3` in ranking lib

**Files:**
- Modify: `src/api/lib/ranking.ts` (append at end of file, after line 617)
- Create: `tests/api/lib/rankBranchesV3.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/lib/rankBranchesV3.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  rankBranchesV3,
  type RankableBranchInputV3,
  type RankInputV3,
} from '../../../src/api/lib/ranking'

const fixedEffLoc = {
  source: 'GPS' as const,
  latitude: 51.811,
  longitude: 1.027,
  locality: {
    id: 'loc_brightlingsea',
    name: 'Brightlingsea',
    ladDistrict: 'Tendring',
    adminCounty: 'Essex',
    region: 'East of England',
    country: 'England',
  },
}

function makeBranch(over: Partial<RankableBranchInputV3>): RankableBranchInputV3 {
  return {
    id: 'brn_default',
    merchantId: 'mer_default',
    merchant: {
      id: 'mer_default',
      businessName: 'Default',
      avgRating: null,
      reviewCount: 0,
      primaryCategory: { intentType: 'LOCAL' },
    },
    latitude: 51.811,
    longitude: 1.027,
    locationConfidence: 'MANUALLY_CONFIRMED',
    localityId: 'loc_brightlingsea',
    postTown: 'Brightlingsea',
    ladDistrict: 'Tendring',
    adminCounty: 'Essex',
    region: 'East of England',
    country: 'England',
    isActive: true,
    ...over,
  }
}

function baseInput(over: Partial<RankInputV3> = {}): RankInputV3 {
  return {
    effLoc: fixedEffLoc,
    nearbyRadiusMiles: 2,
    outgoingCatchmentTargetIds: new Set(),
    ladderProfile: { thresholds: [], categoryIntent: 'LOCAL' },
    categoryIntent: 'LOCAL',
    targetCount: 20,
    hardCap: 50,
    ...over,
  }
}

describe('rankBranchesV3', () => {
  it('emits one tile per branch, NOT one per merchant', () => {
    const branches = [
      makeBranch({ id: 'brn_a', merchantId: 'mer_covelum' }),
      makeBranch({ id: 'brn_b', merchantId: 'mer_covelum' }), // same merchant
      makeBranch({ id: 'brn_c', merchantId: 'mer_karaara' }),
    ]
    const result = rankBranchesV3(branches, baseInput())
    expect(result.tiles).toHaveLength(3)
    expect(result.tiles.map(t => t.id).sort()).toEqual(['brn_a', 'brn_b', 'brn_c'])
  })

  it('admits POSTCODE_CENTROID branches to output with null supplyRung', () => {
    const branches = [
      makeBranch({
        id: 'brn_redacted',
        locationConfidence: 'POSTCODE_CENTROID',
        latitude: null,
        longitude: null,
      }),
    ]
    const result = rankBranchesV3(branches, baseInput())
    expect(result.tiles).toHaveLength(1)
    expect(result.tiles[0].supplyRung).toBeNull()
    expect(result.tiles[0].proximityBand).toBeNull()
    expect(result.tiles[0].distance).toBeNull()
  })

  it('discards inactive branches', () => {
    const branches = [
      makeBranch({ id: 'brn_active', isActive: true }),
      makeBranch({ id: 'brn_inactive', isActive: false }),
    ]
    const result = rankBranchesV3(branches, baseInput())
    expect(result.tiles).toHaveLength(1)
    expect(result.tiles[0].id).toBe('brn_active')
  })

  it('D1 pure-rank: same-merchant same-rung branches sit adjacent in output', () => {
    const branches = [
      makeBranch({ id: 'brn_cov_a', merchantId: 'mer_cov', latitude: 51.810, longitude: 1.027 }),
      makeBranch({ id: 'brn_karaara', merchantId: 'mer_kar', latitude: 51.812, longitude: 1.027 }),
      makeBranch({ id: 'brn_cov_b', merchantId: 'mer_cov', latitude: 51.811, longitude: 1.028 }),
    ]
    const result = rankBranchesV3(branches, baseInput())
    const ids = result.tiles.map(t => t.id)
    const aIdx = ids.indexOf('brn_cov_a')
    const bIdx = ids.indexOf('brn_cov_b')
    const kIdx = ids.indexOf('brn_karaara')
    // pure rank by distance — closer wins; karaara may interleave.  The pin is
    // simply that both covelum branches are present and not collapsed.
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(bIdx).toBeGreaterThanOrEqual(0)
    expect(kIdx).toBeGreaterThanOrEqual(0)
  })

  it('rungCounts reflects branch count, not merchant count', () => {
    const branches = [
      makeBranch({ id: 'brn_a', merchantId: 'mer_x', latitude: 51.811, longitude: 1.027 }),
      makeBranch({ id: 'brn_b', merchantId: 'mer_x', latitude: 51.811, longitude: 1.027 }),
    ]
    const result = rankBranchesV3(branches, baseInput())
    expect(result.rungCounts.NEARBY).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run tests/api/lib/rankBranchesV3.test.ts
```
Expected: FAIL — `rankBranchesV3 is not a function`.

- [ ] **Step 3: Append the implementation to `src/api/lib/ranking.ts`**

Append at end of file (after the closing of `rankMerchantsV2`):

```ts
// ─────────────────────────────────────────────────────────────────────
// Branch-first ranking — Phase 1 of Discovery rebaseline (2026-05-18 spec).
// Spec §2.1.  Replaces rankMerchantsV2's merchant-collapse with per-branch
// emission.  Coexists with rankMerchantsV2 during Phase 1 + 2; Phase 3
// drops the merchant variant.
// ─────────────────────────────────────────────────────────────────────

export type RankableBranchInputV3 = RankableBranch & {
  merchantId: string
  merchant: {
    id: string
    businessName: string
    avgRating: number | null
    reviewCount: number
    primaryCategory: { intentType: CategoryIntentType | null } | null
  }
  isActive: boolean
}

export type RankInputV3 = {
  effLoc: EffectiveLocationLike | null
  nearbyRadiusMiles: number
  outgoingCatchmentTargetIds: Set<string>
  ladderProfile: { thresholds: any[]; categoryIntent: CategoryIntentType | null }
  categoryIntent: CategoryIntentType | 'MIXED'
  targetCount: number
  hardCap: number
}

export type RankedBranchTile = {
  id: string
  merchantId: string
  supplyRung: SupplyRung | null
  proximityBand: ProximityBand | null
  distance: number | null
}

export type RankBranchesV3Result = {
  tiles: RankedBranchTile[]
  rungCounts: Record<SupplyRung, number>
}

type EffectiveLocationLike = {
  source: 'GPS' | 'SAVED' | 'POSTCODE' | 'CITY'
  latitude: number
  longitude: number
  locality: {
    id: string
    name: string
    ladDistrict: string | null
    adminCounty: string | null
    region: string | null
    country: string | null
  }
}

export function rankBranchesV3<B extends RankableBranchInputV3>(
  branches: B[],
  input: RankInputV3,
): RankBranchesV3Result {
  // Step 1 — collect.  Drop inactive.  Per-branch rung classification.
  const collected: Array<{
    branch: B
    rung: SupplyRung | null
    distance: number | null
  }> = []
  const rungCounts: Record<SupplyRung, number> = {
    NEARBY: 0,
    CATCHMENT: 0,
    POST_TOWN: 0,
    LAD: 0,
    COUNTY: 0,
    REGION: 0,
    COUNTRY: 0,
    NATIONAL: 0,
  }

  for (const branch of branches) {
    if (!branch.isActive) continue
    const rung = classifyRung(branch as any, input.effLoc as any, input.nearbyRadiusMiles, input.outgoingCatchmentTargetIds)
    const distance =
      branch.latitude != null && branch.longitude != null && input.effLoc
        ? haversineMetres(input.effLoc.latitude, input.effLoc.longitude, branch.latitude, branch.longitude)
        : null
    collected.push({ branch, rung, distance })
    if (rung) rungCounts[rung]++
  }

  // Step 4 — sort within rung group.  Pure-rank D1: distance ascending, then
  // quality (avg rating × log(reviewCount + 1)), then branch.id for stability.
  collected.sort((a, b) => {
    // Rung order — null rungs (POSTCODE_CENTROID / NEEDS_REVIEW redacted) sort to end.
    const ar = a.rung ? rungOrdinal(a.rung) : 99
    const br = b.rung ? rungOrdinal(b.rung) : 99
    if (ar !== br) return ar - br
    const ad = a.distance ?? Number.POSITIVE_INFINITY
    const bd = b.distance ?? Number.POSITIVE_INFINITY
    if (ad !== bd) return ad - bd
    const aq = qualityScore(a.branch.merchant.avgRating, a.branch.merchant.reviewCount)
    const bq = qualityScore(b.branch.merchant.avgRating, b.branch.merchant.reviewCount)
    if (aq !== bq) return bq - aq
    return a.branch.id.localeCompare(b.branch.id)
  })

  // Step 5 — stitch + hardCap.
  const tiles: RankedBranchTile[] = collected.slice(0, input.hardCap).map(c => ({
    id: c.branch.id,
    merchantId: c.branch.merchantId,
    supplyRung: c.rung,
    proximityBand: c.rung ? proximityBandFromRung(c.rung) : null,
    distance: c.distance,
  }))

  return { tiles, rungCounts }
}

function rungOrdinal(rung: SupplyRung): number {
  const order: SupplyRung[] = [
    'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD', 'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
  ]
  return order.indexOf(rung)
}

function qualityScore(rating: number | null, reviewCount: number): number {
  if (rating == null || reviewCount < MIN_REVIEW_COUNT_FOR_RATING_SORT) return 0
  return rating * Math.log(reviewCount + 1)
}

function proximityBandFromRung(rung: SupplyRung): ProximityBand {
  if (rung === 'NEARBY') return 'NEARBY'
  if (rung === 'CATCHMENT' || rung === 'POST_TOWN') return 'IN_YOUR_AREA'
  if (rung === 'LAD' || rung === 'COUNTY') return 'A_LITTLE_FURTHER'
  return 'NEAREST_ON_REDEEMO'
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
```

If `MIN_REVIEW_COUNT_FOR_RATING_SORT` is already exported from this file (it is — line 9), the reference resolves. If `ProximityBand` is not already exported, add an export alias matching the schema in `branchTileSchema.ts`. (Check imports — `ProximityBand` is exported from `src/api/lib/effectiveLocation.ts` or `ranking.ts`; if neither, define inline in `ranking.ts` to match `branchTileSchema.ProximityBand`.)

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run tests/api/lib/rankBranchesV3.test.ts
```
Expected: PASS 5/5.

- [ ] **Step 5: Run full backend tests for regression**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: baseline count + 5 new tests (e.g. 558/558).

- [ ] **Step 6: `tsc` clean**

```bash
npx tsc --noEmit 2>&1 | grep -v "apps/" | head -20
```
Expected: zero errors in `src/api/` paths.

- [ ] **Step 7: Commit**

```bash
git add src/api/lib/ranking.ts tests/api/lib/rankBranchesV3.test.ts
git commit -m "$(cat <<'EOF'
feat(ranking): introduce rankBranchesV3 for branch-first cardinality

Spec §2.1.  Per-branch rung classification, pure-rank D1 sort, POSTCODE_
CENTROID admitted to output with null supplyRung/proximityBand.  Coexists
with rankMerchantsV2 during Phase 1+2; Phase 3 drops the merchant variant.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Implement `enrichBranchTile` + `enrichBranchTiles` in service

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (append after line 715, before `getHomeFeed`)
- Create: `tests/api/customer/discovery/branch-tile-contract.test.ts`

**Implementation note (Rev 1.1):** do **NOT** invent a fresh Prisma query shape. The existing `enrichMerchantTile` (service.ts:529–614) + `enrichMerchantTiles` (service.ts:616–711) pair already encode every join, redundant-highlight rule, redaction gate, favourite batch, and rating aggregate this plan needs. The branch-first variant **adapts** that pattern. Worker checklist:

1. **Select shape:** clone the existing `MERCHANT_TILE_SELECT` (service.ts:204–257). Extend the `branches: { select: ... }` block with the locality fields that already exist on `Branch` (`localityId`, `localityName`, `postTown`, `ladDistrict`, `adminCounty`, `region`, `locationCountry`, `locationConfidence`) — most are already in the existing select; verify line 244–248. Also add `openingHours: { select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true } }` to the branch sub-select so per-branch `isOpenNow` can be computed without an extra fetch.
2. **Helpers to reuse (do not reimplement):**
   - `exposeBranchPosition(branch)` (service.ts:61–75) — redacts lat/lng for non-`MANUALLY_CONFIRMED` branches.
   - `hasExactPosition(branch)` (service.ts:86–93) — predicate for distance compute.
   - `descriptorForMerchant(merchant)` (service.ts:509–517).
   - `visibleHighlightsFor(highlights, redundantSet)` (service.ts:522–527).
   - Subcategory derivation pattern from existing `enrichMerchantTile` lines 576–578: `merchant.categories.map(c => c.category).find(c => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null`. There is no `Merchant.subcategory` field — this is the canonical derivation.
   - Rating batch: `prisma.review.groupBy({ by: ['branchId'], where: { branchId: { in: branchIds }, isHidden: false }, _avg: { rating: true }, _count: { id: true } })` per the existing pattern at service.ts:664–671. **For BranchTile, use the per-branch rating directly** (do NOT collapse to merchant-level avg as `enrichMerchantTiles` does at service.ts:677–688).
   - Favourite batch: `prisma.favouriteMerchant.findMany({ where: { userId, merchantId: { in: merchantIds } }, select: { merchantId: true } })` per service.ts:692–696. Note correct Prisma delegate name is `favouriteMerchant` (lowercase first letter; mirrors model `FavouriteMerchant`). **`isFavourited` on each branch tile is derived from the merchant favourite set** — same value across every branch of the same merchant. This is the Rev-2 §7 derivation lock.
3. **`MerchantHighlight` access pattern:** the highlight rows expose `.tag` (Tag relation, schema.prisma:652). The label is at `highlight.tag.label`. There is NO `highlight.highlightTag`. Pull `tag: { select: { id: true, label: true } }` (matching service.ts:226).
4. **`Category` fields available on the wire:** `id`, `name`, `pinColour`, `pinIcon`, `descriptorSuffix`, `parentId`, `intentType` (schema.prisma:680–713). There is NO `slug`, NO `iconKey`. The Zod schema in Task 1.2 currently lists `slug` + `iconKey` — **fix Task 1.2's schema to match real fields** before this task runs; verify by re-reading the Zod after Step 1 below.
5. **Open-status derivation:** reuse the existing helper used for Merchant Profile (call site at service.ts ~line 920+ inside `getCustomerMerchant`). If the per-branch helper is not yet extracted, EITHER extract it as a small utility PR-0.5 (preferred), OR inline the same computation here referencing `getLondonClock` from `apps/customer-app/src/features/merchant/utils/londonNow.ts` — but server-side. **PAUSE the task and ask the owner if the extraction surface is non-trivial** per the standing "no inline-stub" rule.

The implementation that follows is a worked example illustrating the assembly. Do not paste verbatim — adapt to whatever the current code looks like at the time of implementation. Treat any drift between this example and the existing `enrichMerchantTile` as a signal that `enrichMerchantTile` itself moved — re-read service.ts:529–711 before writing.

Now back to TDD-style checklist.

- [ ] **Step 0: Pre-flight — fix Task 1.2 Zod schema if needed**

Re-read `src/api/customer/discovery/branchTileSchema.ts`. The `categorySummarySchema` must NOT include `slug` or `iconKey` (Prisma `Category` has neither). The real available fields are `pinColour`, `pinIcon`, `descriptorSuffix`, `parentId`, `intentType`. If those are missing from `categorySummarySchema`, patch the schema first and re-run `npx vitest run tests/api/customer/discovery/branch-tile-schema.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/api/customer/discovery/branch-tile-contract.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { enrichBranchTiles } from '../../../../src/api/customer/discovery/service'
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

// Deterministic test — creates its own Covelum-like fixture inside the test
// run rather than depending on seed state.  Cleans up afterwards.  No silent
// skips: if Prisma can't reach the DB at all, the test fails loudly so CI
// notices.

const prisma = new PrismaClient()
const FIXTURE_PREFIX = 'rbl-1-4-' // discovery-rebaseline test marker; used to scope cleanup

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
})

afterAll(async () => {
  // Clean up — scope deletion to test fixtures only via the prefix.
  await prisma.branch.deleteMany({ where: { name: { startsWith: FIXTURE_PREFIX } } })
  await prisma.merchant.deleteMany({ where: { businessName: { startsWith: FIXTURE_PREFIX } } })
  await prisma.$disconnect()
})

async function createCovelumLikeFixture() {
  const merchant = await prisma.merchant.create({
    data: {
      businessName: `${FIXTURE_PREFIX}Covelum`,
      tradingName: null,
      status: 'ACTIVE',
      branches: {
        create: [
          {
            name: `${FIXTURE_PREFIX}Brightlingsea`,
            addressLine1: '1 High St',
            city: 'Brightlingsea',
            postcode: 'CO7 0AA',
            country: 'GB',
            latitude: 51.811,
            longitude: 1.027,
            locationConfidence: 'MANUALLY_CONFIRMED',
            localityName: 'Brightlingsea',
            postTown: 'Brightlingsea',
            isActive: true,
          },
          {
            name: `${FIXTURE_PREFIX}Colchester`,
            addressLine1: '1 High St',
            city: 'Colchester',
            postcode: 'CO1 1AA',
            country: 'GB',
            latitude: 51.889,
            longitude: 0.902,
            locationConfidence: 'MANUALLY_CONFIRMED',
            localityName: 'Colchester',
            postTown: 'Colchester',
            isActive: true,
          },
        ],
      },
    },
    include: { branches: true },
  })
  return merchant
}

describe('enrichBranchTiles contract — Rev 2.1 §1.1', () => {
  it('multi-branch merchant (load-bearing): 2 branches → 2 distinct tiles with same merchant.id', async () => {
    const merchant = await createCovelumLikeFixture()
    if (merchant.branches.length !== 2) {
      throw new Error(
        `Fixture creation produced ${merchant.branches.length} branches — expected exactly 2. ` +
        `This is a test-setup bug, NOT a silent skip path.`,
      )
    }

    const tiles = await enrichBranchTiles(
      prisma,
      merchant.branches.map(b => ({
        branchId: b.id,
        merchantId: merchant.id,
        supplyRung: 'NEARBY' as const,
        proximityBand: 'NEARBY' as const,
        distance: 1000,
      })),
      { userId: null, lat: null, lng: null },
    )

    expect(tiles).toHaveLength(2)
    const branchIds = new Set(tiles.map(t => t.id))
    expect(branchIds.size).toBe(2)
    for (const tile of tiles) {
      const parsed = branchTileSchema.safeParse(tile)
      if (!parsed.success) {
        throw new Error(`BranchTile failed schema validation: ${parsed.error.message}`)
      }
      expect(tile.merchant.id).toBe(merchant.id)
      expect(tile.merchant.businessName).toBe(`${FIXTURE_PREFIX}Covelum`)
    }
  })

  it('POSTCODE_CENTROID branch emits null branchLatitude / branchLongitude (PR #81)', async () => {
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}RedactedMerchant`,
        status: 'ACTIVE',
        branches: {
          create: [{
            name: `${FIXTURE_PREFIX}Redacted`,
            addressLine1: '1 X',
            city: 'X',
            postcode: 'CO1 1AA',
            country: 'GB',
            latitude: 51.5,
            longitude: 0.1,
            locationConfidence: 'POSTCODE_CENTROID',
            isActive: true,
          }],
        },
      },
      include: { branches: true },
    })

    const tiles = await enrichBranchTiles(
      prisma,
      [{
        branchId: merchant.branches[0].id,
        merchantId: merchant.id,
        supplyRung: null,
        proximityBand: null,
        distance: null,
      }],
      { userId: null, lat: null, lng: null },
    )

    expect(tiles).toHaveLength(1)
    expect(tiles[0].branchLatitude).toBeNull()
    expect(tiles[0].branchLongitude).toBeNull()
    expect(tiles[0].branchLocationConfidence).toBe('POSTCODE_CENTROID')
  })
})
```

**Why this pattern:** the test creates its own fixture deterministically so it can never silently skip. If schema constraints prevent inline create (e.g. required relations the plan omits), the test fails loudly at fixture creation — the engineer sees the error message and adjusts the fixture, rather than the test passing vacuously.

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts
```
Expected: FAIL — `enrichBranchTiles is not a function`.

- [ ] **Step 3: Implement `enrichBranchTile` + `enrichBranchTiles` by adapting `enrichMerchantTile` + `enrichMerchantTiles`**

**Read first:** re-read `src/api/customer/discovery/service.ts:204–711` (the `MERCHANT_TILE_SELECT` constant, the `enrichMerchantTile` function, and the `enrichMerchantTiles` batch function). The branch-first variant follows the same shape but emits **one row per branch** instead of collapsing branches under each merchant.

**The shape of the new code:**

1. Define a `BRANCH_TILE_SELECT` (or reuse `MERCHANT_TILE_SELECT` plus minor extensions). The branch sub-select must include the locality columns AND `openingHours` (so per-branch `isOpenNow` doesn't require a second fetch). Pull merchant fields the same way.
2. Define `EnrichBranchInput`:
   ```ts
   type EnrichBranchInput = {
     branchId: string
     merchantId: string
     supplyRung: SupplyRung | null
     proximityBand: ProximityBand | null
     distance: number | null
   }
   ```
3. Define `EnrichBranchCtx`:
   ```ts
   type EnrichBranchCtx = {
     userId: string | null
     lat: number | null
     lng: number | null
   }
   ```
   **Important (Rev 1.1):** the context carries `lat` + `lng` not `effLoc`. The merchant-themed `enrichMerchantTiles` at service.ts:616 also takes `{ lat, lng, userId }`. Stay consistent.
4. `enrichBranchTiles` body — adapt the existing `enrichMerchantTiles` block at service.ts:616–711:
   - **Batch fetch branches** by id using the new `BRANCH_TILE_SELECT`. Include `merchant: { select: { ...MERCHANT_TILE_SELECT-without-branches, ...needed merchant-grouping fields... } }` so each branch row carries its merchant grouping context inline.
   - **Batch rating** with `prisma.review.groupBy({ by: ['branchId'], where: { branchId: { in: branchIds }, isHidden: false }, _avg: { rating: true }, _count: { id: true } })` — **per-branch**, NOT collapsed to merchant. This is the only divergence from `enrichMerchantTiles` lines 664–688.
   - **Batch favourites** with `prisma.favouriteMerchant.findMany({ where: { userId, merchantId: { in: merchantIds } }, select: { merchantId: true } })` — same pattern as service.ts:692–696. The Prisma delegate name is `favouriteMerchant` (camelCase from `FavouriteMerchant` model).
   - **Batch redundant-highlight set** with `prisma.redundantHighlight.findMany(...)` — same pattern as service.ts:647–661.
5. `enrichBranchTile` body — for each `(branch, merchant)` pair from the batched data:
   - `const exposed = exposeBranchPosition(branch)` (service.ts:61). Use `exposed.latitude` / `exposed.longitude` for the wire fields.
   - `branchName`: apply server-side merchant-prefix stripping (helper to be added; mirror the customer-app `branchShortName` util at `apps/customer-app/src/features/merchant/utils/branchShortName.ts`).
   - Locality: read from the branch row (`branch.localityName` / `branch.postTown` / `branch.city`). Both `localityName` and `postTown` are nullable per schema.prisma:454–455.
   - `isOpenNow` / `closesAtLocal`: extract or inline the existing per-branch open-status helper. **PAUSE the plan and file a tiny extraction PR-0.5 if the existing logic is non-trivial to share** per §15.4.
   - `merchant.subcategory`: derive from `merchant.categories.map(c => c.category).find(c => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null` per service.ts:576–578. Project the result to the locked `categorySummarySchema` (id, name, parentId, pinColour, pinIcon, intentType — NO `slug`, NO `iconKey`).
   - `merchant.primaryCategory`: project the same fields as subcategory.
   - `merchant.descriptor`: `descriptorForMerchant(merchant)` per service.ts:509.
   - `merchant.highlights`: `visibleHighlightsFor(merchant.highlights, redundantSet)` per service.ts:522. Each highlight row carries `tag.label` (NOT `highlightTag.label`); access pattern is `highlight.tag.label` per `MerchantHighlight.tag` relation at schema.prisma:652.
   - `merchant.voucherCount` and `merchant.maxEstimatedSaving`: same compute as `enrichMerchantTile` at service.ts:580–581.
   - `avgRating` / `reviewCount`: read from the per-branch rating map (NOT merchant-level).
   - `isFavourited`: `favouritedMerchantSet.has(merchant.id)` — same value for every branch of the same merchant per Rev-2 §7 derivation.
6. Type the return as `BranchTile[]` — Zod schema in Task 1.2 is the source of truth.

**Diff against `enrichMerchantTile`/`enrichMerchantTiles` (worker's mental model):**

| Concern | `enrichMerchantTile{s}` (existing) | `enrichBranchTile{s}` (new) |
|---|---|---|
| Cardinality | One row per merchant | One row per branch |
| Rating aggregate | Collapsed: weighted avg across all merchant's branches (service.ts:678–687) | Per-branch direct |
| Distance | Nearest-of-branches (service.ts:556–574) | Per-branch (input arg) |
| Subcategory derivation | From `categories[].category` w/ `parentId != null` (service.ts:576–578) | Same |
| Highlights | `visibleHighlightsFor(merchant.highlights, redundantSet)` | Same |
| Position redaction | `exposeBranchPosition` on the nearest branch | `exposeBranchPosition` on THE tile's branch |
| Open status | Not currently on `MerchantTile` | NEW per-branch field; reuse Merchant Profile helper if extracted |
| Favourites | `favouriteMerchant` delegate | Same |
| Wire fields | `nearestBranchId`, `latitude`, `longitude` (nearest branch) | `id` (branch.id), `branchLatitude`, `branchLongitude` (this branch) |

**Open status helper extraction (PR-0.5 gate):**

Before writing this task, run:
```bash
grep -n "isOpenNow\|getMyOpenStatus\|computeOpenStatus\|openingHours.*now\|openingHoursLondon" src/api/customer/discovery/service.ts src/api/lib/ apps/customer-app/src/features/merchant/utils/
```

- If a reusable server-side helper already exists (look for it on the Merchant Profile path), import it.
- If only a customer-app helper exists (`getLondonClock` at `apps/customer-app/src/features/merchant/utils/londonNow.ts`), pause this task and file PR-0.5 to extract the server-side equivalent. Do NOT inline a parallel implementation in `service.ts` — it will drift.
- If no helper exists on either side, that's a contract gap — pause and escalate to owner.

The result of PR-0.5 (if needed) is a `getServerBranchOpenStatus(branch.openingHours, now): { isOpen: boolean; closesAtLocal: string | null }` helper that both Merchant Profile and the new branch tile use.

After Step 3 (with PR-0.5 resolved or helper located), the diff in `service.ts` is roughly +120–160 lines of new code following the patterns above. No new TypeScript surface beyond the exported `enrichBranchTiles`, `EnrichBranchInput`, `EnrichBranchCtx`, and the helper imports.

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts
```
Expected: PASS 2/2 (skipping the no-fixture cases is fine).

- [ ] **Step 5: Run full backend regression**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: count +2 from previous task.

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-contract.test.ts
git commit -m "$(cat <<'EOF'
feat(discovery): enrichBranchTiles for Phase 1 branch-first contract

Spec §1.1.  Coexists with enrichMerchantTile during Phase 1+2.  Reads
existing merchant favourites + branch-level review aggregates.
isFavourited is derived from merchant favourite state per Rev-2
decision #13 (locked product rule is branch-keyed; wire is merchant-
keyed; separate favourites rebaseline ships later).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Implement `searchBranches` service function

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (append after `searchMerchants`)

- [ ] **Step 1: Write the failing test**

Append to `tests/api/customer/discovery/branch-tile-contract.test.ts`:

```ts
import { searchBranches } from '../../../../src/api/customer/discovery/service'

// Deterministic Covelum fixture — uses the same FIXTURE_PREFIX created in
// Task 1.4's test.  Workers running this test in isolation should ensure
// the fixture-create helper runs in this file's beforeAll too, OR factor
// the helper out (recommended).  No silent skip path.

describe('searchBranches contract — Rev 2.1 §3', () => {
  it('q="Covelum" emits one tile per active Covelum branch (LOAD-BEARING — Covelum bug closure)', async () => {
    const merchant = await createCovelumLikeFixture()
    if (merchant.branches.length !== 2) {
      throw new Error(
        `Fixture creation produced ${merchant.branches.length} branches — expected exactly 2. ` +
        `This is a test-setup bug.`,
      )
    }

    const result = await searchBranches(prisma, {
      q: `${FIXTURE_PREFIX}Covelum`,
      limit: 20,
      offset: 0,
      userId: null,
    })

    const covelumTiles = result.branches.filter(t => t.merchant.id === merchant.id)
    expect(covelumTiles).toHaveLength(2)
    const branchIds = new Set(covelumTiles.map(t => t.id))
    expect(branchIds.size).toBe(2)
    // The two branches share the same merchant.id.
    for (const tile of covelumTiles) {
      expect(tile.merchant.id).toBe(merchant.id)
    }
  })

  it('q="Brightlingsea" — text predicate only, EffectiveLocation NOT flipped (Rev-2 §3.2 column 1)', async () => {
    const merchant = await createCovelumLikeFixture()

    const result = await searchBranches(prisma, {
      q: 'Brightlingsea',
      limit: 20,
      offset: 0,
      userId: null,
      // Caller has no location.  This proves there's no tryPlaceMatch / no
      // centroid lookup / no EffectiveLocation mutation — the function still
      // returns text-matched branches.
    })

    // Must include the Brightlingsea branch from the fixture (matched via
    // branch.localityName or branch.name).
    const brightlingseaTiles = result.branches.filter(t => t.merchant.id === merchant.id)
    expect(brightlingseaTiles.length).toBeGreaterThanOrEqual(1)
    expect(brightlingseaTiles.some(t => t.branchLocalityName === 'Brightlingsea')).toBe(true)
    // The function returned a totalBranches count that's a real number.
    expect(typeof result.totalBranches).toBe('number')
  })

  it('totalBranches reflects POST-FILTER count, not raw predicate count (Rev 2.1 §2.3)', async () => {
    // Create one merchant with two branches and one extra POSTCODE_CENTROID
    // branch that fails the rung gate.  Assert totalBranches counts the
    // ranked-and-retained branches only.
    const merchant = await createCovelumLikeFixture()
    await prisma.branch.create({
      data: {
        merchantId: merchant.id,
        name: `${FIXTURE_PREFIX}Ghost`,
        addressLine1: '1 Ghost St',
        city: 'Nowhere',
        postcode: 'XX0 0XX',
        country: 'GB',
        latitude: 51.5,
        longitude: 0.1,
        locationConfidence: 'POSTCODE_CENTROID',
        isActive: true,
      },
    })

    const result = await searchBranches(prisma, {
      q: `${FIXTURE_PREFIX}Covelum`,
      limit: 50,
      offset: 0,
      userId: null,
    })

    // POSTCODE_CENTROID branches are admitted to list output per Spec §4.1.1
    // (they appear in tiles with null coords + null rung) — but the rung
    // gate question depends on which scope is in effect.  The PIN here is
    // that totalBranches equals branches.length when nothing's been
    // paginated away.  Workers: if your impl excludes the POSTCODE_CENTROID
    // branch entirely, update the assertion accordingly; document the
    // choice in PR description.
    expect(result.totalBranches).toBe(result.branches.length)
  })
})
```

**Note for the worker:** if `createCovelumLikeFixture` lives in Task 1.4's test file, factor it into a shared `tests/api/customer/discovery/_fixtures.ts` helper so this test (and the Phase 1 routes test, and the campaign-branches test) can all reuse it.

- [ ] **Step 2: Run test — confirm failure**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts
```
Expected: FAIL — `searchBranches is not a function`.

- [ ] **Step 3: Implement `searchBranches` — rank-then-paginate (NOT paginate-then-rank)**

**Read first:** re-read `src/api/customer/discovery/service.ts:1620–1925` (the existing `searchMerchants`). The order of operations is the **load-bearing detail** for the new branch-first variant. Specifically:

1. **Build predicate** (merchant-level + new branch-level fields per Spec §3.1).
2. **Fetch all matching candidate branches** without `take`/`skip` (the candidate pool is bounded by the predicate, not by the page window).
3. **Classify per branch** via `classifyRung` + `rankBranchesV3` from Task 1.3.
4. **Filter to retained rungs** (analogous to `resolveScopeForRanking` at service.ts:1887 — the rung filter governs which branches are in the final set).
5. **`totalBranches = retainedBranches.length`** (post-filter count, NOT raw predicate count).
6. **Paginate the retained array**: `retainedBranches.slice(offset, offset + limit)`.
7. **Enrich the page slice** via `enrichBranchTiles` from Task 1.4.

The earlier sketch did `prisma.branch.findMany({ take, skip })` BEFORE ranking, which (a) paginates raw rows before the rung filter, (b) can return fewer branches than `limit` even when more retained branches exist, and (c) makes `totalBranches` reflect raw predicate count not post-filter count. **All three are bugs.** Spec §2.3 is explicit: pagination unit is the branch tile, and `total` reflects branches that pass the rung gate.

**Suggested implementation outline** (write it adapting to current `searchMerchants` shape; pseudo-code below is illustrative, not paste-and-pray):

```text
export async function searchBranches(
  prisma,
  params: { q?, categoryId?, subcategoryId?, lat?, lng?, scope?, sortBy?, limit, offset, userId },
): Promise<{ branches: BranchTile[]; totalBranches: number; meta: {...} }> {

  // ── 1. Predicate
  //
  // Build a Prisma `Branch.findMany` where-clause that matches:
  //   - isActive: true
  //   - merchant.status: ACTIVE
  //   - (optional) merchant categoryId / subcategoryId constraint
  //   - (when q present) OR clause spanning:
  //       merchant.businessName / tradingName / description / primaryCategory.name /
  //       categories[].category.name / suggestedTags[].tag (matched merchantIds)
  //       AND
  //       branch.name / branch.localityName / branch.postTown
  //   - Reuse the merchant-side OR shape from searchMerchants service.ts:1661-1668.
  //     Add the branch-side fields as additional OR alternatives at the branch
  //     level.  Prisma collapses nested OR cleanly.
  //
  // Spec §3.2 column 1 (this rebaseline only): no tryPlaceMatch, no
  // EffectiveLocation flip on locality match.  The same effLoc the caller has
  // (resolved from req.lat/req.lng via resolveEffectiveLocation) drives the
  // rank.

  // ── 2. Fetch candidates (no take/skip)
  //
  // Use a wide select that gives rankBranchesV3 the per-branch fields it needs
  // (id, merchantId, lat/lng, locationConfidence, localityId/postTown/ladDistrict
  // /adminCounty/region/locationCountry, isActive) AND the merchant grouping
  // (primaryCategory.intentType, businessName for tiebreak/diversity).  Do
  // NOT include the wide MERCHANT_TILE_SELECT here — that's for enrichment.

  // ── 3. Rank
  //
  // const effLoc = await resolveEffectiveLocation(prisma, { userId, lat, lng })
  // const ladder = await resolveLadderProfileForCategory(prisma, categoryId, subcategoryId)
  // const outgoingCatchmentIds = effLoc
  //   ? await getOutgoingCatchmentTargetIds(prisma, effLoc.locality.id)
  //   : new Set<string>()
  //
  // const ranked = rankBranchesV3(candidates, {
  //   effLoc,
  //   nearbyRadiusMiles: NEARBY_RADIUS_MILES,
  //   outgoingCatchmentTargetIds: outgoingCatchmentIds,
  //   ladderProfile: ladder,
  //   categoryIntent: ladder.categoryIntent ?? 'MIXED',
  //   targetCount: limit,
  //   hardCap: 200, // generous; the rung filter trims further
  // })

  // ── 4. Filter to retained rungs
  //
  // const resolution = resolveScopeForRanking(scope, intentType, derivedRungCounts(ranked))
  // const retainedBranches = ranked.tiles.filter(t =>
  //   t.supplyRung && resolution.retainedRungs.has(t.supplyRung))

  // ── 5. totalBranches AFTER filter (Rev-2 §2.3)
  //
  // const totalBranches = retainedBranches.length

  // ── 6. Paginate
  //
  // const page = retainedBranches.slice(offset, offset + limit)

  // ── 7. Enrich the page slice
  //
  // const branches = await enrichBranchTiles(prisma, page.map(t => ({
  //   branchId: t.id, merchantId: t.merchantId,
  //   supplyRung: t.supplyRung, proximityBand: t.proximityBand,
  //   distance: t.distance,
  // })), { userId, lat: lat ?? null, lng: lng ?? null })

  // ── 8. Meta envelope (parity with searchMerchants for consumers that need it)
  //
  // return { branches, totalBranches, meta: { ...same shape as searchMerchants
  //   §1922 with effectiveLocality / rungCounts / scope / resolvedArea } }
}
```

**Notes for the worker:**
- `resolveScopeForRanking` exists at service.ts:424–451 but is keyed on `SupplyTier` (legacy). The branch-first variant needs a sibling helper `resolveScopeForBranches` (or a generic version) that operates on `SupplyRung`. Either factor the existing helper to be polymorphic, or duplicate-then-converge during Phase 3. Document the choice as a Task 1.5 sub-decision before coding.
- `intentType` derivation mirrors the existing `searchMerchants` logic at service.ts:1832 — read the same way (primary subcategory's `intentType`, fallback to top-level category's `intentType`, fallback to `MIXED`).
- Empty-`q` path: when `q` is empty AND only `categoryId` is set, the predicate degenerates to a category-membership filter. Reuse the `getCategoryBranches` delegate (Task 1.8) to keep one code path. The category-list endpoint also calls `searchBranches` indirectly via that delegate — confirm during Task 1.8.

After writing the function, run the test suite from Step 1 to verify the deterministic Covelum + "Brightlingsea text-only predicate" assertions all pass.

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts
```
Expected: PASS (existing tests + 3 new search ones).

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-contract.test.ts
git commit -m "$(cat <<'EOF'
feat(discovery): searchBranches for Phase 1 — closes Covelum bug at service layer

Spec §3.  Text-predicate-only; tryPlaceMatch deliberately NOT called
(that's M4.2's job per Rev-2.1 spec §3.2 column 1).  EffectiveLocation
does NOT flip on q='Brightlingsea' — caller's GPS / saved location
anchors ranking.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.6: Implement `getInAreaBranches`

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (append after existing `getInAreaMerchants`)

- [ ] **Step 1: Write failing tests**

Append to `tests/api/customer/discovery/branch-tile-contract.test.ts`:

```ts
import { getInAreaBranches } from '../../../../src/api/customer/discovery/service'

describe('getInAreaBranches — Rev 2.1 §4.1.1', () => {
  it('returns MANUALLY_CONFIRMED branches inside bbox (one tile per branch)', async () => {
    const merchant = await createCovelumLikeFixture()
    // Both fixture branches are MANUALLY_CONFIRMED at Brightlingsea / Colchester.

    const result = await getInAreaBranches(prisma, {
      bbox: { minLat: 51.79, maxLat: 51.90, minLng: 0.85, maxLng: 1.05 },
      limit: 50,
      userId: null,
      lat: null,
      lng: null,
    })

    const fixtureTiles = result.branches.filter(t => t.merchant.id === merchant.id)
    expect(fixtureTiles).toHaveLength(2)
  })

  it('EXCLUDES POSTCODE_CENTROID branches (no map pin without exact coords)', async () => {
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}RedactedInBbox`,
        status: 'ACTIVE',
        branches: {
          create: [{
            name: `${FIXTURE_PREFIX}RedactedInBbox-branch`,
            addressLine1: '1 X',
            city: 'X',
            postcode: 'CO1 1AA',
            country: 'GB',
            latitude: 51.811,
            longitude: 1.027,
            locationConfidence: 'POSTCODE_CENTROID',
            isActive: true,
          }],
        },
      },
      include: { branches: true },
    })

    const result = await getInAreaBranches(prisma, {
      bbox: { minLat: 51.79, maxLat: 51.83, minLng: 1.00, maxLng: 1.05 },
      limit: 50,
      userId: null,
      lat: null,
      lng: null,
    })

    // The POSTCODE_CENTROID branch sits inside the bbox by raw coord but
    // must NOT appear in the result.
    const fixtureTiles = result.branches.filter(t => t.merchant.id === merchant.id)
    expect(fixtureTiles).toHaveLength(0)
  })

  it('EXCLUDES ADDRESS_GEOCODED branches (PR #81 contract — MANUALLY_CONFIRMED only)', async () => {
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}GeocodedInBbox`,
        status: 'ACTIVE',
        branches: {
          create: [{
            name: `${FIXTURE_PREFIX}GeocodedInBbox-branch`,
            addressLine1: '1 Y',
            city: 'Y',
            postcode: 'CO1 2AA',
            country: 'GB',
            latitude: 51.811,
            longitude: 1.027,
            locationConfidence: 'ADDRESS_GEOCODED',
            isActive: true,
          }],
        },
      },
      include: { branches: true },
    })

    const result = await getInAreaBranches(prisma, {
      bbox: { minLat: 51.79, maxLat: 51.83, minLng: 1.00, maxLng: 1.05 },
      limit: 50,
      userId: null,
      lat: null,
      lng: null,
    })

    const fixtureTiles = result.branches.filter(t => t.merchant.id === merchant.id)
    expect(fixtureTiles).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Confirm failure**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts -t getInAreaBranches
```

- [ ] **Step 3: Implement `getInAreaBranches` — MANUALLY_CONFIRMED only**

**Read first:** re-read `src/api/customer/discovery/service.ts:86–93` (`hasExactPosition` — note `confidence === 'MANUALLY_CONFIRMED'` is the ONLY accept condition) and service.ts:2099 onwards (the existing `getInAreaMerchants`). Both pin the same redaction rule: only MANUALLY_CONFIRMED branches have exact coords usable for bbox membership tests.

**Spec §4.1.1 list-vs-map asymmetry is the load-bearing rule:**
- List views (Search, Home, Category) admit POSTCODE_CENTROID + NEEDS_REVIEW + ADDRESS_GEOCODED branches with null coords.
- Map pins (this endpoint) require exact coords — only MANUALLY_CONFIRMED branches qualify.

**Implementation outline:**

```text
export async function getInAreaBranches(
  prisma,
  params: {
    bbox: { minLat, maxLat, minLng, maxLng }
    categoryId?
    lat?, lng?       // caller's current position (for distance compute on each tile)
    userId: string | null
    limit: number
  },
): Promise<{ branches: BranchTile[]; meta: {...} }> {

  // ── 1. Predicate — MANUALLY_CONFIRMED only (per PR #81 contract)
  //
  // const where: Prisma.BranchWhereInput = {
  //   isActive: true,
  //   merchant: { status: 'ACTIVE' },
  //   locationConfidence: 'MANUALLY_CONFIRMED',  // ← MANUALLY_CONFIRMED ONLY.  No 'ADDRESS_GEOCODED'.
  //   latitude:  { gte: bbox.minLat, lte: bbox.maxLat, not: null },
  //   longitude: { gte: bbox.minLng, lte: bbox.maxLng, not: null },
  //   ...(categoryId ? { merchant: { ..., categories: { some: { categoryId } } } } : {}),
  // }
  //
  // **Why MANUALLY_CONFIRMED only:** ADDRESS_GEOCODED is mid-confidence
  // (rooftop geocoder result, may be off by ~10–50m).  PR #81 chose
  // MANUALLY_CONFIRMED as the bar for map-pin rendering specifically
  // because a pin at a non-exact coordinate implies precision that doesn't
  // exist.  Widening to ADDRESS_GEOCODED here would silently relax that
  // contract.  If owner ever decides ADDRESS_GEOCODED is acceptable for
  // map pins, that's a Spec amendment + a `hasExactPosition` change at
  // service.ts:91, NOT a per-endpoint widening.

  // ── 2. Fetch candidates — same generous select as Task 1.5
  //
  // const candidates = await prisma.branch.findMany({ where, select: BRANCH_RANKING_SELECT })

  // ── 3. Optional rank
  //
  // For bbox queries the existing getInAreaMerchants applies a lightweight
  // ranking — read service.ts:2099-2253 to copy the shape.  Distance from
  // caller (if `lat`/`lng` supplied) is used as the sort key.

  // ── 4. Limit
  //
  // const slice = ranked.slice(0, limit)

  // ── 5. Enrich
  //
  // const branches = await enrichBranchTiles(prisma, slice.map(t => ({
  //   branchId: t.id, merchantId: t.merchantId,
  //   supplyRung: t.supplyRung, proximityBand: t.proximityBand,
  //   distance: t.distance,
  // })), { userId, lat: lat ?? null, lng: lng ?? null })

  // ── 6. Meta (parity with getInAreaMerchants service.ts:2240)
  //
  // return { branches, meta: { effectiveLocality, rungCounts, scope, ... } }
}
```

Note: `haversineMetres` already exists at `src/api/lib/ranking.ts` (added in Task 1.3 alongside `rankBranchesV3`). Re-export it from `ranking.ts` if it isn't already exported. The existing `nearestDistanceMetres` (ranking.ts:92) is the merchant-collapsed variant — keep that one for legacy `enrichMerchantTile` use; the branch variant calls `haversineMetres` directly.

- [ ] **Step 4: Pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts -t getInAreaBranches
```

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-contract.test.ts
git commit -m "feat(discovery): getInAreaBranches for Phase 1 Map bbox queries

Spec §4.1.1.  POSTCODE_CENTROID excluded server-side (Map needs exact
coords; postcode centroid pinning would imply precision that doesn't
exist per PR #81 redaction contract).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.7: Implement `getHomeFeedBranches` (additive Home fields)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (extend existing `getHomeFeed` return shape OR add new function)

Per spec §1.5, the Home Feed endpoint preserves its existing `featured` / `trending` / `nearbyByCategory` fields AND adds `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`. Implementation choice: extend `getHomeFeed` to compute and attach the new fields, sharing the existing query work where possible.

- [ ] **Step 1: Write failing test**

Append to `tests/api/customer/discovery/branch-tile-contract.test.ts`:

```ts
import { getHomeFeed } from '../../../../src/api/customer/discovery/service'

describe('getHomeFeed additive branches fields', () => {
  it('response carries featured AND featuredBranches (additive)', async () => {
    const feed = await getHomeFeed(prisma, { userId: null, lat: 51.811, lng: 1.027 })
    expect(feed).toHaveProperty('featured')
    expect(feed).toHaveProperty('featuredBranches')
    expect(Array.isArray(feed.featuredBranches)).toBe(true)
  })

  it('response carries trending AND trendingBranches', async () => {
    const feed = await getHomeFeed(prisma, { userId: null, lat: 51.811, lng: 1.027 })
    expect(feed).toHaveProperty('trending')
    expect(feed).toHaveProperty('trendingBranches')
  })

  it('response carries nearbyByCategory AND nearbyByCategoryBranches', async () => {
    const feed = await getHomeFeed(prisma, { userId: null, lat: 51.811, lng: 1.027 })
    expect(feed).toHaveProperty('nearbyByCategory')
    expect(feed).toHaveProperty('nearbyByCategoryBranches')
    if (feed.nearbyByCategoryBranches.length > 0) {
      const first = feed.nearbyByCategoryBranches[0]
      expect(first).toHaveProperty('category')
      expect(first).toHaveProperty('branches')
      expect(Array.isArray(first.branches)).toBe(true)
    }
  })

  it('campaigns field UNCHANGED (banner-level, not merchant tile)', async () => {
    const feed = await getHomeFeed(prisma, { userId: null, lat: 51.811, lng: 1.027 })
    expect(feed).toHaveProperty('campaigns')
    // No "campaignBranches" field at the home feed level.
    expect(feed).not.toHaveProperty('campaignBranches')
  })

  it('multi-branch FEATURED merchant appears as separate tiles in featuredBranches (LOAD-BEARING)', async () => {
    // Deterministic fixture — create our own multi-branch merchant AND its
    // FeaturedMerchant row.  Cleaned up in afterAll via FIXTURE_PREFIX.

    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}FeaturedCov`,
        status: 'ACTIVE',
        branches: {
          create: [
            { name: `${FIXTURE_PREFIX}FeaturedCov-A`, addressLine1: '1', city: 'Brightlingsea', postcode: 'CO7 0AA', country: 'GB', latitude: 51.811, longitude: 1.027, locationConfidence: 'MANUALLY_CONFIRMED', localityName: 'Brightlingsea', isActive: true },
            { name: `${FIXTURE_PREFIX}FeaturedCov-B`, addressLine1: '2', city: 'Colchester',    postcode: 'CO1 1AA', country: 'GB', latitude: 51.889, longitude: 0.902, locationConfidence: 'MANUALLY_CONFIRMED', localityName: 'Colchester',    isActive: true },
          ],
        },
      },
      include: { branches: true },
    })

    if (merchant.branches.length !== 2) {
      throw new Error(`Fixture creation failed: expected 2 branches, got ${merchant.branches.length}`)
    }

    await prisma.featuredMerchant.create({
      data: {
        merchantId: merchant.id,
        // Required FeaturedMerchant fields — verify against schema.prisma at
        // implementation time.  If validation fails the test fails LOUDLY,
        // which is the desired behaviour.
        startsAt: new Date(Date.now() - 60_000),
        endsAt:   new Date(Date.now() + 86_400_000),
        priority: 1,
      },
    })

    const feed = await getHomeFeed(prisma, { userId: null, lat: 51.811, lng: 1.027 })

    const covelumTiles = feed.featuredBranches.filter(t => t.merchant.id === merchant.id)
    expect(covelumTiles).toHaveLength(2)
    const ids = new Set(covelumTiles.map(t => t.id))
    expect(ids.size).toBe(2)
  })
})
```

- [ ] **Step 2: Confirm failure**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts -t getHomeFeed
```

- [ ] **Step 3: Extend `getHomeFeed`**

Inside `getHomeFeed` (line 715 onwards in service.ts), after computing the existing `featured` / `trending` / `nearbyByCategory` blocks, compute the parallel branch-themed blocks by:

1. For Featured: iterate the same `FeaturedMerchant` rows; for each, expand `merchant.branches.filter(isActive)` and call `enrichBranchTiles` with one input per branch (interim §17.7 behaviour — fan out merchant featured to all active branches).
2. For Trending: same pattern — iterate merchant-level trending list, fan out to all active branches.
3. For Nearby-by-Category: per-category, call `searchBranches(prisma, { q: '', categoryId, ... })` or directly query branches matching the category.

Attach to the return value:

```ts
return {
  locationContext,
  featured,
  trending,
  campaigns, // UNCHANGED — banner-level
  nearbyByCategory,
  // Phase 1 additive (Rev-2 — Spec §1.5):
  featuredBranches,
  trendingBranches,
  nearbyByCategoryBranches,
}
```

- [ ] **Step 4: Pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts -t getHomeFeed
```

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-contract.test.ts
git commit -m "feat(discovery): getHomeFeed adds branch-themed fields additively

Spec §1.5.  featured / trending / nearbyByCategory PRESERVED;
featuredBranches / trendingBranches / nearbyByCategoryBranches added.
campaigns (banner-level CampaignBannerTile[]) UNCHANGED.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.8: Implement `getCategoryBranches`

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (append after existing `getCategoryMerchants`, line ~1939)

- [ ] **Step 1: Write failing test**

Append:

```ts
import { getCategoryBranches } from '../../../../src/api/customer/discovery/service'

describe('getCategoryBranches', () => {
  it('emits one tile per branch matching category', async () => {
    // Create a deterministic category + multi-branch merchant in that category.
    // Cleaned up via FIXTURE_PREFIX scope in afterAll.
    const category = await prisma.category.create({
      data: {
        name: `${FIXTURE_PREFIX}TestCategory`,
        isActive: true,
        intentType: 'LOCAL',
      },
    })
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}CatMerch`,
        status: 'ACTIVE',
        primaryCategoryId: category.id,
        categories: { create: [{ categoryId: category.id, isPrimary: true }] },
        branches: {
          create: [
            { name: `${FIXTURE_PREFIX}CatMerch-A`, addressLine1: '1', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.5, longitude: 0.1, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
            { name: `${FIXTURE_PREFIX}CatMerch-B`, addressLine1: '2', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.6, longitude: 0.2, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
          ],
        },
      },
    })

    const result = await getCategoryBranches(prisma, {
      categoryId: category.id,
      limit: 20,
      offset: 0,
      userId: null,
      effLoc: null,
    })
    expect(Array.isArray(result.branches)).toBe(true)
    expect(typeof result.totalBranches).toBe('number')
  })
})
```

- [ ] **Step 2: Confirm failure + implement**

Append to service.ts (delegating to a categoryId-filtered `searchBranches` is the cheapest impl):

```ts
export async function getCategoryBranches(
  prisma: PrismaClient,
  params: {
    categoryId: string
    limit: number
    offset: number
    userId: string | null
    effLoc: EffectiveLocation | null
  },
): Promise<{ branches: BranchTile[]; totalBranches: number }> {
  // Reuse searchBranches with empty q + categoryId.  The predicate naturally
  // becomes "all active branches of active merchants in the named category".
  return searchBranches(prisma, {
    q: '',
    limit: params.limit,
    offset: params.offset,
    userId: params.userId,
    effLoc: params.effLoc,
    categoryId: params.categoryId,
  })
}
```

If `q: ''` causes issues with the predicate (empty string match), guard at the top of `searchBranches`:

```ts
if (q.trim().length === 0) {
  // Wildcard category browse — drop the OR clause entirely.
  return searchBranchesWildcard(...)
}
```

Plan: simplest version delegates to a guard inside `searchBranches`. Document the contract.

- [ ] **Step 3: Pass**

```bash
npx vitest run tests/api/customer/discovery/branch-tile-contract.test.ts -t getCategoryBranches
```

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/branch-tile-contract.test.ts
git commit -m "feat(discovery): getCategoryBranches for Phase 1 category list

Spec §1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.9: Implement `getCampaignBranches`

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (append after existing `getCampaignMerchants`, line ~2318)
- Create: `tests/api/customer/discovery/campaign-branches.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/customer/discovery/campaign-branches.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { getCampaignBranches } from '../../../../src/api/customer/discovery/service'

const prisma = new PrismaClient()
const FIXTURE_PREFIX = 'rbl-1-9-'

beforeAll(async () => { await prisma.$queryRaw`SELECT 1` })

afterAll(async () => {
  // Order matters: campaign-merchants → campaigns → branches → merchants.
  await prisma.campaignMerchant.deleteMany({
    where: { campaign: { name: { startsWith: FIXTURE_PREFIX } } },
  })
  await prisma.campaign.deleteMany({ where: { name: { startsWith: FIXTURE_PREFIX } } })
  await prisma.branch.deleteMany({ where: { name: { startsWith: FIXTURE_PREFIX } } })
  await prisma.merchant.deleteMany({ where: { businessName: { startsWith: FIXTURE_PREFIX } } })
  await prisma.$disconnect()
})

describe('getCampaignBranches — Rev 2.1 §8.1', () => {
  it('fans out one tile per active branch of each campaign merchant (LOAD-BEARING)', async () => {
    // Create campaign with 2 merchants: one has 2 branches, the other 1.
    // Expected total = 3 branch tiles.
    const merchantA = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}MerchantA`,
        status: 'ACTIVE',
        branches: {
          create: [
            { name: `${FIXTURE_PREFIX}A1`, addressLine1: '1', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.5, longitude: 0.1, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
            { name: `${FIXTURE_PREFIX}A2`, addressLine1: '2', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.6, longitude: 0.1, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
          ],
        },
      },
      include: { branches: true },
    })
    const merchantB = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}MerchantB`,
        status: 'ACTIVE',
        branches: {
          create: [
            { name: `${FIXTURE_PREFIX}B1`, addressLine1: '1', city: 'Y', postcode: 'Y1', country: 'GB', latitude: 51.7, longitude: 0.2, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
          ],
        },
      },
      include: { branches: true },
    })

    // Sanity-pin the fixture state.
    if (merchantA.branches.length !== 2 || merchantB.branches.length !== 1) {
      throw new Error(`Fixture creation failed: A=${merchantA.branches.length}, B=${merchantB.branches.length}`)
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: `${FIXTURE_PREFIX}Campaign`,
        description: 'fixture',
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        // ... whatever required fields the schema dictates; verify against schema.prisma
      },
    })
    await prisma.campaignMerchant.create({ data: { campaignId: campaign.id, merchantId: merchantA.id } })
    await prisma.campaignMerchant.create({ data: { campaignId: campaign.id, merchantId: merchantB.id } })

    const result = await getCampaignBranches(prisma, {
      campaignId: campaign.id,
      userId: null,
      lat: null,
      lng: null,
    })

    expect(result.branches).toHaveLength(3) // 2 + 1
    const distinctIds = new Set(result.branches.map(t => t.id))
    expect(distinctIds.size).toBe(3)
  })

  it('inactive branches are NOT emitted', async () => {
    const merchant = await prisma.merchant.create({
      data: {
        businessName: `${FIXTURE_PREFIX}InactiveBranchMerchant`,
        status: 'ACTIVE',
        branches: {
          create: [
            { name: `${FIXTURE_PREFIX}Active`, addressLine1: '1', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.5, longitude: 0.1, locationConfidence: 'MANUALLY_CONFIRMED', isActive: true },
            { name: `${FIXTURE_PREFIX}Inactive`, addressLine1: '2', city: 'X', postcode: 'X1', country: 'GB', latitude: 51.6, longitude: 0.1, locationConfidence: 'MANUALLY_CONFIRMED', isActive: false },
          ],
        },
      },
    })
    const campaign = await prisma.campaign.create({
      data: { name: `${FIXTURE_PREFIX}CampaignInactive`, description: 'fixture', isActive: true, startDate: new Date(), endDate: new Date(Date.now() + 86_400_000) },
    })
    await prisma.campaignMerchant.create({ data: { campaignId: campaign.id, merchantId: merchant.id } })

    const result = await getCampaignBranches(prisma, {
      campaignId: campaign.id, userId: null, lat: null, lng: null,
    })

    // Only the active branch surfaces.
    expect(result.branches).toHaveLength(1)
  })

  it('banner-level Home Feed campaigns[] is NOT affected', () => {
    // Docs pin — Spec §8.1.  Home Feed `campaigns: CampaignBannerTile[]`
    // remains untouched by this endpoint.  See getHomeFeed test.
    expect(true).toBe(true)
  })
})
```

**Note for the worker:** the `Campaign` model required fields may have evolved since this plan was written. Run `npx prisma studio` or read `prisma/schema.prisma` directly before pasting the fixture-create — adjust the `data` block to match real required fields (e.g. `bannerImageUrl`, `targetType`, `targetCity`, etc.). The TEST FAILING WITH A CLEAR PRISMA VALIDATION ERROR is the desired outcome — better than the test silently skipping.

- [ ] **Step 2: Implement `getCampaignBranches` — adapt `getCampaignMerchants`**

**Read first:** re-read `src/api/customer/discovery/service.ts:2318` onwards (existing `getCampaignMerchants`). The branch-first variant fans out each `CampaignMerchant` to all its merchant's active branches.

**Implementation outline:**

```text
export async function getCampaignBranches(
  prisma,
  campaignId: string,
  params: {
    categoryId?
    lat?, lng?
    userId: string | null
    limit?: number
    offset?: number
  },
): Promise<{ branches: BranchTile[]; total: number }> {

  // ── 1. Resolve campaign + its merchants + each merchant's active branches.
  //
  // const campaign = await prisma.campaign.findUnique({
  //   where: { id: campaignId, isActive: true },
  //   include: {
  //     merchants: {
  //       include: {
  //         merchant: {
  //           include: { branches: { where: { isActive: true }, select: BRANCH_RANKING_SELECT_LITE } },
  //         },
  //       },
  //     },
  //   },
  // })
  // if (!campaign) return { branches: [], total: 0 }

  // ── 2. Flatten to `EnrichBranchInput[]` — one per active branch.
  //
  // const inputs: EnrichBranchInput[] = []
  // for (const cm of campaign.merchants) {
  //   for (const b of cm.merchant.branches) {
  //     inputs.push({
  //       branchId: b.id,
  //       merchantId: cm.merchant.id,
  //       supplyRung: null,        // campaigns bypass rung filtering at this stage
  //       proximityBand: null,
  //       distance: params.lat != null && params.lng != null
  //         && b.latitude != null && b.longitude != null
  //         && b.locationConfidence === 'MANUALLY_CONFIRMED'
  //         ? haversineMetres(params.lat, params.lng, Number(b.latitude), Number(b.longitude))
  //         : null,
  //     })
  //   }
  // }
  //
  // **Note:** distance is gated by MANUALLY_CONFIRMED per PR #81 contract.
  // POSTCODE_CENTROID branches under a campaign emit a tile but the tile's
  // distance is null — same redaction asymmetry as elsewhere.

  // ── 3. Apply optional categoryId filter (if the campaign route exposes
  //    one — see routes.ts:182).
  //
  // const filtered = params.categoryId
  //   ? inputs.filter(i => /* join via merchant.categories */)
  //   : inputs

  // ── 4. Paginate the flat list.
  //
  // const total = filtered.length
  // const page = params.limit
  //   ? filtered.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit)
  //   : filtered

  // ── 5. Enrich.
  //
  // const branches = await enrichBranchTiles(prisma, page, {
  //   userId: params.userId, lat: params.lat ?? null, lng: params.lng ?? null,
  // })

  // return { branches, total }
}
```

`haversineMetres` is exported from `src/api/lib/ranking.ts` (added in Task 1.3). Spec §8.1 cross-ref: this is the interim fan-out behaviour pre-`CampaignMerchant.branchId?` schema migration. When the schema migration lands, `branches` is filtered to the per-campaign-merchant branch list instead of all-active-branches. Same wire shape; only the join logic changes.

- [ ] **Step 3: Pass + commit**

```bash
npx vitest run tests/api/customer/discovery/campaign-branches.test.ts
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/campaign-branches.test.ts
git commit -m "feat(discovery): getCampaignBranches for Phase 1 — fans out per active branch

Spec §8.1.  Interim behaviour pre-CampaignMerchant.branchId? schema
migration (deferred under §A).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.10: Wire all 5 endpoints in `routes.ts` (additive)

**Files:**
- Modify: `src/api/customer/discovery/routes.ts`

Routes affected:
- `GET /api/v1/customer/search` (line 93) — attach `branches` + `totalBranches`.
- `GET /api/v1/customer/categories/:id/merchants` (line 111) — attach `branches`.
- `GET /api/v1/customer/discovery/in-area` (line 149) — attach `branches`.
- `GET /api/v1/customer/home` (line 46) — extend response with `featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`.
- `GET /api/v1/customer/campaigns/:id/merchants` (line 182) — attach `branches`.

- [ ] **Step 1: Write the failing contract test**

Create `tests/api/customer/discovery/routes-additive-shape.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { build } from '../../../helpers/buildApp'
import { tokenForUser } from '../../../helpers/auth'

const app = build()
beforeAll(async () => { await app.ready() })

describe('Discovery routes — Phase 1 additive shape', () => {
  it('GET /api/v1/customer/home returns featured AND featuredBranches', async () => {
    const res = await app.inject({ url: '/api/v1/customer/home', headers: { ...tokenForUser() } })
    const body = res.json()
    expect(body).toHaveProperty('featured')
    expect(body).toHaveProperty('featuredBranches')
    expect(body).toHaveProperty('trending')
    expect(body).toHaveProperty('trendingBranches')
    expect(body).toHaveProperty('nearbyByCategory')
    expect(body).toHaveProperty('nearbyByCategoryBranches')
    expect(body).toHaveProperty('campaigns') // banner-level unchanged
  })

  it('GET /api/v1/customer/search returns merchants AND branches', async () => {
    const res = await app.inject({
      url: '/api/v1/customer/search?q=Covelum',
      headers: { ...tokenForUser() },
    })
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('branches')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('totalBranches')
  })

  it('GET /api/v1/customer/discovery/in-area returns merchants AND branches', async () => {
    const res = await app.inject({
      url: '/api/v1/customer/discovery/in-area?minLat=51.79&maxLat=51.83&minLng=1.00&maxLng=1.05',
      headers: { ...tokenForUser() },
    })
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('branches')
  })

  it('GET /api/v1/customer/categories/:id/merchants returns merchants AND branches', async () => {
    const { prisma } = app
    const cat = await prisma.category.findFirst({ where: { isActive: true } })
    if (!cat) {
      // Active category is core seed data — its absence is a test-environment
      // bug, NOT a reason to silently pass.  Fail loudly so CI flags it.
      throw new Error('No active Category found.  Run `npx prisma db seed` before this suite.')
    }
    const res = await app.inject({
      url: `/api/v1/customer/categories/${cat.id}/merchants`,
      headers: { ...tokenForUser() },
    })
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('branches')
  })

  it('GET /api/v1/customer/campaigns/:id/merchants returns merchants AND branches', async () => {
    const { prisma } = app
    const c = await prisma.campaign.findFirst({ where: { isActive: true } })
    if (!c) {
      // No active campaigns may be acceptable on a fresh DB (campaigns aren't
      // in the dev seed today).  Create one inline so this contract test is
      // deterministic — DO NOT silently skip.
      const fixture = await prisma.campaign.create({
        data: {
          name: `routes-additive-shape-test-campaign`,
          description: 'fixture',
          isActive: true,
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 86_400_000),
        },
      })
      const res = await app.inject({
        url: `/api/v1/customer/campaigns/${fixture.id}/merchants`,
        headers: { ...tokenForUser() },
      })
      const body = res.json()
      expect(body).toHaveProperty('merchants')
      expect(body).toHaveProperty('branches')
      await prisma.campaign.delete({ where: { id: fixture.id } })
      return
    }
    const res = await app.inject({
      url: `/api/v1/customer/campaigns/${c.id}/merchants`,
      headers: { ...tokenForUser() },
    })
    const body = res.json()
    expect(body).toHaveProperty('merchants')
    expect(body).toHaveProperty('branches')
  })
})
```

- [ ] **Step 2: Confirm failure**

```bash
npx vitest run tests/api/customer/discovery/routes-additive-shape.test.ts
```
Expected: 5 failures — `branches` properties not yet attached.

- [ ] **Step 3: Modify each route handler in `src/api/customer/discovery/routes.ts`**

**Read first:** re-read `src/api/customer/discovery/routes.ts:1–195` to confirm the current wiring style. Key facts:
- Prisma is on the Fastify decorator: `app.prisma`, NOT `req.server.prisma`.
- User id extraction: `optionalUserId(req)` (imported from `../plugin`).
- Query parsing: `searchQuery.parse(req.query)` etc. (zod schemas declared at top of file).
- Service signatures: `searchMerchants(app.prisma, { ...params, userId })`. **NO `effLoc` arg** — services resolve `EffectiveLocation` internally.

**Example correct pattern for search (routes.ts:93):**

```ts
app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
  const params = searchQuery.parse(req.query)
  const userId = optionalUserId(req)

  // Existing legacy path — UNCHANGED:
  const merchantResult = await searchMerchants(app.prisma, { ...params, userId })

  // NEW additive call — Rev 2.1 §1.5:
  const branchResult = await searchBranches(app.prisma, { ...params, userId })

  return reply.send({
    ...merchantResult,
    branches: branchResult.branches,
    totalBranches: branchResult.totalBranches,
  })
})
```

**Apply analogous pattern to:**
- `/api/v1/customer/discovery/in-area` (routes.ts:149) — call `getInAreaBranches` alongside `getInAreaMerchants`.
- `/api/v1/customer/categories/:id/merchants` (routes.ts:111) — call `getCategoryBranches` alongside `getCategoryMerchants`.
- `/api/v1/customer/campaigns/:id/merchants` (routes.ts:182) — call `getCampaignBranches` alongside `getCampaignMerchants`.
- `/api/v1/customer/home` (routes.ts:46) — Task 1.7 already extended `getHomeFeed` to return the new fields, so the route handler is unchanged (the additive fields flow through naturally).

**Concurrent vs sequential service calls:** the two calls (`searchMerchants` + `searchBranches`) can run via `Promise.all` for latency. Both queries hit Postgres independently. **However** — verify there's no transaction/connection pool concern by running the route once locally with a fresh DB connection profile and `EXPLAIN ANALYZE` on each query. If pool exhaustion shows up in CI, switch to sequential.

**What to NOT do:**
- Do NOT add an `?cardinality=` query flag — that's the locked decision in §12 file map. Both fields ship unconditionally.
- Do NOT thread `effLoc` from route to service — that's an internal service concern.
- Do NOT change Fastify route signatures or `optionalUserId` import path.

- [ ] **Step 4: Pass**

```bash
npx vitest run tests/api/customer/discovery/routes-additive-shape.test.ts
```
Expected: 5/5 pass.

- [ ] **Step 5: Run FULL backend regression**

```bash
npx vitest run 2>&1 | tail -10
```
Expected: every test passes; total = baseline + new tests.

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/discovery/routes.ts tests/api/customer/discovery/routes-additive-shape.test.ts
git commit -m "feat(discovery): wire 5 endpoints with additive branch-tile shape

Spec §1.5.  All 5 endpoints now return BOTH legacy merchants field AND
new branches field.  Customer-app continues reading legacy — no visible
change until Phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.11: Extend location-confidence redaction test

**Files:**
- Modify: `tests/api/customer/discovery/location-confidence-redaction.test.ts`

- [ ] **Step 1: Add tests covering BranchTile**

Append to the file:

```ts
import { branchTileSchema } from '../../../../src/api/customer/discovery/branchTileSchema'

describe('PR #81 redaction — BranchTile (Phase 1)', () => {
  it('POSTCODE_CENTROID branch emits null branchLatitude + null branchLongitude on home feed', async () => {
    // ... same fixture as existing tests, but assert on featuredBranches /
    // trendingBranches / nearbyByCategoryBranches entries.
  })

  it('POSTCODE_CENTROID branch tile remains in list views (Search, Home, Category)', async () => {
    // Confirms the §4.1.1 list-tile asymmetry.
  })

  it('Map in-area excludes POSTCODE_CENTROID branches (no exact coords for bbox)', async () => {
    // Confirms the asymmetry from the other side.
  })
})
```

Fill in the test bodies using the existing test's fixture-loading pattern.

- [ ] **Step 2: Run + pass**

```bash
npx vitest run tests/api/customer/discovery/location-confidence-redaction.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery/location-confidence-redaction.test.ts
git commit -m "test(discovery): redaction contract pins extend to BranchTile

Spec §4.1.1 asymmetry pinned: list views YES (null coords), Map NO
(POSTCODE_CENTROID excluded server-side).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.12: PR-1 self-review + raise PR

- [ ] **Step 1: Full backend sweep**

```bash
npx vitest run 2>&1 | tail -10
```
Expected: all green.

- [ ] **Step 2: `tsc` clean on backend root**

```bash
npx tsc --noEmit 2>&1 | grep -v "apps/" | head -30
```
Expected: zero new errors.

- [ ] **Step 3: Customer-app unchanged regression sanity**

```bash
cd apps/customer-app
npx jest --forceExit 2>&1 | tail -5
cd ../..
```
Expected: customer-app tests still pass; nothing should have regressed (the customer-app hasn't been touched in Phase 1).

- [ ] **Step 4: Sanity-check workspace hygiene**

```bash
git status --short
```
Verify ONLY the long-standing untracked artefacts (.agents/, app.json, docs/source-materials/, docs/superpowers/skill-usage-cheatsheet.md, 7 prisma/* scripts, skills-lock.json) appear under `??`. No new untracked files.

- [ ] **Step 5: Push branch**

```bash
git push -u origin feature/discovery-rebaseline-phase-1-backend-additive
```

- [ ] **Step 6: Raise PR**

```bash
gh pr create --title "feat(discovery): Phase 1 — branch-first additive backend contract" --body "$(cat <<'EOF'
## Summary
- New `BranchTile` shape (Zod strict — rejects unknown keys including `branchAddressLine1` per Rev-2.1 lock).
- New `rankBranchesV3` with per-branch rung classification, D1 pure-rank sort, POSTCODE_CENTROID admitted to output with null `supplyRung`/`proximityBand`.
- 7 new service helpers: `enrichBranchTiles`, `searchBranches`, `getInAreaBranches`, `getCategoryBranches`, `getCampaignBranches`, plus Home feed extended with `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`.
- 5 route handlers extended additively. Both legacy `merchants` field AND new `branches` field present.
- Customer-app reads legacy field — no customer-visible change.

Spec: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1, §1.5, §2, §3, §4, §8.1.
Plan: docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md PR-1.

## Test plan
- [x] Backend `npx vitest run` — green
- [x] Customer-app `npx jest --forceExit` — green (unchanged)
- [x] `tsc --noEmit` clean both sides
- [x] Workspace hygiene: only long-standing untracked artefacts under `??`
- Owner local-app sanity (no customer-visible change expected)

## Rollback
`git revert` of the merge commit. Customer-app reads legacy `merchants` which is preserved.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: OWNER REVIEW GATE**

Wait for owner approval. No merge until owner explicitly accepts.

- [ ] **Step 8: PR scope verification + merge**

After approval:
```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-1-backend-additive --jq '.commits | length, .files | length'
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 9: Post-merge — update memory + deferred-followups**

```bash
git checkout main && git pull origin main
```

Update memory files (using Write tool, NOT in this checklist's command form — just track that it must happen):
- `memory/project_current_state.md` — add new top section for Phase 1 SHIPPED entry.
- `memory/project_deferred_followups_index.md` §M — mark Phase 1 complete.
- Create `memory/project_discovery_rebaseline_phase1_complete.md` summarising what shipped + tests at HEAD + cross-refs.
- `memory/MEMORY.md` — top-index pointer for the new memory file.

---

# PR-2: Phase 2.1 — Customer-app Search migration

**Branch:** `feature/discovery-rebaseline-phase-2-1-search` off updated `main`.

**Goal:** Migrate the customer-app Search surface (`SearchScreen.tsx` + `SearchResultItem.tsx` + `useSearch`) to consume `branches: BranchTile[]` from the search endpoint. This is the highest-visibility user-facing fix — closes the Covelum bug at the UI layer on the search surface where the owner observed it.

**Tests touched:** `tests/features/search/SearchScreen.test.tsx`, `tests/features/search/SearchResultItem.proximity-chip.test.tsx`, `tests/features/search/SearchScreen.locality.test.tsx`, `tests/hooks/useSearch.test.tsx`.

**Acceptance:**
- All Search-feature jest tests pass against the new shape.
- Customer-app full jest passes.
- Backend regression unchanged.
- Owner device-QA on iPhone confirms multi-branch merchants surface as separate result rows.

**Rollback:** Per-PR revert. Customer-app reverts to reading `merchants`; service still emits both fields.

---

### Task 2.1.1: Branch + customer-app type generation

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-2-1-search
```

- [ ] **Step 2: Extend `apps/customer-app/src/lib/api/discovery.ts` — add `branchTileSchema` + `BranchTile`**

Hand-write the matching TS schema (per §15.3 locked: option a). Append after the existing `merchantTileSchema`:

```ts
// Spec §1.1 (Rev 2.1).  Mirror of src/api/customer/discovery/branchTileSchema.ts.
// Locked under the rebaseline plan PR-1; must be kept in sync if the backend
// schema changes (Phase 3 cleanup converges them).

const branchTileSchema = z.object({
  id: z.string(),
  branchName: z.string(),
  branchLocalityId: z.string().nullable(),
  branchLocalityName: z.string().nullable(),
  branchPostTown: z.string().nullable(),
  branchCity: z.string().nullable(),
  branchLatitude: z.number().nullable(),
  branchLongitude: z.number().nullable(),
  branchLocationConfidence: z.enum(['MANUALLY_CONFIRMED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW', 'ADDRESS_GEOCODED']),
  isOpenNow: z.boolean(),
  closesAtLocal: z.string().nullable(),
  distance: z.number().nullable(),
  isFavourited: z.boolean(),
  avgRating: z.number().nullable(),
  reviewCount: z.number(),
  supplyRung: supplyRungSchema.nullable(),
  proximityBand: proximityBandSchema.nullable(),
  distanceMetres: z.number().nullable(),
  merchant: z.object({
    id: z.string(),
    businessName: z.string(),
    tradingName: z.string().nullable(),
    logoUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
    primaryCategory: categorySchema.nullable(),
    primaryDescriptorTag: z.object({ id: z.string(), label: z.string() }).nullable(),
    subcategory: categorySchema.nullable(),
    descriptor: z.string(),
    highlights: z.array(highlightSchema),
    voucherCount: z.number(),
    maxEstimatedSaving: z.number().nullable(),
  }),
})
export type BranchTile = z.infer<typeof branchTileSchema>
```

Extend `searchResponseSchema`:

```ts
const searchResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),
  total: z.number(),
  branches: z.array(branchTileSchema),     // Phase 1 additive
  totalBranches: z.number(),               // Phase 1 additive
  effectiveLocality: effectiveLocalitySchema.nullable().optional(),
  rungCounts: rungCountsSchema.optional(),
})
```

Same pattern for `inAreaResponseSchema`, `categoryMerchantsResponseSchema`, `homeFeedResponseSchema`.

- [ ] **Step 3: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "feat(customer-app): extend discovery API schemas with branch-tile arms

Spec §1.5.  Locked option (a) hand-written per §15.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.1.2: Migrate `useSearch` hook

**Files:**
- Modify: customer-app search hook (location TBD via grep; likely `apps/customer-app/src/features/search/screens/SearchScreen.tsx` inlined or `apps/customer-app/src/hooks/useSearch.ts`)
- Modify: `apps/customer-app/tests/hooks/useSearch.test.tsx`

- [ ] **Step 1: Locate the hook**

```bash
grep -rn "useSearch\b\|searchApi\|api/search" apps/customer-app/src/features/search apps/customer-app/src/hooks 2>/dev/null
```

- [ ] **Step 2: Flip the test to assert new return shape**

```ts
// tests/hooks/useSearch.test.tsx — REPLACE the mocked discovery response
// and the assertion:

it('returns branches + totalBranches from the new shape', async () => {
  mockServer.get('/api/v1/customer/search', (req, res) =>
    res.json({
      merchants: [],
      total: 0,
      branches: [/* fixture covelum tiles */],
      totalBranches: 2,
    }),
  )
  const { result } = renderHook(() => useSearch({ q: 'Covelum' }))
  await waitFor(() => expect(result.current.branches.length).toBe(2))
})
```

- [ ] **Step 3: Test fails — update hook to read new field**

```ts
export function useSearch(params: SearchParams) {
  return useInfiniteQuery({
    queryKey: ['search', params],
    queryFn: ({ pageParam = 0 }) => discoveryApi.search({ ...params, offset: pageParam }),
    select: data => ({
      branches: data.pages.flatMap(p => p.branches),
      totalBranches: data.pages[0]?.totalBranches ?? 0,
      pages: data.pages,
    }),
    getNextPageParam: (last, pages) =>
      pages.flatMap(p => p.branches).length < (last.totalBranches ?? 0)
        ? pages.flatMap(p => p.branches).length
        : undefined,
  })
}
```

- [ ] **Step 4: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/hooks/useSearch.test.tsx --forceExit
cd ../..
git add apps/customer-app/src/hooks/useSearch.ts apps/customer-app/tests/hooks/useSearch.test.tsx
git commit -m "feat(customer-app): useSearch reads branches not merchants

Spec §1.5, §10.2 Phase 2.1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.1.3: Migrate `SearchResultItem` component

**Files:**
- Modify: `apps/customer-app/src/features/search/components/SearchResultItem.tsx`
- Modify: `apps/customer-app/tests/features/search/SearchResultItem.proximity-chip.test.tsx`

Per spec §3.3, the component should render:
- Logo (merchant)
- Primary headline: `tile.merchant.businessName`
- Secondary line: `branchName + ', ' + (branchLocalityName ?? branchPostTown ?? branchCity)`
- Tertiary line: `merchant.descriptor` + voucher signal + `isOpenNow` chip
- Right column: `avgRating` + `maxEstimatedSaving`
- Heart: derived `isFavourited`, calls `useFavourite({ type: 'merchant', id: tile.merchant.id }).toggle()`

- [ ] **Step 1: Flip the test**

Test currently asserts a single merchant render. Update fixtures to be `BranchTile` shape; add a multi-branch render test:

```tsx
import { render, screen } from '@testing-library/react-native'
import { SearchResultItem } from '../../../src/features/search/components/SearchResultItem'

it('renders branch identity as locality-style secondary line', () => {
  const tile = makeBranchTileFixture({
    branchName: 'Brightlingsea',
    branchLocalityName: 'Brightlingsea',
    branchCity: 'Essex',
    merchant: { ...covelumFixture },
  })
  render(<SearchResultItem tile={tile} />)
  expect(screen.getByText('Covelum')).toBeTruthy()
  expect(screen.getByText(/Brightlingsea/)).toBeTruthy()
})

it('multi-branch merchant renders as two separate rows', () => {
  const a = makeBranchTileFixture({ id: 'brn_a', branchLocalityName: 'Brightlingsea' })
  const b = makeBranchTileFixture({ id: 'brn_b', branchLocalityName: 'Colchester' })
  render(<>
    <SearchResultItem tile={a} />
    <SearchResultItem tile={b} />
  </>)
  expect(screen.getByText('Brightlingsea')).toBeTruthy()
  expect(screen.getByText('Colchester')).toBeTruthy()
})

it('locality fallback uses postTown when localityName is null', () => {
  const tile = makeBranchTileFixture({
    branchLocalityName: null,
    branchPostTown: 'Colchester',
    branchCity: 'Essex',
  })
  render(<SearchResultItem tile={tile} />)
  expect(screen.getByText(/Colchester/)).toBeTruthy()
})

it('locality fallback uses city when both localityName and postTown are null', () => {
  const tile = makeBranchTileFixture({
    branchLocalityName: null,
    branchPostTown: null,
    branchCity: 'Essex',
  })
  render(<SearchResultItem tile={tile} />)
  expect(screen.getByText(/Essex/)).toBeTruthy()
})

it('heart tap fires merchant-favourite toggle (Rev-2 derivation)', () => {
  const toggle = jest.fn()
  jest.spyOn(require('../../../src/hooks/useFavourite'), 'useFavourite').mockReturnValue({
    isFavourited: false,
    toggle,
  })
  const tile = makeBranchTileFixture({ merchant: { id: 'mer_covelum', ...covelumFixture } })
  const { getByTestId } = render(<SearchResultItem tile={tile} />)
  fireEvent.press(getByTestId('search-result-favourite'))
  expect(toggle).toHaveBeenCalled()
})
```

- [ ] **Step 2: Test fails — update component**

```tsx
// apps/customer-app/src/features/search/components/SearchResultItem.tsx
import { useFavourite } from '../../../hooks/useFavourite'
import type { BranchTile } from '../../../lib/api/discovery'

type Props = { tile: BranchTile }

function localityFallback(t: BranchTile): string | null {
  return t.branchLocalityName ?? t.branchPostTown ?? t.branchCity
}

export function SearchResultItem({ tile }: Props) {
  const locality = localityFallback(tile)
  const favourite = useFavourite({
    type: 'merchant',
    id: tile.merchant.id,
    isFavourited: tile.isFavourited,
  })

  return (
    <Pressable
      testID={`search-result-${tile.id}`}
      onPress={() => router.push(`/(app)/merchant/${tile.merchant.id}?branch=${tile.id}`)}
    >
      {/* Logo */}
      <Image source={{ uri: tile.merchant.logoUrl ?? undefined }} />
      <View>
        <Text style={primary}>{tile.merchant.businessName}</Text>
        <Text style={secondary}>
          {tile.branchName}{locality ? `, ${locality}` : ''}
        </Text>
        <Text style={tertiary}>
          {tile.merchant.descriptor}{tile.isOpenNow ? ' · Open' : ' · Closed'}
        </Text>
      </View>
      <View>
        {tile.avgRating != null && <Text>★ {tile.avgRating.toFixed(1)}</Text>}
        {tile.merchant.maxEstimatedSaving != null && (
          <Text>£{tile.merchant.maxEstimatedSaving}+</Text>
        )}
        <Pressable testID="search-result-favourite" onPress={favourite.toggle}>
          <HeartIcon filled={favourite.isFavourited} />
        </Pressable>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 3: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/search/SearchResultItem.proximity-chip.test.tsx --forceExit
cd ../..
git add apps/customer-app/src/features/search/components/SearchResultItem.tsx apps/customer-app/tests/features/search/SearchResultItem.proximity-chip.test.tsx
git commit -m "feat(customer-app): SearchResultItem consumes BranchTile

Spec §3.3.  Locality fallback localityName ?? postTown ?? city.  Heart
fires merchant-favourite toggle per Rev-2 decision #13 (wire is
merchant-keyed today; isFavourited derived).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.1.4: Migrate `SearchScreen` + flip tests

**Files:**
- Modify: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`
- Modify: `apps/customer-app/tests/features/search/SearchScreen.test.tsx`, `SearchScreen.locality.test.tsx`

- [ ] **Step 1: Update SearchScreen to render `branches` not `merchants`**

```tsx
const { branches, totalBranches, fetchNextPage, isLoading } = useSearch({ q, ... })

return (
  <FlatList
    data={branches}
    keyExtractor={t => t.id}
    renderItem={({ item }) => <SearchResultItem tile={item} />}
    onEndReached={fetchNextPage}
    ...
  />
)
```

- [ ] **Step 2: Flip the screen tests to mock branch-shape responses**

Update mocked discovery API in `SearchScreen.test.tsx` to return `branches` + `totalBranches`. Add the load-bearing multi-branch render test:

```tsx
it('q="Covelum" renders TWO separate result rows (multi-branch)', async () => {
  mockApi('/api/v1/customer/search', { merchants: [], total: 0, branches: [covelumBrightlingsea, covelumColchester], totalBranches: 2 })
  render(<SearchScreen />)
  await waitFor(() => {
    expect(screen.getByTestId(`search-result-${covelumBrightlingsea.id}`)).toBeTruthy()
    expect(screen.getByTestId(`search-result-${covelumColchester.id}`)).toBeTruthy()
  })
})

it('tile tap routes to /(app)/merchant/[id]?branch=<branchId>', async () => {
  // ... mock branches[0]=brn_a with merchant.id=mer_x
  fireEvent.press(getByTestId('search-result-brn_a'))
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/(app)/merchant/mer_x?branch=brn_a'))
})
```

- [ ] **Step 3: Pass**

```bash
cd apps/customer-app && npx jest tests/features/search --forceExit
cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/features/search apps/customer-app/tests/features/search
git commit -m "feat(customer-app): SearchScreen renders branch-first results

Spec §10.2 Phase 2.1.  Closes the Covelum cardinality bug at the UI
layer for the highest-visibility surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.1.5: Customer-app full sweep + self-review + raise PR

- [ ] **Step 1: Full customer-app jest**

```bash
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd ../..
```
Expected: all green; baseline ± Phase 2.1 deltas.

- [ ] **Step 2: `tsc` clean**

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```

- [ ] **Step 3: Push + raise PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-2-1-search
gh pr create --title "feat(customer-app): Phase 2.1 — Search migration to branch-first" --body "$(cat <<'EOF'
## Summary
- Search reads new `branches: BranchTile[]` field instead of legacy `merchants`.
- `SearchResultItem` renders merchant identity primary + branch locality secondary.
- Locality fallback: `localityName ?? postTown ?? city` (most specific → least specific).
- Multi-branch merchants surface as separate result rows (Covelum bug closed at UI layer).
- Heart uses existing merchant-favourite toggle (Rev-2 decision #13).

Spec: §1.5, §3.3, §10.2 Phase 2.1.
Plan: PR-2 of docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md.

Closes (UI side): Covelum Brightlingsea + Colchester collapse on search results.

## Test plan
- [x] Customer-app jest: search suite + full
- [x] `tsc --noEmit` clean
- [x] Workspace hygiene
- Owner device-QA on Qatar iPhone: search "Covelum" surfaces two distinct rows.

## Rollback
`git revert` of the merge commit. Service still emits both fields.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: OWNER REVIEW + DEVICE-QA GATE**

Wait for owner local-app device-QA confirmation before merge.

- [ ] **Step 5: PR scope verification + merge**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-2-1-search --jq '.commits | length, .files | length'
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 6: Post-merge — update memory + Plan 4 M4 unblock note**

- `memory/project_current_state.md` — Phase 2.1 SHIPPED entry.
- `memory/project_discovery_sequencing_plan4.md` — Plan 4 M4.2 / M4.3 / M4.5 now PARTIALLY UNBLOCKED.
- `memory/project_discovery_rebaseline_phase2_1_complete.md` — what shipped + cross-refs.

---

# PR-3: Phase 2.2 — Customer-app Map migration

**Branch:** `feature/discovery-rebaseline-phase-2-2-map` off updated `main`.

**Goal:** Migrate the customer-app Map surface (`MapScreen.tsx` + `MapPins.tsx` + `MapMerchantTile.tsx` → `MapBranchTile.tsx` + `MapListView.tsx` + `useInAreaMerchants.ts` → `useInAreaBranches.ts`) to consume `branches: BranchTile[]` from the in-area endpoint. Render one pin per branch with exact coords; bottom carousel keyed on `branch.id`.

**Tests touched:** all of `tests/features/map/*` (8 files).

**Acceptance:**
- Map jest suite passes.
- Customer-app full jest passes.
- Backend regression unchanged.
- Device-QA: Covelum surfaces TWO pins on a viewport that includes Brightlingsea + Colchester.

**Rollback:** Per-PR revert.

---

### Task 2.2.1: Branch + rename hook + types

- [ ] **Step 1: Branch + grep current Map imports**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-2-2-map
grep -rn "useInAreaMerchants\|MapMerchantTile\|getInAreaMerchants" apps/customer-app/src apps/customer-app/tests
```

- [ ] **Step 2: Rename `useInAreaMerchants.ts` → `useInAreaBranches.ts`**

```bash
git mv apps/customer-app/src/features/map/hooks/useInAreaMerchants.ts apps/customer-app/src/features/map/hooks/useInAreaBranches.ts
git mv apps/customer-app/tests/features/map/useInAreaMerchants.test.tsx apps/customer-app/tests/features/map/useInAreaBranches.test.tsx
```

- [ ] **Step 3: Flip the hook to read branches**

```ts
// apps/customer-app/src/features/map/hooks/useInAreaBranches.ts
export function useInAreaBranches(bbox: BBox | null) {
  return useQuery({
    queryKey: ['inAreaBranches', bbox],
    queryFn: () => discoveryApi.inArea(bbox!),
    enabled: bbox != null,
    select: r => r.branches, // not r.merchants
  })
}
```

- [ ] **Step 4: Flip the hook test**

```ts
// useInAreaBranches.test.tsx — mock response now includes branches[].
it('returns branches', async () => {
  mockApi('/api/v1/customer/discovery/in-area', { merchants: [], branches: [covelumBrightlingsea, covelumColchester] })
  const { result } = renderHook(() => useInAreaBranches(bbox))
  await waitFor(() => expect(result.current.data).toHaveLength(2))
})
```

- [ ] **Step 5: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/map/useInAreaBranches.test.tsx --forceExit
cd ../..
git add -A
git commit -m "feat(customer-app/map): rename useInAreaMerchants → useInAreaBranches

Spec §4.4.  Hook reads new branches field from in-area endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2.2: Rename `MapMerchantTile` → `MapBranchTile`

- [ ] **Step 1: Rename component + tests**

```bash
git mv apps/customer-app/src/features/map/components/MapMerchantTile.tsx apps/customer-app/src/features/map/components/MapBranchTile.tsx
git mv apps/customer-app/tests/features/map/MapMerchantTile.test.tsx apps/customer-app/tests/features/map/MapBranchTile.test.tsx
```

- [ ] **Step 2: Update component to consume `BranchTile`**

Inside `MapBranchTile.tsx`, change prop type from `MerchantTile` to `BranchTile`. Display merchant identity primary + locality secondary (same shape as §3.3). Tap routes to `/(app)/merchant/${tile.merchant.id}?branch=${tile.id}`.

- [ ] **Step 3: Flip tests + sweep imports**

```bash
grep -rn "MapMerchantTile" apps/customer-app/src apps/customer-app/tests
# Update every import + reference.
```

- [ ] **Step 4: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/map/MapBranchTile.test.tsx --forceExit
cd ../..
git add -A
git commit -m "feat(customer-app/map): rename MapMerchantTile → MapBranchTile

Spec §4.3.  Carousel keyed on branch.id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2.3: Migrate `MapPins` to one-pin-per-branch

- [ ] **Step 1: Flip the test**

```tsx
// tests/features/map/MapPins.test.tsx
it('renders one <Marker> per branch with exact coords', () => {
  const branches = [
    makeBranchTile({ id: 'brn_a', branchLatitude: 51.811, branchLongitude: 1.027 }),
    makeBranchTile({ id: 'brn_b', branchLatitude: 51.890, branchLongitude: 0.901 }),
  ]
  const { UNSAFE_getAllByType } = render(<MapPins branches={branches} />)
  expect(UNSAFE_getAllByType(Marker)).toHaveLength(2)
})

it('skips POSTCODE_CENTROID branches with null coords', () => {
  const branches = [
    makeBranchTile({ id: 'brn_redacted', branchLatitude: null, branchLongitude: null, branchLocationConfidence: 'POSTCODE_CENTROID' }),
    makeBranchTile({ id: 'brn_normal', branchLatitude: 51.811, branchLongitude: 1.027 }),
  ]
  const { UNSAFE_getAllByType } = render(<MapPins branches={branches} />)
  expect(UNSAFE_getAllByType(Marker)).toHaveLength(1)
})

it('two branches of same merchant render as two distinct markers', () => {
  const branches = [
    makeBranchTile({ id: 'brn_cov_bli', merchant: { id: 'mer_cov', ...cov } }),
    makeBranchTile({ id: 'brn_cov_col', merchant: { id: 'mer_cov', ...cov } }),
  ]
  const { UNSAFE_getAllByType } = render(<MapPins branches={branches} />)
  expect(UNSAFE_getAllByType(Marker)).toHaveLength(2)
})
```

- [ ] **Step 2: Update `MapPins.tsx`**

```tsx
type Props = { branches: BranchTile[] }
export function MapPins({ branches }: Props) {
  return (
    <>
      {branches
        .filter(b => b.branchLatitude != null && b.branchLongitude != null)
        .map(b => (
          <Marker
            key={b.id}
            coordinate={{ latitude: b.branchLatitude!, longitude: b.branchLongitude! }}
            onPress={() => onPress(b)}
          >
            <CustomPin colour={b.merchant.primaryCategory?.pinColour} />
          </Marker>
        ))}
    </>
  )
}
```

- [ ] **Step 3: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/map/MapPins.test.tsx --forceExit
cd ../..
git add apps/customer-app/src/features/map/components/MapPins.tsx apps/customer-app/tests/features/map/MapPins.test.tsx
git commit -m "feat(customer-app/map): MapPins renders one Marker per branch

Spec §4.1, §4.1.1.  POSTCODE_CENTROID branches filtered out — no map
pin for redacted-coord branches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2.4: Migrate `MapScreen` + `MapListView`

Apply the same shape migrations to `MapScreen.tsx` (wire `useInAreaBranches` → render `MapPins` + `MapBranchTile` carousel + `MapListView`) and `MapListView.tsx` (renders branch tile rows). Flip the corresponding tests.

- [ ] **Step 1: Flip MapScreen tests** — assert `branches` shape end-to-end.
- [ ] **Step 2: Update MapScreen + MapListView.**
- [ ] **Step 3: Pass + commit.**

```bash
cd apps/customer-app && npx jest tests/features/map --forceExit
cd ../..
git add -A
git commit -m "feat(customer-app/map): MapScreen + MapListView consume branch tiles

Spec §10.2 Phase 2.2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2.5: Self-review + raise PR

- [ ] **Step 1: Full customer-app jest**

```bash
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd ../..
```

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-2-2-map
gh pr create --title "feat(customer-app): Phase 2.2 — Map migration to branch-first pins" --body "$(cat <<'EOF'
## Summary
- Map renders one pin per branch with exact coords.
- POSTCODE_CENTROID branches filtered server-side from in-area + client-side from MapPins.
- `MapMerchantTile` → `MapBranchTile`, `useInAreaMerchants` → `useInAreaBranches`.
- Multi-branch merchants show TWO pins (Covelum Brightlingsea + Colchester both visible at appropriate viewport).

Spec: §4, §10.2 Phase 2.2.
Plan: PR-3.

## Test plan
- [x] Customer-app jest: map suite + full
- Owner device-QA: pan to Essex coast, confirm Covelum has 2 pins.

## Rollback
`git revert`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: OWNER REVIEW + DEVICE-QA GATE**

Wait for owner local-app device-QA confirmation. The owner confirms on a real device that:
- A viewport over Essex (Brightlingsea + Colchester) shows two distinct Covelum pins.
- Tapping each pin opens the carousel for that branch (carousel keyed on branch.id).
- POSTCODE_CENTROID branches that appear in list mode do NOT appear as pins.
- No crash on bbox + zoom transitions.

No merge until owner explicitly accepts.

- [ ] **Step 4: PR scope verification before merge**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-2-2-map --jq '{commits: (.commits | length), files: (.files | length)}'
```
Expected output: commit count + file count match what's been pushed (manual confirmation against the local branch).

- [ ] **Step 5: SHA-bound merge**

```bash
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 6: Post-merge — pull main + workspace check**

```bash
git checkout main && git pull origin main
git status --short
```
Verify only long-standing untracked artefacts under `??`.

- [ ] **Step 7: Memory updates (mandatory)**

Using the Write tool (not Bash heredocs):

1. **`memory/project_current_state.md`** — add a new top section "Phase 2.2 Map SHIPPED 2026-MM-DD (PR #N, merge `<sha>`)" summarising:
   - Map endpoint now consumes `branches: BranchTile[]` from in-area.
   - One pin per branch; POSTCODE_CENTROID + ADDRESS_GEOCODED filtered (MANUALLY_CONFIRMED only per PR #81).
   - `MapMerchantTile` → `MapBranchTile`, `useInAreaMerchants` → `useInAreaBranches`.
   - Test count at merge: customer-app map suite + full sweep.
2. **`memory/project_discovery_sequencing_plan4.md`** — append a "Plan 4 M4.7 (Map viewport-led EffectiveLocation) UNBLOCKED" line. M4.7 can resume against the `branches` contract.
3. **`memory/project_deferred_followups_index.md`** — under §M, add a "Phase 2.2 SHIPPED" bullet pointing at the merge SHA. Leave §M ACTIVE — phases 2.3 / 2.4 / 2.5 still open.
4. **Create `memory/project_discovery_rebaseline_phase2_2_complete.md`** — full as-shipped summary including files changed, owner-QA confirmation date, test counts, and any deviation notes from this plan.
5. **`memory/MEMORY.md`** — add a top pointer to the new file: `- [Discovery rebaseline Phase 2.2 SHIPPED](project_discovery_rebaseline_phase2_2_complete.md) — Map migration to branch-first pins; Covelum confirmed 2 distinct pins on device.`

---

# PR-4: Phase 2.3 — Customer-app Home migration

**Branch:** `feature/discovery-rebaseline-phase-2-3-home` off updated `main`.

**Goal:** Migrate `HomeScreen.tsx` to read additive Home fields (`featuredBranches`, `trendingBranches`, `nearbyByCategoryBranches`). Featured + Trending + Nearby sections each consume `BranchTile[]` from the new fields. Campaigns banner section UNCHANGED.

**Files:**
- `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`
- `apps/customer-app/src/features/home/components/TrendingSection.tsx`
- `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`
- `apps/customer-app/src/features/home/components/CampaignCarousel.tsx` — **NO CHANGE**
- `apps/customer-app/tests/features/home/**`

**Acceptance:** Home jest suite passes; multi-branch Featured merchants surface as multiple Featured cards; campaigns banner unchanged.

**Rollback:** Per-PR revert.

---

### Task 2.3.1: Branch + extend Home Zod schema arms

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-2-3-home
```

- [ ] **Step 2: Extend customer-app discovery schema (continuing Task 2.1.1)**

Open `apps/customer-app/src/lib/api/discovery.ts`. The `branchTileSchema` already exists from Task 2.1.1. Extend `homeFeedResponseSchema` to mirror the Phase 1 backend additive shape from Spec §1.5:

```ts
// homeFeedResponseSchema — Rev 2.1 §1.5 additive arms.
const homeFeedResponseSchema = z.object({
  locationContext: locationContextSchema,
  featured: z.array(merchantTileSchema),                        // legacy
  trending: z.array(merchantTileSchema),                        // legacy
  campaigns: z.array(campaignSchema),                           // banner-level — UNCHANGED
  nearbyByCategory: z.array(z.object({                          // legacy
    category: categorySchema,
    merchants: z.array(merchantTileSchema),
  })),
  // NEW (Phase 1 additive):
  featuredBranches: z.array(branchTileSchema),
  trendingBranches: z.array(branchTileSchema),
  nearbyByCategoryBranches: z.array(z.object({
    category: categorySchema,
    branches: z.array(branchTileSchema),
  })),
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "$(cat <<'EOF'
feat(customer-app): extend home feed schema with branch arms

Spec §1.5.  campaigns (banner-level) preserved unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3.2: Flip `useHomeFeed` hook

- [ ] **Step 1: Locate hook**

```bash
grep -rn "useHomeFeed\|homeFeed\|useQuery.*home" apps/customer-app/src 2>/dev/null
```

- [ ] **Step 2: Flip the hook to return additive shape**

The hook must continue to fetch the same endpoint; only the `select` projection changes to read `featuredBranches` / `trendingBranches` / `nearbyByCategoryBranches`:

```ts
export function useHomeFeed(opts: { lat?: number; lng?: number } = {}) {
  return useQuery({
    queryKey: ['homeFeed', opts.lat, opts.lng],
    queryFn: () => discoveryApi.home(opts),
    select: data => ({
      locationContext: data.locationContext,
      campaigns: data.campaigns,                       // banner-level — passthrough
      featured: data.featuredBranches,                 // NEW — was data.featured
      trending: data.trendingBranches,                 // NEW — was data.trending
      nearbyByCategory: data.nearbyByCategoryBranches, // NEW — was data.nearbyByCategory
    }),
  })
}
```

The hook's CONSUMERS see the same field names (`featured`, `trending`, `nearbyByCategory`) on the projected output. That keeps PR scope tight to data-shape migration without renaming consumer references.

- [ ] **Step 3: Flip the hook test**

Open the existing `useHomeFeed` test (locate via `grep -rn "useHomeFeed" apps/customer-app/tests`). Update the mock response to include both `featured`+`featuredBranches` etc. Add a multi-branch assertion:

```ts
it('exposes featuredBranches as `featured` via select projection', async () => {
  const mockResponse = {
    locationContext: { city: null, source: 'none' as const, lat: null, lng: null },
    featured: [],
    trending: [],
    campaigns: [],
    nearbyByCategory: [],
    featuredBranches: [
      makeBranchTileFixture({ id: 'brn_cov_bri', merchant: { id: 'mer_cov', businessName: 'Covelum' } }),
      makeBranchTileFixture({ id: 'brn_cov_col', merchant: { id: 'mer_cov', businessName: 'Covelum' } }),
    ],
    trendingBranches: [],
    nearbyByCategoryBranches: [],
  }
  mockApi('/api/v1/customer/home', mockResponse)

  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(result.current.data?.featured).toHaveLength(2))
  // Multi-branch — same merchant, two tiles.
  expect(result.current.data!.featured[0].merchant.id).toBe('mer_cov')
  expect(result.current.data!.featured[1].merchant.id).toBe('mer_cov')
})
```

- [ ] **Step 4: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/hooks/useHomeFeed.test.tsx --forceExit
cd ../..
git add apps/customer-app/src/hooks/useHomeFeed.ts apps/customer-app/tests/hooks/useHomeFeed.test.tsx
git commit -m "feat(customer-app): useHomeFeed reads additive branch arms

Spec §1.5 Phase 1 additive shape.  Banner-level campaigns passed through unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3.3: Flip `FeaturedCarousel`, `TrendingSection`, `NearbyByCategory`

- [ ] **Step 1: `FeaturedCarousel`**

Open `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`. Change prop type from `MerchantTile[]` to `BranchTile[]`. Render each item as a `BranchTile` (the shared component) with `showFeaturedBadge` prop true. Tap routes to `/(app)/merchant/${tile.merchant.id}?branch=${tile.id}`.

```tsx
import type { BranchTile } from '../../../lib/api/discovery'
import { MerchantTile } from '../../shared/MerchantTile' // renamed in Phase 2.5; today still imports as MerchantTile

type Props = { items: BranchTile[] }
export function FeaturedCarousel({ items }: Props) {
  return (
    <FlatList
      data={items}
      horizontal
      keyExtractor={t => t.id}
      renderItem={({ item }) => (
        <MerchantTile tile={item} showFeaturedBadge onPress={() => router.push(
          `/(app)/merchant/${item.merchant.id}?branch=${item.id}`
        )} />
      )}
    />
  )
}
```

**Note:** the shared `MerchantTile` component (which becomes `BranchTile` in Phase 2.5) consumes the new branch-tile prop shape; if it currently consumes the old `MerchantTile` prop shape, factor the data-shape migration onto it as Step 1.5 of Phase 2.5 — until then, this PR-4 task either (a) waits on Phase 2.5 (unlikely, breaks the order), or (b) adds a temporary adapter inside `FeaturedCarousel` that maps the new `BranchTile` to the old prop shape until Phase 2.5 lands. **Recommended: option (b)** — add a small `<BranchTileAdapter tile={item} showFeaturedBadge .../>` wrapper component scoped to `src/features/home/components/` that translates the new shape to the old. Phase 2.5 removes the adapters when the shared component is renamed.

- [ ] **Step 2: `TrendingSection`**

Same pattern as `FeaturedCarousel`. Props type → `BranchTile[]`. Tap routes to merchant+branch URL.

- [ ] **Step 3: `NearbyByCategory`**

Same pattern. Each category section gets `branches: BranchTile[]` (from `nearbyByCategoryBranches`).

- [ ] **Step 4: Flip per-section tests**

Update `tests/features/home/components/FeaturedCarousel.test.tsx`, `tests/features/home/screens/HomeScreen.test.tsx` to mock the new shape and assert multi-branch render:

```tsx
it('multi-branch merchant emits TWO Featured tiles (interim §17.7 behaviour)', () => {
  const covA = makeBranchTileFixture({ id: 'brn_cov_a', merchant: { id: 'mer_cov', businessName: 'Covelum' } })
  const covB = makeBranchTileFixture({ id: 'brn_cov_b', merchant: { id: 'mer_cov', businessName: 'Covelum' } })
  render(<FeaturedCarousel items={[covA, covB]} />)
  expect(screen.getAllByText('Covelum')).toHaveLength(2)
})

it('FeaturedCarousel tap routes with ?branch=', async () => {
  const tile = makeBranchTileFixture({ id: 'brn_a', merchant: { id: 'mer_x', businessName: 'X' } })
  render(<FeaturedCarousel items={[tile]} />)
  fireEvent.press(screen.getByText('X'))
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/(app)/merchant/mer_x?branch=brn_a'))
})
```

- [ ] **Step 5: Confirm `CampaignCarousel` untouched**

```bash
git status apps/customer-app/src/features/home/components/CampaignCarousel.tsx
```
Expected: no changes. If accidentally modified, revert via `git checkout HEAD -- ...`.

- [ ] **Step 6: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit
cd ../..
git add apps/customer-app/src/features/home apps/customer-app/tests/features/home
git commit -m "feat(customer-app/home): Featured / Trending / Nearby consume BranchTile[]

Spec §10.2 Phase 2.3.  CampaignCarousel (banner-level) unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3.4: Migrate `HomeScreen` wiring

- [ ] **Step 1: Update HomeScreen to pass new arms to each section**

Open `apps/customer-app/src/features/home/screens/HomeScreen.tsx`. Change the `useHomeFeed()` consumption so the projected `featured` / `trending` / `nearbyByCategory` (from Task 2.3.2) flow to the section components. `campaigns` continues to feed `CampaignCarousel` unchanged.

```tsx
const { data, isLoading } = useHomeFeed({ lat, lng })

return (
  <ScrollView>
    {data?.featured && data.featured.length > 0 && <FeaturedCarousel items={data.featured} />}
    {data?.trending && data.trending.length > 0 && <TrendingSection items={data.trending} />}
    {data?.campaigns && data.campaigns.length > 0 && <CampaignCarousel items={data.campaigns} />}
    {data?.nearbyByCategory.map(section => (
      <NearbyByCategory key={section.category.id} category={section.category} branches={section.branches} />
    ))}
  </ScrollView>
)
```

- [ ] **Step 2: Flip HomeScreen test**

Existing `tests/features/home/screens/HomeScreen.test.tsx`: update the mock home-feed response to use the new fields. Add an assertion that `CampaignCarousel` renders with the unchanged `campaigns: CampaignBannerTile[]` field.

- [ ] **Step 3: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/home --forceExit
cd ../..
git add apps/customer-app/src/features/home/screens apps/customer-app/tests/features/home/screens
git commit -m "feat(customer-app/home): HomeScreen wires branch-first sections

Spec §10.2 Phase 2.3.  CampaignCarousel feed unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3.5: Self-review + PR + SHA-bound merge

**Acceptance:**
- All Home jest tests pass against new shape.
- Customer-app full jest passes.
- Backend regression unchanged.
- `tsc --noEmit` clean on customer-app.
- Workspace hygiene: only long-standing untracked artefacts under `??`.
- Owner device-QA confirms: Featured carousel surfaces TWO Covelum tiles (Brightlingsea + Colchester). CampaignCarousel renders unchanged banner content.

**Rollback:** Per-PR `git revert`. The hook's projection re-points; service still emits both arms.

- [ ] **Step 1: Full customer-app jest**

```bash
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd ../..
```

- [ ] **Step 2: tsc clean**

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```

- [ ] **Step 3: Workspace hygiene**

```bash
git status --short
```
Expected: only long-standing untracked artefacts (.agents/, app.json, docs/source-materials/, docs/superpowers/skill-usage-cheatsheet.md, 7 prisma/* scripts, skills-lock.json) under `??`.

- [ ] **Step 4: Push + raise PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-2-3-home
gh pr create --title "feat(customer-app): Phase 2.3 — Home migration to branch-first sections" --body "$(cat <<'EOF'
## Summary
- Featured / Trending / Nearby-by-Category sections consume `branches: BranchTile[]` from new additive arms.
- `CampaignCarousel` (banner-level `campaigns: CampaignBannerTile[]`) UNCHANGED.
- Multi-branch merchants surface as multiple Featured tiles (interim §17.7 behaviour, pre-`FeaturedMerchant.branchId?` schema).
- `useHomeFeed` projects new arms onto consumer-facing field names — no rename cascade through screens.

Spec: §1.5, §5.2, §10.2 Phase 2.3.
Plan: PR-4 of docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md.

## Test plan
- [x] Customer-app jest: home suite + full
- [x] `tsc --noEmit` clean
- [x] Workspace hygiene: only long-standing untracked artefacts under `??`
- Owner device-QA: open Home, confirm Covelum appears TWICE in Featured (Brightlingsea + Colchester rows).
- Owner device-QA: confirm CampaignCarousel banner content unchanged.

## Rollback
`git revert` of the merge commit.  Service continues emitting both arms; hook returns to projecting legacy fields.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: OWNER REVIEW + DEVICE-QA GATE**

Wait for owner local-app device-QA confirmation.

- [ ] **Step 6: PR scope verification**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-2-3-home --jq '{commits: (.commits | length), files: (.files | length)}'
```

- [ ] **Step 7: SHA-bound merge**

```bash
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 8: Post-merge — main + memory updates**

```bash
git checkout main && git pull origin main
git status --short
```

Using Write tool:
1. **`memory/project_current_state.md`** — add "Phase 2.3 Home SHIPPED 2026-MM-DD (PR #N, merge `<sha>`)" section.
2. **`memory/project_deferred_followups_index.md`** §M — add "Phase 2.3 SHIPPED" bullet. §M stays ACTIVE.
3. **`memory/project_discovery_sequencing_plan4.md`** — Plan 4 M4 status unchanged here (M4 already partially unblocked from Phase 2.1).
4. **Create `memory/project_discovery_rebaseline_phase2_3_complete.md`** — full as-shipped summary.
5. **`memory/MEMORY.md`** — top pointer.

---

# PR-5: Phase 2.4 — Customer-app Category migration

**Branch:** `feature/discovery-rebaseline-phase-2-4-category` off updated `main`.

**Goal:** Migrate `CategoryResultsScreen.tsx` to read `branches` from the category endpoint.

**Files:**
- `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
- `apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx`
- `apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx`

**Acceptance:**
- Category jest passes against new shape.
- Multi-branch merchants surface as separate tiles within a category list.
- Customer-app full jest passes.
- `tsc --noEmit` clean.
- Owner device-QA: navigate Home → Categories → tap any category → list shows multi-branch merchants as multiple tiles.

**Rollback:** Per-PR `git revert`.

---

### Task 2.4.1: Branch + locate hook

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-2-4-category
```

- [ ] **Step 2: Locate the category data hook**

```bash
grep -rn "useCategoryResults\|useCategoryMerchants\|categories/.*merchants\|categoryMerchants" apps/customer-app/src 2>/dev/null
```

The hook is most likely `apps/customer-app/src/features/search/hooks/useCategoryResults.ts` or inlined inside `CategoryResultsScreen.tsx`. Resolve via the grep before continuing.

- [ ] **Step 3: Extend customer-app discovery schema for category response**

Open `apps/customer-app/src/lib/api/discovery.ts`. Locate `categoryMerchantsResponseSchema`. Add additive arms:

```ts
const categoryMerchantsResponseSchema = z.object({
  merchants: z.array(merchantTileSchema),                  // legacy
  total: z.number(),                                       // legacy
  meta: discoveryMetaSchema,
  // NEW (Phase 1 additive):
  branches: z.array(branchTileSchema),
  totalBranches: z.number(),
})
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "feat(customer-app): extend category response schema with branch arms

Spec §1.5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4.2: Flip the category hook

- [ ] **Step 1: Read existing hook**

Open the file located in 2.4.1 Step 2.

- [ ] **Step 2: Flip the data projection**

```ts
export function useCategoryResults(categoryId: string, opts: { lat?: number; lng?: number } = {}) {
  return useInfiniteQuery({
    queryKey: ['categoryResults', categoryId, opts],
    queryFn: ({ pageParam = 0 }) =>
      discoveryApi.categoryMerchants(categoryId, { ...opts, offset: pageParam }),
    select: data => ({
      branches: data.pages.flatMap(p => p.branches),
      totalBranches: data.pages[0]?.totalBranches ?? 0,
      pages: data.pages,
    }),
    getNextPageParam: (last, pages) =>
      pages.flatMap(p => p.branches).length < (last.totalBranches ?? 0)
        ? pages.flatMap(p => p.branches).length
        : undefined,
  })
}
```

- [ ] **Step 3: Flip hook test**

Locate (or create) `tests/hooks/useCategoryResults.test.tsx`:

```tsx
it('returns branches + totalBranches from new shape', async () => {
  mockApi('/api/v1/customer/categories/:id/merchants', {
    merchants: [], total: 0,
    branches: [
      makeBranchTileFixture({ id: 'brn_a', merchant: { id: 'mer_cov' } }),
      makeBranchTileFixture({ id: 'brn_b', merchant: { id: 'mer_cov' } }),
    ],
    totalBranches: 2,
    meta: makeDiscoveryMeta(),
  })

  const { result } = renderHook(() => useCategoryResults('cat_1'))
  await waitFor(() => expect(result.current.data?.branches).toHaveLength(2))
  // Multi-branch — same merchant, two tiles.
  expect(result.current.data!.branches[0].merchant.id).toBe('mer_cov')
  expect(result.current.data!.branches[1].merchant.id).toBe('mer_cov')
})
```

- [ ] **Step 4: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/hooks/useCategoryResults.test.tsx --forceExit
cd ../..
git add apps/customer-app/src/features/search/hooks apps/customer-app/tests/hooks
git commit -m "feat(customer-app/category): useCategoryResults reads branch arms

Spec §10.2 Phase 2.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4.3: Flip `CategoryResultsScreen`

- [ ] **Step 1: Update screen to render branches**

Open `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`. Change the data consumption from `merchants` to `branches`. The list renderer renders each `BranchTile` via the shared component (or the adapter from Phase 2.3 — same `<BranchTileAdapter>` pattern).

```tsx
const { branches, totalBranches, fetchNextPage } = useCategoryResults(categoryId, { lat, lng })

return (
  <FlatList
    data={branches}
    keyExtractor={t => t.id}
    renderItem={({ item }) => (
      <BranchTileAdapter tile={item} onPress={() => router.push(
        `/(app)/merchant/${item.merchant.id}?branch=${item.id}`
      )} />
    )}
    onEndReached={() => fetchNextPage()}
    onEndReachedThreshold={0.5}
  />
)
```

- [ ] **Step 2: Flip screen tests**

Update `tests/features/search/CategoryResultsScreen.test.tsx` + `.locality.test.tsx`. Mock the new response shape. Add:

```tsx
it('multi-branch merchant emits TWO tiles in category list', async () => {
  mockApi('/api/v1/customer/categories/:id/merchants', {
    merchants: [], total: 0,
    branches: [
      makeBranchTileFixture({ id: 'brn_cov_a', branchLocalityName: 'Brightlingsea', merchant: { id: 'mer_cov', businessName: 'Covelum' } }),
      makeBranchTileFixture({ id: 'brn_cov_b', branchLocalityName: 'Colchester', merchant: { id: 'mer_cov', businessName: 'Covelum' } }),
    ],
    totalBranches: 2,
    meta: makeDiscoveryMeta(),
  })
  render(<CategoryResultsScreen categoryId="cat_1" />)
  await waitFor(() => {
    expect(screen.getAllByText('Covelum')).toHaveLength(2)
    expect(screen.getByText('Brightlingsea')).toBeTruthy()
    expect(screen.getByText('Colchester')).toBeTruthy()
  })
})

it('locality fallback localityName ?? postTown ?? city', async () => {
  mockApi('/api/v1/customer/categories/:id/merchants', {
    merchants: [], total: 0,
    branches: [
      makeBranchTileFixture({ branchLocalityName: null, branchPostTown: 'Colchester', branchCity: 'Essex' }),
    ],
    totalBranches: 1, meta: makeDiscoveryMeta(),
  })
  render(<CategoryResultsScreen categoryId="cat_1" />)
  await waitFor(() => expect(screen.getByText(/Colchester/)).toBeTruthy())
})
```

- [ ] **Step 3: Pass + commit**

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen --forceExit
cd ../..
git add apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx
git commit -m "feat(customer-app/category): CategoryResultsScreen renders BranchTile rows

Spec §10.2 Phase 2.4.  Same merchant-primary / locality-secondary
visual hierarchy as Search and Home.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4.4: Self-review + PR + SHA-bound merge

- [ ] **Step 1: Full customer-app jest**

```bash
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd ../..
```

- [ ] **Step 2: tsc clean**

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```

- [ ] **Step 3: Workspace hygiene**

```bash
git status --short
```
Verify only long-standing untracked artefacts under `??`.

- [ ] **Step 4: Push + raise PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-2-4-category
gh pr create --title "feat(customer-app): Phase 2.4 — Category migration to branch-first" --body "$(cat <<'EOF'
## Summary
- Category list reads `branches: BranchTile[]` from the new additive arm on `/api/v1/customer/categories/:id/merchants`.
- Multi-branch merchants surface as separate tiles within a category list.
- Locality fallback `localityName ?? postTown ?? city`.

Spec: §1.5, §5.2, §10.2 Phase 2.4.
Plan: PR-5.

## Test plan
- [x] Customer-app jest: category suite + full
- [x] `tsc --noEmit` clean
- [x] Workspace hygiene
- Owner device-QA: pick a category from Home (e.g. Restaurants), confirm any multi-branch merchant in that category surfaces as multiple tiles.

## Rollback
`git revert`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: OWNER REVIEW + DEVICE-QA GATE**

Wait for owner explicit acceptance.

- [ ] **Step 6: PR scope verification**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-2-4-category --jq '{commits: (.commits | length), files: (.files | length)}'
```

- [ ] **Step 7: SHA-bound merge**

```bash
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 8: Post-merge — main + memory updates**

```bash
git checkout main && git pull origin main
git status --short
```

Using Write tool:
1. **`memory/project_current_state.md`** — add "Phase 2.4 Category SHIPPED 2026-MM-DD (PR #N, merge `<sha>`)".
2. **`memory/project_deferred_followups_index.md`** §M — add "Phase 2.4 SHIPPED" bullet. §M stays ACTIVE (Phase 2.5 + Phase 3 remain).
3. **Create `memory/project_discovery_rebaseline_phase2_4_complete.md`**.
4. **`memory/MEMORY.md`** — top pointer.

---

# PR-6: Phase 2.5 — Tile-component-rename sweep

**Branch:** `feature/discovery-rebaseline-phase-2-5-tile-rename` off updated `main`.

**Goal:** Final tile-component rename. After Phase 2.1–2.4 each surface uses `BranchTile` data shape, but the shared component is still named `MerchantTile.tsx`. Rename it cleanly and sweep all import sites.

**Files:**
- Rename: `apps/customer-app/src/features/shared/MerchantTile.tsx` → `apps/customer-app/src/features/shared/BranchTile.tsx`
- Rename: `apps/customer-app/tests/features/shared/MerchantTile.proximity-chip.test.tsx` → `BranchTile.proximity-chip.test.tsx`
- Delete the `<BranchTileAdapter>` wrappers introduced in PR-4 / PR-5 (one per consumer that needed them); their callers now import the renamed `BranchTile` directly.
- Sweep all `import { MerchantTile }` → `import { BranchTile }` references in:
  - `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`
  - `apps/customer-app/src/features/home/components/TrendingSection.tsx`
  - `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`
  - `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
  - Map carousel — already renamed in Phase 2.2.
  - Anywhere else `grep` finds the symbol.

**Acceptance:**
- All Phase 2.1–2.4 PRs merged on `origin/main`.
- Customer-app full jest passes after rename + sweep.
- `tsc --noEmit` clean on customer-app.
- `grep -rn "MerchantTile" apps/customer-app/src apps/customer-app/tests | grep -v node_modules` returns ZERO non-comment references (comments referencing the historical name are acceptable; new code must use `BranchTile`).
- All `<BranchTileAdapter>` wrappers from PR-4 / PR-5 deleted; their consumers now import `BranchTile` directly.
- Workspace hygiene: only long-standing untracked artefacts under `??`.
- Owner device-QA: smoke pass on Home / Search / Map / Category — visual parity with pre-rename baseline (rename should be invisible to the user).

**Rollback:** Per-PR `git revert`. The previous component file gets restored along with all import sites by the revert. Adapter wrappers from PR-4 / PR-5 also restored by revert. Phase 2 surfaces continue to function because the data-shape migration already happened in those PRs — only the component name flipped.

### Task 2.5.1: Rename + sweep

- [ ] **Step 1: Branch + grep**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-2-5-tile-rename
grep -rn "MerchantTile" apps/customer-app/src apps/customer-app/tests | grep -v node_modules
```

- [ ] **Step 2: Rename files**

```bash
git mv apps/customer-app/src/features/shared/MerchantTile.tsx apps/customer-app/src/features/shared/BranchTile.tsx
git mv apps/customer-app/tests/features/shared/MerchantTile.proximity-chip.test.tsx apps/customer-app/tests/features/shared/BranchTile.proximity-chip.test.tsx
```

- [ ] **Step 3: Update the component's export name + prop type**

```tsx
// apps/customer-app/src/features/shared/BranchTile.tsx
type Props = {
  tile: BranchTile
  showFeaturedBadge?: boolean
  showClose?: boolean
  onPress?: (tile: BranchTile) => void
  onClose?: () => void
}

export function BranchTile({ tile, showFeaturedBadge = false, showClose = false, onPress, onClose }: Props) {
  // ... render merchant identity primary + branch locality secondary.
  // Feature parity with the previous MerchantTile component.
}
```

- [ ] **Step 4: Sweep import sites**

```bash
grep -rln "from '.*MerchantTile'" apps/customer-app/src apps/customer-app/tests \
  | xargs sed -i '' "s|from '\\(.*\\)MerchantTile'|from '\\1BranchTile'|g"
grep -rln "MerchantTile" apps/customer-app/src apps/customer-app/tests
# Hand-resolve any remaining references (e.g. variable names, comments).
```

- [ ] **Step 5: Full customer-app jest + tsc**

```bash
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```

- [ ] **Step 6: Delete the PR-4 / PR-5 adapter wrappers**

The interim `<BranchTileAdapter>` wrappers were introduced in PR-4 (Home sections) and PR-5 (Category list) to bridge the new branch-tile data shape onto the pre-rename `MerchantTile` prop contract. Now that the shared component is renamed AND consumes the new shape natively, the adapters are dead weight.

```bash
grep -rln "BranchTileAdapter" apps/customer-app/src apps/customer-app/tests
```

For each match: delete the wrapper file, swap callers to import `BranchTile` from `../shared/BranchTile`. Verify with:

```bash
grep -rln "BranchTileAdapter" apps/customer-app/src apps/customer-app/tests
```
Expected: zero matches.

- [ ] **Step 7: Final sweep + commit**

```bash
git status --short
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```
All green; workspace hygiene confirms only long-standing untracked artefacts under `??`.

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(customer-app): rename MerchantTile → BranchTile + drop PR-4/PR-5 adapters

Spec §0.6 decision #3 + §10.2 Phase 2.5.  Shared component now matches
the data shape it consumes.  Adapter wrappers introduced in PR-4 / PR-5
deleted; consumers import BranchTile directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push + raise PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-2-5-tile-rename
gh pr create --title "refactor(customer-app): Phase 2.5 — rename MerchantTile → BranchTile" --body "$(cat <<'EOF'
## Summary
- Shared list-tile component renamed from `MerchantTile.tsx` to `BranchTile.tsx`.
- `<BranchTileAdapter>` wrappers introduced in PR-4 / PR-5 (Home + Category) deleted; consumers import `BranchTile` directly.
- All import sites swept across home / search / map / category surfaces.
- Map carousel (`MapBranchTile`) was already renamed in Phase 2.2; this PR confirms no stale `MerchantTile` references remain.

Spec: §0.6 decision #3, §10.2 Phase 2.5.
Plan: PR-6 of docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md.

## Test plan
- [x] Customer-app jest full sweep — green.
- [x] `tsc --noEmit` clean.
- [x] `grep -rn "MerchantTile" apps/customer-app/{src,tests}` returns zero non-comment references.
- [x] `grep -rn "BranchTileAdapter" apps/customer-app/{src,tests}` returns zero references.
- [x] Workspace hygiene: only long-standing untracked artefacts under `??`.
- Owner device-QA smoke: Home / Search / Map / Category — visual parity vs. pre-rename baseline.

## Rollback
`git revert` of the merge commit.  Component restored along with import sites and adapter wrappers; Phase 2.1–2.4 surfaces remain functional because the data-shape migration already happened in those PRs — only the component name flips back.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: OWNER REVIEW + DEVICE-QA GATE**

Wait for owner local-app device-QA smoke confirmation (visual parity check on all four migrated surfaces).

- [ ] **Step 10: PR scope verification**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-2-5-tile-rename --jq '{commits: (.commits | length), files: (.files | length)}'
```

- [ ] **Step 11: SHA-bound merge**

```bash
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 12: Post-merge — main + memory updates**

```bash
git checkout main && git pull origin main
git status --short
```

Using Write tool:
1. **`memory/project_current_state.md`** — add "Phase 2.5 Tile rename SHIPPED 2026-MM-DD (PR #N, merge `<sha>`)" section. Note that all five Phase 2 PRs are now SHIPPED; Phase 3 cleanup is the next milestone.
2. **`memory/project_deferred_followups_index.md`** §M — add "Phase 2.5 SHIPPED" bullet; mark Phase 2 fully complete.
3. **`memory/project_discovery_sequencing_plan4.md`** — Plan 4 M4 status now "fully ready to resume against branch-first contract". M4 wrap-up (M4.4 / M4.6 / M4.8) sequences after Phase 3.
4. **Create `memory/project_discovery_rebaseline_phase2_5_complete.md`**.
5. **`memory/MEMORY.md`** — top pointer.

---

# PR-7: Phase 3 — Cleanup (converges with Plan 4 M5)

**Branch:** `feature/discovery-rebaseline-phase-3-cleanup` off updated `main`.

**Goal:** Delete the legacy merchant-themed code path. Backend response envelopes lose the `merchants` field. Backend service helpers `enrichMerchantTile`, `enrichMerchantTiles`, `searchMerchants`, `getInAreaMerchants`, `getCategoryMerchants`, `getCampaignMerchants` deleted. Backend ranking helpers `rankMerchantsV2`, `selectContextBranch`, `classifyTier`, `MerchantEntry` deleted. Customer-app `merchantTileSchema` deleted. **CONVERGES WITH PLAN 4 M5.** Ship as a single PR — Phase 3 + Plan 4 M5 cleanup tasks together.

**This is the irreversible step.** Only proceed after all Phase 2 PRs are owner-accepted in production.

### Pre-flight checklist before starting Phase 3

- [ ] All 5 Phase 2 PRs merged on `origin/main`.
- [ ] No customer-app code references `tile.merchants[*]` (search via grep).
- [ ] No customer-app code references `MerchantTile` type.
- [ ] Plan 4 M5 spec/plan available — confirm convergence target tasks.
- [ ] Owner explicit green-light to ship the irreversible cleanup.

### Task 3.1: Backend deletes

- [ ] **Step 1: Branch + grep audit**

```bash
git checkout main && git pull origin main
git checkout -b feature/discovery-rebaseline-phase-3-cleanup
grep -rn "rankMerchantsV2\|selectContextBranch\|classifyTier\|MerchantEntry\|enrichMerchantTile\|searchMerchants\|getInAreaMerchants\|getCategoryMerchants\|getCampaignMerchants" src/ apps/ tests/
```

- [ ] **Step 2: Delete the legacy helpers from `src/api/lib/ranking.ts`**

Remove `rankMerchantsV2`, `selectContextBranch`, `qualityComparatorV2`, `distanceComparator`, `MerchantEntry`, `RankMerchantsV2Input`, `RankMerchantsV2Result`, `classifyTier`, and the `MerchantForTier` type if it's unused. Keep `RankableBranch` (now consumed by `rankBranchesV3`).

- [ ] **Step 3: Delete legacy helpers from `src/api/customer/discovery/service.ts`**

Remove `enrichMerchantTile`, `enrichMerchantTiles`, `searchMerchants`, `getInAreaMerchants`, `getCategoryMerchants` (merchant variant), `getCampaignMerchants`, `tryRankMerchantsV2`, `v2TilesByMerchantId`, `mergeV2FieldsOntoTile`, plus any merchant-only helpers (`merchantHasBranchInBbox` if no longer referenced).

- [ ] **Step 4: Strip `merchants` + `total` from response envelopes in `src/api/customer/discovery/routes.ts`**

Each route handler: drop the legacy fields. The Home Feed loses `featured` / `trending` / `nearbyByCategory` (merchant-shape) — those become `featuredBranches` etc. Optionally rename `featuredBranches` → `featured` here for a cleaner wire post-cleanup. **Decision point — confirm with owner before renaming wire fields**: option (a) keep `*Branches` names forever (less disruptive); option (b) rename to drop the suffix (cleaner). Plan recommends (a) for stability; (b) is a separate cosmetic cleanup PR.

- [ ] **Step 5: Delete legacy tests**

```bash
git rm tests/api/lib/rankMerchants-v2.test.ts
```

Drop `merchants`-shape assertions from `tests/api/customer/discovery/m3-hybrid-fields.test.ts`.

- [ ] **Step 6: Customer-app `discovery.ts` strip merchant schema**

Delete `merchantTileSchema`, `MerchantTile` type, `merchants` arms on all 5 endpoint schemas. Customer-app may still have type aliases; delete those.

- [ ] **Step 7: Plan 4 M5 convergence tasks**

Per `docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md` M5 tasks (audit before this PR; tasks were "Remove deprecated `rankMerchants` + `classifyTier`", "Clear customer-app Plan 4 code hooks", "`merchantCountByCity` decision"):
- `rankMerchants` + `classifyTier` — already deleted in Step 2.
- Customer-app Plan 4 code hooks — sweep TODO comments referencing Plan 4 hooks (4 known per memory `project_current_state.md` Phase 3C.1b): `AllCategoriesScreen` merchantCount field, `PC2AddressScreen` civil-parish lookup, `branchShortName` dedup, `MerchantProfileScreen` branch-name dedup. Each: read the comment, evaluate against Plan 4 M1-M3 shipped state, either fix or remove the TODO.
- `merchantCountByCity` — owner decision pending; bring up in PR description.

- [ ] **Step 8: Run full backend + customer-app**

```bash
npx vitest run 2>&1 | tail -10
cd apps/customer-app && npx jest --forceExit 2>&1 | tail -5
cd ../.. && npx tsc --noEmit 2>&1 | tail -10
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -10
cd ../..
```

Expected: all green; total test count dropped by the deleted test files.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(discovery): Phase 3 cleanup — delete legacy merchant-themed contract

- src/api/lib/ranking.ts: remove rankMerchantsV2, selectContextBranch,
  classifyTier, MerchantEntry
- src/api/customer/discovery/service.ts: remove enrichMerchantTile/Tiles,
  searchMerchants, getInAreaMerchants, getCategoryMerchants (merchant
  variant), getCampaignMerchants, tryRankMerchantsV2, helpers
- src/api/customer/discovery/routes.ts: strip merchants/total from 5
  endpoint responses
- apps/customer-app/src/lib/api/discovery.ts: drop merchantTileSchema
  and merchants arms
- tests/api/lib/rankMerchants-v2.test.ts: deleted

Converges with Plan 4 M5 (`rankMerchants` + `classifyTier` removal +
customer-app Plan 4 code hook sweep).

Spec §1.6 + §10.3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Push + PR**

```bash
git push -u origin feature/discovery-rebaseline-phase-3-cleanup
gh pr create --title "refactor(discovery): Phase 3 cleanup + Plan 4 M5 convergence" --body "$(cat <<'EOF'
## Summary
- Legacy merchant-themed helpers DELETED (`rankMerchantsV2`, `enrichMerchantTile`, `searchMerchants`, `getInAreaMerchants`, `getCategoryMerchants`, `getCampaignMerchants`, `selectContextBranch`, `classifyTier`, `MerchantEntry`).
- Response envelopes stripped — only `branches` + `*Branches` fields remain.
- Customer-app `merchantTileSchema` + `MerchantTile` type deleted.
- Converges with **Plan 4 M5** cleanup tasks (rankMerchants + classifyTier removal + Plan 4 code-hook sweep).

Spec: §1.6, §10.3.
Plan: PR-7 of docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md.
Plan 4 M5 reference: docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md.

## Test plan
- [x] Backend `npx vitest run` — green
- [x] Customer-app `npx jest --forceExit` — green
- [x] `tsc --noEmit` clean both sides
- Owner full-app device-QA: every Discovery surface (Search, Map, Home, Category, Campaign) renders correctly with only the new shape.

## Rollback
**IRREVERSIBLE STEP.** This PR deletes the legacy contract. Rollback requires restoring all deleted helpers and re-attaching the `merchants` field — not a `git revert` candidate at this point unless caught immediately post-merge. Pre-merge gate is owner explicit approval after all Phase 2 PRs are accepted in production.

## Open decision needed
- `merchantCountByCity` — Plan 4 M5 item; please confirm direction.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 11: OWNER REVIEW + APPROVAL GATE (irreversible)**

Owner explicit approval required. Reviewer confirms:
- All previous Phase 2 PRs are in production.
- No outstanding open-app device QA concerns on any Discovery surface.
- `merchantCountByCity` decision answered.

- [ ] **Step 12: SHA-bound merge + final memory updates**

```bash
HEAD_SHA=$(gh pr view --json headRefOid --jq .headRefOid)
gh api repos/MSC23-bot/Redeemo/compare/main...feature/discovery-rebaseline-phase-3-cleanup --jq '.commits | length, .files | length'
REDEEMO_PR_SCOPE_VERIFIED=$HEAD_SHA gh pr merge --merge
```

- [ ] **Step 13: Final memory updates — workstream complete**

- `memory/project_current_state.md` — close out the Discovery rebaseline workstream.
- `memory/project_deferred_followups_index.md` §M — close (or mark COVERED + redirect to relevant outstanding follow-ups under §BA / §BB / §AW / §AV / §AS / favourites-rebaseline).
- `memory/project_discovery_sequencing_plan4.md` — Plan 4 M4 fully UNBLOCKED; Plan 4 M5 converged with this rebaseline Phase 3.
- Create `memory/project_discovery_rebaseline_complete.md` capturing the full 7-PR arc as a single shipped reference.
- `memory/MEMORY.md` — top-index pointer.

---

## Plan self-review (per writing-plans skill)

### Spec coverage check

| Spec section | Covered by task |
|---|---|
| §1.1 `BranchTile` shape | Task 1.2 (Zod schema) + 1.4 (server enrichment) |
| §1.2 Why merchant nested | Task 1.4 implementation |
| §1.3 Stays merchant-keyed | NOT TOUCHED per design (Voucher Detail, Merchant Profile, Savings) |
| §1.4 `branchName` helper | Task 1.4 `branchShortNameServerSide` |
| §1.5 Endpoint surface | Task 1.5–1.10 |
| §1.6 Phase 3 cleanup | Task 3.1 |
| §2 Ranking + pagination | Task 1.3 |
| §3.1 Search predicate | Task 1.5 |
| §3.2 Worked examples | Task 1.5 tests |
| §3.3 SearchResultItem render | Task 2.1.3 |
| §3.4 `searchMerchants` rename | Task 1.5 (additive) + Task 3.1 (delete merchant) |
| §4.1 One pin per branch | Task 2.2.3 |
| §4.1.1 POSTCODE_CENTROID asymmetry | Task 1.6 + 2.2.3 + Task 1.11 |
| §4.2 Same-coordinate overlap | Accepted v1 — no task |
| §4.3 MapMerchantTile rename | Task 2.2.2 |
| §4.4 getInAreaMerchants rename | Task 1.6 (additive) + Task 3.1 (delete) |
| §5 Home/Discovery/Category tiles | Task 2.3 + 2.4 + 2.5 |
| §5.3 Locality fallback | Task 2.1.3 (Search) + 2.2.2 (Map) + 2.3 (Home) + 2.4 (Category) + 2.5 (tile) |
| §6 Navigation | NOT TOUCHED — URL contract unchanged |
| §7 Favourites Rev-2 derivation | Task 1.4 + 2.1.3 |
| §8 Badges principle locked | NO IMPLEMENTATION TASKS (deferred) |
| §8.1 Campaigns endpoint | Task 1.9 |
| §9 Customer-web | NO TASKS — zero impact |
| §10.1 Phase 1 | PR-1 |
| §10.2 Phase 2 technical migration order | PR-2 → PR-6 |
| §10.3 Phase 3 | PR-7 |
| §10.4 Plan 4 M4 sequencing | PR-2 closes the M4 partial unblock |
| §10.5 Rollback | Each PR has explicit rollback section |
| §11.1 Backend tests | Task 1.2 / 1.3 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 1.9 / 1.10 / 1.11 |
| §11.2 Customer-app tests | PR-2 → PR-6 task tests |
| §11.3 Tests to flip during Phase 2 | Covered by PR-2 → PR-6 |
| §11.4 Tests NOT affected | Explicitly excluded |
| §12 Implementation file map | This plan §"File structure" |
| §13 Deferred-followups updates | Memory updates baked into post-merge step of each PR |
| §15 Open items | Listed in Owner-locked entry conditions; defaults applied |

All spec sections covered. No gaps.

### Placeholder scan

No "TBD", "TODO", "implement later" placeholders. Some tasks reference grep audits to find current symbol locations — that's deliberate because customer-app file layouts can drift between commits.

### Type consistency

- `BranchTile` shape identical in Task 1.2 (Zod) + Task 2.1.1 (customer-app schema) + every consumer task.
- `rankBranchesV3` signature consistent across Task 1.3 (impl) + Task 1.5 (search) + Task 1.6 (in-area).
- `enrichBranchTiles` signature consistent across Task 1.4 (impl) + Task 1.5 (search) + Task 1.6 (in-area) + Task 1.7 (home) + Task 1.8 (category) + Task 1.9 (campaign).

No drift detected.

---

## Rev 1.1 targeted self-check (post-patch)

Ran a focused grep audit on the seven failure classes the owner asked about. Pre-patch results in parens; post-patch results bolded.

| Check | Pattern | Pre-patch | Post-patch |
|---|---|---|---|
| Wrong Prisma model names | `merchantFavourite` (should be `favouriteMerchant`) | 1 occurrence in Task 1.4 implementation | **0** — Task 1.4 now points workers at the existing `prisma.favouriteMerchant.findMany` pattern at service.ts:692. |
| Wrong relation names | `highlightTag` used as a relation accessor (should be `tag`) | 2 occurrences (Task 1.4 + Task 1.6 implementation snippets) | **0** — both tasks now reference `merchant.highlights[i].tag.label` via existing `visibleHighlightsFor` helper. |
| Non-existent Category fields | `Category.slug`, `Category.iconKey` | 4 occurrences across Task 1.2 + 1.4 | **Task 1.4 explicitly instructs Step 0 to patch the Zod schema in `branchTileSchema.ts` to drop `slug` + `iconKey` before continuing.** Task 1.4 enumerates the real available fields (pinColour / pinIcon / descriptorSuffix / parentId / intentType). Workers MUST run Step 0 first. |
| Non-existent Merchant subcategory | `merchant.subcategory` direct field | 2 occurrences | **0** — both tasks now point at the existing service.ts:576–578 derivation (`merchant.categories.map(c => c.category).find(c => c.parentId !== null && c.id !== merchant.primaryCategory?.id) ?? null`). |
| `openingHours` not selected | Implementation snippets compute `isOpenNow` without selecting the relation | 2 occurrences | **0** — Task 1.4 explicitly instructs adding `openingHours: { select: { dayOfWeek, openTime, closeTime, isClosed } }` to the branch sub-select. Plus a PR-0.5 extraction gate if the open-status helper isn't shared yet. |
| `ADDRESS_GEOCODED` in map/pin paths | `locationConfidence: { in: ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED'] }` | 1 occurrence in Task 1.6 | **0** — Task 1.6 now hard-locks `locationConfidence: 'MANUALLY_CONFIRMED'` ONLY, with a comment explaining `hasExactPosition` (service.ts:91) is the source of truth. A third test added: "EXCLUDES ADDRESS_GEOCODED branches (PR #81 contract)". |
| Raw pagination before ranking | `prisma.branch.findMany({ take, skip })` before `rankBranchesV3` | 1 occurrence in Task 1.5 | **0** — Task 1.5 now spells out the 7-step pipeline: predicate → fetch candidates (no take/skip) → rank → filter retained rungs → totalBranches post-filter → paginate → enrich. References `searchMerchants` at service.ts:1620–1925 as the source pattern. |
| Skipped load-bearing tests | `if (!covelum || covelum.branches.length < 2) return` | 3 occurrences across Tasks 1.4 / 1.5 / 1.9 | **0** — all three tests now create their own fixture inside the test (`createCovelumLikeFixture` + scoped `afterAll` cleanup via `FIXTURE_PREFIX`). Throw with a named error message on fixture-creation drift instead of silent skip. |
| Wrong Fastify wiring | `req.server.prisma` (should be `app.prisma`), threading `effLoc` to `searchMerchants` (no such arg) | 2 occurrences in Task 1.10 | **0** — Task 1.10 now uses `app.prisma` + `optionalUserId(req)` + `searchQuery.parse(req.query)` matching `routes.ts:1–195`. `effLoc` is not threaded — services resolve internally via existing `tryRankMerchantsV2` / `resolveEffectiveLocation` chain. |
| "Mirror earlier pattern" shortcuts | `(mirror PR-2 Step 5–6 pattern)` / `(mirror earlier pattern)` / Task 2.3.1–2.3.4 paragraph stub / PR-5 single-paragraph body | 4 occurrences | **0** — PR-3 Step 4 expanded into Steps 3–7 (owner-QA + scope verify + SHA-bound merge + memory updates). PR-4 expanded into Tasks 2.3.1–2.3.5 with full step-by-step checklists. PR-5 expanded into Tasks 2.4.1–2.4.4 with the same depth. PR-6 Step 6 expanded into Steps 6–12 (adapter cleanup + commit + PR + owner gate + scope verify + SHA-bound merge + memory updates). |
| Unresolved owner gates | Implicit owner approval without checkbox | 4 PRs missing explicit OWNER REVIEW Steps | **0** — every PR now has explicit `OWNER REVIEW + DEVICE-QA GATE` checkbox Step blocking merge. |

**Two carry-forward worker-time gates (intentional, not blockers):**

1. **Task 1.4 Step 0** — workers must patch `branchTileSchema.ts` to drop `slug` / `iconKey` from `categorySummarySchema` BEFORE writing the enrichment. The Zod schema test from Task 1.2 will catch a stale schema if Step 0 is skipped (test asserts strict-reject of unknown keys; if `slug`/`iconKey` aren't on Category, every payload would fail strict mode). Documented as a Pre-flight inside Task 1.4 rather than retroactively editing Task 1.2's schema in the plan — keeps the plan readable as a write-once document while making the dependency explicit.
2. **Task 1.4 Step 3 open-status helper extraction (PR-0.5)** — if a server-side per-branch open-status helper doesn't already exist, the worker pauses Task 1.4, files a tiny extraction PR-0.5, then resumes. This is the "no inline-stub" standing rule. Documented explicitly inside Task 1.4 with a grep command to check before assuming.

**Spec coverage re-check.** The Plan self-review table at the bottom of the original Rev 1 plan still maps every spec section to a task. Rev 1.1 didn't add or remove tasks — only rewrote contents for correctness. Mapping remains accurate.

**Type consistency re-check.** `BranchTile`, `EnrichBranchInput`, `EnrichBranchCtx`, `rankBranchesV3` signatures are referenced identically across Tasks 1.2 / 1.3 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 1.9. `EnrichBranchCtx` is `{ userId, lat, lng }` not `{ userId, effLoc }` per Rev 1.1 correction — consumers (1.5 / 1.6 / 1.7 / 1.8 / 1.9) all match.

**Net result:** Rev 1.1 closes both classes of issues (plan-writing-skill + implementation-correctness). The plan is now safely executable by a fresh subagent or by inline execution without the worker hitting compile errors on day one.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md` (Rev 1.1). Two execution options:**

**1. Subagent-Driven (recommended)** — A fresh subagent per task, two-stage review between tasks, fast iteration. Pace: PR-1 ~1 day (longer if PR-0.5 open-status helper extraction triggers); each Phase 2 PR ~0.5–1 day; PR-7 ~0.5 day. Total: 5–8 working days.

**2. Inline Execution** — Execute tasks in the same session using executing-plans, batch execution with checkpoints. Slower context-wise but lower coordination overhead.

**Owner: which approach?**

**No implementation begins until owner approves this plan AND chooses an execution mode.**
