# Home Relevance — Design Spec

**Version:** 1.8 (PR #126 device-QA-5 owner direction: `proximityBand` honesty on filler tiles + semantic-tinted `<ProximityBandChip>` variants)
**Status:** Implemented in PR #126 (feature/home-relevance) — pending device-QA-6 + SHA-bound merge
**Tier:** 3 (new backend contract, new customer-app contract, new locked product principles)
**Brainstorm:** in-session 2026-05-22 (10-section package + section 11 sticky-controls extension + D1–D12 owner decisions + spec-review fallback note v1.1 + spec-review consistency note v1.2 + device-QA-1 + device-QA-2 owner direction 2026-05-23 + device-QA-3 Halifax direction 2026-05-23 + device-QA-3 refinement "local-first not local-only" 2026-05-23 + device-QA-4 Halifax/Manchester finding "leaf rails feel thin" 2026-05-23 + device-QA-5 Brightlingsea finding "thin local rails should top up with wider Redeemo" 2026-05-23 + device-QA-5 follow-up "filler tiles need proximityBand + chip needs semantic tinting" 2026-05-23)
**Prior audit:** Explore-agent audit of `getHomeFeed()` + customer-app Home rails + ranking utilities, 2026-05-22

## v1.8 changelog (2026-05-23) — proximityBand honesty on filler tiles + tinted chip variants

PR #126 device-QA-5 follow-up finding: v1.5 cascade fillers AND v1.7 top-up fillers explicitly set `proximityBand: null` (because both call sites skip the V3 ranker — the `maxRung` gate would drop cross-region tiles). The customer-app `<ProximityBandChip>` returns null for null bands → the chip disappeared on the EXACT tiles where it'd help users understand WHY a farther merchant is appearing. With v1.5 and v1.7 now intentionally surfacing wider merchants, the chip's honesty signal becomes load-bearing — distance alone is necessary but not sufficient.

Two locked v1.8 changes:

1. **Backend: `deriveFillerProximityBand(distanceMetres)` helper.** Lives at the top of `src/api/customer/discovery/homeRailBuilders.ts`. Maps haversine-distance to a `ProximityBand` using thresholds that mirror the V3 rung-based classification semantically:
   - `< 12 875 m` (8 mi)  → `IN_YOUR_AREA`
   - `< 40 234 m` (25 mi) → `A_LITTLE_FURTHER`
   - `>= 40 234 m`         → `NEAREST_ON_REDEEMO`
   - `null` distance       → `null` (defensive — non-rankable tail tiles still emit null per existing contract)
   - `NEARBY` is INTENTIONALLY never derived for fillers: by construction the local-first loop exhausted the genuinely NEARBY supply BEFORE fillers were considered, so a NEARBY filler would be dishonest.

   Wired into two call sites:
   - v1.5 cascade-fill loop `headInputs` map (was `proximityBand: null`).
   - v1.7 top-up loop `fillerInputs.push()` (was `proximityBand: null`).

   The six other `proximityBand: null` sites in `homeRailBuilders.ts` are non-rankable tail tiles (POSTCODE_CENTROID / NEEDS_REVIEW) with `distance: null` — they correctly stay null because no distance signal is available to derive from. v1.8 changes nothing for them.

2. **Customer-app: semantic-tinted `<ProximityBandChip>` variants.** The chip component now varies its background colour by band, so colour communicates meaning, not just text:
   - `IN_YOUR_AREA` → soft sage/green tint (`#E8F5EE` bg, `color.success` text) — reassuring.
   - `A_LITTLE_FURTHER` → soft amber/peach tint (`#FEF3E6` bg, `color.warning` text) — warm.
   - `NEAREST_ON_REDEEMO` → cream-rose tint (`color.surface.tint` bg, `color.brandRose` text) — neutral baseline (unchanged from v1.7-).
   - `NEARBY` → still renders null (no chip on already-nearby merchants).

   Lightweight implementation: variant style table inline in `ProximityBandChip.tsx`, no token churn. Existing API unchanged (same `band?: ProximityBand | null | undefined` prop). No new interaction, no tooltip, no explainer modal — those are deferred under §DI (richer chip system).

**Scope discipline (unchanged):** no Campaign / sticky-controls / Map / Search / customer-web / further visual redesign. v1.8 is a Home relevance + chip-honesty amendment.

**Spec sections amended:** §6.3 (Step 2 top-up + Step 3 cascade — derive `proximityBand` from distance instead of emitting null) — §8.2 chip variant table.

**Deferred to follow-up:**
- §DI (NEW) — richer `<ProximityBandChip>` design (interactive explainer modal, per-band iconography, possible distance-range copy).
- §DH (NEW) — branch locality/post-town visible on `<BranchTile>` cards (cross-surface design call).
- §DD (existing) — copy variation on "{x} picks" rail labels.
- §DG (existing v1.7) — Popular rail location-aware ranking + test-redemption noise cleanup.

## v1.7 changelog (2026-05-23) — thin-local-supply top-up

PR #126 device-QA-5 finding: v1.5 cascade fill activated only when a parent category had ZERO local supply. Brightlingsea Food & Drink with 2 Covelum branches → parent rail counted as filled → cascade skipped Food & Drink → My Kerala (Ipswich, ~25 mi away but closer than nothing) never surfaced on Home, even though it'd be useful for a Brightlingsea user.

Owner direction (locked): Home must be local-first AND not look sparse. If a parent rail has thin local supply (1-4 merchants), top it up with the closest wider Redeemo merchants until full (5 per rail). The rail-level meta MUST stay honest — local supply is genuine, so `scopeExpanded` stays `false` (which also means mixed rails do NOT contribute to the `<NearbyContextBanner>`). The honesty signal lives at the TILE level: filler tiles carry `supplyRung: null` + a real distance chip showing they're further out.

Six locked design assumptions (owner-confirmed before implementation):

1. **Top-up trigger:** rails with `0 < branches.length < NEARBY_CATEGORY_TAKE` (i.e. `0 < n < 5`). Rails at the cap (5) get nothing. Rails with zero local supply get the existing v1.5 cascade-fill (pure-cascade rail, `scopeExpanded=true`).

2. **Filler ordering:** appended at the END of the rail in distance-ASC order across the entire eligible pool. Local merchants stay first in their V3 rank order; fillers visibly trail with bigger distance chips. Honest progression.

3. **Filler `supplyRung`:** `null` (V3 skipped per the maxRung gate rationale). **Filler `proximityBand`:** v1.8 supersedes — derived from haversine distance via `deriveFillerProximityBand` (see v1.8 changelog). `< 8 mi → IN_YOUR_AREA`, `< 25 mi → A_LITTLE_FURTHER`, `>= 25 mi → NEAREST_ON_REDEEMO`. Pre-v1.8 fillers emitted `proximityBand: null` and the customer-app chip silently hid; v1.8 closes that honesty gap.

4. **Rail-level `meta.scopeExpanded`:** stays `false` on mixed rails. The local supply is genuine; the rail header doesn't lie. Mixed rails do NOT trigger `<NearbyContextBanner>` — banner fires only when at least one rail is PURE cascade (zero local supply). This avoids "banner says we're still growing in {City} while user sees 2 local merchants".

5. **Distance signal:** tile-level distance chip + proximity band carry the honesty. No new copy for mixed rails.

6. **Fill target:** `NEARBY_CATEGORY_TAKE = 5`. Same cap for pure-local, mixed, and pure-cascade rails.

Implementation: new "Step 4.5" block in `buildNearbyByCategoryRails` between the local-first loop and the cascade-fill loop. Single batched fetch — `prisma.merchant.findMany({ status: ACTIVE, primaryCategory: { OR: [{ id: { in: topUpParentIds } }, { parentId: { in: topUpParentIds } }] }, branches.some({ isActive: true }) })`. Per-rail filter excludes merchants already in the local-first slot (by merchant id) AND dedupes fillers to ONE branch per merchant for variety. POSTCODE_CENTROID + NEEDS_REVIEW branches are skipped on the filler side (every filler MUST carry a real distance chip — non-rankable supply stays a local-tail story).

**Scope discipline (unchanged):** no Campaign / sticky-controls / Map / Search / customer-web / visual redesign. v1.7 is a Home relevance contract amendment only.

**Spec sections amended:** §6.3 builder pipeline (Step 4.5 between local-first and cascade-fill).

## v1.6 changelog (2026-05-23) — parent-category grouping

PR #126 device-QA-4 finding: v1.5 closed the empty-Home problem, but Halifax/Manchester device QA showed the next-level weakness — leaf-category rails (Nail Salon, Barber, Aesthetics Clinic) frequently had only ONE merchant each, making Home look thin / broken / like Redeemo has one merchant per category. The repeated "See all" chip on one-card rails compounded the misleading visual.

Owner direction (locked): for Home discovery, especially while supply is sparse, category rails group by PARENT category. Cards inside the rail still show the leaf-level descriptor (Nail Salon, Barber, Italian Restaurant) via `BranchTile.merchant.descriptor`. One-card rails hide their See-all chip.

Five changes on top of v1.5:

1. **Parent-category grouping (backend §6.3).** `buildNearbyByCategoryRails` groups both the local-first loop AND the cascade fill by `primaryCategory.parent?.id ?? primaryCategory.id` instead of the leaf `primaryCategoryId`. A merchant whose `primaryCategory` is a subcategory ("Pizza Restaurant", "Barber") falls under its parent's rail header ("Food & Drink", "Beauty & Wellness"); merchants whose `primaryCategory` is already top-level collapse to themselves. `NEARBY_MAX_CATEGORIES = 6` and `NEARBY_CATEGORY_TAKE = 5` stay — caps are now per parent rail. Cascade dedup is JS-side (parent-keyed `usedCategoryIds`) since the legacy SQL `notIn` filter was leaf-keyed.

2. **`homeCategoryRailLabel` display helper (§8.2).** Customer-app helper at `apps/customer-app/src/features/home/utils/homeCategoryRailLabel.ts` produces sentence-case + " picks" so rail headers don't read like a plain duplicate of the top category navigation grid:
   - "Food & Drink" → "Food & drink picks"
   - "Beauty & Wellness" → "Beauty & wellness picks"
   - "Health & Fitness" → "Health & fitness picks"
   - "Out & About" → "Out & about picks"
   - "Shopping" → "Shopping picks"
   Empty / whitespace-only input → defensive fallback to bare "picks".

3. **`{Category} on Redeemo` retired (§8.2).** v1.5's cascade-specific suffix variant is REMOVED. The `<NearbyContextBanner>` already carries the platform-claim message when any rail is cascaded — repeating "on Redeemo" on every rail was redundant. Local + cascade NearbyByCategory rails now share the same label rule (helper-driven). Scope-aware copy still exists on Featured (`Featured on Redeemo` cascade variant unchanged) — only NearbyByCategory rails drop the suffix.

4. **See-all suppression on one-card rails (§8.8).** `<NearbyByCategory>` hides the See-all chip when `rail.branches.length < 2`. With parent grouping a one-card rail genuinely means the parent category has only one merchant within reach, so the chevron promise of more is misleading. Threshold locked at `>= 2`. Header text remains tappable for completeness.

5. **`BranchTile` card descriptor preserved (§9.1).** No card-side wire change required. `BranchTile.merchant` already carries both `primaryCategory` (now the parent) AND `subcategory` AND `descriptor` (the leaf differentiator). Cards inside "Food & drink picks" still render "Italian Restaurant" / "Pizza Place" / "Indian Cafe" as their descriptor — owner direction satisfied.

**Spec sections amended:** §6.3 builder pipeline (parent grouping step) — §7 phrase library (parent variants + retired cascade variant) — §8.2 helper spec — §8.8 dedup table (See-all chip rule).

**Scope discipline (unchanged):** no Campaign / sticky-controls / Map / Search / customer-web / visual redesign. v1.6 is a Home relevance contract amendment only.

**§DD residual after v1.6:** deterministic ordering across cascade pool + interest-based parent ordering (User.interests → weight which parent rails appear first). Both remain Tier 2 brainstorm-first under §DD.

## v1.5 changelog (2026-05-23) — locked product rule: Home is local-first, not local-only

PR #126 device-QA-3 refinement after Halifax + Manchester observations. Owner's locked product rule:

> Home should be local-first, not local-only. The Discovery/Home page should not feel empty for users anywhere in the UK. If local/catchment merchants exist, show those first. If not, show wider Redeemo merchants with honest copy and distance/proximity chips.

Three additive changes on top of v1.4 — Path β:

1. **`buildNearbyByCategoryRails` cascade fill (β1 + β5 + β7).** Per-category, if the local-first loop (bbox candidates → V3 rank → strict NEARBY+CITY scope filter) produces zero supply, the builder now cascades to a UK-wide platform fetch. Up to `NEARBY_MAX_CATEGORIES` (6) rails total — categories already covered locally are excluded from the cascade. Cascaded rails:
   - Header copy: `{Category} on Redeemo` (set by `<RailHeader>` from `meta.scopeExpanded === true`).
   - Tail: **permissive** (no strict-locality identity gate per β7 — rail no longer claims locality).
   - Tile order: ASC distance across all rungs (β5 — closest matches first).
   - Meta: `{ locality: locationCtx.locality, scope: 'platform', scopeExpanded: true, rungCounts }`.
   - Per-category cap unchanged (5 merchants).

2. **`<NearbyContextBanner>` minimal component (β2 + β3).** Renders ABOVE the NearbyByCategory rail strip when at least one category rail has `meta.scopeExpanded === true`. Provides honest context that local/catchment supply is limited so the user understands the `{Category} on Redeemo` headers + larger distance chips. Locked copy (β3): `We're still growing in {City}. Here are the closest category matches on Redeemo.` Defensive fallback drops the leading clause when locality is null. Minimal visual — same warm-tinted card surface + 1px border as `<NearbySectionEmpty>` but smaller padding + no CTAs. Visual polish deferred to §DE.

3. **Featured copy in-locality vs near-locality (v1.4 carry-over).** Reaffirmed: when Featured rail's NEARBY+CITY supply is genuinely IN the locality (every visible branch passes §6.4.1 strict-locality identity ladder) → `Featured in {City}`. Catchment/post-town tier supply → `Featured near {City}`. Cascade → `Featured on Redeemo`.

**Dedup invariants (additive):**
- `<NearbyContextBanner>` ⊥ `<NearbySectionEmpty>` (mutual exclusion by construction — banner needs `hasNearbyRails`; empty card needs `!hasNearbyRails`).
- `<NearbyContextBanner>` MAY coexist with `<HomeNoLocationBanner>` only when Popular sibling rail somehow surfaces with cascade-style rails, which is structurally impossible (no-location state has no `effLoc`, so NBC builder is skipped — `nearbyByCategoryRails` is empty, banner doesn't fire).

**Empty-card v1.5 condition (β4):** `<NearbySectionEmpty>` (full card with CTAs) renders only when `nearbyByCategoryRails.length === 0` — which under v1.5 only happens when the platform has zero categories with active merchants (effectively unreachable with current seed). For sparse-market real users, cascade fills + banner contextualises.

**Scope discipline (unchanged):** no Campaign / sticky-controls / Map / Search / customer-web / full §DA-§DC redesign. v1.5 is a Home relevance contract amendment only.

## v1.4 changelog (2026-05-23)

PR #126 device-QA-3 owner direction (Halifax-locality QA — rail consistency + Featured copy honesty):

1. **NearbyByCategory inclusion bbox-based, not city-string (§6.3).** The legacy `buildNearbyByCategoryRails` pre-filtered candidates by `branch.city === locationCtx.city` (case-insensitive). That excluded CATCHMENT/POST_TOWN-tier merchants that Featured + Trending already surface via the V3 scope cascade — producing the device-QA-3 inconsistency where a Halifax user saw "Featured in Halifax" with Huddersfield merchants (6-9mi catchment) AND "We're still growing in Halifax" on the empty card simultaneously. Fixed: NBC inclusion now uses a `±0.3°` bbox around `effLoc.lat/lng` (mirrors `prisma/profile-nearest-locality-at4.ts` pattern). Pool size raised to 100 candidates. Per-category `rankBranchesV3` + strict NEARBY+CITY scope filter (§6.3 strict rule unchanged) decides what surfaces. Three rails (Featured / Trending / NBC) now use the same locality concept.

2. **Featured rail copy: in-locality vs near-locality framing (§6.1 + §7).** Pre-fix, Featured header read `Featured in {City}` whenever NEARBY+CITY supply existed — including when ALL visible merchants were CATCHMENT/POST_TOWN tier (i.e. 5-10mi away in different localities). For Halifax with Huddersfield merchants, this read "Featured in Halifax" alongside "6.1 miles away" chips — header overclaim. Fixed: client-side check via the §6.4.1 strict-locality identity ladder (same predicate as `appendStrictLocalityTail`). If every visible Featured branch passes the ladder → `Featured in {City}`. If any visible branch fails (i.e. catchment/post-town tier) → `Featured near {City}`. `Featured on Redeemo` cascade copy unchanged. `<FeaturedCarousel>` computes the flag; `<RailHeader>` accepts a new optional `allBranchesInLocality` prop.

## v1.3 changelog (2026-05-23)

PR #126 device-QA-2 owner direction (Manchester / Huddersfield + outskirts / sparse-market QA):

1. **`<NearbySectionEmpty>` body line locality-aware (B.1).** §8.2 phrase library entry L5 amended from generic `Try browsing categories or searching to find offers across the UK.` to locality-templated `We're still growing in {City}. Try browsing categories or searching to find offers across the UK.` `{City}` sourced from `feed.locationContext.locality.name`. Defensive fallback drops the leading clause when locality is null (only fires defensively — component is gated on `source !== 'none'` at the call site). §8.4 updated with the `cityName` prop spec. Headline L1 unchanged.

2. **`<HomeScreen>` ScrollView bottom-clipping fix (A).** Bottom tab bar is `position: 'absolute'` with `height: 80` per `(app)/_layout.tsx`. Pre-fix the ScrollView had no `paddingBottom`, so the last child (e.g. `<NearbySectionEmpty>` CTAs or `<HomeExploreMore>` button) was clipped behind the tab bar; iOS rubber-band scroll snapped back so the buttons were unreachable. Fixed via runtime padding `insets.bottom + TAB_BAR_HEIGHT (80) + SCROLL_BOTTOM_GUTTER (24)` from `useSafeAreaInsets()`. Pattern matches `<SearchScreen>` precedent.

3. **§DE deferred follow-up created** for the larger NearbySectionEmpty v2 product decisions (visual design polish, optional nearby-merchant preview inside the card, whole-card tappability, single-tap primary action destination). Bundles with §DA (sticky-controls) and §DC (sparse-category short-trip cascade) brainstorm. Captured in `project_deferred_DB_DC_DD_home_relevance_followups.md`.

Other device-QA-1 outcomes (informational; no code change in v1.3):
- Distance audit: no code bug. Seed merchants (Karaara / Pino's / Trim & Co) cluster within ~300m in central Huddersfield by intentional seed design.
- Sparse-supply heuristic: ships unchanged (v1.2 §8.5 conditions intact).
- Outskirts/boundary behaviour: classifier ignores postcode prefix entirely (HD / BD / HX irrelevant); pure geographic + admin-region fields drive rung classification.

## v1.2 changelog (2026-05-23)

Resolves four contradictions surfaced in v1.1 owner review:

1. **Non-rankable tail conflict with P1 `near you` promise.** Added the **strict-locality identity gate** (§6.4): non-rankable tail tiles surface inside any `near you` / `in {City}` local Home rail ONLY if `branch.localityId === effLoc.locality.id` OR `branch.localityName === effLoc.locality.name` (case-insensitive) OR `branch.postTown === effLoc.locality.name` (case-insensitive). Search's non-rankable tail is unchanged; Home's contract is stricter. P1 + §6.4 + test pins updated.

2. **Featured tail-only state.** Owner chose **Option A: tail-only Featured hides.** §6.1 + §6.4 + §12.1 updated. Featured rail hides when ranked NEARBY+CITY+DISTANT supply is zero regardless of how many tail-eligible branches exist. Tail attaches only when ranked supply > 0 in the chosen tier.

3. **`<NearbySectionEmpty>` vs `<HomeExploreMore>` dedup.** Owner chose **mutual exclusion in v1.** Updated §8.1, §8.3 row #10, §8.5, §8.7, §8.8, §11.5, §11.6, §12.4. Resolves O7 (removed).

4. **Popular tile contract in no-location state.** Explicit: when `locationContext.source === 'none'`, every Popular tile has `supplyRung = null` / `proximityBand = null` / `distanceMetres = null`. Customer-app render hides distance/proximity chip when null. §5 + §6.2 + §10.4 + §12.4 updated.

v1.1 changelog (2026-05-22) carried forward — see archived spec under §17. v1.0 → v1.1 added P6 + §8 + 3 fallback components + canonical phrase library.

---

## 1. Goal + scope

### 1.1 Goal

Make the customer-app Home tab's three merchant rails (Featured / Trending / NearbyByCategory) **relevant and honest** for a UK-wide user base, regardless of how local supply is to any given user. After this workstream:

- Every rail's header copy MUST match the scope of the cards it surfaces. `near you` / `in {City}` is reserved for genuinely-local supply — including any non-rankable tail tiles, which must pass the **strict-locality identity gate** (§6.4) to enter a local rail.
- Every Home tile MUST carry distance + proximity-band signals when the branch is classifiable, rendered using the same chip format as Search/Category/Map tiles. Tiles that cannot be classified (no effLoc, or POSTCODE_CENTROID) carry null on these signals; customer-app renders without the chip.
- Local relevance is computed via the same `rankBranchesV3` / `LadderProfile` / `effectiveLocation` infrastructure that Search and Category already use — reusing the data layer, NOT copying Search's scope-pill UI onto Home.
- A user opening Home from Huddersfield, Brightlingsea, or any non-major-city locality sees a trustworthy local experience that degrades gracefully when local supply is sparse.
- **Empty rails / empty sections / no-location states never feel broken.** Friendly placeholders + warm CTAs replace silent vertical gaps. See §8 fallback matrix.

### 1.2 In scope

- `getHomeFeed()` backend rebaselined onto `rankBranchesV3` + per-rail scope helper.
- New per-rail `meta` envelope on the wire (`locality`, `scope`, `scopeExpanded`, `rungCounts`).
- Every Home tile gains `supplyRung` / `proximityBand` / `distanceMetres` when classifiable; nulls when not (with the customer-app render path handling nulls gracefully).
- Featured rail: NEARBY+CITY first; honest cascade to DISTANT only when no local supply (F-2 / D2). **Tail-only state hides the rail** (v1.2).
- Trending rail: NEARBY+CITY strict (T-2 / D3). When empty, sibling `Popular on Redeemo` rail renders instead.
- NearbyByCategory rails: NEARBY+CITY strict (NBC-1 / D4); hide per-category rail when empty.
- Distance/proximity chip on Home tiles in the same format as Search (D5).
- Conditional rail header copy driven by per-rail `meta.locality` + `meta.scopeExpanded`.
- Fix `resolveLocationContext` so `locationCtx.city` and a new `locationCtx.locality` populate from GPS via `findNearestLocality` (closes deferred §BB / D8).
- POSTCODE_CENTROID + NEEDS_REVIEW branches surface via a non-rankable tail under the **strict-locality identity gate** for local rails (v1.2); freely on platform-claim rails (Popular, Featured cascade). Per the §6.4 audit.
- Three friendly fallback components: `<HomeNoLocationBanner>` / `<NearbySectionEmpty>` / `<HomeExploreMore>`. `<NearbySectionEmpty>` and `<HomeExploreMore>` are **mutually exclusive in v1** (v1.2 dedup).
- Canonical phrase library locked in §8.2 — owner-provided phrases.
- Explicit Popular tile contract in no-location state: `supplyRung`/`proximityBand`/`distanceMetres` all null.
- New deferred follow-up §DA captures the sticky-controls polish work (D12).

### 1.3 Out of scope

- CampaignCarousel — separate brainstorm later. Campaign rail is untouched in this workstream.
- Customer-web — branch-first migration tracked under §CU.1; not part of this workstream.
- Map rebase / correctness (§CZ).
- Voucher keyword search (§CD already shipped PR #125).
- Sticky / collapsible nearby-section header + filter controls (deferred to §DA — see §6.5).
- Home visual scale polish, category tile redesign, animation polish (separate workstreams).
- 3-card minimum threshold (D6 = no minimum for v1).
- Home-level merchant dedup (D11 = no dedup; branch-as-primary preserved per §M).
- Hard distance ceiling on Featured cascade (D10 = no ceiling for v1).
- Changes to Search's non-rankable tail behaviour — Search stays permissive; only Home gets the strict gate (v1.2).

---

## 2. Locked decisions (D1–D12)

| # | Decision | Locked outcome |
|---|---|---|
| **D1** | Confirm Option C per-rail strategy. | ✅ Option C locked. |
| **D2** | Featured cascade behaviour. | ✅ **F-2** — NEARBY+CITY first; controlled cascade to DISTANT only when no local/city Featured supply; honest non-local copy. **Tail-only state hides the rail** (v1.2). |
| **D3** | `Popular on Redeemo` sibling rail. | ✅ **Build it (T-2).** When `Trending near you` has no NEARBY+CITY supply, Trending rail is hidden and the sibling `Popular on Redeemo` rail renders instead. No far-away merchants ever surface under `Trending near you`. |
| **D4** | NearbyByCategory scope rule. | ✅ **NBC-1** — strict NEARBY+CITY; hide empty per-category rails; no cascade under `near you` framing. |
| **D5** | Distance chip on Home tiles. | ✅ **Yes**, using the same format/language as Search's chip. |
| **D6** | Sparse-supply minimum threshold. | ✅ **No minimum for v1.** Render honest rails with 1–2 genuinely-local cards. Revisit thresholds after observing real supply. |
| **D7** | No GPS / no profile locality empty state. | ✅ **Hide local rails; show one top-level Home location banner.** Implemented as `<HomeNoLocationBanner>` per §8.6. |
| **D8** | Fix `locationCtx.city` / effective locality from GPS in this workstream. | ✅ **Yes, close deferred §BB here.** |
| **D9** | POSTCODE_CENTROID / non-rankable branches on Home. | ✅ **Mirror Search's cautious non-rankable tail, but with Home's stricter contract.** Local rails apply the **strict-locality identity gate** (§6.4 v1.2); platform-claim rails (Popular, Featured cascade) allow tail freely. |
| **D10** | Hard distance ceiling on Featured. | ✅ **No ceiling for v1**, conditional on non-local Featured using honest `Featured on Redeemo`-style copy. Revisit if surface feels odd. |
| **D11** | Home-level merchant dedup. | ✅ **No dedup for v1.** Preserve branch-as-primary rule per §M. |
| **D12** | Sticky nearby controls. | ✅ **SS-1 — defer.** Sticky controls are NOT in this workstream. Captured as **deferred follow-up §DA**, including the SS-2 lightweight option, for a separate Home UX/polish brainstorm. |

---

## 3. Locked product principles (new — added to memory)

The following principles are introduced by this spec and bind future Home / Discovery work. They will be added to memory as standing rules (see §14.5).

| # | Principle | Implication |
|---|---|---|
| **P1** | **Header copy honesty is the contract.** A rail labelled `near you` / `in {City}` / `nearby` MUST contain only tiles that are genuinely local to the user — either (a) NEARBY-tier or CITY-tier per `rankBranchesV3`, OR (b) non-rankable tail tiles that pass the **strict-locality identity gate** (§6.4). Wider supply triggers a copy change, never silent expansion. Tiles that cannot prove local identity by either path MUST NOT appear in a local rail. | Locks the `near you` promise across Featured / Trending / NearbyByCategory + any future Home rail. Encompasses both rank-classified and tail tiles in v1.2. |
| **P2** | **Per-rail product purpose drives the scope rule.** Featured (paid placement) ≠ Trending (social proof) ≠ NearbyByCategory (local browse). One scope policy across all rails would be incorrect. | Justifies Option C per-rail strategy. |
| **P3** | **Distance + proximity band are first-class trust signals.** Every Home tile carrying a `distanceMetres` value renders it; every tile classified into a rung renders its proximity band, matching the Search tile contract. Tiles that cannot be classified (POSTCODE_CENTROID, NEEDS_REVIEW, or no-effLoc state) carry null on these signals and render without the chip — never with placeholder / fake distance. | Drives the wire-shape change and the customer-app tile rendering. |
| **P4** | **Honest empty over dishonest fill.** If a rail's scope rule has zero supply, hide the rail (or swap to a differently-labelled sibling rail like Popular on Redeemo). Never silently widen under the original label. | Operationalises P1. |
| **P5** | **Reuse Search/Category infrastructure; don't copy Search UI.** `rankBranchesV3` / `classifyRung` / `LadderProfile` / `effectiveLocation` / `resolveScopeForBranches` exist and are correct. Home consumes them at the data layer; the UI stays curatorial (carousels + rails), not a scope-pill surface. | Search's `Nearby / Your city / More places` framework informs the SHAPE of Home's relevance rules without imposing the scope-pill UI onto Home. |
| **P6** | **Friendly empty over silent empty.** When a rail or section is honestly empty, prefer a warm one-line placeholder / CTA over a blank vertical gap. Honesty AND warmth, not honesty OR warmth. Use the canonical phrase library (§8.2); avoid ad-hoc empty-state copy. At most ONE primary CTA renders per state (§8.7 dedup rules). | Operationalises the "Home should not feel broken" principle from spec-review v1.1. Drives §8 fallback matrix + three new components. |

---

## 4. Per-rail product purpose

- **Featured** — paid placement. Merchants pay for visibility on Home. Commercial intent. Allowed to cascade past the user's locality when no local Featured supply exists, but only under honest non-local copy. Tail-only state hides (v1.2).
- **Trending near you** — social proof. "Other people redeemed these recently." Strictly local-to-the-user. Cannot cascade under this label.
- **Popular on Redeemo** (new sibling rail) — platform-wide curiosity surface. "Most-redeemed merchants on Redeemo this month." Renders only when `Trending near you` has no NEARBY+CITY supply OR when no location signal exists. Always honestly labelled as UK-wide. Tile contract relaxes in no-location state (§6.2 + §5).
- **NearbyByCategory rails** — local browse by category. "Cafes near you" / "Restaurants near you" / etc. The promise is in the name. Strictly NEARBY+CITY. Hide when empty per-category; section-level friendly empty state when ALL categories are empty (see §8.4).

---

## 5. Wire contract — `HomeFeedResponse`

The new response envelope. Customer-app reads the per-rail `meta` block to drive header copy + rail visibility + fallback state selection.

```ts
type LocalityRef = { id: string; name: string }

type HomeRailMeta = {
  locality:       LocalityRef | null     // effLoc.locality; null only when effLoc is null
  scope:          'nearby' | 'city' | 'platform'   // resolved scope for this rail
  scopeExpanded:  boolean                // cascade fired (Featured only — false on others)
  rungCounts:     Record<SupplyRung, number>       // candidate counts pre-scope-filter
}

type HomeFeedResponse = {
  locationContext: {
    locality: LocalityRef | null         // populated from GPS via findNearestLocality
    city:     string | null              // derived from locality.name when locality is set
    source:   'coordinates' | 'profile' | 'none'
  }

  campaigns: CampaignTile[]              // UNCHANGED — out of scope this workstream

  featured: {
    branches: BranchTile[]
    meta:     HomeRailMeta | null        // null when rail is hidden (no supply)
  }

  trending: {
    branches: BranchTile[]               // empty when rail hidden by no-NEARBY+CITY-supply
    meta:     HomeRailMeta | null
  }

  popular: {                             // sibling rail
    branches: BranchTile[]               // populated when (trending.meta === null) OR (locationContext.source === 'none')
    meta:     HomeRailMeta | null        // locality always null on Popular meta
  }

  nearbyByCategory: Array<{
    category: { id: string; name: string }
    branches: BranchTile[]               // strictly NEARBY+CITY; rail hidden if zero
    meta:     HomeRailMeta | null
  }>
}
```

**Tile contract (`BranchTile`) — explicit no-classification cases (v1.2):**
- `supplyRung: SupplyRung | null` — populated for branches classified by `rankBranchesV3`; `null` for non-rankable tail tiles (POSTCODE_CENTROID / NEEDS_REVIEW per §6.4) AND for ALL tiles emitted when `effLoc` is null (no-location state).
- `proximityBand: ProximityBand | null` — derived from `(supplyRung, densityClass)`; `null` whenever `supplyRung` is null.
- `distanceMetres: number | null` — haversine from `effLoc` when branch is MANUALLY_CONFIRMED AND `effLoc !== null`; `null` for POSTCODE_CENTROID, NEEDS_REVIEW, profile-only callers without GPS coords, and any tile emitted in no-location state.
- All other tile fields unchanged.

**No-location state explicit (v1.2):** when `locationContext.source === 'none'`:
- Featured / Trending / NearbyByCategory all return `branches: []` and `meta: null`.
- Popular may render. **All Popular tiles in this state have `supplyRung = null`, `proximityBand = null`, `distanceMetres = null`** because no `effLoc` exists to classify against. The customer-app render path hides the distance/proximity chip when these are null (P3).

**Visibility rules (encoded server-side):**
- `featured.meta = null` ⇒ no Featured supply at all (rail hidden client-side). Tail-only Featured does NOT keep this populated (v1.2 — see §6.1).
- `trending.meta = null` ⇒ no NEARBY+CITY Trending supply (rail hidden; Popular sibling renders).
- `popular.meta = null` ⇒ either Trending has supply (sibling not needed) AND `source !== 'none'`, OR no UK-wide redemptions at all (sibling also empty).
- `nearbyByCategory[i].meta = null` ⇒ that per-category rail hidden.
- `nearbyByCategory.length === 0` AND `locationContext.source !== 'none'` ⇒ trigger `<NearbySectionEmpty>` (see §8.4).
- `locationContext.source === 'none'` ⇒ trigger `<HomeNoLocationBanner>` (see §8.6).

---

## 6. Per-rail scope rules + cascade semantics

### 6.1 Featured rail (F-2)

**Inclusion source:** `FeaturedMerchant` rows in date window + ACTIVE merchants, identical to today.

**Scope filter:**
1. Run inclusion candidates through `rankBranchesV3` to attach rung classification + distance.
2. Apply per-rail scope helper `resolveScopeForHomeRail('featured', rungCounts)`:
   - Initial retained tiers: `[NEARBY, CITY]`.
   - If `rungSupplyForTiers([NEARBY, CITY], rungCounts) > 0` → keep; `scopeExpanded = false`; `scope = 'city'`.
   - Else if `rungSupplyForTiers([NEARBY, CITY, DISTANT], rungCounts) > 0` → cascade; `scopeExpanded = true`; `scope = 'platform'`.
   - Else → rail hidden (`meta = null`, `branches = []`).
3. Append non-rankable tail per §6.4 (subject to the strict-locality identity gate in local state; freely in cascade state).
4. Tiles emitted in the surviving tier(s) sorted by `startDate ASC` within rung (preserves admin curation intent).

**Tail-only state hides the rail (v1.2 — Option A).** If `rungCounts` has zero across NEARBY+CITY+DISTANT, the rail hides regardless of how many tail-eligible branches exist. Tail tiles cannot independently trigger any rail state because they have no rung classification to claim. This aligns Featured with Trending + NearbyByCategory rules (tail attaches only when ranked supply > 0).

**Header copy is driven by `meta.scopeExpanded` + `meta.locality.name` + client-derived `allBranchesInLocality` (v1.4):**
- `scopeExpanded === true` → `Featured on Redeemo` (subtitle: `Here are the closest matches we have` — see §8.3 row 2). Locality framing irrelevant.
- `scopeExpanded === false` AND locality present AND **every visible branch passes the §6.4.1 strict-locality identity ladder** → `Featured in {City}`.
- `scopeExpanded === false` AND locality present AND **any visible branch fails the identity ladder** (i.e. CATCHMENT/POST_TOWN tier — strict-locality gate not satisfied) → `Featured near {City}` (v1.4).
- `scopeExpanded === false` AND locality absent → `Featured near you` (defensive fallback — pre-v1.4 behaviour preserved).
- `meta === null` → rail hidden (see §8.3 row 3).

The `allBranchesInLocality` derivation runs client-side in `<FeaturedCarousel>` (the call site has both `meta.locality` and the visible `rail.branches`). The predicate matches §6.4.1 exactly: `branch.localityId === effLoc.locality.id` OR `branch.localityName?.toLowerCase() === effLoc.locality.name.toLowerCase()` OR `branch.postTown?.toLowerCase() === effLoc.locality.name.toLowerCase()`.

**Why this matters (v1.4 honesty rationale):** pre-v1.4, a Halifax user seeing Huddersfield Featured merchants (6-9mi catchment) read "Featured in Halifax" alongside "6.1 miles away" chips — header overclaim. Post-v1.4, the same state reads "Featured near Halifax" (more honest); a Huddersfield user with strictly-in-Huddersfield Featured supply continues to read "Featured in Huddersfield" (unchanged).

### 6.2 Trending rail + Popular sibling (T-2)

**Trending inclusion source:** redemption count per merchant within current calendar month, identical to today's redemption-count logic.

**Trending scope filter:**
1. Run inclusion candidates through `rankBranchesV3` to attach rung classification + distance.
2. Apply `resolveScopeForHomeRail('trending', rungCounts)`:
   - Strict retained tiers: `[NEARBY, CITY]`. NO cascade.
   - If supply > 0 → render; `scope = 'city'`; `scopeExpanded = false`; copy = `Trending near you`.
   - Else → `trending.meta = null`, `trending.branches = []`. Popular sibling rail is then evaluated.
3. Append non-rankable tail per §6.4 (subject to strict-locality identity gate) only when ranked supply > 0. Tail does NOT keep an empty Trending rail alive (v1.2 explicit).

**Popular on Redeemo sibling rail (v1.2 tile-contract rules made explicit):**

- **Trigger:** renders when EITHER `trending.meta === null` (no local-tier Trending supply) OR `locationContext.source === 'none'` (no location signal at all).
- **Inclusion source:** same monthly-redemption-count query as Trending, but without locality filter — top N merchants by redemption count UK-wide.
- **With `effLoc` resolved (Trending-empty path):**
  - Tiles flow through `rankBranchesV3` so they get rung classification + distance.
  - POSTCODE_CENTROID tail tiles append freely (no locality claim under `Popular on Redeemo` framing — strict-locality gate does NOT apply).
  - `meta = { locality: null, scope: 'platform', scopeExpanded: false, rungCounts }` — locality is null on Popular meta because the rail is intentionally platform-wide.
- **Without `effLoc` (no-location path):**
  - V3 ranker NOT invoked (it requires `effLoc`).
  - Every tile receives `supplyRung = null, proximityBand = null, distanceMetres = null` (v1.2 explicit).
  - Customer-app render path hides the distance/proximity chip per P3 — never renders placeholder copy.
  - `meta = { locality: null, scope: 'platform', scopeExpanded: false, rungCounts: <zeros> }`.
- **Header copy:** `Popular on Redeemo`. Always honestly platform-wide. Never claims locality.
- **Hidden state:** `popular.meta = null` when no UK-wide redemptions at all this month, regardless of location state.

**Cross-rail invariant:** `trending.meta` and `popular.meta` MUST be mutually exclusive when `source !== 'none'`. At most one of the two rails ever renders in that state. In `source === 'none'` state, Trending is forced null and Popular evaluates independently. Backend asserts this in the response builder.

### 6.3 NearbyByCategory rails (v1.7 amended — thin-local-supply top-up)

**Inclusion + cascade (v1.5) + parent-grouping (v1.6) + top-up (v1.7):**
1. **Local-first pass** — geographic-catchment merchant pool, bbox-filtered around `effLoc.lat/lng` (`±0.3°`, matching `prisma/profile-nearest-locality-at4.ts` pattern). Pool size: 100. **Merchants grouped by `primaryCategory.parent?.id ?? primaryCategory.id` (v1.6 — parent rollup; was leaf `primaryCategoryId` in v1.5).** Per-parent-category: rank via `rankBranchesV3` → strict NEARBY+CITY scope filter (`resolveScopeForHomeRail('nearbyByCategory', ...)`) → append strict-locality tail per §6.4.1 → enrich. Surviving parent categories render with `meta.scopeExpanded === false` and `<RailHeader>` applies `homeCategoryRailLabel()` to produce `"{Sentence-cased parent} picks"` (e.g. `Food & drink picks`, `Beauty & wellness picks`). Per-tile descriptor on `BranchTile.merchant.descriptor` continues to carry the leaf differentiator (Italian Restaurant, Pizza Place, Nail Salon, Barber).

2. **Top-up pass (v1.7 NEW)** — for each parent rail with `0 < branches.length < NEARBY_CATEGORY_TAKE`, append wider-Redeemo filler tiles to fill empty slots. Single batched fetch keyed by parent ids needing top-up: `prisma.merchant.findMany({ status: ACTIVE, branches.some({ isActive: true }), primaryCategory: { OR: [{ id: { in: topUpParentIds } }, { parentId: { in: topUpParentIds } }] } }, take: 300)`. Per rail:
   - Exclude merchants already represented in the rail (by merchant id).
   - Fetch branches with `RANK_BRANCH_SELECT`.
   - Filter to MANUALLY_CONFIRMED + ADDRESS_GEOCODED only (every filler tile MUST have a real distance chip — POSTCODE_CENTROID + NEEDS_REVIEW stay a local-tail story).
   - Compute `haversineMetres(effLoc.lat, effLoc.lng, branch.lat, branch.lng)`.
   - Distance-ASC sort across the entire eligible pool.
   - Dedupe to ONE filler tile per merchant (variety > branch-density).
   - Take up to `NEARBY_CATEGORY_TAKE - rail.branches.length` fillers.
   - Filler `supplyRung: null` (V3 skipped — cross-region distances exceed maxRung). Filler `proximityBand`: **v1.8 derives from distance** via `deriveFillerProximityBand` (< 8 mi → `IN_YOUR_AREA`; < 25 mi → `A_LITTLE_FURTHER`; else → `NEAREST_ON_REDEEMO`). Was `null` pre-v1.8 → chip silently hid → v1.8 closes the honesty gap on EXACTLY the tiles that needed the chip most.
   - Append at the END of `rail.branches`.  Local-first ordering preserved.
   - `rail.meta.scopeExpanded` STAYS `false` — mixed rails do NOT contribute to `<NearbyContextBanner>` (which only fires on pure-cascade rails).

3. **Cascade fill (v1.5 — β1 + β5 + β7; v1.6 parent-keyed dedup)** — if the local-first loop produced fewer than `NEARBY_MAX_CATEGORIES` (6) rails, top up with UK-wide platform-fetch. **Cascade pool (v1.6): `prisma.merchant.findMany({ status: ACTIVE, branches.some({ isActive: true }) }, take: 200)` — the legacy SQL `primaryCategoryId NOT IN local-rails` filter was leaf-keyed; v1.6 dedup runs JS-side via `usedCategoryIds` (parent-keyed Set) against `railGroupingCategory(merchant)`.** Same per-parent-category grouping (5 merchants). For each cascade category:
   - Rank via `rankBranchesV3` (same params as local).
   - **No scope filter** — all rungs accepted.
   - **Permissive tail** (no strict-locality identity gate per β7 — rail no longer claims locality).
   - **Distance ASC sort across all rungs** (β5 — closest matches first; overrides V3's within-rung ordering for cascade rails specifically).
   - **v1.8:** Filler `proximityBand` derived from distance (same `deriveFillerProximityBand` rule as Step 2 top-up). Was `null` pre-v1.8.
   - Enrich + push with `meta.scopeExpanded === true`, `meta.scope === 'platform'`, `meta.locality` preserved (used by context banner copy).
4. **Total rails capped at `NEARBY_MAX_CATEGORIES` (6).** Per-rail cap at `NEARBY_CATEGORY_TAKE` (5) is enforced after Step 2 top-up — fillers cannot push a rail past 5.

Pre-v1.5 history: v1.3 used `branch.city === locationCtx.city` string-match (excluded catchment); v1.4 fixed inclusion to bbox-filter (matches Featured+Trending); v1.5 adds the cascade-fill behaviour so sparse-market users still get content (`local-first, not local-only`). v1.7 adds top-up so even rails with thin local supply fill to the cap with closest wider Redeemo merchants.

**Why this matters (v1.5 owner direction):** Manchester / Bristol users pre-v1.5 saw an empty NBC zone with `<NearbySectionEmpty>` as the only signal — feel-empty Home. Post-v1.5, the cascade surfaces relevant platform merchants under honest `{Category} on Redeemo` headers + a contextual `<NearbyContextBanner>` ("We're still growing in {City}. Here are the closest category matches on Redeemo."). Distance/proximity chips on tiles carry the trust signal.

**Scope filter:** per-category rails apply the SAME strict NEARBY+CITY filter as Trending:
1. For each category candidate set, run `rankBranchesV3` → attach rungs.
2. Apply `resolveScopeForHomeRail('nearbyByCategory', rungCounts)`:
   - Strict retained tiers: `[NEARBY, CITY]`. NO cascade.
   - Per-category rail hidden (`meta = null`) if supply is zero in those tiers.
3. Surviving per-category rails sorted within rung by distance (LOCAL intent default — appropriate for the "near me browse" purpose).
4. Append non-rankable tail per §6.4 (subject to strict-locality identity gate) only when per-category ranked supply > 0.

**Header copy per category rail (v1.6 — parent-grouped):**
- Local rail (`meta.scopeExpanded === false`) → `homeCategoryRailLabel(parentName)` → e.g. `Food & drink picks`
- Cascade rail (`meta.scopeExpanded === true`) → SAME helper output (v1.6 retired the cascade-specific `{Category} on Redeemo` suffix; the `<NearbyContextBanner>` carries the platform-claim message)
- No supply → rail hidden (per-parent-category)
- All categories hidden AND effLoc resolved (effectively unreachable post-v1.5 cascade) → `<NearbySectionEmpty>` renders (see §8.4)

**Top-level limit:** `NEARBY_MAX_CATEGORIES = 6` parent rails total. `NEARBY_CATEGORY_TAKE = 5` merchants per parent rail. Both caps unchanged in v1.6 — the rollup pulls more variety into each rail rather than producing more rails. If fewer than 6 parents have local-tier supply, cascade fill tops up with cascaded parent rails (still capped at 6 total).

### 6.4 POSTCODE_CENTROID + NEEDS_REVIEW non-rankable tail (D9) — v1.2 strict-locality gate

**Audit (per owner direction "audit and document carefully"):**

`rankBranchesV3` ([src/api/lib/ranking.ts](src/api/lib/ranking.ts)) classifies only branches with `locationConfidence ∈ {MANUALLY_CONFIRMED, ADDRESS_GEOCODED}`. POSTCODE_CENTROID + NEEDS_REVIEW branches return `rung = null` and are excluded from `rungCounts`.

Search's behaviour (locked under §AV, 2026-05-15) surfaces these branches via a **non-rankable tail** appended to the end of the rankable result set. **Search's tail is unchanged in this workstream** — owner direction v1.2: "Search can tolerate a non-rankable tail, but Home's `near you` contract is stricter."

#### 6.4.1 Strict-locality identity gate (NEW v1.2)

For a non-rankable tail tile to surface inside a **local-claim rail** on Home (any rail with `near you` / `in {City}` framing), the branch MUST pass at least one of the three identity-ladder checks against the user's `effLoc.locality`:

1. **Canonical ID match:** `branch.localityId === effLoc.locality.id`
2. **Case-insensitive locality-name text match:** `branch.localityName?.toLowerCase() === effLoc.locality.name.toLowerCase()`
3. **Case-insensitive postTown text match:** `branch.postTown?.toLowerCase() === effLoc.locality.name.toLowerCase()`

The three-check identity ladder mirrors PR #124 fixup-6 in Search (the multi-row Locality fallback). Owner-locked: any one of these passing is sufficient; none passing excludes the tile from local rails.

Tiles passing the gate carry `supplyRung = null, proximityBand = null, distanceMetres = null` on the wire per the existing `exposeBranchPosition` redaction. POSTCODE_CENTROID lat/lng MUST NOT surface (existing standing rule).

#### 6.4.2 Per-rail decision matrix (v1.2)

| Rail | State | Tail attaches? | Strict-locality gate applies? |
|---|---|---|---|
| Featured | local supply (`scopeExpanded=false`) | Yes, only when ranked supply > 0 | **Yes** — local-claim header `Featured in {City}` |
| Featured | cascade (`scopeExpanded=true`) | Yes | **No** — header `Featured on Redeemo` carries no locality claim |
| Featured | no supply at all | Rail hidden; tail does NOT keep it alive (§6.1 v1.2) | N/A |
| Trending near you | local supply | Yes, only when ranked NEARBY+CITY supply > 0 | **Yes** — local-claim header `Trending near you` |
| Trending near you | no local supply | Rail hidden; tail does NOT keep it alive (§6.2) | N/A |
| Popular on Redeemo | with effLoc | Yes | **No** — platform-claim header `Popular on Redeemo` |
| Popular on Redeemo | no effLoc | Yes (all tiles in this state are effectively non-classifiable) | **No** — platform-claim, no locality claim |
| NearbyByCategory `{Category} near you` | per-category supply | Yes, only when per-category ranked supply > 0 | **Yes** — local-claim header |
| NearbyByCategory | per-category empty | Rail hidden; tail does NOT keep it alive (§6.3) | N/A |

#### 6.4.3 Why this matters

Without the gate (v1.0 / v1.1 behaviour), a POSTCODE_CENTROID branch in Bristol could surface under `Trending near you` on a Huddersfield user's Home — visually indistinguishable from a real local Trending tile (no distance chip, no proximity band, no header copy change). That violates P1.

With the gate (v1.2), Covelum's Brightlingsea POSTCODE_CENTROID branch surfaces under a Brightlingsea user's `Trending near you` rail (passes branch.postTown match), but NOT under a Huddersfield user's `Trending near you` rail (no identity match). Honest by construction.

#### 6.4.4 Location-confidence redaction

The existing `exposeBranchPosition(branch)` helper continues to apply to ALL tail tiles. POSTCODE_CENTROID branches have `latitude = null, longitude = null` on the wire; no distance / no rung / no proximity band. Customer-app render path tolerates null values (chip hides when `distanceMetres === null`). This is the existing standing contract; v1.2 adds the strict-locality gate ON TOP of redaction for local rails only.

### 6.5 Sticky-controls deferred boundary (D12)

**Out of scope for v1 per D12 = SS-1.**

Sticky / collapsible header on the nearby section with filter / sort / category-chips controls is **not built** in this workstream. The relevance model + tile contract DO leave clean hooks for a future polish workstream to consume:

- Per-rail `meta` blocks already carry locality + scope state — future filter UI can read them without further backend rework.
- Each `nearbyByCategory[i]` entry exposes a `category.id` — future "jump to category" chips deep-link cleanly to the existing Category screen.
- Per-rail tile renderings are already isolated components; wrapping the nearby section in a scrollable container later is a layout change, not a contract change.

The full SS-1 / SS-2 / SS-3 trade-offs, the filter-surface consolidation question (relationship to Category's `<FilterSheet>` + Search's scope pill row + Map's category pills), and the "Open now" toggle proposal are captured as deferred follow-up **§DA Home nearby sticky-controls + filter UI consolidation** (see §14.2).

---

## 7. Locked-copy worksheet (rail headers)

Drives the `<RailHeader>` component on the customer-app side. The component reads `rail.meta.locality.name` + `rail.meta.scopeExpanded` to render the right variant.

This worksheet covers **rail header copy only**. Empty-state copy + section-level fallback components live in §8.

| Rail | State | Header copy | Subtitle (when applicable) |
|---|---|---|---|
| Featured | NEARBY+CITY supply, locality known, **all visible branches pass strict-locality identity ladder** (§6.4.1) | `Featured in {City}` | — |
| Featured | NEARBY+CITY supply, locality known, **any visible branch fails identity ladder** (CATCHMENT/POST_TOWN tier — v1.4) | `Featured near {City}` | — |
| Featured | NEARBY+CITY supply, locality unknown | `Featured near you` | — |
| Featured | DISTANT cascade (scopeExpanded=true) | `Featured on Redeemo` | `Here are the closest matches we have` |
| Trending | NEARBY+CITY supply | `Trending near you` | — |
| Popular on Redeemo | UK-wide supply (fires when Trending empty OR no-location) | `Popular on Redeemo` | — |
| NearbyByCategory | Local supply (`meta.scopeExpanded === false`) — v1.6 parent-grouped | `homeCategoryRailLabel(parent.name)` → e.g. `Food & drink picks`, `Beauty & wellness picks` | — |
| NearbyByCategory | Cascaded supply (`meta.scopeExpanded === true`) — v1.6 same helper output (retired v1.5 `{Category} on Redeemo` suffix) | `homeCategoryRailLabel(parent.name)` (banner carries platform claim) | — |

**`homeCategoryRailLabel` helper (v1.6 — locked):** `apps/customer-app/src/features/home/utils/homeCategoryRailLabel.ts`. Inputs the parent category name; outputs sentence-case + " picks":
- `Food & Drink` → `Food & drink picks`
- `Beauty & Wellness` → `Beauty & wellness picks`
- `Health & Fitness` → `Health & fitness picks`
- `Out & About` → `Out & about picks`
- `Shopping` → `Shopping picks`
- Empty / whitespace input → defensive `picks`

The label rule is identical for local AND cascade rails — the `<NearbyContextBanner>` carries the cascade claim in one place rather than 6× per-rail suffixes. Avoids feeling like a plain duplicate of the top category navigation grid (which renders bare parent names).

**Locked phrase rules:**
- `near you` appears ONLY when every tile in the rail is NEARBY/CITY tier per `rankBranchesV3` OR passes the §6.4 strict-locality identity gate.
- `in {City}` is used when `meta.locality.name` is available + supply is NEARBY+CITY tier. Falls back to `near you` if locality name is somehow unavailable (defensive).
- `on Redeemo` is the canonical "platform-wide" qualifier — used on Featured cascade and on Popular sibling. NearbyByCategory cascade rails do NOT carry this suffix (v1.6 — banner does that work).
- `picks` is the v1.6 suffix on NearbyByCategory rail labels (parent-grouped). Only applies to `railKind="nearbyByCategory"`.
- `Here are the closest matches we have` is the canonical subtitle for any cascaded "on Redeemo"-style header on Home (currently used by Featured cascade only).
- No em dashes in user-facing rail copy (existing standing rule, applies to all copy in this spec).
- All copy is British English (existing standing rule).

**Distance chip on tiles:** identical format to Search's chip per D5. Display logic + thresholds (metres vs. miles, when to show "Nearest on Redeemo" proximity band copy) are reused from the existing `BranchTile` component used by Search/Category/Map. Chip auto-hides when `distanceMetres === null`.

---

## 8. Fallback matrix + friendly empty states

This section operationalises **P6 — Friendly empty over silent empty**. Every empty state on Home is documented, with a clear render decision (hide / sibling rail / friendly card / banner) and a locked copy/CTA pairing.

### 8.1 Design principles for fallbacks (v1.2 updated)

1. **RAIL-level empty ≠ SECTION-level empty.** A single empty rail hides silently (the next rail moves up). A whole product zone going empty (e.g. all nearby category rails) gets a friendly section-level empty card with CTAs. The whole-page empty case gets the no-location banner.
2. **At most ONE primary CTA per state.** When the no-location banner is showing, no other CTA renders. **When `<NearbySectionEmpty>` is showing, `<HomeExploreMore>` does NOT also render** (v1.2 dedup). Stacking CTAs makes the surface feel desperate.
3. **The nearby-section empty card REPLACES the per-category rails**; it does not sit alongside any rail in that zone.
4. **Popular on Redeemo renders INDEPENDENTLY of the no-location state.** It can render alongside the banner — it's the fallback for "no location but there's still UK-wide content worth showing." In no-location state, Popular tiles carry null rung/band/distance (§6.2).
5. **Copy is centralised in §8.2.** No ad-hoc empty-state copy anywhere; every CTA / placeholder phrase comes from the canonical library.

### 8.2 Canonical phrase library (locked 2026-05-22)

Owner-provided phrases that ALL fallback states draw from. No other empty-state copy is permitted; if a new state needs phrasing, the phrase is added here first.

| # | Phrase | Used in |
|---|---|---|
| L1 | `We're still growing near you` | `<NearbySectionEmpty>` headline (§8.4) |
| L2 | `Here are the closest matches we have` | Featured cascade subtitle (§7) |
| L3 | `Explore more on Redeemo` | `<HomeExploreMore>` button label (§8.5) |
| L4 | `Set your area to see nearby offers` | `<HomeNoLocationBanner>` headline (§8.6) |
| L5 | `We're still growing in {City}. Try browsing categories or searching to find offers across the UK.` | `<NearbySectionEmpty>` body (§8.4). `{City}` is `feed.locationContext.locality.name`. Defensive fallback when locality is null drops the leading clause entirely, leaving just `Try browsing categories or searching to find offers across the UK.` — fires only defensively because the component is gated on `source !== 'none'` at the call site. Locality-aware variant locked PR #126 device-QA B.1 (2026-05-23). |
| L6 | `Browse all categories` | `<NearbySectionEmpty>` primary CTA → Categories tab (§8.4) |
| L7 | `Open search` | `<NearbySectionEmpty>` secondary CTA → Search tab (§8.4) |
| L8 | `Allow location or set your saved area so we can show you what's nearby.` | `<HomeNoLocationBanner>` body (§8.6) |
| L9 | `Allow location` | `<HomeNoLocationBanner>` primary CTA → request GPS (§8.6) |
| L10 | `Set my area` | `<HomeNoLocationBanner>` secondary CTA → PC2 (§8.6) |
| L11 | `Looking for more? Explore offers across Redeemo.` | `<HomeExploreMore>` body (§8.5) |
| L12 | `We're still growing in {City}. Here are the closest category matches on Redeemo.` | `<NearbyContextBanner>` body (§8.7-new). `{City}` is `feed.locationContext.locality.name`. Defensive fallback when locality is null leaves only `Here are the closest category matches on Redeemo.` Locked v1.5 PR #126 device-QA-3 (β2 + β3, 2026-05-23). |

All copy is British English, no em dashes, no emoji, no exclamation marks except where natural sentence structure demands.

### 8.3 Fallback matrix — every empty state mapped (v1.2 updated)

Each row defines a state + the precise render decision. Backend response detection conditions are documented for test pin authoring.

| # | State | Detection (backend response) | Rail behaviour | Section / page behaviour | Copy / CTAs |
|---|---|---|---|---|---|
| 1 | Featured: local supply | `featured.meta !== null && featured.meta.scopeExpanded === false` | Render rail normally | — | Header: `Featured in {City}` (or `Featured near you` if locality unknown) |
| 2 | Featured: platform cascade | `featured.meta !== null && featured.meta.scopeExpanded === true` | Render rail normally | — | Header: `Featured on Redeemo` + subtitle: `Here are the closest matches we have` |
| 3 | Featured: no supply at all (including tail-only) | `featured.meta === null` | **Hide rail silently** (v1.2 — tail-only also hides) | Next rail occupies the slot | No copy |
| 4 | Trending: local supply | `trending.meta !== null` | Render `Trending near you` | — | Header: `Trending near you` |
| 5 | Trending empty, Popular fills (with effLoc) | `trending.meta === null && popular.meta !== null && locationContext.source !== 'none'` | Trending hidden; Popular renders in same slot | — | Header: `Popular on Redeemo`; tiles have rung/band/distance when classifiable |
| 6 | Trending + Popular both empty | `trending.meta === null && popular.meta === null` | Both rails hidden silently | Next zone (NearbyByCategory or its empty state) moves up | No copy |
| 7 | NearbyByCategory: per-category empty | individual `nearbyByCategory[i].meta === null` (or absent from array) | That category rail hidden | Other categories continue rendering | No copy |
| 8 | NearbyByCategory: ALL categories empty AND effLoc resolved | `nearbyByCategory.length === 0 && locationContext.source !== 'none'` | All per-category rails hidden | `<NearbySectionEmpty>` card renders in place of the rails | Card: headline `We're still growing near you` + body `We're still growing in {City}. Try browsing categories or searching to find offers across the UK.` (defensive fallback drops the leading clause if locality is null) + buttons `Browse all categories` (→ Categories tab) + `Open search` (→ Search tab) |
| 9 | No location at all | `locationContext.source === 'none'` | Featured / Trending / NearbyByCategory all hidden (server returns empty + null meta on each); Popular MAY render with null-tile-contract per §6.2 | `<HomeNoLocationBanner>` renders above all other content | Banner: headline `Set your area to see nearby offers` + body `Allow location or set your saved area so we can show you what's nearby.` + buttons `Allow location` (request GPS) + `Set my area` (→ PC2) |
| 10 | Sparse local supply (rails render with 1–2 cards) | rails return `meta !== null` but `branches.length` is small | Render rails honestly with low card count | If page is thin (per §8.5 heuristic) AND `<NearbySectionEmpty>` is NOT showing, `<HomeExploreMore>` renders at page bottom | Body: `Looking for more? Explore offers across Redeemo.` + button: `Explore more on Redeemo` (→ Search tab) |
| 11 | Total page-empty (no effLoc + no Popular either) | `locationContext.source === 'none' && popular.meta === null` | All rails hidden | Banner from row #9 only | Banner from row #9. No other CTA. |

**Row #10 — sparse-supply heuristic for `<HomeExploreMore>` (v1.2):** the page-bottom soft CTA renders when ALL the following hold:
```
(featured.meta === null OR featured.meta.scopeExpanded === true)
&& trending.meta === null
&& nearbyByCategory.length < 2
&& locationContext.source !== 'none'   // banner takes precedence
&& !nearbySectionEmptyVisible          // mutual exclusion with <NearbySectionEmpty> (v1.2)
```
The last condition is the v1.2 dedup change. If `nearbyByCategory.length === 0` then `<NearbySectionEmpty>` renders AND `<HomeExploreMore>` does NOT. The two never coexist.

### 8.4 `<NearbySectionEmpty>` component spec

Renders when `nearbyByCategory.length === 0 && locationContext.source !== 'none'` (matrix row 8). Sits in the vertical zone where the per-category rails would otherwise appear.

**Visual:** soft warm-tinted card surface matching DESIGN.md's `color.surface.tint` palette (same tone used by `<RedemptionDetailsCard>` inner-notice and `<FilterSheet>` selected-row backgrounds). 1px hairline border, no card shadow, generous internal padding. Single card; not a list.

**Props (v1.1 update — PR #126 device-QA B.1):**
```ts
interface NearbySectionEmptyProps {
  cityName?: string | null
}
```
`cityName` is passed by `<HomeScreen>` as `feed.locationContext.locality.name`. May be null only as a defensive fallback (the component itself is gated on `source !== 'none'` at the call site, so a populated locality is expected in normal operation).

**Content:**
- **Headline** (Mustica Pro Semibold, display.sm): `We're still growing near you` (L1 — unchanged).
- **Body** (Lato Regular, body.md, color.text.secondary):
  - When `cityName` is provided: `We're still growing in {cityName}. Try browsing categories or searching to find offers across the UK.` (L5 amended).
  - When `cityName` is null/undefined (defensive fallback): `Try browsing categories or searching to find offers across the UK.` (original generic phrasing — leading locality clause dropped entirely).
- **Button row** (two pills, vertically stacked on narrow viewports, side-by-side otherwise):
  - **Primary:** `Browse all categories` — navigates to Categories tab (`router.push('/(app)/categories')`)
  - **Secondary:** `Open search` — navigates to Search tab with empty query (`router.push('/(app)/search')`)

**testID:** `home-nearby-section-empty`

**Does NOT render when:**
- `locationContext.source === 'none'` (banner takes over instead — row #9)
- Any per-category rail has supply (`nearbyByCategory.length > 0`)

**When this renders, `<HomeExploreMore>` MUST NOT render (v1.2 dedup).**

**v1.2 / PR #126 device-QA-2 deferrals (§DE):** visual design polish, optional nearby-merchant preview inside the card, whole-card tappability, single-tap primary action destination. See deferred follow-ups `project_deferred_DB_DC_DD_home_relevance_followups.md` §DE — bundles with §DA (sticky-controls) and §DC (sparse-category short-trip cascade) brainstorm.

### 8.5 `<HomeExploreMore>` component spec (v1.2 updated)

Renders at the bottom of the Home scrollable area when the sparse-supply heuristic in §8.3 row #10 fires. The user has location but the page is thin AND `<NearbySectionEmpty>` is not already filling the empty-state role.

**Visual:** soft pill-style CTA card. Lower visual weight than `<NearbySectionEmpty>` — this is a gentle nudge, not a primary call-to-action. Same warm-tinted surface; smaller padding; centred content.

**Content:**
- **Body** (Lato Regular, body.md, color.text.secondary, centred): `Looking for more? Explore offers across Redeemo.`
- **Button** (single pill, primary navy-gradient variant matching the established Home CTA style): `Explore more on Redeemo` — navigates to Search tab (`router.push('/(app)/search')`)

**testID:** `home-explore-more`

**Render conditions (all must hold) — v1.2:**
- `(featured.meta === null OR featured.meta.scopeExpanded === true)`
- `trending.meta === null`
- `nearbyByCategory.length < 2`
- `locationContext.source !== 'none'`
- `<NearbySectionEmpty>` is NOT rendering (i.e. `nearbyByCategory.length > 0`)

**Mutually exclusive with:**
- `<HomeNoLocationBanner>` (banner-up state precludes this CTA)
- `<NearbySectionEmpty>` (v1.2 dedup — choose one, never both)

### 8.6 `<HomeNoLocationBanner>` component spec

Renders ONLY when `locationContext.source === 'none'`. Sits at the top of Home, ABOVE the campaign carousel and all rails.

**Visual:** prominent warm-tinted card surface, larger padding than `<NearbySectionEmpty>`, full-width across Home content area. Top-anchored; not sticky/floating in v1 (sticky behaviour is §DA territory).

**Content:**
- **Headline** (Mustica Pro Semibold, display.sm): `Set your area to see nearby offers`
- **Body** (Lato Regular, body.md, color.text.secondary): `Allow location or set your saved area so we can show you what's nearby.`
- **Button row** (two pills, side-by-side):
  - **Primary:** `Allow location` — triggers `useUserLocation().requestPermission()`; on grant, banner unmounts and Home refetches with new coords.
  - **Secondary:** `Set my area` — navigates to PC2 address screen at `/(auth)/profile-completion/address` with a return-URL param so user lands back on Home after saving.

**testID:** `home-no-location-banner`

**Behaviour on permission grant:**
- `useUserLocation` returns coords → React Query cache key changes → `useHomeFeed` refetches with `{ lat, lng }` → `locationContext.source === 'coordinates'` → banner unmounts, rails populate.

**Behaviour on permission deny:**
- Banner stays visible. User can tap `Set my area` as a fallback path to establish a location signal via PC2.
- v1 ships always-visible while `source === 'none'`. Dismissibility / sessionStorage persistence is a v2 polish concern (recorded as O7 in §15).

**State concurrency:** Featured / Trending / NearbyByCategory all hidden in this state (backend returns `meta = null` on each). Popular on Redeemo MAY render under the explicit no-location tile contract (§6.2) — tiles carry null rung/band/distance.

### 8.7 `<NearbyContextBanner>` component spec (v1.5 — new)

Renders ABOVE the NearbyByCategory rail strip when at least one category rail has `meta.scopeExpanded === true` (v1.5 cascade fill per §6.3). Provides honest context that local/catchment supply is limited so the user understands why the rails carry `{Category} on Redeemo` headers + larger distance chips on tiles.

**Visual:** intentionally minimal per β3 — "Keep this minimal. Prefer adapting/reusing the existing nearby empty-state area rather than adding a big new visual system." Same warm-tinted card surface (`color.surface.tint`) + 1px hairline border (`color.border.subtle`) as `<NearbySectionEmpty>`, smaller padding (`spacing[3]` vertical / `spacing[4]` horizontal), `radius.md` (vs `lg`), no CTAs. Single line of `body.sm` copy. Visual polish deferred to §DE.

**Content:**
- **Body** (Lato Regular, body.sm, color.text.secondary, single line wrapping permitted):
  - When `cityName` provided: `We're still growing in {cityName}. Here are the closest category matches on Redeemo.` (L12)
  - When `cityName` null/undefined (defensive fallback): `Here are the closest category matches on Redeemo.` (drops the leading clause — fires only defensively since the banner is gated on `hasNearbyRails && hasCascadedNearbyRail` at the call site, and cascaded rails imply a resolved locality in practice).
- **No buttons / CTAs.**

**testID:** `home-nearby-context-banner`

**Props:**
```ts
interface NearbyContextBannerProps {
  cityName?: string | null
}
```
`cityName` is passed by `<HomeScreen>` as `feed.locationContext.locality.name`.

**Render conditions** (set by `<HomeScreen>` derivation):
- `hasNearbyRails === true` (at least one category rail rendering)
- `hasCascadedNearbyRail === true` (at least one rail has `meta.scopeExpanded === true`)

**Does NOT render when:**
- `hasNearbyRails === false` → `<NearbySectionEmpty>` takes the slot instead (mutual exclusion).
- All category rails are local-supply (`scopeExpanded === false` on every rail) — no platform claim is being made.

**Locked owner direction (v1.5 β2 + β3):** banner gives context without making Home feel empty; minimal visual; defers visual design polish to §DE; coexists with the cascade rails it contextualises.

### 8.8 Interaction between fallbacks — dedup rules (v1.2 + v1.5 + v1.6 updated)

**v1.6 — "See all" chip suppression on one-card NearbyByCategory rails (locked):** `<NearbyByCategory>` MUST hide its trailing `See all ›` chip whenever `rail.branches.length < 2`. A one-card rail with a See-all chip implies more merchants behind it; with parent-category grouping a one-card rail genuinely means that parent category has only one merchant within reach. Threshold is locked at `>= 2`; rail header text stays tappable but without the chevron promise.

Hard rules enforced by the customer-app render layer to avoid stacking CTAs (operationalises §8.1 principle 2):

| Showing... | THEN ALSO show? |
|---|---|
| `<HomeNoLocationBanner>` (no effLoc) | ❌ `<NearbySectionEmpty>` (no effLoc means no "growing near you" claim) |
| `<HomeNoLocationBanner>` (no effLoc) | ❌ `<HomeExploreMore>` (banner CTA points to similar action) |
| `<HomeNoLocationBanner>` (no effLoc) | ✅ Popular on Redeemo (different intent — browse popular while deciding about location; tiles have null rung/band/distance per §6.2) |
| `<NearbySectionEmpty>` (all categories empty) | ✅ Featured / Trending / Popular rails (each independent) |
| `<NearbySectionEmpty>` (all categories empty) | ❌ **`<HomeExploreMore>` (v1.2 dedup — mutually exclusive, never both)** |
| `<HomeExploreMore>` (sparse heuristic) | ✅ Any rail that's actually rendering |
| `<HomeExploreMore>` | ❌ `<NearbySectionEmpty>` (v1.2 dedup) |
| `<NearbyContextBanner>` (v1.5 — any cascaded rail) | ❌ `<NearbySectionEmpty>` (mutually exclusive by construction — banner requires `hasNearbyRails`; empty card requires `!hasNearbyRails`) |
| `<NearbyContextBanner>` (v1.5) | ✅ Per-category rails it contextualises (both local + cascaded mix is valid) |
| `<NearbyContextBanner>` (v1.5) | ✅ `<HomeExploreMore>` (different intents — banner explains the cascade, ExploreMore is page-bottom nudge; can coexist) |
| `<NearbyContextBanner>` (v1.5) | ✅ `<HomeNoLocationBanner>` (structurally impossible in practice — no-effLoc state has no NBC rails, so banner can't fire — but no hard dedup needed) |

### 8.9 Render order on Home (top to bottom) — v1.5 updated

1. `<HomeNoLocationBanner>` (if `source === 'none'`)
2. Campaign carousel (existing — out of scope this workstream)
3. Featured rail (if `featured.meta !== null`)
4. `<TrendingSection>` (if `trending.meta !== null`) OR `<PopularSection>` (if `trending.meta === null && popular.meta !== null`) — same vertical slot
5. NearbyByCategory zone:
   - **v1.5:** if any rail has `meta.scopeExpanded === true` AND `nearbyByCategory.length > 0` → `<NearbyContextBanner>` renders ABOVE the rails
   - If `nearbyByCategory.length > 0` → per-category rails (one carousel per entry)
   - Else if `locationContext.source !== 'none'` → `<NearbySectionEmpty>` card
   - Else → nothing (banner is up at top)
6. `<HomeExploreMore>` (if sparse-supply heuristic fires AND banner is NOT up AND `<NearbySectionEmpty>` is NOT rendering — v1.2)

### 8.10 What we DON'T show

Recorded explicitly to prevent scope creep:
- No "0 nearby" / "no results" hard error messages anywhere. Empty rails just hide.
- No per-category empty state cards (e.g. "No cafes near you" replacing the Cafes rail). Per-category empty = hide the rail; only the WHOLE nearby zone going empty triggers `<NearbySectionEmpty>`.
- No banner / CTA when only Featured cascades. Featured cascade is honestly labelled (`Featured on Redeemo` + subtitle); the cascade IS the fallback for that rail.
- No countdown / "expanding search radius" copy. Owner direction: avoid mechanical-sounding language; warmth + honesty over technical transparency.
- No placeholder distance chip ("?.? mi" or similar) on tiles with `distanceMetres === null`. Chip just doesn't render. Same for proximity band.

---

## 9. Edge-case handbook

### 9.1 Sparse supply (D6)

A Huddersfield user with 1–2 local cafes + voucher: the `Cafes & Coffee near you` rail renders with 1–2 cards. No minimum threshold for v1. Acceptable. If the overall page is thin AND `<NearbySectionEmpty>` is not showing, `<HomeExploreMore>` (§8.5) provides a soft nudge to Search.

### 9.2 No GPS, no profile city (D7)

- All local rails hide (`featured.meta = null`, `trending.meta = null`, `nearbyByCategory = []`).
- Popular on Redeemo MAY render with the no-location tile contract (§6.2): all tiles have `supplyRung = null, proximityBand = null, distanceMetres = null`. Customer-app renders without distance/proximity chip.
- `<HomeNoLocationBanner>` (§8.6) renders at top.
- No `<NearbySectionEmpty>` (no effLoc → no "growing near you" claim) — per dedup rule §8.7.
- No `<HomeExploreMore>` (banner takes precedence) — per dedup rule §8.7.
- Backend response includes `locationContext.locality = null, locationContext.source = 'none'` to signal this state to the client.

### 9.3 Profile-city-only users (GPS denied, saved area present)

- `resolveLocationContext` (post-D8 fix) returns `locality = User.locality / profile area`, `city = locality.name`, `source = 'profile'`.
- Per-rail rules apply identically to GPS users — including the §6.4 strict-locality gate on tail tiles in local rails.
- Distance chip on tiles: hidden (no GPS coords → can't haversine). Rung + proximity band still render for classifiable branches.

### 9.4 POSTCODE_CENTROID + NEEDS_REVIEW branches (v1.2 strict-locality gate)

See §6.4 audit. Surfaces via non-rankable tail subject to the strict-locality identity gate in local rails:
- Local rails (Featured local, Trending near you, NearbyByCategory `{Category} near you`): tail tile MUST pass identity ladder.
- Platform-claim rails (Featured cascade `Featured on Redeemo`, Popular on Redeemo): tail surfaces freely.

Never keeps a `near you` rail alive on its own — tail attaches only when ranked supply > 0 (Featured tail-only state hides the rail per §6.1 v1.2).

### 9.5 Multi-branch merchants (D11)

Per `branch-as-primary` rule (§M), each ACTIVE branch surfaces as its own tile. Across rails, the same merchant may appear multiple times if multiple branches qualify (e.g. two Covelum branches both surfacing under Trending nearby — one MANUALLY_CONFIRMED + classified, another POSTCODE_CENTROID + passing the strict-locality gate). No Home-level dedup for v1.

### 9.6 First-open / no location signal

Same as §9.2 — `<HomeNoLocationBanner>` is the recovery surface. PC2 onboarding is the primary driver to establish a location signal during initial sign-up; the banner is the post-onboarding recovery path.

### 9.7 Cache invalidation on location change

React Query cache key for `useHomeFeed` includes `lat` + `lng` (already true). Coordinate change → cache miss → refetch. Permission grant via `<HomeNoLocationBanner>` flows naturally: new coords → cache invalidation → banner unmounts on refetch.

### 9.8 `scopeExpanded` semantics across rails

- Featured: `scopeExpanded = true` when cascade to DISTANT fired. This is the only rail where cascade is allowed.
- Trending: `scopeExpanded = false` always (no cascade).
- Popular: `scopeExpanded = false` always (no locality scope concept; always platform).
- NearbyByCategory: `scopeExpanded = false` always (no cascade).

The customer-app `<RailHeader>` ignores `scopeExpanded` for Trending / Popular / NearbyByCategory rails — copy is determined by rail presence + locality alone.

### 9.9 Concurrent rail empty states

If Trending is empty AND no UK-wide redemptions exist at all this month: Trending hidden, Popular hidden, NearbyByCategory rails may still render normally. User sees Featured + NearbyByCategory only. If NearbyByCategory ALSO empty: `<NearbySectionEmpty>` shows in its zone (and `<HomeExploreMore>` does NOT render per v1.2 dedup). If Featured ALSO empty: just `<NearbySectionEmpty>` carries the page.

### 9.10 Featured cascade tie-break with admin curation

Under F-2, when Featured cascades to DISTANT, the existing `startDate ASC` tie-break preserves admin curation intent within each rung. Owner may want to revisit this later (e.g. distance-within-rung as the inner sort) — deferred, not a blocker for v1. Recorded as a non-blocking open question (§15).

### 9.11 Featured tail-only state (v1.2)

If the only branches available to Featured are POSTCODE_CENTROID + NEEDS_REVIEW (zero MANUALLY_CONFIRMED + ADDRESS_GEOCODED), `rankBranchesV3` returns empty `rungCounts`. Per §6.1 v1.2: the rail hides (`featured.meta = null`). Tail tiles cannot independently trigger a rail state because they have no rung to claim. Aligns Featured with Trending + NearbyByCategory consistency rules.

---

## 10. Backend implementation contract

### 10.1 Reused primitives (no new ranking logic)

- `resolveEffectiveLocation` ([src/api/lib/effectiveLocation.ts](src/api/lib/effectiveLocation.ts:41-109)) — resolves GPS → nearest Locality → densityClass → `EffectiveLocation`. Already supports saved-profile fallback.
- `rankBranchesV3` ([src/api/lib/ranking.ts](src/api/lib/ranking.ts:679-779)) — branch ranker with rung classification + per-rung sort + targetCount/hardCap. Already used by Search / Category / Map.
- `classifyRung` ([src/api/lib/ranking.ts](src/api/lib/ranking.ts)) — branch → SupplyRung classifier. Skips POSTCODE_CENTROID + NEEDS_REVIEW per locked location-confidence rules.
- `LadderProfile` + `NEARBY_RADII` ([src/api/lib/ladderProfiles.ts](src/api/lib/ladderProfiles.ts:50-56)) — radius constants per density class. Already correct.
- `getProximityBand` ([src/api/lib/ladderProfiles.ts](src/api/lib/ladderProfiles.ts)) — rung → proximity band copy mapper. Already correct.
- `exposeBranchPosition` (existing helper) — applies POSTCODE_CENTROID lat/lng redaction. Mandatory on non-rankable tail tiles.
- `findNearestLocality` ([src/api/lib/nearestLocality.ts](src/api/lib/nearestLocality.ts)) — bbox-prefiltered + haversine-sorted nearest-Locality lookup. Used by §10.3 fix.

### 10.2 New helpers

A small, well-bounded surface — see §6.1 / §6.2 / §6.3 for full semantics.

- `resolveScopeForHomeRail(railKind, rungCounts) → { retainedRungs, scopeExpanded, scope }` in `src/api/customer/discovery/homeScope.ts` (new file). Distinct from Search's `resolveScopeForBranches` because Home rails have hardcoded per-rail policies (no `?scope=` user input):
  - `'featured'` — NEARBY+CITY → cascade to DISTANT on zero supply. **Hide if all three are zero (v1.2).**
  - `'trending'` — NEARBY+CITY strict, no cascade.
  - `'nearbyByCategory'` — NEARBY+CITY strict, no cascade.
  - `'popular'` — all tiers (UK-wide).
- `appendStrictLocalityTail(rankedTiles, candidates, effLoc) → BranchTile[]` in same file (v1.2). Applies the §6.4 identity-ladder gate. Used by Featured local / Trending / NearbyByCategory rail builders. Returns the original `rankedTiles` followed by any gate-passing tail tiles (with `exposeBranchPosition` redaction applied).
- `appendPermissiveTail(rankedTiles, candidates) → BranchTile[]` in same file (v1.2). No gate. Used by Featured cascade + Popular rail builders.

### 10.3 `resolveLocationContext` fix (closes deferred §BB / D8)

Current behaviour ([src/api/customer/discovery/service.ts:102-120](src/api/customer/discovery/service.ts#L102-L120)):
- GPS present → `city: null, lat, lng, source: 'coordinates'`.
- GPS absent + profile city → `city: User.city, lat: null, lng: null, source: 'profile'`.

The `city: null` for GPS callers is the root cause of the Trending + NearbyByCategory locality-filter bypass (audited 2026-05-22).

**Post-fix behaviour:**
- GPS present → resolve via `findNearestLocality(lat, lng)` → `locality, city: locality.name, lat, lng, source: 'coordinates'`.
- GPS absent + profile city → resolve `User.locality` (or back-lookup `User.city` → Locality via existing helper) → `locality, city: locality.name, lat: null, lng: null, source: 'profile'`.
- Neither → `locality: null, city: null, source: 'none'`.

**Backward compatibility:** the `city` field stays; downstream code reading `locationCtx.city` continues to work. Adding `locationCtx.locality` is additive. Closes §BB cleanly.

### 10.4 Rail builders (v1.2 updated)

Each rail is a focused builder taking `(prisma, effLoc, ladderProfile, options) → { branches, meta }`:

- **`buildFeaturedRail(prisma, effLoc, ladderProfile, locationCtx)`** — inclusion query → `rankBranchesV3` → `resolveScopeForHomeRail('featured', ...)`. Three terminal states:
  - Local supply (`scopeExpanded=false`): apply scope filter → `appendStrictLocalityTail(...)` per §6.4 → enrich tiles → return `{ branches, meta }`.
  - Cascade supply (`scopeExpanded=true`): apply scope filter → `appendPermissiveTail(...)` → enrich tiles → return `{ branches, meta }`.
  - **No ranked supply at all (v1.2): return `{ branches: [], meta: null }`. Tail-only state hides the rail.**

- **`buildTrendingRail(prisma, effLoc, ladderProfile, locationCtx)`** — same pattern, strict NEARBY+CITY scope. If no ranked supply → return `{ branches: [], meta: null }`. Tail does not keep alive. If ranked supply > 0 → `appendStrictLocalityTail(...)`.

- **`buildPopularRail(prisma, effLoc, ladderProfile, locationCtx)`** (v1.2 explicit no-location handling) — fires when caller signals Trending was empty OR `effLoc === null`. Two branches:
  - **With `effLoc`:** inclusion query (UK-wide redemption count) → `rankBranchesV3` to attach rung classification → no scope filter (all tiers) → `appendPermissiveTail(...)` → enrich tiles → return `{ branches, meta: { locality: null, scope: 'platform', scopeExpanded: false, rungCounts } }`.
  - **Without `effLoc` (no-location state):** inclusion query → V3 ranker NOT invoked → every tile constructed with `supplyRung = null, proximityBand = null, distanceMetres = null` → `appendPermissiveTail(...)` adds same null-tile-shape POSTCODE_CENTROID tiles → return `{ branches, meta: { locality: null, scope: 'platform', scopeExpanded: false, rungCounts: <zeros> } }`.

- **`buildNearbyByCategoryRails(prisma, effLoc, ladderProfile, locationCtx)`** — runs the per-category loop; each category resolved independently via the strict scope filter. Tail per category uses `appendStrictLocalityTail(...)`. Empty categories produce no entry.

`getHomeFeed()` becomes an orchestrator:
1. Resolve `locationContext` (with §10.3 fix).
2. Resolve `effLoc` from locationContext.
3. If `effLoc === null`: featured / trending / nearbyByCategory all return `{ branches: [], meta: null }`. Only popular may render (via no-location branch).
4. Else: invoke each rail builder in parallel.
5. Wire Popular sibling logic: render when (`trending.meta === null` AND `source !== 'none'`) OR (`source === 'none'`). Server invariant: trending + popular are mutually exclusive when `source !== 'none'`.
6. Assemble + return `HomeFeedResponse`.

---

## 11. Customer-app implementation contract

### 11.1 `<RailHeader>` component

Single conditional-copy component for all rail headers.

```tsx
interface RailHeaderProps {
  fixedCopy?: string                    // e.g. 'Popular on Redeemo' — overrides meta
  meta:       HomeRailMeta | null
  fallbackCopy?: string                 // shown when meta is null (rare — rails normally hide)
  subtitle?:  string                    // optional subtitle line (used by Featured cascade)
}
```

Logic:
- If `fixedCopy` provided → render `fixedCopy` (used by Popular sibling).
- Else read `meta.locality.name` + `meta.scopeExpanded` per the §7 worksheet.
- Subtitle slot renders if non-empty; used for `Here are the closest matches we have` on Featured cascade.

### 11.2 Tile distance + proximity rendering (P3)

`<BranchTile>` already has the slots (per the branch-first rebaseline). Home consumers must:
- Pass `tile.distanceMetres` to the chip slot — chip auto-hides on null.
- Pass `tile.proximityBand` to the band slot — band auto-hides on null.
- Match the chip format used by Search/Category/Map by NOT customising the props. No new chip variants.
- Never render placeholder distance copy when null (P3 + §8.9).

### 11.3 `<HomeNoLocationBanner>` component

Spec at §8.6. Top-of-Home banner; renders only when `locationContext.source === 'none'`. Two CTAs (Allow location, Set my area). All copy from §8.2 phrase library. testID `home-no-location-banner`.

### 11.4 `<NearbySectionEmpty>` component

Spec at §8.4. Replaces the per-category rail strip when `nearbyByCategory.length === 0 && locationContext.source !== 'none'`. Two CTAs (Browse all categories, Open search). All copy from §8.2 phrase library. testID `home-nearby-section-empty`. **When rendering, `<HomeExploreMore>` MUST NOT also render (v1.2).**

### 11.5 `<HomeExploreMore>` component (v1.2 updated)

Spec at §8.5. Page-bottom soft CTA. Fires per the sparse-supply heuristic in §8.3 row #10 INCLUDING the v1.2 condition `<NearbySectionEmpty>` is NOT rendering. Single CTA (Explore more on Redeemo → Search tab). All copy from §8.2 phrase library. testID `home-explore-more`.

### 11.6 Sparse-supply handling (D6 + P6, v1.2 updated)

Per-rail render-when-non-empty rule (silent hide for individual rails):
- `featured.branches.length === 0 || featured.meta === null` → hide Featured rail silently.
- `trending.meta === null` → hide Trending rail; render Popular rail per §6.2 conditions.
- `popular.meta === null && trending.meta === null` → both rails hidden silently.
- `nearbyByCategory[i].meta === null` → hide that per-category rail silently.

Section-level + page-level fallbacks (friendly empty per P6) with v1.2 dedup:
- `nearbyByCategory.length === 0 && locationContext.source !== 'none'` → `<NearbySectionEmpty>` renders.
- Sparse-supply heuristic per §8.3 row #10 + §8.5 fires AND `<NearbySectionEmpty>` NOT rendering → `<HomeExploreMore>` renders at page bottom.
- `locationContext.source === 'none'` → `<HomeNoLocationBanner>` renders at top of Home; neither `<NearbySectionEmpty>` nor `<HomeExploreMore>` renders.

No 3-card minimum per D6. A rail with 1 card renders honestly.

### 11.7 Trending → Popular sibling swap (T-2)

`HomeScreen.tsx` renders:
```tsx
{feed.trending.meta !== null && <TrendingSection rail={feed.trending} />}
{feed.trending.meta === null && feed.popular.meta !== null && <PopularSection rail={feed.popular} />}
```

`<PopularSection>` is a sibling component to `<TrendingSection>` reusing the same horizontal-carousel chrome but a fixed `Popular on Redeemo` header. In no-location state, the carousel renders tiles with null distance/proximity chips (per §6.2 v1.2 tile contract); the carousel layout itself is unchanged.

### 11.8 Render order on Home (top to bottom)

Per §8.8:
1. `<HomeNoLocationBanner>` (conditional)
2. Campaign carousel (unchanged — out of scope)
3. Featured rail (conditional)
4. Trending OR Popular sibling (one of the two, or neither)
5. NearbyByCategory rails OR `<NearbySectionEmpty>` card (one of the two, or nothing if no effLoc)
6. `<HomeExploreMore>` (conditional, AND only when `<NearbySectionEmpty>` is NOT rendering)

Customer-app `<HomeScreen>` enforces this order + the §8.7 dedup rules.

---

## 12. Test strategy

### 12.1 Backend integration pins (v1.2 updated)

Per rail, integration tests covering each scope state via `app.inject` against real seed data:

- **Featured pins:**
  - In-locality featured supply → `featured.meta.scopeExpanded=false`, `featured.meta.scope='city'`.
  - No in-locality but UK-wide featured supply → `featured.meta.scopeExpanded=true`, `featured.meta.scope='platform'`.
  - No featured supply at all → `featured.meta=null`, branches empty.
  - **(v1.2)** Featured with ONLY POSTCODE_CENTROID branches (zero MANUALLY_CONFIRMED + ADDRESS_GEOCODED) → `featured.meta=null` (rail hidden; tail-only state does NOT keep rail alive).
- **Trending + Popular pins:**
  - Local trending supply → trending renders, popular has `meta=null`.
  - No local trending, UK-wide redemptions present → trending `meta=null`, popular renders.
  - No redemptions at all → both rails `meta=null`.
  - **(v1.2)** No-location state (`source='none'`) with UK-wide redemptions present → popular renders; every tile has `supplyRung=null`, `proximityBand=null`, `distanceMetres=null`.
- **NearbyByCategory pins:**
  - Local supply in 2 categories, no supply in 4 others → exactly 2 entries in `nearbyByCategory`.
  - All categories empty → `nearbyByCategory.length === 0`.
- **POSTCODE_CENTROID strict-locality gate pins (v1.2 — per §6.4):**
  - **Local rail, branch passes gate:** Featured local state with branch where `branch.localityId === effLoc.locality.id` → tail tile surfaces inside local rail with null rung/band/distance.
  - **Local rail, branch FAILS gate:** Featured local state with branch in unrelated locality (no id/name/postTown match) → tail tile EXCLUDED from local rail.
  - **Local rail, branch passes via postTown:** branch.postTown matches `effLoc.locality.name` (case-insensitive) → tail tile surfaces.
  - **Local rail, branch passes via localityName:** branch.localityName matches `effLoc.locality.name` (case-insensitive) → tail tile surfaces.
  - **Cascade rail, no gate:** Featured cascade (`scopeExpanded=true`) with POSTCODE_CENTROID branches in unrelated locality → tail tile surfaces (no locality claim under `Featured on Redeemo`).
  - **Popular rail, no gate:** Popular with POSTCODE_CENTROID branches in any locality → tail tile surfaces.
  - **Trending strict-locality gate:** same pattern as Featured local (passes localityId/name/postTown → tail surfaces; fails all three → excluded).
  - **NearbyByCategory strict-locality gate:** same pattern.

### 12.2 Backend fallback-state pins (per §8.3 matrix)

Each row of the §8.3 matrix gets an integration pin asserting the response shape (`meta` values, array lengths, `locationContext.source`):

- Row #1 — Featured local supply: `featured.meta !== null && featured.meta.scopeExpanded === false`.
- Row #2 — Featured platform cascade: `featured.meta !== null && featured.meta.scopeExpanded === true`.
- Row #3 — **Featured no supply (v1.2 includes tail-only state): `featured.meta === null`**.
- Row #4 — Trending local supply.
- Row #5 — Trending empty, Popular fills (with effLoc).
- Row #6 — Trending + Popular both empty.
- Row #8 — NearbyByCategory all empty AND effLoc resolved: `nearbyByCategory.length === 0 && locationContext.source !== 'none'`.
- Row #9 — No location: `locationContext.source === 'none'` (server omits local rails; popular present with null-tile contract).
- Row #11 — Total page-empty.

Mutual-exclusion invariant pin: when `source !== 'none'`, `trending.meta !== null XOR popular.meta !== null` (or both null).

### 12.3 Customer-app jest pins

- **`<RailHeader>` copy permutations:**
  - All entries in the §7 worksheet pinned via parametric `it.each` test (rail × state × expected header copy + subtitle).
- **Render-order pin:**
  - Mock the response per §8.3 rows; assert the component tree renders in §8.8 order.
- **Distance chip rendering parity with Search:**
  - Snapshot or assertion that Home tile renders the same chip component as Search tile for the same `distanceMetres` value.
  - **(v1.2)** Tile with `distanceMetres === null && proximityBand === null` → chip does NOT render (no placeholder copy).

### 12.4 Customer-app fallback-component pins (v1.2 updated)

- **`<HomeNoLocationBanner>` (§8.6):**
  - Renders when `locationContext.source === 'none'`.
  - Does NOT render when `source === 'coordinates' | 'profile'`.
  - Primary CTA invokes `useUserLocation().requestPermission()`.
  - Secondary CTA navigates to `/(auth)/profile-completion/address`.
  - Copy assertions for L4 / L8 / L9 / L10 phrases from §8.2.

- **`<NearbySectionEmpty>` (§8.4):**
  - Renders when `nearbyByCategory.length === 0 && locationContext.source !== 'none'`.
  - Does NOT render when any per-category rail has supply.
  - Does NOT render when `locationContext.source === 'none'` (banner takes over).
  - CTAs navigate to Categories tab + Search tab.
  - Copy assertions for L1 / L5 / L6 / L7 phrases from §8.2.

- **`<HomeExploreMore>` (§8.5) — v1.2 dedup:**
  - Renders when the §8.3 row #10 heuristic fires INCLUDING `<NearbySectionEmpty>` NOT rendering.
  - Does NOT render when `<HomeNoLocationBanner>` is showing.
  - **Does NOT render when `<NearbySectionEmpty>` is showing (v1.2 dedup)** — pin asserts mock state where `nearbyByCategory.length === 0` AND sparse-heuristic conditions match → `<NearbySectionEmpty>` mounts, `<HomeExploreMore>` does NOT.
  - CTA navigates to Search tab.
  - Copy assertions for L3 / L11 phrases from §8.2.

- **Dedup rule pins (§8.7) — v1.2:**
  - Banner + nearby-empty card never both render.
  - Banner + page-bottom soft CTA never both render.
  - **Nearby-empty card + page-bottom soft CTA never both render (v1.2 dedup).**
  - Banner can render alongside Popular rail.

- **Popular tile no-location contract (v1.2):**
  - Mock `locationContext.source === 'none'` + populated `popular.branches` with null rung/band/distance on each tile → assert PopularSection renders the rail; assert per-tile distance/proximity chip does NOT render.
  - Mock `source !== 'none'` + populated `popular.branches` with classifiable tiles → chip renders.

### 12.5 Cross-cutting §BB pin

- Backend integration test: GPS-only call to `getHomeFeed` returns `locationContext.locality !== null` AND `locationContext.city !== null`. Pre-fix behaviour was `city = null` for GPS callers; this pin guards the §BB fix.

### 12.6 Existing test gates

- Customer-app full jest run (~1300 tests post-§CD) must remain green.
- Backend vitest full run (~550 tests) must remain green.
- `tsc --noEmit` clean on customer-app; backend unchanged from current §BV baseline.

---

## 13. Convergence with Plan 4 M5

Plan 4 M5 (cleanup) is currently blocked on §CU.1 customer-web branch-first migration. M5.3 (remove V1 ranker) cannot ship until Home + customer-web stop reading V1-ranker outputs.

**This workstream removes Home's dependency on `rankMerchantsV2`** (currently called at [service.ts:1482](src/api/customer/discovery/service.ts#L1482) for metadata) by replacing the metadata path with `rankBranchesV3` outputs. After this workstream merges:
- Home no longer calls V1 ranker.
- Search / Category / Map already on V3 from earlier phases.
- Customer-web remains the only V1-ranker consumer (per §CU.1 state).

Therefore: **M5.3 unblocking remains gated only on §CU.1.** This workstream does NOT independently ship M5 cleanup; it removes one of two remaining V1-ranker consumers.

**This workstream and M5 ship independently.** M5 will sequence after §CU.1.

---

## 14. Deferred follow-ups

### 14.1 Closed by this spec

- **§BB Home `effectiveLocality` plumbing** — closed via §10.3 / D8. `locationContext.locality` now populated for GPS callers via `findNearestLocality`.
- **§CM rail cascade / supply-aware Home fallback** — superseded by this spec; remove from deferred index after this spec ships.

### 14.2 New deferred follow-up created

**§DA Home nearby sticky-controls + filter UI consolidation** (Tier 2/3 brainstorm-first, recorded 2026-05-22).

Captures the owner-proposed sticky/collapsible nearby section header concept (brainstorm §11). To be picked up by a separate Home UX/polish brainstorm after this relevance workstream ships.

Scope of the future brainstorm:
- SS-1 (defer further), SS-2 (lightweight: category chips + Open now toggle), SS-3 (full mini-discovery surface) trade-offs.
- Relationship between Search scope pills, Category `<FilterSheet>`, Map category pills, and a new Home sticky-controls surface — filter-surface consolidation question.
- Whether `<FilterSheet>` is the right component or needs a Home-specific variant.
- Whether sticky controls become a global pattern (also on Featured / Trending?) or genuinely nearby-only.
- Scroll-behaviour patterns (true sticky vs scrollable-collapse), Hermes / iOS / Android compatibility.
- Filter state persistence semantics.
- Tab-bar coexistence + sparse-supply implications.

Hooks left in place by this workstream:
- Per-rail `meta` blocks carry locality + scope state (filter UI can read them).
- `nearbyByCategory[i]` exposes `category.id` (chips can deep-link to Category screen).
- Per-rail rendering structure preserved (nearby section can be wrapped in scrollable container later).

### 14.3 Out of scope but partially revisited

- **§AV POSTCODE_CENTROID merchant visibility** — D9 mirrors Search's tail behaviour. v1.2 adds the strict-locality identity gate for Home local rails (Search unchanged). The underlying §AV lock (do not silently drop POSTCODE_CENTROID merchants under M3a hybrid) is honoured — they still surface, just gated under local-claim copy. §AV stays open for the eventual policy review post-Plan-4-M5.

### 14.4 Untouched deferred items adjacent to Home

- **§CZ.1 Map UK-wide category filter under-returns** — not addressed here; Map remains a separate workstream.
- **§CZ.2 Map merchant card distance recomputes on pan/zoom** — not addressed here.

### 14.5 Standing rules added to memory

A new memory file `project_locked_product_principles_home_relevance.md` is created (or P1–P6 are appended to the existing branch-first principles file — owner preference). Content:
- P1 Header copy honesty contract (v1.2 — encompasses both rank-classified and strict-locality-gated tail tiles)
- P2 Per-rail product purpose drives scope rule
- P3 Distance + proximity band as first-class trust signals (v1.2 — explicit null-tile contract documented)
- P4 Honest empty over dishonest fill
- P5 Reuse Search/Category infra; don't copy Search UI
- P6 Friendly empty over silent empty

Standing rules on canonical phrase usage:
- `near you` = NEARBY/CITY tier supply OR strict-locality-gated tail tiles, always.
- `in {City}` = same scope with locality name available.
- `on Redeemo` = the canonical "platform-wide" qualifier.
- The §8.2 phrase library is the source of truth for fallback copy. New fallback copy MUST be added to §8.2 before being used.

Standing rule on Home tail tiles (v1.2): non-rankable tail in local Home rails requires strict-locality identity gate (`branch.localityId === effLoc.locality.id` OR `branch.localityName === effLoc.locality.name` OR `branch.postTown === effLoc.locality.name`, all case-insensitive on text checks). Search's tail policy is unchanged.

---

## 15. Risks + open questions

### 15.1 Risks (v1.2 updated)

| Risk | Mitigation |
|---|---|
| **Sparse-supply rail collapse for non-major-city users.** A Huddersfield user may see Home with only Featured (cascaded) + Popular sibling, no NearbyByCategory rails. | Mitigated by P6 friendly-empty + `<NearbySectionEmpty>` + `<HomeExploreMore>` (v1.2 mutually exclusive). Search + Categories tab remain available. Acceptable per D6. |
| **Advertiser perception under Featured F-2 + tail-only hide (v1.2).** Paid Featured merchants with only POSTCODE_CENTROID branches will not surface to Home users at all under v1.2 — tail-only state hides the rail. | Acceptable per D2 + D9 (owner direction). Advertiser onboarding should ensure at least one MANUALLY_CONFIRMED or ADDRESS_GEOCODED branch exists before featured placement runs. Recorded as soft observation for advertiser ops process. |
| **Non-rankable tail surface area + strict-locality gate.** D9 with v1.2 gate adds locality-check logic to each local rail builder. Risk of gate bugs replicating across rails. | Shared `appendStrictLocalityTail(rankedTiles, candidates, effLoc)` helper used by all local rail builders. Single source of truth + shared tests. Permissive variant `appendPermissiveTail` for cascade / Popular rails. |
| **`resolveLocationContext` fix (§10.3) is a behaviour change.** Existing callers of `getHomeFeed` that depend on `locationCtx.city = null` for GPS callers will now see populated city. | Audit: the only consumers are the Trending + NearbyByCategory queries which are being rewritten anyway. No other callers. |
| **Popular sibling rail confusion.** Users seeing `Popular on Redeemo` may not immediately understand it's a substitute for `Trending near you`. | Locked copy is explicit ("on Redeemo" vs "near you"). No further mitigation v1. |
| **`<HomeNoLocationBanner>` fatigue.** Users repeatedly seeing the banner without acting on it may dismiss it as noise. | Banner dismissibility / sessionStorage persistence is a v2 polish concern (O7). v1 ships always-visible while `source='none'`. |
| **POSTCODE_CENTROID tail tile UX.** Tail tiles render with no distance chip + no proximity band. Visual asymmetry vs ranked tiles. | Acceptable per §AV. Customer-app component layouts already handle null-distance gracefully. P3 explicit: never render placeholder. |
| **Popular no-location tile UX (v1.2).** Every tile renders without distance/proximity chip in this state; visually flatter than effLoc-resolved Popular. | Acceptable — user hasn't given a location signal, so distance is genuinely unknown. The banner above the rail clarifies the location-missing state. |
| **Test coverage breadth.** Per-rail × per-scope-state × per-tail-state × per-fallback-component × strict-locality-gate matrix is large. | §12.1–§12.5 enumerate the load-bearing pin set. Self-review in §16 catches gaps before implementation. |
| **Banner pushes Featured / Trending below the fold on small viewports.** Banner is full-width + ~120pt tall; users on iPhone SE-class devices may not see Popular rail without scrolling. | v1 acceptable — first-open with no location is the explicit "establish a signal" surface, not a browse surface. After signal granted, banner unmounts. |

### 15.2 Open questions (non-blocking — resolve during implementation or v2)

| # | Question | Default approach |
|---|---|---|
| **O1** | Featured cascade tie-break — `startDate ASC` preserves admin curation; should it switch to distance-within-rung when cascade fires? | Keep `startDate ASC` for v1 (matches today's behaviour). Revisit if cascade output feels wrong. |
| **O2** | Banner / empty-state surface backgrounds — match `color.surface.tint` (FilterSheet pattern) or use a softer Home-specific variant? | Use `color.surface.tint` for v1 (existing token, consistency). Revisit if Home design polish takes a different direction. |
| **O3** | Popular on Redeemo rail position — sits where Trending sits (same vertical slot, swapped)? Or different position? | Same slot swap — minimises layout shift. |
| **O4** | "Top rated" filter (mentioned in §DA brainstorm option list) — does it belong in Popular's sort order, or stay reserved for §DA? | Stay reserved for §DA. Popular uses redemption-count-desc (same as Trending) for v1. |
| **O5** | Should `nearbyByCategory[].category.id` deep-link be enabled in v1 (tile tap on a category-rail card opens the Category screen) or remain `merchant tap → merchant page` only? | Keep `merchant tap → merchant page` for v1; category deep-link is §DA territory. |
| **O6** | Empty-state visual when ALL local rails hide but Popular shows — do we treat that as a "thin page" case for `<HomeExploreMore>`? | Per §8.3 row #10 heuristic, yes — Popular rail counts as supply but the heuristic still fires if NearbyByCategory < 2 + Featured hidden/cascaded + Trending hidden, AND `<NearbySectionEmpty>` is not rendering (v1.2). |
| **O7** | `<HomeNoLocationBanner>` dismissibility — sessionStorage persistence, "Maybe later" button, or always-visible while `source === 'none'`? | Always-visible v1. Dismissibility is v2 polish. (Re-numbered from O8 in v1.1; old O7 about `<NearbySectionEmpty>`+`<HomeExploreMore>` redundancy is RESOLVED by v1.2 dedup.) |
| **O8** | When user grants location via banner → banner unmounts → rails populate. Is there a graceful transition / loading state needed? | React Query refetch shows existing skeleton; banner unmounts on next render. v1 acceptable. Revisit if device QA flags jank. (Re-numbered from O9 in v1.1.) |

**Resolved in v1.2:**
- Old O7 (`<NearbySectionEmpty>` + `<HomeExploreMore>` redundancy) — resolved by mutual-exclusion dedup rule. Removed from open questions.

---

## 16. Spec self-review (v1.2 re-run)

After v1.2 update, re-reviewed against the brainstorming-skill checklist.

**1. Placeholder scan.** No "TBD" / "TODO" / "implement later" in the spec proper. Open questions (O1–O8) are explicit non-blockers, not placeholders. Banner / card surface tint colour deferred to a token (O2) — implementation pulls from existing design-system token, not a placeholder.

**2. Internal consistency.** Cross-checked v1.2:
- D-matrix (§2) ↔ rail rules (§6) ↔ fallback matrix (§8.3) ↔ copy worksheet (§7) ↔ phrase library (§8.2) — all consistent.
- D9 audit (§6.4) ↔ tile contract (§5) ↔ P1/P3 (§3) ↔ test strategy (§12.1) — strict-locality gate locked uniformly.
- **(v1.2)** Tail-only Featured hide rule consistent across §6.1 (rail rule), §6.4 decision matrix (Featured no-supply row), §8.3 row 3 (fallback matrix), §9.11 (edge case), §12.1 (test pin), §12.2 row 3 (fallback pin). All updated together.
- **(v1.2)** `<NearbySectionEmpty>` ↔ `<HomeExploreMore>` mutual exclusion consistent across §8.1 (principle), §8.3 row 10 (matrix condition), §8.5 (render conditions), §8.7 (dedup table), §8.8 (render order condition #6), §11.4/§11.5 (component specs), §12.4 (test pin).
- **(v1.2)** Popular no-location tile contract consistent across §5 (wire contract), §6.2 (per-rail rule), §10.4 (rail builder), §11.7 (customer-app sibling swap), §12.1 (backend pin), §12.4 (customer-app pin).
- §10 (backend) ↔ §11 (customer-app) — wire shape and consumption match including the 3 fallback components.
- §14.1 (§BB closes) ↔ §10.3 (the fix) ↔ §12.5 (pin) — fully traced.
- P1–P6 (§3) referenced consistently in §6 / §7 / §8 / §11.
- Render order §8.8 ↔ §11.8 — match including v1.2 #6 dedup condition.

**3. Scope check.** Single coherent workstream — backend `getHomeFeed` rebaseline + customer-app rail rendering + 3 fallback components + strict-locality gate helper + null-tile-contract Popular branch + `<RailHeader>` + §BB fix. No accidental sprawl into Map / Voucher / Customer-web / Search tail. Sticky controls (§6.5) explicitly carved out as §DA.

**4. Ambiguity check (v1.2 re-checked).** Potential ambiguities resolved:
- "Strict NEARBY+CITY" defined as `rungs ∈ {NEARBY, CATCHMENT, POST_TOWN}` per the `tiersToRungs` mapping in Search's existing helper.
- Popular sibling's trigger formalised as `(trending.meta === null && source !== 'none') OR (source === 'none')` (v1.2 — explicit no-location branch added).
- Non-rankable tail behaviour per rail differentiated in §6.4 (v1.2 strict-locality gate matrix is the definitive source).
- Tail-only state explicitly hides Featured (v1.2 §6.1 + §9.11).
- `<NearbySectionEmpty>` + `<HomeExploreMore>` mutual exclusion locked across all six dependent sections.
- `scopeExpanded` semantics across rails clarified in §9.8.
- Page-bottom soft CTA heuristic explicit in §8.3 row #10 + §8.5 INCLUDING v1.2 dedup condition.
- Strict-locality identity gate uses three-step ladder: localityId → localityName → postTown (all case-insensitive on text checks).
- No-location Popular tile contract explicit at §5 + §6.2 + §10.4: all three fields (`supplyRung`, `proximityBand`, `distanceMetres`) are null when `source === 'none'`.

No outstanding ambiguities flagged.

**5. Copy review (v1.1).** Cross-checked all owner-provided phrases:
- `We're still growing near you` → L1, used in §8.4 ✓
- `Here are the closest matches we have` → L2, used in §7 (Featured cascade subtitle) ✓
- `Explore more on Redeemo` → L3, used in §8.5 ✓
- `Set your area to see nearby offers` → L4, used in §8.6 ✓
- All other phrases (L5–L11) are operational support copy needed by the CTAs and have been added to the canonical library.
- No ad-hoc copy outside §8.2 anywhere in the spec.

**6. Contradiction check (v1.2 new).** All four owner-flagged contradictions verified resolved:
- ✅ Non-rankable tail conflict with P1 — resolved via §6.4 strict-locality identity gate; P1 wording updated to encompass both rank-classified AND gate-passing tail tiles.
- ✅ Featured tail-only contradicting itself — resolved via §6.1 explicit hide rule + §6.4 Featured-no-supply row + §12.1 pin updated from "tail surfaces" to "rail hides".
- ✅ `<NearbySectionEmpty>` vs `<HomeExploreMore>` dedup inconsistency — resolved via mutual exclusion across §8.1/§8.5/§8.7/§8.8/§11.5/§11.6/§12.4; O7 marked resolved.
- ✅ Popular no-location tile contract missing — resolved via explicit contract at §5 + §6.2 + §10.4 + §11.7 + §12.4 pinning all three fields as null.

---

## 17. Status

- Spec v1.2 ready for owner review (incorporates spec-review v1.1 fallback note + spec-review v1.2 contradiction-resolution note).
- After owner approval: `superpowers:writing-plans` skill produces `docs/superpowers/plans/2026-05-22-home-relevance.md`.
- No code touched until the plan is approved.

**Awaiting owner sign-off on this spec (v1.2) before writing the implementation plan.**
