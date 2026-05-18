# Discovery Rebaseline — Branch-First Cardinality

**Date:** 2026-05-18 (Revision 2.1 — Rev-2 self-review carry-over fixes)
**Tier:** 2 plan-first
**Status:** Spec phase — Revision 2.1 awaiting owner approval; plan + implementation downstream.
**Blocks:** Plan 4 M4 (Search + UX).
**Owner-approved brainstorm date:** 2026-05-18 (chat session).

## Revision history

- **Rev 1 (2026-05-18 earlier today):** initial spec from brainstorm output. Locked Path (a), §17 brainstorm decisions, 3-phase additive migration.
- **Rev 2 (2026-05-18 later):** audit-driven revision. Folded in:
  1. Older Home/Discovery card audit findings (single-component strategy is locked; carry-forward list explicit; per-surface card variants do NOT exist and are NOT introduced).
  2. Owner clarification: §15.2 renamed `Phase 2 technical migration order` so it is NOT confused with the bottom-tab navigation order (Home → Map → Savings → Favourites → Profile is locked product order; this rebaseline does NOT change it).
  3. Owner clarification: §15.6 reversed — `BranchTile` does NOT carry street address. Locality hierarchy only.
  4. Favourites assumption corrected — wire is merchant-keyed TODAY; locked branch-keyed rule sits behind the separate favourites rebaseline; this Discovery rebaseline does NOT migrate favourites contract.
  5. Home `getHomeFeed` response shape reconciled — preserves existing `campaigns` field; per-section additive `*Branches` fields specified.
  6. Search predicate worked examples reconciled — separated "today after rebaseline" (text predicate only) from "after Plan 4 M4.2 ships" (place-match priority).
  7. POSTCODE_CENTROID asymmetry made explicit — branches surface in list views; Map renders NO PIN (no exact coords).
  8. Campaigns endpoint pulled in — Phase 1 additive `getCampaignBranches` alongside `getCampaignMerchants`; banner-level `campaigns[]` on `getHomeFeed` unchanged for this rebaseline.
- **Rev 2.1 (2026-05-18 self-review patch):** small carry-over fix pass. No contract changes; only stale Rev-1 wording purged. Five corrections:
  1. §0.3 scope item: "Favourites alignment (branch-keyed model already locked)" reworded to reflect Rev-2 reality (merchant-keyed wire today; `BranchTile.isFavourited` derived from merchant favourite state; branch-level favourites is a separate workstream).
  2. §3.3 SearchResultItem render shape: "Branch-keyed favourite toggle" reworded to match the Rev-2 derivation.
  3. Locality fallback ordering: `branchLocalityName ?? branchCity ?? branchPostTown` in §3.3 secondary-line example + §11.2 Branch-name display test fixed to canonical Rev-2 order `branchLocalityName ?? branchPostTown ?? branchCity` (most specific → least specific).
  4. §11.1 backend test row for `q="Brightlingsea"` flipped from the M4.2-future place-match assertion to this-rebaseline-only text-predicate behaviour (EffectiveLocation does NOT flip; ranking stays anchored to the caller's current location context). The M4.2 place-match test belongs in M4.2's spec/plan when M4.2 ships.
  5. §10.2 header renamed to disambiguate technical migration order from bottom-tab navigation order.
  6. §15.1 (`unconditional additive vs ?cardinality=` flag) removed from open questions — already locked in §12 file map. Numbering of §15.2–§15.7 cascades up by one.

---

## §0. Spec preamble

### §0.1 Problem statement

Discovery, Search, Map, Home, and Category surfaces currently emit **one tile per merchant**. Each tile carries one "context" or "nearest" branch chosen by the backend (`enrichMerchantTile` line 529-613 in `src/api/customer/discovery/service.ts`; `rankMerchantsV2` line 507 in `src/api/lib/ranking.ts`). Multi-branch merchants like Covelum (Brightlingsea + Colchester) collapse to a single tile bearing one branch's identity — the second branch is structurally invisible regardless of viewport, query, or category.

This violates the locked branch-as-PRIMARY-unit product rule (`project_branch_first_class_platform_rules.md`, 2026-05-03): *"Branch is the primary unit of experience; merchant is a grouping layer above it."* Plus the §M `isMainBranch` surface checklist (deferred-followups index line 174-192): *"branches are product-equivalent in user/product-facing language."*

The shipped Discovery contract implements an implicit primary-branch hierarchy at the API layer, which every Discovery surface faithfully renders.

### §0.2 Why now

- §M (Branch-as-primary-unit, locked 2026-05-03) has been waiting for the discovery rebaseline brainstorm trigger.
- PR #105 device QA 2026-05-16 reconfirmed the Covelum / Brightlingsea / Colchester collapse on real-app search.
- Owner observation 2026-05-18: the same instance surfaced in fresh QA; investigation confirmed root cause is structural.
- Plan 4 M4 (Search + UX) is ready to dispatch but would inherit the bug class — every M4 surface adds more consumer surface area to the merchant-tile contract.

Inverse order — rebaseline first, then M4 against the new shape — is materially less work AND closes the locked product rule violation.

### §0.3 Scope

This spec covers:
1. Backend tile-shape contract (`BranchTile` replaces `MerchantTile` for Discovery list/grid/map endpoints).
2. Ranking + pagination semantics (`rankBranchesV3` replaces `rankMerchantsV2`).
3. Query-matching strategies for `searchMerchants` (predicate stays merchant-level, output flattens per-branch).
4. Map pin model (one pin per branch).
5. Home / Discovery / Category tile rendering shape (merchant identity primary, branch as locality-style secondary).
6. Navigation contract (every Discovery tap routes with `?branch=<branchId>`).
7. Favourites alignment for this rebaseline — `BranchTile.isFavourited` derived from merchant-favourite state (wire is merchant-keyed today). True branch-level favourites stays a separate workstream; see §7.
8. Badges / merchandising principle lock (branch-scoped from day one; implementation deferred).
9. Customer-web implications (zero for this rebaseline).
10. Migration strategy (3-phase additive).
11. Test strategy.

### §0.4 NOT in scope

This spec does NOT ship:
- The richer Filter button (§BS multi-axis filter — separate brainstorm-first workstream).
- POSTCODE_CENTROID hybrid-vs-exclude product decision (§AV remains a separate question).
- Featured / Trending / Badge layer implementation (§AW principle locked here; schema + UI deferred to Phase 4/5).
- Plan 4 M4 (Search + UX) tasks — those resume against this rebaseline's new contract.
- Plan 4 M5 (Cleanup) — converges with Phase 3 of this rebaseline.
- Customer-web Discovery surfaces (none shipped; future work consumes the new contract directly).
- Customer-web Favourites / Savings parity (separate workstreams).
- Cursor pagination (opportunistic future optimisation; this rebaseline preserves limit/offset).
- Marker clustering (deferred to §BA.1 Map polish).
- `Branch.shortName` / `Branch.county` schema migrations (§A schema gaps; server-side display helpers used for this rebaseline).

### §0.5 Locked product rules + constraints

| Constraint | Source | Applies how |
|---|---|---|
| Branches are product-equivalent. No "main branch" framing anywhere customer/merchant/admin/dev-facing. | `project_branch_first_class_platform_rules.md` 2026-05-03 | Tile headline cannot pick one branch as primary. |
| Vouchers are merchant-wide content. | Platform rule 3 (memory same file) | Voucher count + max savings stay at merchant grouping level, NOT on branch tile root. |
| Redemption is branch-attributed. | Phase 2D contract | Branch id is mandatory on the tile. |
| Favourites SHOULD be branch-scoped (product rule); WIRE is merchant-keyed today. | `project_favourites_scope_branch_level.md` + `apps/customer-app/src/hooks/useFavourite.ts` | Tile `isFavourited` is DERIVED from merchant favourite state under this rebaseline (every branch of the same merchant shares the value). Favourites rebaseline is a separate workstream. See §7 + Rev-2 decision #13. |
| `Review.branchId` is the unit. | Phase 3C.1d | Tile `avgRating` + `reviewCount` are branch-level. |
| PR #81 location-confidence redaction. | `project_location_confidence_redaction_contract.md` | Each branch tile gates `latitude`/`longitude` through `hasExactPosition()`. POSTCODE_CENTROID branches emit null coords. |
| `exposeBranchPosition()` helper is mandatory. | Same | Server-side spread on every customer-facing branch payload. |
| TIME_LIMITED + REUSABLE behave like other types for Discovery purposes. | §T + PR #72 | No type-specific tile logic. |
| §AE5 2h presentation window untouched. | M3 lock | Redemption-flow surfaces unaffected. |

### §0.6 Locked §17 product decisions (from brainstorm 2026-05-18, plus Rev-2 clarifications)

1. **Diversity ranking:** D1 pure rank for v1; no interleave. If dominance becomes a QA issue, track as a future product decision.
2. **`Branch.shortName`:** server-side display helper for this rebaseline; schema migration deferred under §A.
3. **Tile component naming:** Rename `MerchantTile` → `BranchTile` cleanly. Temporary compat wrappers (if any) marked for cleanup. **Rev-2:** the rename keeps the SINGLE-COMPONENT-PER-SURFACE strategy locked by the 2026-05-18 audit (see §0.7) — no per-surface card variants are introduced.
4. **`Branch.county`:** No schema migration; no fragile parsing. Use existing locality / postTown / city fields. **Rev-2 supersedes the Rev-1 "use address fields" wording — addresses are NOT on `BranchTile`. Locality hierarchy only (see §1.1 + §5.3).** Schema migration deferred under §A.
5. **Same-locality duplicate branches:** Show both as separate tiles. Branches are equal. Do NOT dedupe by locality.
6. **Search-by-locality (Rev-2 clarified):** Place-match-priority is the **target alignment with Plan 4 M4.2**. M4.2 is currently BLOCKED on this rebaseline (§10.4); place-detection itself ships in M4.2 AFTER this rebaseline lands. For THIS rebaseline alone, the search predicate falls back to text-match over `branch.localityName` / `branch.postTown` / `branch.name` (new branch-level predicate fields — see §3.1). When M4.2 ships against the branch-first contract, it adds `tryPlaceMatch` ahead of the text fallback.
7. **Featured pre-`FeaturedMerchant.branchId`:** Emit one tile per active branch as explicit interim behaviour, cross-referenced to §A / §AW.
8. **Map clustering:** Deferred. v1 renders one pin per branch. Same-coordinate overlap tracked under §BA.1.
9. **Spec location:** `docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md` (this document).
10. **Migration phasing:** 3-phase additive (Phase 1 backend additive; Phase 2 customer-app surfaces; Phase 3 cleanup).
11. **Phase 2 technical migration order (Rev-2 — owner clarification):** the Phase-2 PR sequence (Search → Map → Home → Category → tile-component-rename sweep) is the **technical migration order for implementing the new contract on each customer-app surface**. It is NOT the bottom-tab navigation order. **The bottom-tab nav order remains the locked product order: Home → Map → Savings → Favourites → Profile.** This rebaseline does NOT change bottom-tab order; nothing about the visible tab bar is affected. See §10.2 + §15.2.
12. **`BranchTile` address policy (Rev-2 — owner clarification):** the tile does NOT carry street address (`addressLine1` / `addressLine2`). It carries the locality hierarchy only: `branchLocalityName → branchPostTown → branchCity`. Street address remains on Merchant Profile, Receipt, and branch-detail surfaces — those are not Discovery cards. See §1.1 + §5.3.
13. **Favourites scope (Rev-2 — correction):** the favourites WIRE today is merchant-keyed (`POST /api/v1/customer/favourites/merchants/:id`, `useFavourite({ type: 'merchant', id })`). The locked product rule (`project_favourites_scope_branch_level.md`) says favourites SHOULD be branch-keyed. The wire-side migration to branch-keyed favourites is a SEPARATE workstream (favourites rebaseline). **This Discovery rebaseline does NOT migrate the favourites contract.** Under Path (a): `BranchTile.isFavourited` is **derived from the merchant-favourite state** (same value for every branch of the same merchant) until the favourites rebaseline ships. The field name + shape on `BranchTile` is forward-compatible with the eventual branch-keyed contract — no schema lock today. See §7.
14. **Campaigns endpoint policy (Rev-2 — added):** `getCampaignMerchants(campaignId)` exists on the current pipeline as merchant-tile-returning. Phase 1 adds `getCampaignBranches(campaignId)` returning `BranchTile[]` alongside it. The `Home Feed.campaigns: CampaignBannerTile[]` field (banner-level campaign envelope) is UNCHANGED — that's a banner, not a merchant tile. See §1.5 + §8.

### §0.7 Single-component carry-forward (2026-05-18 audit-locked)

The 2026-05-18 read-only audit of current customer-app on main + the older `feature/customer-app` reference branch + brainstorm mockups (Home-Discovery v1 + Discovery-Pages v2) + spec/plan history + `project_card_display_direction.md` (locked 2026-04-29) confirmed:

**No per-surface card structural variants exist today, none existed in the older reference branch, none were specced by any brainstorm.** All Discovery card surfaces share one component (`MerchantTile.tsx`) differentiated only by:
- Section header (icon + label + optional "See all").
- Section background (Trending uses a warm gradient section wrap; others do not).
- Optional **Featured badge** (rose→coral gradient, top-left, absolute-positioned on the banner — Featured carousel only).
- Optional **close button** (Map carousel tile only).
- Conditional **ProximityBandChip** (Plan 4 M3b — renders null for NEARBY/null; safe to mount unconditionally).

The only surface that visually diverges is **Search** — `SearchResultItem.tsx` is a row layout (horizontal logo + vertical text stack), NOT a card. This is intentional and locked.

**Carry-forward direction for `BranchTile` (renames from `MerchantTile`):**

| Older feature | Decision |
|---|---|
| Single shared component across Featured / Trending / Nearby / Category / Map carousel | ✅ CARRY FORWARD. `BranchTile.tsx` is the renamed canonical component. Per-surface differentiation stays prop-driven (`showFeaturedBadge`, `showClose`, section header / background owned by the parent screen). |
| Search row layout via separate component | ✅ CARRY FORWARD. `SearchResultItem.tsx` stays its own component (row format); reads the same `BranchTile` data shape. |
| Featured badge (rose→coral gradient, top-left) | ✅ CARRY FORWARD. Featured-only conditional render. |
| Banner image (80pt) + gradient fallback | ✅ CARRY FORWARD. Field source: `merchant.bannerUrl`. |
| Logo overlay (34×34pt bleed onto banner) | ✅ CARRY FORWARD. Field source: `merchant.logoUrl`. |
| Voucher count + max-savings pills | ✅ CARRY FORWARD. Field source: `merchant.voucherCount`, `merchant.maxEstimatedSaving`. Both merchant-wide. |
| Descriptor (Plan-1 refined category label) | ✅ CARRY FORWARD. Field source: `merchant.descriptor`. Per `project_card_display_direction.md` locked rule: name + descriptor + distance + offer + badges only. |
| ProximityBandChip (M3b) | ✅ CARRY FORWARD. Branch-keyed under Path (a) (was merchant-keyed under M3a hybrid). |
| Star rating | ✅ CARRY FORWARD. Branch-level under Path (a) (was merchant-rolled under M3a). Field source: `BranchTile.avgRating` + `reviewCount`. |
| Category + distance meta line | ✅ CARRY FORWARD. Distance is now per-branch under Path (a). |
| Map carousel close button + dot indicators | ✅ CARRY FORWARD. `MapBranchTile.tsx` (renamed from `MapMerchantTile.tsx`) stays a thin wrapper over `BranchTile`. |
| Hardcoded `OpenStatusBadge` (`isOpen={true}`) — REMOVED on main | ❌ DO NOT REVIVE as a hardcoded value. **Under Path (a), `isOpenNow` is a real per-branch field on the tile** (because the tile IS a branch), so the badge CAN come back wired to real data. The brainstorm carry-forward question is whether to render it on list-tile surfaces; recommended YES (see §1.1 `isOpenNow` field) since it's branch-truthful and useful. The original removal was driven by merchant-aggregate ambiguity which no longer applies. |
| Highlights (e.g. Halal, Vegan-friendly) on card | ❌ DO NOT CARRY FORWARD. Locked in `project_card_display_direction.md`: highlights are backend-only data for filtering/search; cards stay minimal. |

**No new card variants:** the per-surface differentiation strategy is preserved. Featured-only badge stays as the only structural per-surface differentiation; the rest is render-time props.

---

## §1. Backend contract shape — `BranchTile`

### §1.1 New tile shape

Replaces `MerchantTile` for Discovery / Search / Category / Map / Favourites list endpoints. Merchant Profile single-detail (`/api/v1/customer/merchants/:id`) keeps its current shape — it's a single-merchant page, not a Discovery list.

```ts
export interface BranchTile {
  // ── BRANCH IDENTITY (primary) ─────────────────────────────────
  id:                   string             // branch.id — load-bearing for tile key + navigation
  branchName:           string             // canonical display name (server-side helper; see §1.4)

  // Locality hierarchy (Rev-2 — Owner-locked decision #12; NO street address).
  // Renderer uses fallback order: localityName → postTown → city.  The tile
  // renderer is responsible for picking the most-specific non-null value;
  // server sends all three so the customer-app can shape display per
  // surface if needed.
  branchLocalityId:     string | null      // Plan 4 M1 — for locality chip / link if surface needs it
  branchLocalityName:   string | null      // preferred display value
  branchPostTown:       string | null      // fallback when localityName null
  branchCity:           string | null      // last-resort fallback when both null

  branchLatitude:       number | null      // gated by `hasExactPosition()`
  branchLongitude:      number | null      // ditto
  branchLocationConfidence: 'MANUALLY_CONFIRMED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW' | 'ADDRESS_GEOCODED'
  isOpenNow:            boolean            // branch-level — see §0.7 carry-forward note
  closesAtLocal:        string | null      // "22:30", server-computed Europe/London, branch-scoped
  distance:             number | null      // metres from caller's EffectiveLocation; null when no GPS OR non-exact branch

  // ── USER STATE (Rev-2 — favourites correction) ────────────────
  // Rev-2: under THIS rebaseline (Discovery cardinality only), favourites
  // wire is still merchant-keyed.  `isFavourited` here is DERIVED from
  // merchant favourite state — same value across every branch of the same
  // merchant.  The favourites rebaseline (separate workstream per
  // `project_favourites_scope_branch_level.md`) is what flips the wire to
  // branch-keyed.  Field name + shape on the tile is forward-compatible —
  // when the favourites rebaseline ships, server simply starts populating
  // it from the branch-keyed favourites record.  No tile-shape change
  // needed at that point.
  isFavourited:         boolean

  avgRating:            number | null      // BRANCH-level (Review.branchId aggregate)
  reviewCount:          number             // BRANCH-level

  // ── PLAN 4 M3 FIELDS (branch-keyed now) ───────────────────────
  supplyRung:           SupplyRung | null  // NEARBY / CATCHMENT / POST_TOWN / LAD / COUNTY / REGION / COUNTRY / NATIONAL
  proximityBand:        ProximityBand | null  // NEARBY / IN_YOUR_AREA / A_LITTLE_FURTHER / NEAREST_ON_REDEEMO
  distanceMetres:       number | null      // alias of `distance`; preserved for M3a wire-name back-compat in Phase 1

  // ── MERCHANT IDENTITY (grouping context, nested) ──────────────
  merchant: {
    id:                  string             // merchant.id — for navigation
    businessName:        string
    tradingName:         string | null
    logoUrl:             string | null
    bannerUrl:           string | null
    primaryCategory:     CategorySummary | null
    primaryDescriptorTag: DescriptorTagSummary | null
    subcategory:         CategorySummary | null
    descriptor:          string
    highlights:          TileHighlight[]   // backend-only data per `project_card_display_direction.md`;
                                           //   NOT rendered on cards by default.  Carried for future
                                           //   filter/search consumers.
    voucherCount:        number             // merchant-wide
    maxEstimatedSaving:  number | null      // merchant-wide max
  }
}
```

Fields explicitly REMOVED vs `MerchantTile`:
- `nearestBranchId` — the tile IS the branch.
- `contextBranchId` — the tile IS the context branch.
- Top-level `latitude` / `longitude` — replaced by `branchLatitude` / `branchLongitude` for explicit naming.

Fields explicitly NOT INCLUDED on `BranchTile` (per Rev-2 owner-locked decision #12):
- `branchAddressLine1` / `branchAddressLine2` — street address. NOT on Discovery cards. The locality hierarchy is what users need to recognise a branch on a card. Street address remains on Merchant Profile, Receipt, and branch-detail surfaces.
- `branchPostcode` — not needed for card display; the locality fallback covers the need.

### §1.2 Why merchant is nested

- Voucher count + max savings are merchant-wide (locked rule). Hoisting them to the branch root would imply branch-level vouchers, which is NOT v1 platform behaviour.
- Merchant highlights / descriptor / primary category are merchant-level metadata. Canonical source is merchant.
- Future schema growth: if per-branch voucher availability ever lands (§A schema gap, currently NOT v1), it flows naturally as `branchAvailableVouchers: number` at the branch root, alongside merchant grouping. Semantic separation preserved.

### §1.3 What stays merchant-keyed

- `GET /api/v1/customer/merchants/:id` (Merchant Profile detail) — already merchant-keyed.
- `GET /api/v1/customer/vouchers/:id` (Voucher Detail) — merchant-keyed with `?branch=` qualifier for redemption attribution.
- `GET /api/v1/customer/savings/*` — already correctly branch-attributed (Savings PR-A / PR-B baseline).
- Redemption flow endpoints.

### §1.4 `branchName` display helper

The wire field `BranchTile.branchName` is a clean display name — the merchant prefix stripped if `branch.name` was stored as "Covelum — Brightlingsea". Today the customer-app does this via `branchShortName(branch.name)` helper at `apps/customer-app/src/features/merchant/utils/branchShortName.ts`.

**Locked decision §17.2:** server-side display helper for this rebaseline. Server applies `branchShortName(rawBranch.name)` at the tile boundary; the wire field carries the clean name. The actual `Branch.shortName` schema migration is deferred under §A as a Tier 3 cleanup.

When the schema migration eventually lands:
- Admin / merchant-portal pin a real `shortName` on branch create.
- Server stops applying the helper; uses `branch.shortName ?? branchShortName(branch.name)` as a fallback.
- Eventually drop the helper entirely.

### §1.5 Endpoint contract surface — Phase 1 (additive)

**Five endpoints affected** (Rev-2 — campaigns added):

- `GET /api/v1/customer/discovery/home-feed` — current shape per `getHomeFeed` in service.ts:
  ```jsonc
  {
    "locationContext": { "city": ..., "source": ... },
    "featured":          [ MerchantTile, ... ],
    "trending":          [ MerchantTile, ... ],
    "campaigns":         [ CampaignBannerTile, ... ],         // banner-level, NOT merchant tiles
    "nearbyByCategory":  [ { "category": ..., "merchants": [ MerchantTile, ... ] }, ... ]
  }
  ```
  Phase 1 adds these branch-first fields ADDITIVELY (legacy fields untouched):
  ```jsonc
  {
    "featuredBranches":           [ BranchTile, ... ],
    "trendingBranches":           [ BranchTile, ... ],
    "nearbyByCategoryBranches":   [ { "category": ..., "branches": [ BranchTile, ... ] }, ... ]
  }
  ```
  **`campaigns: CampaignBannerTile[]` is UNCHANGED.** The Home Feed `campaigns` field is a campaign-banner envelope (admin-curated banner + headline + CTA), NOT a merchant-or-branch tile list. Campaign-banner content is unaffected by the branch-first cardinality change.

- `GET /api/v1/customer/search` → adds `branches: BranchTile[]` + `totalBranches: number`. Legacy `merchants: MerchantTile[]` + `total` preserved.

- `GET /api/v1/customer/discovery/in-area` → adds `branches: BranchTile[]`. Legacy `merchants: MerchantTile[]` preserved.

- `GET /api/v1/customer/merchants/:id/category/:categoryId` (category list) → adds `branches: BranchTile[]`. Legacy shape preserved.

- `GET /api/v1/customer/campaigns/:id/merchants` (Rev-2 — added) → adds `branches: BranchTile[]` alongside legacy `merchants: MerchantTile[]`. Campaign-detail screen consumes the new field surface-by-surface during Phase 2.

The `meta` block stays merchant/locality-keyed (effective locality, rung counts, search chip) — those are query-level summaries, not per-tile.

### §1.6 Endpoint contract surface — Phase 3 (cleanup)

After Phase 2 customer-app surface migrations complete:
- Remove `merchants` field from all four endpoints.
- Remove `total` (legacy merchant count) — `totalBranches` becomes `total` again.
- Plan 4 M5's "remove deprecated `rankMerchants` + `classifyTier`" task converges with this cleanup.

---

## §2. Ranking + pagination semantics

### §2.1 New `rankBranchesV3` shape

Replaces `rankMerchantsV2`. Pipeline:

```ts
export function rankBranchesV3<B extends RankableBranch>(
  branches: B[],            // flat list, NOT nested under merchants
  input: RankInputV3,
): {
  tiles: RankedBranchTile[]
  rungCounts: Record<SupplyRung, number>
}
```

- **Step 1 (collect):** flat list of `RankableBranch` arrives pre-joined with merchant grouping fields. For each branch independently, call `classifyRung(branch, effLoc, ...)`. Discard branches that fail the rung gate (null) or exceed `maxRungOrdinal`.
- **Step 2 (no context-branch selection):** the `selectContextBranch` step is GONE. Each branch is its own entry. Multi-branch merchants emit multiple `RankedBranchTile` entries.
- **Step 3 (group by rung):** same as today's `rankMerchantsV2`.
- **Step 4 (sort within rung):** per `categoryIntent` (LOCAL / MIXED / DESTINATION). Distance / quality sort operates on branch-level coords + branch-level rating. Multi-branch merchants compete with themselves like any other branches; pure-rank D1 means same-merchant branches can cluster naturally when their rungs and distances co-locate.
- **Step 5 (stitch):** walk rungs in order, apply `targetCount` + `hardCap`. Output is a flat `tiles` array of `RankedBranchTile`.

### §2.2 `RankableBranch` shape

```ts
type RankableBranch = {
  id: string
  merchantId: string         // for grouping field on the tile
  // Merchant-grouped fields (pre-joined for ranker convenience):
  merchant: {
    id: string
    businessName: string
    avgRating: number | null
    reviewCount: number
    primaryCategory: { intentType: 'LOCAL' | 'DESTINATION' | 'MIXED' | null } | null
  }
  // Branch-scoped fields (the load-bearing classification inputs):
  latitude: number | null
  longitude: number | null
  locationConfidence: ...
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  country: string | null
  isActive: boolean
}
```

### §2.3 Pagination

- Pagination unit: **branch tile**.
- `limit=20, offset=0` returns up to 20 branch tiles.
- `total` (Phase 1: `totalBranches`) = total count of branches matching the query + rung filter (NOT merchants).
- Customer-app `useInfiniteQuery` semantics carry through unchanged — the page count → total → "Load more" pill all key on branch count.

### §2.4 Diversity (D1 default, locked)

**D1 — Pure rank.** Sort by rung > distance/quality > id-tiebreaker. Multi-branch merchants cluster when their branches' rungs + distances co-locate. Pros: simplest; queries like `q="Covelum"` naturally show all branches contiguously. Cons: generic queries with one dominant chain can look samey on the first page.

Real-world UK chain geography typically separates branches by miles, so dominance is rarely an issue at v1 data volumes. If QA surfaces dominance as a real problem, an opt-in `?interleave=1` query param becomes the future polish vector. NOT in scope for v1.

### §2.5 `classifyRung` per branch — unchanged

The existing `classifyRung(branch, effLoc, nearbyRadius, outgoingCatchmentTargetIds)` function operates on a single branch. Under branch-first, it's called per branch in the collect step exactly as today — no signature change.

PR #81 discoverability gate (rejects POSTCODE_CENTROID / NEEDS_REVIEW for ranking purposes) carries through. Per-branch tiles with redacted coords still surface but without distance / nearest semantics — same as today's "POSTCODE_CENTROID merchant emits a tile with null coords" pattern.

---

## §3. Search behaviour

### §3.1 Query-matching predicate

The `q` SQL predicate stays merchant-level for most fields BUT extends to branch-level for branch-identity fields:

```
WHERE merchant.status = 'ACTIVE' AND
  (
    merchant.businessName       ILIKE '%q%'
    OR merchant.tradingName     ILIKE '%q%'
    OR merchant.description     ILIKE '%q%'
    OR merchant.primaryCategory.name ILIKE '%q%'
    OR merchant.categories.some(category.name ILIKE '%q%')
    OR merchant.tags.some(tag ILIKE '%q%')  -- via MerchantSuggestedTag
    OR branch.name              ILIKE '%q%'         -- NEW (branch-level)
    OR branch.localityName      ILIKE '%q%'         -- NEW
    OR branch.postTown          ILIKE '%q%'         -- NEW
  )
```

**Output strategy:**
- If ANY merchant-level field matched → collect ALL active branches of matched merchants (emit one tile per branch).
- If ONLY branch-level fields matched (no merchant-level match) → scope to the specific matched branches only.
- If `tryPlaceMatch` resolves (M4.2 — currently deferred but the shape is locked here) → place becomes EffectiveLocation; branch predicate filters by locality membership.

### §3.2 Worked examples — Rev-2 reconciled

**Important Rev-2 clarification:** the rebaseline alone does NOT ship place-detection. `tryPlaceMatch` lives in Plan 4 M4.2 (currently BLOCKED on this rebaseline). Worked examples are split into two columns: **today after THIS rebaseline lands** (text predicate only, including new branch-level predicate fields per §3.1) and **after Plan 4 M4.2 ships** against the new branch-first contract (place-match priority added).

| Query | Today (after rebaseline only — text predicate) | After M4.2 (place-match priority) |
|---|---|---|
| `q="Covelum"` | Merchant `businessName` match → all Covelum branches (Brightlingsea + Colchester) → 2 tiles, each independently ranked by user's EffectiveLocation. **Closes the load-bearing Covelum bug.** | Unchanged. |
| `q="Pizza"` | Merchant tag/description match → all branches of every pizza merchant → potentially many tiles, paginated. | Unchanged. |
| `q="Brightlingsea"` | **Text predicate only.** Matches `branch.localityName='Brightlingsea'` / `branch.postTown='Brightlingsea'` (new branch-level predicate fields per §3.1) → branches in Brightlingsea AND any merchant whose `businessName` happens to contain "Brightlingsea". EffectiveLocation is **NOT** flipped — user's GPS / saved location still drives ranking. Result: the user gets Brightlingsea-related branches but the ranking still respects their current GPS-anchored area. | `tryPlaceMatch` resolves "Brightlingsea" → Locality → EffectiveLocation flips → all branches near Brightlingsea ranked from Brightlingsea's centroid. Replaces the text fallback for true place names. |
| `q="Costa Brightlingsea"` | Text predicate matches BOTH merchant.businessName AND branch.localityName → branches that satisfy both clauses (Costa AND in Brightlingsea) via the SQL `OR` widening but ranked by relevance — likely surfaces Costa Brightlingsea branches first. | Place-match resolves "Brightlingsea" (token-level) → EffectiveLocation flips to Brightlingsea + text predicate on remaining "Costa" token → all Costa branches near Brightlingsea ranked from Brightlingsea's centroid. |
| `q="Half-price pizza"` | Merchant description / voucher tag match → every branch of every matched merchant. | Unchanged. |

**Rev-2 takeaway:** This rebaseline closes the Covelum cardinality bug (the load-bearing case the owner observed) WITHOUT depending on M4.2. M4.2 work then refines the `q="Brightlingsea"` UX with proper place-detection on top of the branch-first contract.

### §3.3 `SearchResultItem` render shape

```
┌──────────────────────────────────────────────────┐
│ [Logo]  Covelum                          ★ 4.6   │
│         Brightlingsea, Essex             £15+    │
│         Indian restaurant · BOGO · Open    [♥]   │
└──────────────────────────────────────────────────┘
```

- **Primary headline:** Merchant `businessName` ("Covelum") — recognised brand identity.
- **Secondary line:** Branch identity with locality context ("Brightlingsea, Essex" — concatenation of `branchName + branchLocalityName` or `branchName + branchPostTown`, with fallback hierarchy `branchLocalityName ?? branchPostTown ?? branchCity` — most specific → least specific).
- **Tertiary line:** Descriptor + voucher signal + branch-level open status.
- **Right column:** Branch-level rating + merchant-wide max savings.
- **Heart:** Tap fires the existing merchant-favourite toggle (`useFavourite({ type: 'merchant', id: tile.merchant.id })`); `isFavourited` is derived from merchant-favourite state for this rebaseline. See §7.

This preserves the §AS audit's confirmed-correct merchant-primary visual hierarchy on EACH tile. The tile COUNT changes (one per branch); the per-tile identity hierarchy stays merchant-primary with branch as secondary locality-style context. §AS NOT regressed.

### §3.4 `searchMerchants` rename → `searchBranches`

The function name `searchMerchants` is misleading once it returns branches. Rename to `searchBranches` at `src/api/customer/discovery/service.ts`. Phase 1 keeps both: legacy `searchMerchants` returns merchant tiles unchanged; new `searchBranches` returns branch tiles. Phase 3 deletes `searchMerchants`.

---

## §4. Map pins

### §4.1 One pin per branch

`MapPins.tsx` renders one `<Marker>` per branch tile **that has exact coords**. `tile.id === branch.id` becomes the marker key; coordinates from `branchLatitude` / `branchLongitude` (gated by `hasExactPosition()` server-side per PR #81).

Multi-branch merchants in the same viewport: multiple pins.

### §4.1.1 POSTCODE_CENTROID asymmetry (Rev-2 — explicit)

**The contract:**
- **List views** (Search results, Home Featured / Trending / Nearby carousels, Category list, in-area list mode, Map carousel bottom-sheet when scrolling the merchant strip) → POSTCODE_CENTROID / NEEDS_REVIEW branches **DO** appear as tiles. `branchLatitude` / `branchLongitude` are `null`; the tile renders without a distance value and without coordinate-dependent UI. Merchant identity, voucher count, max savings, descriptor — all present.
- **Map pin layer** (`<Marker>` rendering) → POSTCODE_CENTROID / NEEDS_REVIEW branches render **NO PIN**. There's nothing to render at — no exact coord. `MapPins.tsx` filters where `branchLatitude === null || branchLongitude === null` and skips.

**Why the asymmetry:** users browsing a list of merchants don't need exact coords to understand the merchant exists in their area. Users browsing a Map specifically EXPECT exact coords; pinning a POSTCODE_CENTROID branch at the postcode centroid implies precision that doesn't exist, which the PR #81 redaction contract specifically forbids.

**Ranking gate (also Rev-2 — explicit):** `rankBranchesV3`'s `classifyRung` discoverability gate mirrors the legacy contract — **MANUALLY_CONFIRMED + ADDRESS_GEOCODED** branches are admitted to the ranking pipeline; **POSTCODE_CENTROID + NEEDS_REVIEW** branches are admitted to the **list-tile output** but `classifyRung` returns `null` so they're not assigned a `supplyRung` or `proximityBand`. They surface in lists carrying null V2 fields, exactly as today's merchants do under the M3a hybrid pipeline.

**Cross-ref:** `project_location_confidence_redaction_contract.md`; PR #81; §AV (POSTCODE_CENTROID discoverability product decision — preserved separately as a product question, NOT collapsed by this rebaseline).

### §4.2 Same-coordinate overlap (§17.5, §17.8)

Two branches at near-identical coords (same shopping centre, two units): both render as pins. They will visually overlap.

- **v1 acceptance:** acceptable. Real-world UK chains rarely have two branches at literally identical coords; tens-of-metres separation reads as distinct pins at typical zoom.
- **v1.1 (deferred):** small overlap-offset (e.g. 5px horizontal jitter on the second pin when distance < 10m). NOT in scope.
- **v2 (deferred under §BA.1):** proper marker clustering at low zoom levels — entirely separate workstream.

### §4.3 `MapMerchantTile` carousel — rename to `MapBranchTile`

The bottom carousel surfaces one tile per pin. Today keys on `merchant.id`; under branch-first keys on `branch.id`. Component rename to match. Inside the carousel the rendered tile follows the same merchant-primary visual hierarchy from §3.3.

### §4.4 `getInAreaMerchants` rename → `getInAreaBranches`

Same pattern as §3.4 — function name follows the new unit.

---

## §5. Home / Discovery / Category tiles

### §5.1 Tile rendering

The shared `MerchantTile` component renames to `BranchTile`. Consumes the new `BranchTile` shape. Renders merchant identity primary + branch identity as locality-style secondary (same shape as §3.3).

The same component serves Home Featured, Home Trending, Home Nearby, Category list, and the Map carousel inside the Map screen.

### §5.2 Section behaviour

#### Home Featured carousel
- Today: 1-N featured merchants.
- Under branch-first (interim, pre-`FeaturedMerchant.branchId?` schema): emit one tile per active branch of each featured merchant. Explicit interim behaviour per §17.7.
- Cross-reference §A schema gap + §AW badge layer.

#### Home Trending carousel
- Today: merchant-level trending (redemption count aggregated by merchantId).
- Under branch-first (interim, pre-branch-level-trending compute): emit one tile per active branch of each trending merchant.
- Future (§B / §AW): trending compute moves to branch-level redemption aggregation. NOT in scope.

#### Home Nearby (by category)
- Branch-first by default; each category section shows up to N branch tiles ranked by rung > distance.

#### Category list
- Branch-first list under the category. Pagination on branches.

### §5.3 Branch identity display fallback (Rev-2 — locality-only, no street address)

Locality copy on each tile uses this fallback order (preferring most specific useful area):
1. `branchLocalityName` (Plan 4 M1 enriched) — preferred. Most-specific user-recognisable area.
2. `branchPostTown` — fallback when locality not resolved.
3. `branchCity` — last-resort fallback.
4. Empty — never; if all three are null the tile shows `branchName` alone.

Worked example for Covelum branches:
- Brightlingsea branch → display "Brightlingsea" (localityName resolved).
- Colchester branch → display "Colchester" (localityName resolved).
- A hypothetical small Costa in a non-mapped hamlet → falls back to postTown (e.g. "Colchester") or city (e.g. "Essex" — only as last resort).

**Rev-2 corrections vs Rev-1:**
- ❌ **NO street address on tiles.** `branchAddressLine1` / `branchAddressLine2` are NOT on `BranchTile`. Street address remains on Merchant Profile / Receipt / branch-detail surfaces (which are NOT Discovery cards).
- ❌ **NO `Branch.county` schema migration.** Locked decision #4 — county can stay deferred under §A.

**Why locality > street address on cards:** users scanning Discovery want to recognise the AREA (Brightlingsea, Colchester, Brixton) — not the specific street. Street address is recognition-context for someone already viewing the merchant detail.

---

## §6. Navigation

### §6.1 Discovery tap routes

Every Discovery / Search / Map / Home / Category tile tap routes to:

```
/(app)/merchant/[id]?branch=<branchId>
```

The customer-app already supports this URL fully:
- `useBranchSelection(branchIdParam)` reads branch from URL synchronously.
- `MerchantProfileScreen` cold-opens to the URL-supplied branch.
- `useMerchantProfile(merchantId, { branchId })` keys the cache by branch.
- Voucher Detail propagates `?branch=` from the merchant context.

No customer-app navigation refactor needed.

### §6.2 Cold-open / deep link without `?branch=`

`/merchant/<id>` (no branch param) keeps the existing fallback: backend resolves nearest-by-GPS or first-active-branch, returns as `selectedBranch` with `selectedBranchFallbackReason`. This path stays for share URLs / push notifications / direct entry.

The §M `isMainBranch` checklist (line 174-192) explicitly allows this fallback: cold-open determinism is the one place where internal fallback logic is permitted, because the alternative is asking the user to pick a branch without context.

### §6.3 Map pin → carousel → tap

Tap pin → `MapBranchTile` carousel slides up to that branch → tap carousel → `/merchant/<id>?branch=<branchId>`. Same URL contract.

---

## §7. Favourites — Rev-2 correction: wire is merchant-keyed TODAY

**Rev-1 mistake (corrected in Rev-2):** the Rev-1 spec asserted "`useFavourite(branchId)` is already branch-keyed". That is **wrong** for the wire today. Confirmed by reading [apps/customer-app/src/hooks/useFavourite.ts](apps/customer-app/src/hooks/useFavourite.ts):

```ts
type Params = {
  type: 'voucher' | 'merchant'   // <— merchant, NOT branch
  id: string
  isFavourited: boolean
}
// mutationFn: api.post(`/api/v1/customer/favourites/${type}s/${id}`)
//   → /api/v1/customer/favourites/merchants/:merchantId
```

The favourites WIRE is merchant-keyed end-to-end (storage, hook contract, API endpoint name, customer-app heart toggles on Merchant Profile / Voucher Detail / Favourites tab).

**Locked product rule** (`project_favourites_scope_branch_level.md`, 2026-05-03): favourites SHOULD be branch-keyed — a heart tap on a merchant profile favourites the selected branch, not the merchant.

**The gap is a known deferred workstream.** Flipping the wire to branch-keyed requires:
- Schema: new `BranchFavourite` table (or `Favourite.branchId` field) + migration of existing rows (mapping each merchant favourite to its representative branch, owner-decision required).
- API: new `/api/v1/customer/favourites/branches/:branchId` endpoints; deprecation path for the merchant ones.
- Customer-app: `useFavourite` signature flip; Favourites tab rework (it's currently merchant-keyed too).
- Customer-web: `FavouritesList` rebaseline.

**This Discovery rebaseline does NOT touch any of that.** The favourites rebaseline is its own separate workstream, sequenced after the Favourites tab rebaseline (Phase 3C.1g, deferred) lands.

**Rev-2 locked behaviour under THIS rebaseline:**

- `BranchTile.isFavourited` is **derived from the merchant favourite state** server-side. Server reads the merchant favourites table; every branch tile of the same merchant gets the same `isFavourited` value. This is the temporary mapping.
- Heart tap on a `BranchTile` calls the existing merchant-keyed mutation `api.post('/api/v1/customer/favourites/merchants/:merchantId')` via the existing `useFavourite({ type: 'merchant', id: tile.merchant.id })` shape. Toggling a heart on one branch flips ALL branch tiles of the same merchant — visible and intentional under this rebaseline.
- The `BranchTile.isFavourited` field name + shape are **forward-compatible**. When the favourites rebaseline ships and the wire flips to branch-keyed, server simply starts populating `isFavourited` from the branch-keyed table instead of deriving from merchant. **No `BranchTile` shape change at that point.**
- Optimistic update on heart tap: same merchant-fan-out semantics. The optimistic update mutates `merchant.id` → all branch tiles in the cache for that merchant get the new value.

**Customer-web Favourites tab.** Already flagged as blocked by the favourites branch-level rebaseline (separate workstream). This Discovery rebaseline does NOT fix customer-web Favourites either.

**Cross-ref:** `project_favourites_scope_branch_level.md`; §M deferred-followups index (favourites scope is one of the §M sub-items). When the favourites rebaseline writeup begins, this Rev-2 spec section will be the starting reference point for what `BranchTile.isFavourited` derivation looked like during the interim.

---

## §8. Badges / merchandising / campaigns (§AW) — principle locked

The locked rule (per §M line 167 + §AW): all future badges (NEW / FEATURED / TRENDING / EXCLUSIVE / POPULAR / NEW_NEAR_YOU) MUST be branch-scoped from day one. This Discovery rebaseline LOCKS the principle by making each `BranchTile` the natural carrier for badge fields when they ship.

Schema gaps (deferred under §A):
- `FeaturedMerchant.branchId?` — needs nullable branch field.
- `CampaignMerchant.branchId?` — needs nullable branch field. Same pattern as `FeaturedMerchant`.
- Branch-level trending compute — currently merchant-rolled.
- NEW freshness window — branch-level (`Branch.createdAt` exists; client can compute).

Implementation deferred to Phase 4/5. This rebaseline does NOT ship badges. It only locks the cardinality so badges, when they ship, can't accidentally bolt onto merchant-level.

### §8.1 Campaigns — branch-scoped same principle (Rev-2)

Campaigns (location-targeted banner promotions; `Campaign → CampaignMerchant → Merchant` per CLAUDE.md data model) follow the same branch-scoped principle as badges:

- **Banner-level campaign envelope** (`Home Feed.campaigns: CampaignBannerTile[]`): UNCHANGED by this rebaseline. The banner is admin-curated content (image + headline + CTA) keyed by `Campaign.id`. It is NOT a merchant tile and has no branch cardinality dimension.
- **Campaign merchant list** (`GET /api/v1/customer/campaigns/:id/merchants`): TODAY returns one entry per `CampaignMerchant` row. Phase 1 adds `getCampaignBranches(campaignId)` returning `BranchTile[]` — one tile per active branch of each campaign merchant. **Interim behaviour pre-`CampaignMerchant.branchId?` schema migration**: every campaign merchant fans out to all its active branches. Identical to Featured pre-`FeaturedMerchant.branchId?` (§5.2 Featured carousel).
- **Future** (post-`CampaignMerchant.branchId?` migration, deferred to §A): admin can target specific branches for a campaign. Server respects `CampaignMerchant.branchId` when present (filter to just that branch) and falls back to "all active branches" when null. Tile contract on the wire stays `BranchTile[]` — only the server-side join logic changes.

**Cross-ref:** §1.5 endpoint surface (campaigns endpoint Phase 1 scope); §A schema gaps (`CampaignMerchant.branchId?`); §AW.

---

## §9. Customer-web implications

- `app/merchants/[id]/page.tsx` — single merchant detail; unaffected.
- `app/account/favourites/page.tsx` — already deferred per favourites rebaseline.
- `app/account/savings/page.tsx` — already deferred per plan §12.1.
- No customer-web Search / Map / Discovery list surfaces shipped yet.

**Net customer-web impact: zero for this rebaseline.** When customer-web Discovery surfaces ship in a future workstream, they consume the new branch-first contract directly.

---

## §10. Migration strategy — 3-phase additive

### §10.1 Phase 1 — Backend additive

**Scope:**
- New `BranchTile` shape implemented (§1.1).
- New `rankBranchesV3` shipped alongside existing `rankMerchantsV2`.
- New `enrichBranchTiles` shipped alongside existing `enrichMerchantTiles`.
- New `searchBranches`, `getInAreaBranches`, `getHomeFeedBranches`, `listCategoryBranches`, and `getCampaignBranches` shipped alongside existing merchant-themed counterparts (Rev-2: campaigns endpoint added).
- All FIVE affected endpoints (search, in-area, home-feed, category list, campaign merchants) return BOTH the legacy `merchants` field AND the new `branches` field on the same response envelope (campaigns banner-level `campaigns: CampaignBannerTile[]` field unchanged).
- Backend tests pin the new shape.

**Customer-app changes:** NONE. Continues reading the legacy `merchants` field. No customer-visible change.

**Acceptance:**
- Customer-app full jest passes unchanged.
- Backend full vitest passes with new contract pins.
- `tsc --noEmit` clean on both sides.

### §10.2 Phase 2 — Customer-app surface migrations (technical migration order, NOT bottom-tab order)

**Reminder (per §0.6 decision #11 and §15.2):** the PR sequence below is the **technical migration order for shipping each customer-app surface against the new branch-first backend contract**. It is NOT the bottom-tab navigation order. The bottom-tab nav order remains the locked product order **Home → Map → Savings → Favourites → Profile** and is unaffected by this rebaseline.

Migrate each Discovery surface in its own focused PR:

| PR | Surface | Notes |
|---|---|---|
| Phase 2.1 | Search (`SearchScreen.tsx` + `SearchResultItem.tsx`) | Highest visibility; closes the Covelum bug on the most-affected surface. |
| Phase 2.2 | Map (`MapScreen.tsx`, `MapPins.tsx`, `MapMerchantTile` → `MapBranchTile`) | One pin per branch; carousel keyed on branch. |
| Phase 2.3 | Home (`HomeScreen.tsx` + Featured / Trending / Nearby sections) | Each section consumes `branches: BranchTile[]`. |
| Phase 2.4 | Category (`CategoryResultsScreen.tsx`) | Branch-first list. |
| Phase 2.5 | in-area + tile component rename (`MerchantTile` → `BranchTile`) | Final tile-component rename; sweep any remaining references. Should be small if 2.1-2.4 already aligned. |

Each Phase 2.x PR:
- Migrates one screen's data hook to read `branches` instead of `merchants`.
- Flips that screen's tests to assert the new shape.
- Per-surface visual verification — owner device-QA per the standing rebaseline workflow.

Phase 2 PRs ship serially with owner review between each. Estimated 4-5 small-to-medium PRs.

### §10.3 Phase 3 — Cleanup

After all Phase 2 surfaces migrated:
- Backend: remove `merchants` field from all four endpoints. `branches` becomes the only response shape.
- Backend: delete `rankMerchantsV2`, `classifyTier`, `selectContextBranch`, `enrichMerchantTile`, `enrichMerchantTiles`, `searchMerchants`, `getInAreaMerchants` (the merchant-themed helpers).
- Backend: tests deleted/converged. The §AT1 / §AT2 type-unification + miles-to-metres alignment items converge cleanly.

**This converges with Plan 4 M5's existing "remove deprecated `rankMerchants` + `classifyTier`" task.** Phase 3 + Plan 4 M5 ship as a single PR. M5's other tasks (clear customer-app Plan 4 code hooks, `merchantCountByCity` decision) ride along.

### §10.4 Plan 4 M4 sequencing

- Today: M4 is BLOCKED.
- Phase 1 ships → M4 still blocked (customer-app surfaces not migrated).
- Phase 2.1 (Search) ships → M4 partially unblocked (M4.2 + M4.3 can resume against `branches` contract; M4.5 SearchChip can render against `branches`).
- Phase 2.2 (Map) ships → M4.7 unblocked.
- Phase 2.5 ships → M4 fully unblocked. M4.4 + M4.6 + M4.8 wrap.

M4 effectively resumes mid-Phase-2 once Search migration lands. M4.4 / M4.5 / M4.6 / M4.8 are render/copy-only or fixture work; they fall in naturally.

### §10.5 Rollback / risk strategy

- Phase 1 is purely additive — rollback is `git revert` with no customer-visible impact (clients still read legacy field).
- Each Phase 2.x PR is single-surface — rollback per-surface possible.
- Phase 3 cleanup is the irreversible step. Only ship after all Phase 2 PRs are owner-accepted in production.

---

## §11. Test strategy

### §11.1 Backend tests

| Test | Coverage |
|---|---|
| **Contract pin** | Every endpoint returns `branches: BranchTile[]` with the exact shape spec'd in §1.1. Snapshot test on a fixed fixture. |
| **Multi-branch test** (load-bearing) | Covelum with 2 active branches (Brightlingsea + Colchester) → 2 entries in `branches[]`, distinct branch ids, both carrying `merchant.id === covelum.id` + same merchant identity fields. |
| **Single-branch test** | Karaara (1 branch) → 1 entry. |
| **Inactive-branch test** | Merchant with all branches inactive → 0 entries (NOT 1 with `isActive=false` leaking). |
| **Per-branch rung classification** | Each branch independently classified; multi-branch merchant can have branches in DIFFERENT rungs. |
| **Distance per branch** | Each tile carries its own distance from caller's EffectiveLocation. |
| **POSTCODE_CENTROID redaction** | Branches without exact position emit null `branchLatitude` / `branchLongitude`. Existing `location-confidence-redaction.test.ts` extends to cover `BranchTile`. PR #81 contract pinned for the new tile shape. |
| **Pagination** | `limit + offset` operates on branch tiles; `total` / `totalBranches` reflects branch count. |
| **Diversity (D1 default)** | Two branches of the same merchant sit adjacent under pure-rank sorting (proves clustering happens naturally). |
| **Query matching — `q="Covelum"`** | All Covelum branches returned. |
| **Query matching — `q="Pizza"`** | All branches of every pizza merchant returned. |
| **Query matching — `q="Brightlingsea"` (text predicate only, this rebaseline)** | SQL `OR` clause matches `branch.localityName='Brightlingsea'` / `branch.postTown='Brightlingsea'` / `branch.name LIKE '%Brightlingsea%'` plus any merchant whose `businessName` happens to contain "Brightlingsea". Output collects every active branch of every matched merchant. **EffectiveLocation does NOT flip** — caller's GPS / saved-location-driven `effLoc` continues to anchor ranking. Pinned assertion: no `tryPlaceMatch` call, no centroid lookup, no EffectiveLocation mutation. Place-match priority is M4.2's responsibility and is tested there, not here. |
| **Branch-level predicate match** | `q` matches `branch.name` but NOT merchant → scope to specific matched branches only. |
| **`rankBranchesV3` collect-first** | Each branch independently rung-classified; output cardinality = sum of (branches passing the rung gate) across merchants. |
| **All-time regression** | Endpoints without `month` filter (savings tangent) preserve their behaviour — Discovery is independent of Savings PR-B's month scope. |

### §11.2 Customer-app tests

| Test | Coverage |
|---|---|
| **Per-surface tile contract** | Search, Home, Category, Map, in-area. Each test mocks `branches: BranchTile[]` and asserts rendered tile reads `branch.id` + merchant identity. |
| **Multi-branch render** | Mock Covelum 2 branches → 2 tiles rendered with same merchant headline + distinct branch suffixes. |
| **Tap navigation** | Every tile tap routes to `/(app)/merchant/[id]?branch=<branchId>`. Snapshot the pushed URL. |
| **Map pin count** | 2 branches → 2 `<Marker>` elements with distinct keys. |
| **Map carousel** | Carousel keyed on `branch.id`. Tapping different pins slides to different branches of the same merchant. |
| **Favourites (Rev-2 — merchant-keyed wire)** | `tile.isFavourited` derived server-side from merchant favourite state. Tap heart on a branch tile fires `useFavourite({ type: 'merchant', id: tile.merchant.id }).toggle()`. Toggling one branch tile flips `isFavourited` across all branch tiles of the same merchant in the cache. Test pins this interim fan-out behaviour; forward-compatible field name + shape on `BranchTile` survives the future favourites rebaseline. |
| **Branch-name display** | Tile renders `branchName` (clean form, no merchant prefix) + locality fallback (`localityName ?? postTown ?? city` — most specific → least specific). |
| **POSTCODE_CENTROID branches** | Render with null coords; no map pin emitted; tile still appears in list views with merchant identity. |

### §11.3 Tests to flip during Phase 2

- Existing Search / Home / Category / Map tile snapshot tests — flip from one-merchant assertions to one-tile-per-branch assertions.
- `voucher-press-branch-race.test.tsx` — preserved; the URL contract is unchanged.

### §11.4 Tests NOT affected

- Voucher Detail tests — merchant-keyed surface, unchanged.
- Merchant Profile tests — merchant-keyed surface, unchanged.
- Redemption flow / Redemption Receipt — branch-attributed, already aligned.
- Savings tests — already correctly branch-attributed (PR #105).
- §AS tests — merchant-primary visual hierarchy preserved on each tile.

---

## §12. Implementation file map

Per-phase file inventory (specced; final list comes in the plan doc).

### Phase 1 — Backend additive

**New files:**
- `src/api/lib/ranking.ts` — `rankBranchesV3` function appended.
- `src/api/customer/discovery/service.ts` — `enrichBranchTile`, `enrichBranchTiles`, `searchBranches`, `getInAreaBranches`, `getHomeFeedBranches`, `listCategoryBranches`, `getCampaignBranches` (Rev-2 — campaigns added) appended alongside the legacy merchant-themed helpers.
- `src/api/customer/discovery/branchTileSchema.ts` (new file) — Zod schema for `BranchTile` shape for client-side type generation alignment.

**Modified files:**
- `src/api/customer/discovery/routes.ts` — handlers for the FIVE affected endpoints (search, in-area, home-feed, category list, campaign merchants) simply add the `branches` field to existing responses unconditionally (additive, no flag plumbing). Locked decision: **unconditional additive** — no query flag, no header. Both fields always present.

**New test files:**
- `tests/api/customer/discovery/branch-tile-contract.test.ts` — every endpoint returns `branches` with the spec'd shape.
- `tests/api/lib/rankBranchesV3.test.ts` — collect-first, per-branch classify, pagination, multi-branch fixture.
- `tests/api/customer/discovery/campaign-branches.test.ts` (Rev-2 — added) — `getCampaignBranches` fans out one tile per active branch of every campaign merchant; pinned interim pre-`CampaignMerchant.branchId?` behaviour.

### Phase 2 — Customer-app surface migrations

**Per-surface PR scope (rough):**
- Phase 2.1 (Search): `apps/customer-app/src/features/search/screens/SearchScreen.tsx`, `SearchResultItem.tsx`, `hooks/useSearch.ts`, `tests/features/search/**`.
- Phase 2.2 (Map): `apps/customer-app/src/features/map/screens/MapScreen.tsx`, `MapPins.tsx`, `MapMerchantTile.tsx` → rename `MapBranchTile.tsx`, `MapListView.tsx`, `hooks/useInAreaMerchants.ts` → `useInAreaBranches.ts`.
- Phase 2.3 (Home): `apps/customer-app/src/features/home/screens/HomeScreen.tsx`, `FeaturedCarousel.tsx`, `TrendingCarousel.tsx`, `NearbyByCategory.tsx`, `hooks/useHomeFeed.ts`.
- Phase 2.4 (Category): `apps/customer-app/src/features/category/screens/CategoryResultsScreen.tsx`, `hooks/useCategoryResults.ts`.
- Phase 2.5 (tile component rename): `apps/customer-app/src/features/shared/components/MerchantTile.tsx` → `BranchTile.tsx`. Sweep all import sites.

**Tests in each PR:** matching feature folder tests, flipped to assert one-tile-per-branch.

### Phase 3 — Cleanup

**Files deleted or stripped:**
- `src/api/customer/discovery/service.ts`: remove `enrichMerchantTile`, `enrichMerchantTiles`, `searchMerchants`, `getInAreaMerchants`, `getHomeFeed` (merchant variant), and the legacy `merchants` field from all endpoint responses.
- `src/api/lib/ranking.ts`: remove `rankMerchantsV2`, `classifyTier`, `selectContextBranch`, `MerchantEntry`.
- Tests for removed code dropped.

Converges with Plan 4 M5 cleanup tasks (`M5.3 Remove deprecated rankMerchants + classifyTier`, `M5.5 Clear customer-app Plan 4 code hooks`, `M5.6 merchantCountByCity decision`).

---

## §13. Deferred-followups updates (status as of 2026-05-18)

Captured in memory edits made alongside this spec:

| Entry | Status |
|---|---|
| §M Branch-as-primary-unit | 🚧 ACTIVE — this rebaseline IS its resolution. |
| §BA "One-pin-per-merchant vs one-pin-per-branch" | ✅ COVERED by this rebaseline (pin cardinality flips). Other §BA scope (LocationSearch parity, MapListView parity, ADDRESS_GEOCODED policy) remains OPEN. |
| §BB Home meta `effectiveLocality` | ✅ IMPLICITLY COVERED (Path B answer locked — Home WILL carry `effectiveLocality` under the branch-first contract). |
| §AW Discovery badge / merchandising | ⚠️ PRINCIPLE LOCKED — badges branch-scoped from day one; schema + UI implementation deferred to Phase 4/5. |
| §AV POSTCODE_CENTROID discoverability | ⚠️ REDACTION CONTRACT REAFFIRMED — passes through per-branch unchanged. Hybrid-vs-exclude product decision preserved separately. |
| §A schema gaps (`Branch.shortName`, `Branch.county`, `FeaturedMerchant.branchId?`, `CampaignMerchant.branchId?`) | All OPEN under §A. This rebaseline uses server-side helpers + fallback fields; schema migrations remain Tier 3 cleanups. Rev-2 adds `CampaignMerchant.branchId?` to the list (parallel to `FeaturedMerchant.branchId?`). |
| §AS merchant-identity sweep | NOT REGRESSED. Merchant identity stays primary in each tile's visual hierarchy; branch is locality-style secondary context. |
| Favourites branch-keyed rebaseline (Rev-2) | OUT OF SCOPE for THIS rebaseline. Favourites wire stays merchant-keyed during Phase 1/2/3 of Discovery rebaseline; `BranchTile.isFavourited` derived from merchant favourite state until separate workstream ships. See §7. |
| Plan 4 M4 | 🚫 BLOCKED. Resumes mid-Phase-2 once Search migration lands. |
| Plan 4 M5 | Converges with Phase 3 cleanup as a single PR. |

---

## §14. Spec self-review

Per the writing-plans / brainstorm-first standing rule — checking this spec against itself before owner review:

### §14.1 Placeholder scan
- No "TBD" / "TODO" markers.
- All eight surfaces (Search, Map, Home, Category, in-area, Favourites tiles, Voucher Detail, Merchant Profile detail) explicitly scoped (first six change; last two preserved).
- All ten §17 owner-locked decisions cross-referenced inline.
- All five cross-ref deferred-followups entries (§M / §BA / §BB / §AV / §AW) explicitly addressed.

### §14.2 Internal consistency
- `BranchTile.id === branch.id` consistent across §1 / §3 / §4 / §5 / §6.
- Pagination unit (branch tile) consistent across §2 / §11.
- POSTCODE_CENTROID redaction contract (PR #81) referenced identically in §0.5 / §1.1 / §11.1.
- Diversity D1 decision referenced identically in §2.4 / §11.1 / §0.6.

### §14.3 Scope check
- Single-purpose rebaseline; doesn't try to also ship badges / filter buttons / clustering / schema migrations.
- §0.4 NOT-in-scope list explicit and comprehensive.
- §10.4 Plan 4 M4 sequencing makes the M4 dependency unambiguous.

### §14.4 Ambiguity check
- Tile rename (`MerchantTile` → `BranchTile`) explicitly locked in §0.6 §17.3 + §12 file map.
- Same-coordinate Map overlap explicitly accepted as v1 in §4.2.
- Trending pre-branch-level-compute explicitly captured as interim in §5.2 + §17.7.
- Place-match-priority for `q=` explicitly captured in §3.2 + §17.6.

No issues found. Spec is implementation-ready.

---

## §15. Open items / questions for owner before plan-writing

These are items that affect the plan doc but NOT the spec contract. Spec stands regardless of resolution.

> **Rev 2.1 note:** former §15.1 ("Endpoint contract: unconditional additive vs `?cardinality=` flag") was removed because it is already locked elsewhere in this spec — see §12 file map: *"Locked decision: unconditional additive — no query flag, no header. Both fields always present."* The numbering below cascades up by one.

1. **Phase 2 technical migration order** (Rev-2 — renamed for clarity, was "Phase 2 PR sequencing"). Spec recommends Search → Map → Home → Category → tile-component-rename sweep as the **technical migration order for shipping each customer-app surface against the new branch-first backend contract**. This is implementation order ONLY. **It is NOT the bottom-tab navigation order; the bottom-tab nav order remains the locked product order Home → Map → Savings → Favourites → Profile and is unchanged by this rebaseline.** Want a different technical migration order? Reasons Search is first: highest-visibility user-facing fix for the Covelum cardinality bug; smallest blast-radius PR; once Search migrates, Plan 4 M4 partially unblocks.

2. **Plan 4 M4 resumption point.** Spec recommends M4 resumes after Phase 2.1 (Search) ships, with M4.2 / M4.3 / M4.5 picking up against the `branches` contract. Confirm or revise.

3. **Customer-app type generation.** Spec adds `branchTileSchema.ts` as a backend file but customer-app needs the matching TS shape. Two options: (a) ship the TS interface in the customer-app Zod schema file (`lib/api/discovery.ts`) hand-written, OR (b) bring up code-gen. Locked decision recommended: **(a) hand-written** — matches existing pattern.

4. **Branch.businessHours / openingHours** — `BranchTile.isOpenNow` is branch-level today via `selectedBranch` patterns. Confirm the existing `getMyOpenStatus` derivation extends naturally to per-branch tile rendering on Discovery surfaces. (Spec assumes yes; flag if there's a subtlety.)

5. **`BranchTile` address policy** (Rev-2 — REWRITTEN to lock the locality-only direction). Rev-1 incorrectly suggested adding `branchAddressLine1` (and asked whether to add `branchAddressLine2` for co-located branch disambiguation). Owner-locked Rev-2 direction: **NO street address on `BranchTile` at all.** Cards carry locality hierarchy only — `branchLocalityName ?? branchPostTown ?? branchCity`. Why: users scanning Discovery cards want to recognise the AREA (Brightlingsea, Colchester, Brixton), not the specific street. Street address remains on Merchant Profile, Receipt, and branch-detail surfaces (which are NOT Discovery cards). See §1.1 + §5.3 for the locked fields. **Open variant for plan-time:** if device-QA on Phase 2.1 (Search) surfaces a real same-locality-disambiguation case (two Costa branches both in Brightlingsea), the fallback is to lean on `branchName` clean form (the merchant-prefix-stripped name) which often contains the disambiguating fragment naturally (e.g. "Brightlingsea High Street" vs "Brightlingsea Marina"). If that's not enough, the followup is a focused branch-name editorial pass, NOT a tile-shape change. Flag for owner.

6. **Plan doc location.** Confirm `docs/superpowers/plans/2026-05-18-discovery-rebaseline-branch-first.md` as the canonical plan path post-spec-approval.

---

## §16. Approval gates

This spec phase requires:

1. **Owner spec review.** Read this document; verify it captures the brainstorm output faithfully; flag any divergences from the §17 locked decisions; answer §15 open items.
2. **Spec lock.** After owner approval, this spec becomes the source of truth for the plan + implementation.
3. **Plan-writing phase begins.** Plan doc authored at the path confirmed in §15.6. Multi-PR plan with Phase 1 / Phase 2.1-2.5 / Phase 3 milestones.
4. **Owner plan review.** Plan reviewed before implementation.
5. **Implementation begins.** Phase 1 backend additive PR first.

**Paused after spec write. Awaiting owner review before plan-writing.**
