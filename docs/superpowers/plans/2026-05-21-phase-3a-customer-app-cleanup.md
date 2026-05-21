# Phase 3a — Customer-app residual legacy cleanup · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the customer-app's residual legacy merchant-first contract artefacts — the `MerchantTile` type alias, the legacy `featured`/`trending`/`nearbyByCategory`/`merchants`/`total`/`meta` declarations on customer-app Zod response schemas, the `makeMerchantTile` test fixture, and the legacy-arm assertions in `tests/lib/api/discovery.test.ts`. Customer-app no longer reads any of these. Wire emission stays untouched (customer-web still reads the legacy contract). Backend services, routes, V1 ranker, `getInAreaMerchants`, `getCategoryMerchants`, `searchMerchants`, `getCampaignMerchants`, `enrichMerchantTile/Tiles` all stay. **No backend changes. No customer-web changes. No wire-shape changes.**

**Architecture:** This PR is customer-app-internal cleanup ONLY. Zod schemas declare the branch-first shape only; Zod default behaviour silently strips legacy wire keys at parse time so wire continues emitting both shapes without breaking customer-app. The Phase 2.5 negative-pin meta-test is extended to forbid future re-introduction of `MerchantTile` type imports and `makeMerchantTile` fixture imports under `apps/customer-app/src/`.

**Tech Stack:** Expo SDK 54, jest-expo. No backend changes, no Prisma migrations.

---

## 0. Owner-locked direction (2026-05-21)

| # | Decision | Locked value |
|---|---|---|
| **0.1** | Scope | **Option A — Minimal Phase 3a customer-app-internal cleanup only.** No backend route/service changes, no wire-shape changes, no customer-web changes. |
| **0.2** | Branch + base | Base `main` at `a069a2e`; branch `feature/discovery-rebaseline-phase-3a-customer-app-cleanup`. |
| **0.3** | `makeMerchantTile` fixture | **REMOVE** the fixture file entirely. Migrate 9 consumer test files to `makeBranchTile`. |
| **0.4** | `discovery.test.ts` legacy assertions | **DELETE** the legacy `r.merchants[]` parse assertions where branch-first equivalents already exist. Keep tests that verify branch-first parse behaviour. |
| **0.5** | Deferred-followups entry §CU | **ADD** explicit deferred entry for "Phase 3b backend cleanup + Plan 4 M5.3 — blocked on customer-web branch-first migration". |
| **0.6** | Tier | **Tier 2 plan-first.** Bounded scope, behaviour-preserving, no architectural decision. |
| **0.7** | No knowingly broken intermediate commit | Standing rule from Phase 2.5 §0.11 carries forward. Every commit in the chain MUST be `tsc --noEmit` clean + jest-passing. |
| **0.8** | No visual / design / polish work | Standing rule. |
| **0.9** | No `<SavePill>` / `<VoucherCountPill>` shape changes | Phase 2.5 §BY escalation gate carries forward. PAUSE if needed. |
| **0.10** | Negative-pin meta-test extension | Extend `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` with new patterns forbidding `MerchantTile` type imports and `makeMerchantTile` fixture imports under `apps/customer-app/src/`. |
| **0.11** | Standing rules carry forward | SHA-bound merge command; subagent-driven implementer + spec/code-quality reviewer per task; owner device-QA gate before merge (lighter than Phase 2.5 — no visual surface impacted). |
| **0.12** | **Amendment — 4 audit corrections (2026-05-21 owner re-review)** | (a) `inAreaResponseSchema.meta` MUST STAY (Map `mapDataView.ts:63` reads `d?.branchMeta ?? d?.meta`; InAreaResponse has no `branchMeta`, so `.meta` is the only envelope). (b) `CategoryResultsScreen.tsx:164,170` carries legacy `?? data?.total` and `?? data?.meta` fallbacks — owner option (a) locked: add small source cleanup to switch to `data?.totalBranches ?? 0` and `data?.branchMeta`, then schema removal is safe. (c) Audit claim in §1.2 corrected — there ARE 2 source-side legacy reads (Category + mapDataView), not zero; my original grep missed the `??` fallback pattern. (d) Task E cascade-cleanup: if `merchantTileSchema` becomes unused, also remove its dependent legacy-only helpers `supplyTierSchema` / `SupplyTier` type / `highlightSchema` / `MerchantTileHighlight` type (audit-confirmed: no src-tree consumers outside `merchantTileSchema` itself). |

---

## 1. Audit-verified inventory (2026-05-21 against `a069a2e`)

### 1.1 Legacy fields to remove from `apps/customer-app/src/lib/api/discovery.ts`

| Field path | Line(s) | Schema | Action |
|---|---|---|---|
| `MerchantTile` type alias | 149 | `export type MerchantTile = z.infer<typeof merchantTileSchema>` | **DELETE** |
| `homeFeedResponseSchema.featured` | 306 | `z.array(merchantTileSchema)` | **DELETE** |
| `homeFeedResponseSchema.trending` | 307 | `z.array(merchantTileSchema)` | **DELETE** |
| `homeFeedResponseSchema.nearbyByCategory` | 309-313 | `z.array({category, merchants})` | **DELETE** |
| `searchResponseSchema.merchants` | 376 | `z.array(merchantTileSchema)` | **DELETE** |
| `searchResponseSchema.total` | 377 | `z.number()` | **DELETE** |
| `searchResponseSchema.meta` | 378 | `discoveryMetaSchema.optional()` | **DELETE** (customer-app reads `branchMeta` only post Phase 2.4) |
| `categoryMerchantsResponseSchema.merchants` | 400 | `z.array(merchantTileSchema)` | **DELETE** |
| `categoryMerchantsResponseSchema.total` | 401 | `z.number()` | **DELETE** — requires §0.12(b) source cleanup at `CategoryResultsScreen.tsx:164` first (clean `data?.totalBranches ?? 0`, drop the `?? data?.total` fallback) |
| `categoryMerchantsResponseSchema.meta` | 402 | `discoveryMetaSchema` | **DELETE** — requires §0.12(b) source cleanup at `CategoryResultsScreen.tsx:170` first (clean `data?.branchMeta`, drop the `?? data?.meta` fallback) |
| `inAreaResponseSchema.merchants` | 410 | `z.array(merchantTileSchema)` | **DELETE** — zero source consumers (Map reads `data?.branches` only) |
| `inAreaResponseSchema.total` | 411 | `z.number()` | **DELETE** — `mapDataView.ts:62` falls back to `branches.length` (NOT `data?.total`); zero source consumers |
| `inAreaResponseSchema.meta` | 412 | `inAreaMetaSchema` | **🛑 KEEP** per §0.12(a) — `mapDataView.ts:63` reads `d?.branchMeta ?? d?.meta` and InAreaResponse has NO `branchMeta` field on the wire, so `.meta` is the SINGLE COHERENT envelope for Map's default in-area mode. Removing this breaks `<MapEmptyArea>` empty-state classification + `<ViewportLocalityBadge>`. |

**NOT touched** (kept as branch-first canonical schemas): `homeFeedResponseSchema.locationContext`, `homeFeedResponseSchema.campaigns` (banner-level, not merchant array), `homeFeedResponseSchema.featuredBranches`, `homeFeedResponseSchema.trendingBranches`, `homeFeedResponseSchema.nearbyByCategoryBranches`, `searchResponseSchema.branches/totalBranches/branchMeta`, `categoryMerchantsResponseSchema.branches/totalBranches/branchMeta`, `inAreaResponseSchema.branches`, `merchantTileSchema` itself (still used internally — see §1.3).

### 1.2 Customer-app source consumers — audit (corrected 2026-05-21 per §0.12(c))

**Original claim was wrong** — my initial grep missed the `??` fallback pattern. Re-audit:

**Direct reads** (e.g. `data?.merchants` accessing the field as primary value) — **zero hits**. Phase 2.5 left no surfaces that primary-read legacy fields.

**Fallback reads** (e.g. `data?.branchMeta ?? data?.meta`) — **TWO LEGITIMATE CONSUMERS**:

| File | Line | Pattern | Action |
|---|---|---|---|
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | 164 | `data?.totalBranches ?? data?.total ?? 0` | Phase 3a Task E cleans → `data?.totalBranches ?? 0` |
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | 170 | `data?.branchMeta ?? data?.meta` | Phase 3a Task E cleans → `data?.branchMeta` |
| `apps/customer-app/src/features/map/utils/mapDataView.ts` | 63 | `d?.branchMeta ?? d?.meta` | **🛑 STAYS** — load-bearing for InAreaResponse default-mode meta envelope (§0.12(a)) |

The CategoryResultsScreen `??` fallbacks were added defensively in Phase 2.4 wave-2 when `branchMeta` was first introduced; Phase 2.4 made `branchMeta` + `totalBranches` canonical, so the legacy fallbacks are now dead-code safety nets. Removing them is the Phase 3a source cleanup.

`mapDataView.ts:63` is fundamentally different: InAreaResponse's wire shape has only `meta` (the route does NOT emit `branchMeta`), so the fallback to `d?.meta` is the SOURCE of meta data for Map's default in-area mode — not a fallback. This is why `inAreaResponseSchema.meta` MUST STAY.

**Other legacy field reads** (direct `data?.merchants` / `data?.featured` / `data?.trending` / `data?.nearbyByCategory`) — still **zero hits** as previously stated.

### 1.2.1 Customer-app source files affected by Phase 3a

| File | Why touched |
|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | Drop `MerchantTile` + legacy fields from response schemas + cascade dependents (§0.12(d)) |
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | Drop the 2-line legacy `??` fallback per §0.12(b) (Task E) |
| (no other src files) | — |

### 1.3 `merchantTileSchema` removal + cascade audit (corrected per §0.12(d))

**Audit-verified cascade chain** (`apps/customer-app/src/lib/api/discovery.ts` references):

| Symbol | Line | Other consumers in src tree? |
|---|---|---|
| `merchantTileSchema` (Zod) | 84 | Only referenced internally (lines 306-411 via `z.array(merchantTileSchema)`) — all those references gone in Task F |
| `MerchantTile` type alias | 149 | Audit-verified zero src-tree consumers outside discovery.ts itself |
| `supplyTierSchema` | 18 | Only referenced internally at line 132 (`supplyTier: supplyTierSchema.nullable().optional()` inside `merchantTileSchema`) |
| `SupplyTier` type alias | 19 | Audit-verified zero src-tree consumers outside discovery.ts itself |
| `highlightSchema` | 72 | Only referenced internally at line 134 (`highlights: z.array(highlightSchema).optional()` inside `merchantTileSchema`) |
| `MerchantTileHighlight` type alias | 78 | Audit-verified zero src-tree consumers outside discovery.ts itself |

**Conclusion**: ALL FIVE symbols become orphans once `merchantTileSchema`'s 4 references (in the four response schemas) are deleted. Phase 3a Task F removes the entire cascade.

**Defensive verification step in Task F**: re-grep each symbol after the response-schema deletions. If any unexpected src-tree consumer surfaces (e.g. a third-party import discovered late), PAUSE and escalate rather than blind-delete.

**Branch-side schemas are independent**: `branchTileSchema` declares its own `branchTileMerchantGroupingSchema` (lines ~187-200) with its own `voucherCount` / `maxEstimatedSaving` / etc., AND its own `branchTileHighlightSchema` (line ~187-190). These do NOT depend on `supplyTierSchema` / `highlightSchema` / `merchantTileSchema`. Removing the merchant-side cascade does not touch the branch-side.

### 1.4 Test files using `makeMerchantTile` (9 consumers)

| File | LOC ref | What it constructs |
|---|---|---|
| `apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx` | 2 occurrences | `mockTile` mock data |
| `apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx` | 2 occurrences | `mockTile` mock data |
| `apps/customer-app/tests/features/map/useInAreaBranches.test.tsx` | 3 occurrences | Mock data |
| `apps/customer-app/tests/features/map/MapScreen.locality.test.tsx` | 2 occurrences | Mock data |
| `apps/customer-app/tests/features/map/MapScreen.loader.test.tsx` | 2 occurrences | Mock data |
| `apps/customer-app/tests/features/map/CustomPin.test.tsx` | 1 occurrence | Pin fixture |
| `apps/customer-app/tests/hooks/useSearch.test.tsx` | 3 occurrences | Mock data |
| `apps/customer-app/tests/fixtures/merchantTile.ts` | 3 (the file itself) | `makeMerchantTile` definition |
| `apps/customer-app/tests/lib/api/discovery.test.ts` | (uses fixture indirectly via `tile` variable) | Legacy parse-test mocks |

Excluded:
- `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` — references `MerchantTile` ONLY in the negative-pin regex / docstring; not a consumer of the type or fixture. Stays untouched.
- `apps/customer-app/tests/fixtures/branchTile.ts` — imports `BranchTile` type only, NOT `MerchantTile`. Comment references `makeMerchantTile` in a docstring (`Override pattern matches makeMerchantTile`); update comment text but no code change needed.

### 1.5 `discovery.test.ts` legacy-arm assertions (Task C scope)

Audit-confirmed assertions on `r.merchants[0]?.field` in `apps/customer-app/tests/lib/api/discovery.test.ts`:

| Line | Assertion | Phase 3a action |
|---|---|---|
| 67 | `expect(r.merchants[0]?.supplyTier).toBe('NEARBY')` | DELETE — legacy parse, branch-first equivalent at `tests/api/customer/discovery/m3-hybrid-fields.test.ts` and customer-app branch-tile tests |
| 222-223 | `expect(typeof r.branches[0]?.merchant.totalEstimatedSaving).toBe('number')` (already branch-first) | KEEP |
| 302-305 | `r.merchants[0]?.supplyRung/proximityBand/distanceMetres/contextBranchId` toBeUndefined assertions | DELETE — these test M3 hybrid back-compat on the legacy arm; the branch-first arm at `branches[]` is the canonical surface post Phase 2.5 |
| 328-330 | `expect(r.merchants[0]?.supplyRung).toBe('NEARBY')` (M3 hybrid V2 case) | DELETE — same; M3 hybrid is now tested on the branch arm |

Audit will need to look at the full file before locking exact assertions to delete vs keep. Treat as plan-time list; implementer verifies during Task C.

### 1.6 Negative-pin meta-test extension (Task F scope)

Existing `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` covers:
1. Adapter file paths do NOT exist
2. No source file imports/calls `branchToMerchantTile(Props)?`
3. No source file under `features/**` imports `'@/features/shared/MerchantTile'`

Phase 3a EXTENDS the same test file with:
4. **No source file under `apps/customer-app/src/` imports `MerchantTile` (named import) from `'@/lib/api/discovery'`.** The wire-type alias was deleted in Task E; this is belt-and-braces (tsc covers it) but locks the future structural invariant.
5. **No source file under `apps/customer-app/src/` imports `makeMerchantTile` (named import).** Same rationale.

Patterns:
- `/import\s+(?:type\s+)?\{[^}]*\bMerchantTile\b[^}]*\}\s+from\s+['"]@\/lib\/api\/discovery['"]/`
- `/import\s+\{[^}]*\bmakeMerchantTile\b[^}]*\}/`

---

## 2. Out of scope (explicit — locked from §0)

- ❌ NO backend route / service / function changes
- ❌ NO removal of `searchMerchants`, `getCategoryMerchants`, `getInAreaMerchants`, `getCampaignMerchants`, `enrichMerchantTile`, `enrichMerchantTiles`
- ❌ NO removal of `rankMerchants` V1 + `classifyTier` (Plan 4 M5.3 — blocked on customer-web)
- ❌ NO wire-shape changes — every endpoint keeps emitting both legacy and branch-first arms
- ❌ NO customer-web changes — customer-web continues consuming legacy contract unchanged
- ❌ NO Plan 4 M5.3 work (deferred under §CU)
- ❌ NO Plan 4 M5.4 legacy-field-removal (P1.10 explicit no-op)
- ❌ NO §BY pill/copy migration; PAUSE + escalate if `<SavePill>` / `<VoucherCountPill>` shapes need changing
- ❌ NO §CO Home polish / §CN Campaign / §CL handlers / §CQ Category UX / §CP chip semantics / §CR Trending model / §CS Category perf / §CT Map filter correctness / §CK Map polish
- ❌ NO visual / design / motion / styling changes anywhere
- ❌ NO docs/memory text chasing — only specific source-comment cleanup IF a touched file has a stale reference
- ❌ NO `merchantTileSchema` Zod schema declaration removal UNLESS Task E audit confirms zero remaining usages

---

## 3. File-by-file scope

### 3.1 Files modified

| File | Action |
|---|---|
| `apps/customer-app/src/lib/api/discovery.ts` | Drop `MerchantTile` type alias + legacy fields from `homeFeedResponseSchema`, `searchResponseSchema`, `categoryMerchantsResponseSchema` (merchants + total + meta); drop `merchants` + `total` from `inAreaResponseSchema` (KEEP `.meta` per §0.12(a)); drop `merchantTileSchema` + cascade dependents (`supplyTierSchema` / `SupplyTier` type / `highlightSchema` / `MerchantTileHighlight` type) per §0.12(d) |
| **NEW per §0.12(b)**: `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | Lines 164 + 170 source cleanup: `data?.totalBranches ?? data?.total ?? 0` → `data?.totalBranches ?? 0`; `data?.branchMeta ?? data?.meta` → `data?.branchMeta`. Drops the dead legacy `??` fallbacks added defensively in Phase 2.4. Comment context updated to reflect the canonical post-2.4 contract. |
| `apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx` | `makeMerchantTile` → `makeBranchTile`; remove legacy `merchants[]` from mock payloads (Zod strips them anyway, but cleaner to omit) |
| `apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx` | Same |
| `apps/customer-app/tests/features/map/useInAreaBranches.test.tsx` | Same |
| `apps/customer-app/tests/features/map/MapScreen.locality.test.tsx` | Same |
| `apps/customer-app/tests/features/map/MapScreen.loader.test.tsx` | Same |
| `apps/customer-app/tests/features/map/CustomPin.test.tsx` | Same |
| `apps/customer-app/tests/hooks/useSearch.test.tsx` | Same |
| `apps/customer-app/tests/lib/api/discovery.test.ts` | Delete legacy-arm assertions per §1.5; keep branch-first assertions |
| `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts` | Extend with 2 new negative-pin patterns per §1.6 |
| `apps/customer-app/tests/fixtures/branchTile.ts` | Cosmetic: update the docstring comment that references `makeMerchantTile` for context |

### 3.2 Files deleted

| File | Reason |
|---|---|
| `apps/customer-app/tests/fixtures/merchantTile.ts` | Fixture no longer needed (per §0.3); 9 consumer files migrated to `makeBranchTile` in Task B |

### 3.3 Files NOT touched (explicit out-of-scope)

- Every backend file (`src/api/**`, `tests/api/**`, `tests/prisma/**`)
- All customer-web files (`apps/customer-web/**`)
- All customer-app source files under `apps/customer-app/src/` EXCEPT `lib/api/discovery.ts`
- `apps/customer-app/tests/fixtures/branchTile.ts` core fixture (only docstring touch)

---

## 4. Tasks

### Task A: Pre-implementation verification

- [ ] **A1** Confirm zero customer-app source consumers of legacy fields:

```bash
grep -rnE "data\?\.merchants|data\.merchants|data\?\.featured|data\.featured|data\?\.trending|data\.trending|data\?\.nearbyByCategory|data\.nearbyByCategory" apps/customer-app/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "branches\|branchMeta\|totalBranches"
```

Expected output: EMPTY. If any hit, PAUSE and escalate.

- [ ] **A2** Confirm `MerchantTile` type imports in customer-app source:

```bash
grep -rnE "import\s+(?:type\s+)?\{[^}]*\bMerchantTile\b[^}]*\}\s+from" apps/customer-app/src 2>/dev/null
```

Expected: zero hits (only `lib/api/discovery.ts` defines it; no source imports it). If any other source file imports it, PAUSE and escalate.

- [ ] **A3** Confirm `makeMerchantTile` consumers — should be exactly 9 test files (per §1.4 audit):

```bash
grep -rln "makeMerchantTile" apps/customer-app 2>/dev/null
```

PAUSE and escalate if the count differs from the audit.

- [ ] **A4** Capture baseline jest:

```bash
cd apps/customer-app && npx jest --forceExit --silent 2>&1 | tail -5
```

Expected: ~207 suites / ~2097 tests passing (post Phase 2.5). PAUSE if numbers diverge.

- [ ] **A5** Capture baseline tsc:

```bash
cd apps/customer-app && npx tsc --noEmit > /tmp/tsc-baseline-p3a.log 2>&1; echo "EXIT=$?"; wc -l /tmp/tsc-baseline-p3a.log
```

Expected: exit 0, zero errors.

### Task B: Migrate test fixtures `makeMerchantTile` → `makeBranchTile` (9 consumer files)

**Buildable end-state**: after this task, `makeMerchantTile` is unused but the fixture file still exists. Tsc clean, jest pass.

- [ ] **B1** For each of the 9 consumer files (per §1.4), apply the systematic transform:
  - `import { makeMerchantTile } from '../../fixtures/merchantTile'` → `import { makeBranchTile } from '../../fixtures/branchTile'` (adjust path depth per file)
  - `makeMerchantTile({ id: 'X', businessName: 'Y', ... })` → `makeBranchTile({ id: 'X', merchant: { businessName: 'Y' }, ... })`. Field-path remapping per §1.2 of the Phase 2.5 plan (same table — top-level vs nested merchant grouping).
  - Mock payloads that include `merchants: [mockTile]` should change to `branches: [mockBranch]` to match the branch-first wire shape.
  - **Defensive**: do NOT change assertion VALUES. Only the fixture builder name + field-path layout.

- [ ] **B2** Run jest after each file migration to catch breakage early:

```bash
cd apps/customer-app && npx jest <specific-file> --forceExit --silent 2>&1 | tail -5
```

PAUSE if any test breaks because of an assertion that depends on `MerchantTile` field paths that don't translate to `BranchTile`. Likely failure modes:
- Tests that read `mockTile.distance` (top-level on MerchantTile, top-level on BranchTile too — OK)
- Tests that read `mockTile.voucherCount` (top-level on MerchantTile, nested under `branch.merchant.voucherCount` on BranchTile — needs remap)

- [ ] **B3** Full jest sweep:

```bash
cd apps/customer-app && npx jest --forceExit --silent 2>&1 | tail -5
```

Expected: 207 suites / 2097 tests passing. PAUSE if any regression.

- [ ] **B4** Customer-app tsc clean.

- [ ] **B5** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx \
        apps/customer-app/tests/features/search/CategoryResultsScreen.locality.test.tsx \
        apps/customer-app/tests/features/map/useInAreaBranches.test.tsx \
        apps/customer-app/tests/features/map/MapScreen.locality.test.tsx \
        apps/customer-app/tests/features/map/MapScreen.loader.test.tsx \
        apps/customer-app/tests/features/map/CustomPin.test.tsx \
        apps/customer-app/tests/hooks/useSearch.test.tsx
git commit -m "$(cat <<'EOF'
test(customer-app): migrate makeMerchantTile → makeBranchTile (9 files)

Phase 3a Task B. The 9 test files that constructed mock data via the
legacy `makeMerchantTile` fixture now build BranchTile fixtures via
`makeBranchTile`. Field paths remapped per the Phase 2.5 §1.2 table
(top-level branch fields + nested branch.merchant.* grouping).
Assertion values unchanged.

`makeMerchantTile` fixture file stays for now — Task D deletes it
once it's truly unused.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task C: Drop legacy-arm assertions in `discovery.test.ts`

**Buildable end-state**: legacy-shape parse tests removed; branch-first parse tests retained. Tsc + jest still pass.

- [ ] **C1** Open `apps/customer-app/tests/lib/api/discovery.test.ts` and audit every `r.merchants[0]?.*` / `r.merchants[*].field` assertion. Classify each:
  - **Legacy parse contract** (e.g. testing `supplyTier` populated on the legacy arm) → DELETE.
  - **Branch-first equivalent already exists** (in the same file or in `m3-hybrid-fields.test.ts`) → DELETE.
  - **Defensive cross-check still valuable** (e.g. testing that legacy + branch arms both expose the same supplyRung) → KEEP unless audit shows redundancy.

Likely deletions per §1.5 audit:
- Line 67: `expect(r.merchants[0]?.supplyTier).toBe('NEARBY')` — DELETE (covered by branch arm)
- Line 302-305: `r.merchants[0]?.supplyRung/proximityBand/distanceMetres/contextBranchId` assertions — DELETE
- Line 328-330: M3 hybrid V2 case — DELETE (covered by branch arm)

KEEP every `r.branches[0]?.*` assertion (those are the Phase 2.4 branch-first parse pins — load-bearing).

- [ ] **C2** Also remove any mock payloads in the file that ONLY include legacy fields (no branch arm). Update mock payloads to provide branch-first arms instead.

- [ ] **C3** Run jest on the touched file:

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts --forceExit --silent 2>&1 | tail -5
```

All remaining tests pass.

- [ ] **C4** Customer-app tsc clean.

- [ ] **C5** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/tests/lib/api/discovery.test.ts
git commit -m "$(cat <<'EOF'
test(discovery): drop legacy-arm parse assertions

Phase 3a Task C. Removes the customer-app's `r.merchants[0]?.field`
parse assertions from tests/lib/api/discovery.test.ts where:

  - The branch-first arm at r.branches[0] already pins the same
    behaviour, OR
  - The legacy-arm assertion was testing a contract customer-app no
    longer reads post Phase 2.5.

Branch-first parse assertions on r.branches[] stay (Phase 2.4 pins).
Wire still emits the legacy arm; customer-app schemas will silently
strip it (Task E). Backend tests still verify the legacy wire shape
end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task D: Delete `tests/fixtures/merchantTile.ts`

**Buildable end-state**: fixture deleted; no consumers remain (Task B handled them). Tsc + jest still pass.

- [ ] **D1** Confirm `makeMerchantTile` has zero remaining importers post-Task-B:

```bash
grep -rn "makeMerchantTile" apps/customer-app 2>/dev/null
```

Should return only:
- `apps/customer-app/tests/fixtures/merchantTile.ts` (the file itself)
- `apps/customer-app/tests/fixtures/branchTile.ts` (docstring comment only — preserved)

PAUSE if any consumer file still imports the fixture.

- [ ] **D2** Delete the fixture:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git rm apps/customer-app/tests/fixtures/merchantTile.ts
```

- [ ] **D3** Customer-app tsc + jest sweep — must still pass cleanly.

- [ ] **D4** Commit:

```bash
git commit -m "$(cat <<'EOF'
chore(customer-app): delete makeMerchantTile fixture

Phase 3a Task D. The customer-app's legacy makeMerchantTile fixture
is no longer consumed by any test (Task B migrated all 9 consumers
to makeBranchTile). Removing the fixture finalises the customer-app's
internal cleanup of merchant-first test scaffolding.

Backend tests + customer-web are unaffected (separate codebases /
contracts).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task E: CategoryResultsScreen source cleanup (per §0.12(b))

**Buildable end-state**: `CategoryResultsScreen.tsx` reads `data?.totalBranches ?? 0` and `data?.branchMeta` directly. Tsc + jest still pass. Unblocks Task F's schema deletion of `categoryMerchantsResponseSchema.total/meta`.

- [ ] **E1** Confirm exact line numbers:

```bash
grep -n "data?\.totalBranches\|data?\.branchMeta" apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx
```

Expected (against `a069a2e`): line 164 + line 170.

- [ ] **E2** Apply the two-line cleanup. Before / after:

```diff
- const total     = data?.totalBranches ?? data?.total ?? 0
+ const total     = data?.totalBranches ?? 0
```

```diff
- const meta      = data?.branchMeta ?? data?.meta
+ const meta      = data?.branchMeta
```

Update any inline comments that reference "legacy fallback" or "Phase 2.4 defensive fallback" near these lines to reflect the post-3a canonical contract (branchMeta + totalBranches are canonical; no legacy fallback needed). Comment context only — no other code changes.

- [ ] **E3** Customer-app tsc clean (still should pass at this commit since schema legacy arm is intact):

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **E4** Run Category test suites:

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen --forceExit --silent 2>&1 | tail -5
```

All pins pass.

- [ ] **E5** Full customer-app jest sweep — must still pass.

- [ ] **E6** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx
git commit -m "$(cat <<'EOF'
feat(category): drop legacy total/meta fallbacks; canonicalise on branchMeta + totalBranches

Phase 3a Task E (per plan §0.12(b)). The defensive `??` fallbacks on
`data?.total` and `data?.meta` that Phase 2.4 wave-2 added to
CategoryResultsScreen.tsx are now dead code. Phase 2.4 made
`branchMeta` + `totalBranches` canonical on the category-merchants
endpoint; the legacy `total` + `meta` arms have zero remaining
customer-app readers.

  - Line 164: `data?.totalBranches ?? data?.total ?? 0` → `data?.totalBranches ?? 0`
  - Line 170: `data?.branchMeta ?? data?.meta` → `data?.branchMeta`

Wire emission is UNCHANGED — backend keeps emitting both shapes
(customer-web still consumes the legacy arm). Customer-app simply
stops referencing the legacy fields, which unblocks Task F's removal
of `categoryMerchantsResponseSchema.total/meta` schema declarations.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F: Drop legacy schema fields + `MerchantTile` type alias + cascade dependents from `discovery.ts`

**Buildable end-state**: Zod schemas declare branch-first shape only; wire keeps emitting both shapes; Zod default behaviour strips legacy keys silently at parse time. `inAreaResponseSchema.meta` STAYS per §0.12(a). All `merchantTileSchema` dependents (cascade per §0.12(d)) removed if audit-confirmed orphan. Tsc + jest still pass.

- [ ] **F1** Open `apps/customer-app/src/lib/api/discovery.ts`. Apply edits per §1.1 (corrected per §0.12):
  - Line 149: DELETE `export type MerchantTile = z.infer<typeof merchantTileSchema>`
  - Lines 306-313: DELETE `featured`, `trending`, `nearbyByCategory` field declarations from `homeFeedResponseSchema`
  - Lines 376-378: DELETE `merchants`, `total`, `meta` field declarations from `searchResponseSchema`
  - Lines 400-402: DELETE `merchants`, `total`, `meta` field declarations from `categoryMerchantsResponseSchema`
  - Line 410: DELETE `merchants` field declaration from `inAreaResponseSchema`
  - Line 411: DELETE `total` field declaration from `inAreaResponseSchema`
  - Line 412: **🛑 KEEP `meta: inAreaMetaSchema`** per §0.12(a) — load-bearing for Map default in-area mode (`mapDataView.ts:63` reads `d?.branchMeta ?? d?.meta`; InAreaResponse has NO `branchMeta` field on the wire, so `.meta` is the SINGLE coherent envelope).
  - Update inline comments referencing legacy fields to reflect that customer-app schema no longer carries the legacy `merchants`/`total` arms (wire still emits; customer-app strips on parse). For `inAreaResponseSchema.meta`: ADD a comment explaining why this field STAYS (InAreaResponse has no branchMeta on the wire, so meta is the only envelope).

- [ ] **F2** Cascade audit per §1.3 — confirm no other src-tree consumers exist:

```bash
grep -rnE "\bsupplyTierSchema\b|\bSupplyTier\b|\bMerchantTileHighlight\b|\bhighlightSchema\b|\bmerchantTileSchema\b" apps/customer-app/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "lib/api/discovery.ts"
```

Expected: EMPTY (per §1.3 audit). If any consumer surfaces, PAUSE and escalate — do NOT blind-delete the dependents.

- [ ] **F3** Delete `merchantTileSchema` + cascade dependents at `discovery.ts`:
  - Line ~84: DELETE `const merchantTileSchema = z.object({...})` (entire block)
  - Line ~18: DELETE `const supplyTierSchema = z.enum(['NEARBY', 'CITY', 'DISTANT'])`
  - Line ~19: DELETE `export type SupplyTier = z.infer<typeof supplyTierSchema>`
  - Line ~72: DELETE `const highlightSchema = z.object({...})` (entire block)
  - Line ~78: DELETE `export type MerchantTileHighlight = z.infer<typeof highlightSchema>`

  Defensive: if F2 returned ANY hit, KEEP the schema + its dependents. Branch-side schemas (`branchTileMerchantGroupingSchema` / `branchTileHighlightSchema`) are independent per §1.3.

- [ ] **F4** Customer-app tsc clean:

```bash
cd apps/customer-app && npx tsc --noEmit 2>&1 | tail -20
```

Expected: zero new errors. If any source file fails because it referenced `MerchantTile` / `SupplyTier` / `MerchantTileHighlight` or a legacy field, PAUSE — Task A1/A2 + F2 should have caught it.

- [ ] **F5** Customer-app jest sweep — must still pass.

- [ ] **F6** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "$(cat <<'EOF'
chore(customer-app): drop MerchantTile type + legacy schema fields + cascade dependents

Phase 3a Task F. Customer-app `apps/customer-app/src/lib/api/discovery.ts`
no longer declares the merchant-first response arm and its merchant-
only auxiliary helpers:

  - DELETED: `MerchantTile` type alias (line 149).
  - DELETED from `homeFeedResponseSchema`: `featured`, `trending`,
    `nearbyByCategory` legacy fields.
  - DELETED from `searchResponseSchema`: `merchants`, `total`, `meta`.
  - DELETED from `categoryMerchantsResponseSchema`: `merchants`,
    `total`, `meta` (unblocked by Task E source cleanup).
  - DELETED from `inAreaResponseSchema`: `merchants`, `total`.
  - 🛑 KEPT `inAreaResponseSchema.meta` — load-bearing for Map default
    in-area mode (`mapDataView.ts:63` reads `d?.branchMeta ?? d?.meta`;
    InAreaResponse has NO `branchMeta` on the wire, so `meta` is the
    SINGLE coherent envelope for Map's default mode).
  - DELETED merchant-only auxiliary symbols (cascade per plan §0.12(d)
    + §1.3 audit-confirmed zero remaining src-tree consumers):
      - `merchantTileSchema` declaration
      - `supplyTierSchema` Zod enum
      - `SupplyTier` type alias
      - `highlightSchema` Zod object
      - `MerchantTileHighlight` type alias

Branch-side schemas (`branchTileSchema` / `branchTileMerchantGroupingSchema`
/ `branchTileHighlightSchema`) are independent and continue to declare
their own shapes.

Wire emission is UNCHANGED — backend keeps emitting both legacy and
branch-first shapes (customer-web still reads the legacy contract).
Zod's default behaviour silently strips unknown keys at parse time,
so customer-app sees only the branch-first shape from here on.

Plan 4 M5.3 backend cleanup (`rankMerchants` + `classifyTier` + the
five legacy service functions + wire field removal) is BLOCKED on
customer-web branch-first migration — recorded under deferred-followups
§CU.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task G: Extend negative-pin meta-test

**Buildable end-state**: 2 new pins in the existing meta-test; total grows from 3 to 5 pins. Tsc + jest still pass.

- [ ] **G1** Open `apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts`. Extend `FORBIDDEN_IMPORT_PATTERNS` with two new patterns AND add two new `it()` blocks for the Phase 3a invariants:

```ts
// Phase 3a additions (2026-05-21) — block reintroduction of the
// merchant-first tile contract at the customer-app source layer.

it('no source file imports the legacy MerchantTile type from @/lib/api/discovery', () => {
  const files = walkSync(SRC_ROOT)
  const pattern = /import\s+(?:type\s+)?\{[^}]*\bMerchantTile\b[^}]*\}\s+from\s+['"]@\/lib\/api\/discovery['"]/
  const offenders: { file: string; line: number }[] = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8').split('\n')
    content.forEach((line, idx) => {
      if (pattern.test(line)) {
        offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1 })
      }
    })
  }
  expect(offenders).toEqual([])
})

it('no source file imports the legacy makeMerchantTile fixture', () => {
  const files = walkSync(SRC_ROOT)
  const pattern = /import\s+\{[^}]*\bmakeMerchantTile\b[^}]*\}/
  const offenders: { file: string; line: number }[] = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8').split('\n')
    content.forEach((line, idx) => {
      if (pattern.test(line)) {
        offenders.push({ file: path.relative(REPO_ROOT, file), line: idx + 1 })
      }
    })
  }
  expect(offenders).toEqual([])
})
```

Also extend the docstring at the top of the file to call out Phase 3a additions.

Note: the meta-test walks `SRC_ROOT` (`apps/customer-app/src/`) only — it does NOT scan tests. Tests that legitimately reference `MerchantTile` in comments / regex patterns / their own scope are unaffected.

- [ ] **G2** Run the meta-test:

```bash
cd apps/customer-app && npx jest tests/_meta/phase-2-5-adapter-removed.test.ts --forceExit --silent 2>&1 | tail -10
```

All 5 pins (3 existing + 2 new) pass.

- [ ] **G3** Customer-app tsc + jest sweep — must still pass.

- [ ] **G4** Commit:

```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git add apps/customer-app/tests/_meta/phase-2-5-adapter-removed.test.ts
git commit -m "$(cat <<'EOF'
test(meta): lock customer-app cannot re-import MerchantTile / makeMerchantTile

Phase 3a Task F. Extends the Phase 2.5 negative-pin meta-test with
two new structural invariants:

  4. No source file under apps/customer-app/src/ imports the
     legacy MerchantTile type alias from '@/lib/api/discovery'.
  5. No source file imports the legacy makeMerchantTile fixture.

The wire-type alias was deleted in Task E and the fixture file in
Task D; tsc covers reintroduction, but the meta-test is the standing
guard against silent regressions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task H: Pre-merge gate (sweeps + PR + device QA + merge + memory close-out)

- [ ] **H1** Full customer-app jest sweep — confirm baseline + test-count delta:

```bash
cd apps/customer-app && npx jest --forceExit --silent 2>&1 | tail -6
```

Expected: ~207 suites (same as Phase 2.5 baseline). Test count: 2097 baseline minus deleted legacy-arm assertions in Task C minus any merged tests + the 2 new meta-test pins from Task F. Estimated post-Phase-3a: ~207 suites / ~2090 tests (a few legacy-arm tests gone from `discovery.test.ts`).

- [ ] **H2** Customer-app tsc clean.

- [ ] **H3** Backend vitest sweep — verify NO backend changes (Phase 3a touches zero backend code, so a clean sweep is the expected baseline):

```bash
cd /Users/shebinchaliyath/Developer/Redeemo && npx vitest run 2>&1 | tail -6
```

Same Neon-flake pattern from Phase 2.5 close-out is expected and pre-existing; isolation re-runs verify each flake passes cleanly.

- [ ] **H4** Push branch + open PR titled `Phase 3a — customer-app residual legacy cleanup`. PR body must:
  - Explicitly say no backend changes, no wire-shape changes, no customer-web changes
  - List the 11 files modified + 1 file deleted + 2 new meta-test pins added
  - Confirm `<SavePill>` / `<VoucherCountPill>` unchanged (§BY escalation gate not triggered)
  - Cross-ref §CU as the deferred sibling for Phase 3b backend cleanup
  - Affirm Plan 4 M5.3 stays deferred

- [ ] **H5** Owner device QA (lighter than Phase 2.5 — no visual surface impacted). Verification:
  1. Customer-app builds + runs (Metro reload with cache clear after merge).
  2. Home / Search / Map / Category surfaces all render correctly (sanity smoke test — these should be entirely unaffected since they read branch-first arms only).
  3. Backend continues serving (no API regression).
  4. Customer-web's QA path is OUT of scope but worth a spot check that it still works (it should — wire unchanged).

- [ ] **H6** SHA-bound merge once QA passes:

```bash
SHA=$(gh pr view N --json headRefOid --jq .headRefOid)
gh api "repos/MSC23-bot/Redeemo/compare/main...$SHA" --jq '{ahead_by, total_commits, files_changed: (.files | length), commits: [.commits[].sha[0:7]]}'
# Confirm scope matches expectation (8 commits: plan-lock + Task B + C + D + E + F + close-out + merge):
REDEEMO_PR_SCOPE_VERIFIED=$SHA gh pr merge N --merge
```

- [ ] **H7** Post-merge memory close-out:
  - Create `project_discovery_rebaseline_phase3a_complete.md` topic file.
  - Update `project_current_state.md` to new main HEAD (Phase 3a SHIPPED; Phase 3b deferred under §CU).
  - Add deferred-followups §CU per §0.5 (NEW entry — see §6 below for the locked content).
  - Update §M in deferred-index — Phase 3a row added; Phase 3b explicitly deferred with §CU pointer.
  - Update `MEMORY.md` top-line.
  - Delete merged feature branch (local + origin).

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Customer-app source file silently reads a legacy field after schema cleanup | Very low | Medium | A1 grep audit + tsc would catch; negative-pin meta-test in Task F is the standing future-proof. |
| `makeBranchTile` doesn't perfectly substitute for `makeMerchantTile` (field path remap mismatch) | Low | Low | Task B's per-file jest runs catch breakage before commit. |
| Deleted `discovery.test.ts` legacy assertions covered a real contract bug | Low | Low | Backend tests still verify legacy wire emission; customer-web's E2E if run would catch a real regression. |
| `merchantTileSchema` Zod declaration still referenced internally after type-alias removal | Low | Low | Task F2 cascade audit before deleting; KEEP `merchantTileSchema` + dependents if any reference found (§1.3 conditional). |
| Zod parse fails because wire emits a field the schema doesn't declare | None | — | Zod's default `z.object` strips unknown keys silently. Verified throughout Phase 2 by the fact that customer-app worked despite the wire emitting both shapes pre-Phase-3a. |
| customer-web breaks | None | — | Phase 3a touches zero backend code and zero customer-web code. Wire is unchanged. |
| Plan 4 M5.3 expectations re-surface | Low | Cosmetic | §CU deferred entry locks the dependency on customer-web migration. Owner aware. |

---

## 6. New deferred-followups entry §CU (Task H7 content)

Add the following block to `/Users/shebinchaliyath/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md` at the end of the file:

```markdown
## §CU — Phase 3b backend cleanup + Plan 4 M5.3 — blocked on customer-web branch-first migration (Tier 2/3, locked 2026-05-21 from Phase 3a audit)

**Status:** DEFERRED. Phase 3a (PR-TBD, 2026-05-21) cleaned the customer-app's residual legacy merchant-first contract artefacts — Zod schemas, type aliases, fixtures, legacy-arm parse tests — but explicitly DID NOT touch the backend or wire emission because customer-web still consumes the legacy contract.

**Audit findings (Phase 3a, 2026-05-21):**
- Customer-web at `apps/customer-web/lib/api.ts:154` declares its own `MerchantTileData` type and consumes `featured`/`trending`/`nearbyByCategory`/`merchants` legacy wire fields across 8+ component files (Discovery / Search / Categories / TrendingPreview / MerchantRow / SearchResults).
- Removing any backend wire field BREAKS customer-web; Phase 3a explicitly avoided this.
- Plan 4 M5.3 (remove V1 ranker `rankMerchants` + `classifyTier`) requires removing the five legacy backend functions (`searchMerchants`, `getCategoryMerchants`, `getInAreaMerchants`, `getCampaignMerchants`, `enrichMerchantTile`/`Tiles`) that call V1. Customer-web reads ALL of those. Blocked.

**Scope when picked up:**

**§CU.1 — Customer-web branch-first migration** (Tier 3, brainstorm-first prerequisite):
- Mirror customer-app Phase 2.x: design a Next.js sibling `<BranchTile>` component (separate component from customer-app's; same wire-shape consumer).
- Migrate 8+ customer-web files (lib/api Discovery type + Home / Discover / Search / Categories pages + MerchantRow / SearchResults / TrendingPreview components).
- Customer-web's `lib/api.ts:216` pre-existing bug: declares `results: MerchantTileData[]` for search but wire emits `merchants[]` (verify at pickup whether this is a runtime bug or a working-by-accident path).
- Add branch-first equivalents for the customer-web `Favourites/merchants` endpoint consumer if relevant.
- Customer-web tests / E2E adjustments.

**§CU.2 — Phase 3b backend cleanup** (Tier 2 follow-up after §CU.1):
- Remove `searchMerchants`, `getCategoryMerchants`, `getInAreaMerchants`, `getCampaignMerchants`, `enrichMerchantTile`, `enrichMerchantTiles` from `src/api/customer/discovery/service.ts`.
- Remove the corresponding `merchantResult` spreads + legacy fields from `src/api/customer/discovery/routes.ts` for `/home`, `/search`, `/categories/:id/merchants`, `/discovery/in-area`, `/campaigns/:id/merchants`.
- Remove `MERCHANT_TILE_SELECT` if internal-only after the function deletions.

**§CU.3 — Plan 4 M5.3 — remove V1 ranker** (Tier 2 final step):
- Once §CU.2 ships, the V1 ranker (`rankMerchants` + `classifyTier` in `src/api/lib/ranking.ts:69 + :141`) has zero callers.
- Delete both functions + their unit tests at `tests/api/lib/ranking.test.ts` (any V1-specific assertions).
- Plan 4 doc explicitly converges here — M5.3 was always meant to ship with Phase 3 cleanup.

**§CU.4 — Plan 4 M5.4 stays no-op** (locked Plan 4 P1.10):
- Legacy `supplyTier` / `nearbyCount` / `cityCount` / `distantCount` API fields STAY for the full Plan 4a deprecation cycle. Removal is a post-Plan-4a explicit decision, gated on mobile-app releases consuming `supplyRung`/`proximityBand`/`rungCounts` having shipped. NOT in §CU scope.

**Sequencing recommendation:**
1. **§CU.1** (customer-web branch-first migration) — Tier 3, brainstorm-first. Likely 2-3 PRs.
2. **§CU.2** (backend cleanup) — Tier 2, single PR after §CU.1 merges.
3. **§CU.3** (Plan 4 M5.3) — Tier 2 follow-up; can fold into §CU.2 if scope allows.

**Trigger:** when owner is ready to scope customer-web branch-first migration. There is no urgency — the wire-shape coexistence is stable.

**Cross-refs:**
- §M Discovery rebaseline — Phase 3 was meant to ship the full backend cleanup; §CU is the deferred slice that customer-web migration unblocks.
- Plan 4 M5 convergence — explicit in plan doc `docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md` line 4737 + 5306-5352.
- §CR / §CS / §CT — orthogonal Phase 2.x device-QA follow-ups; not blocked by §CU.

**Tracking artefact:** Phase 3a audit (2026-05-21) confirmed customer-web blocks the full cleanup. Owner direction: ship customer-app cleanup now (Phase 3a); customer-web migration is a separate workstream when scheduled.
```

---

## 7. Standing rule reaffirmations (Phase 3a)

- **No-overclaim discipline.** PR body / commit messages / memory updates must NOT imply backend cleanup or wire-shape changes. Phase 3a is customer-app internal only.
- **Single-component carry-forward.** `<BranchTile>` stays as the single Discovery tile component; Phase 3a doesn't touch it.
- **POSTCODE_CENTROID redaction** continues to flow through `BranchTile` unchanged.
- **SHA-bound merge command** required for merge approval.
- **Hermes-robust patterns preserved.**

---

## 8. Self-review (pre-lock)

- [x] **Spec coverage** — Owner's 5 decisions captured in §0; in-scope vs out-of-scope clearly enumerated in §1 + §2; deferred §CU drafted in §6.
- [x] **No placeholders** — Every task lists exact files, exact line ranges, exact code where applicable.
- [x] **Type consistency** — All field-path remaps reference the Phase 2.5 §1.2 mapping table. No introduction of new types or shapes.
- [x] **Scope discipline** — §2 out-of-scope list is exhaustive and matches owner's explicit constraints; PR body G4 enforces no-overclaim.
- [x] **Reviewer-friendly diff** — Task sequence (B → C → D → E → F → G) keeps each commit buildable + jest-clean + tsc-clean per §0.7.
- [x] **Plan 4 M5 alignment** — §CU explicitly defers M5.3; §CU.4 explicitly preserves Plan 4 P1.10's no-op direction.

---

## 9. Execution mode

Same Tier 2 plan-first pattern as Phase 2.5:

1. **Plan-lock commit** (this commit) — pause for owner review.
2. **Implementer subagent** per task (B through G) sequentially. Each commit reviewed by spec-compliance + code-quality reviewer subagents before next task.
3. **Owner device QA gate** (lighter than Phase 2.5 — no visual impact) across the customer-app build before merge.
4. **SHA-bound merge** via the env-var override hook contract.
5. **Post-merge bookkeeping** per Task H7.

**Pause point:** plan-lock commit + owner review before Task A1 starts.
