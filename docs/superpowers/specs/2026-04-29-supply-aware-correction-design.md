# Plan 1.5 — Supply-aware visibility correction + amenity eligibility

**Status:** Draft for full-spec review (Sections 1–6 directionally approved; pending final lock)
**Date:** 2026-04-29
**Author:** brainstorming session, 2026-04-29
**Supersedes parts of:** `docs/superpowers/specs/2026-04-28-category-taxonomy-design.md` §4.5
**Related memory:** `project_supply_aware_visibility_revision.md`, `project_amenity_eligibility_extension.md`, `project_card_display_direction.md`

---

## 1. Problem statement

Plan 1 shipped a *hide-on-low-supply* rule (taxonomy spec §4.5): when surviving subcategory count for a resolved city falls below `Category.minSubcategoryCountForChips`, the API returned `chipsHidden=true` on top-level rows, signalling the frontend to suppress the chip strip. Combined with the city-scope filter in `searchMerchants` and `getCategoryMerchants`, this meant categories and merchants could be **hidden from view purely because of distance**.

This breaks destination-intent discovery. The canonical example: a Huddersfield user looking for Museums sees the category hidden because all museums are in London — even though they may willingly travel for one. The principle the system should encode is:

> **Distance is a ranking signal, not a visibility filter.**

Plan 1.5 corrects this by replacing the hide rule with an **intent-aware ranking model** and laying down the data foundation for **subcategory-aware amenity eligibility** (a related concern that needs schema in place before Plan 2 starts consuming amenities in UI).

## 2. Solution overview

Plan 1.5 makes eight changes:

1. **Top-level categories are always visible.** They form the app's structural scaffold. Visibility filtering applies only to subcategories, filter chips, and result composition.
2. **Subcategories appear when ≥1 active UK merchant exists.** Hidden only when zero UK-wide supply (rare).
3. **API returns merchants pre-ordered by relevance.** `NEARBY → CITY → DISTANT` tier ladder, modulated by category intent.
4. **Per-merchant `supplyTier` field** (`'NEARBY' | 'CITY' | 'DISTANT'`) for optional UI grouping.
5. **Per-meta tier counts** (`nearbyCount`, `cityCount`, `distantCount`) — always reflect *full UK supply*, even when results are tier-filtered.
6. **Per-meta `emptyStateReason` field** (`'none' | 'expanded_to_wider' | 'no_uk_supply'`) — single source of truth for empty-state UX, so Plan 2 frontends don't have to derive it from composing other fields.
7. **Category intent** (LOCAL / DESTINATION / MIXED) modifies *how* distance affects ranking — not *whether* results are shown. Intent lives on `Category` with parent inheritance for subcategories.
8. **`CategoryAmenity` foundation** introduces eligibility rules (which amenities apply to which categories/subcategories). Foundation only — admin UI deferred to Phase 5; customer-facing response shape is unchanged.

Two existing artefacts of the rejected hide model are removed:
- The **`chipsHidden` API/service response field** (in `/categories` and `/category/:id/merchants` meta) — eliminated.
- The **`Category.minSubcategoryCountForChips` schema column** — dropped.

## 3. Schema changes

### 3.1 Additions

**`CategoryIntentType` enum**
```prisma
enum CategoryIntentType {
  LOCAL
  DESTINATION
  MIXED
}
```

**`Category.intentType` column** — nullable per-row, with parent inheritance fallback at lookup time.
```prisma
model Category {
  // … existing fields …
  intentType CategoryIntentType?
}
```
- Top-level rows seeded with explicit values.
- Subcategories left NULL by default → service-layer code resolves to parent's value.
- Override possible by setting on a subcategory row directly when needed.

**`CategoryAmenity` model** — eligibility join, accepts either category level.
```prisma
model CategoryAmenity {
  id         String   @id @default(uuid())
  categoryId String
  amenityId  String

  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  amenity    Amenity  @relation(fields: [amenityId], references: [id], onDelete: Cascade)

  @@unique([categoryId, amenityId])
}
```
- `categoryId` references `Category` at any level (top-level OR subcategory).
- Eligibility for subcategory X = (rules where `categoryId = X`) ∪ (rules where `categoryId = X.parentId`).
- Both FKs `ON DELETE CASCADE` (rules disappear when their referent does).

### 3.2 Removals

- **`Category.minSubcategoryCountForChips`** column — dropped via migration. This column was tied 1:1 to the rejected hide rule and has no role under rank-not-hide.

### 3.3 Explicit clarification (no code change but contract-level)

- **`BranchAmenity.amenityId` FK** — Plan 1.5 makes the existing PostgreSQL default behaviour explicit by adding `onDelete: Restrict`. Hard-deleting an `Amenity` row is rejected when any `BranchAmenity` references it — admins must reassign or soft-deactivate first.

- **Three-layer amenity model — amenities are branch-level, NOT merchant-level.** The amenity system has three distinct concerns, each in its own model:
  - `Amenity` — the master list of possible amenities (the canonical set of options, admin-managed)
  - `CategoryAmenity` (new in Plan 1.5) — eligibility rules: which amenities are allowed/relevant for a category or subcategory
  - `BranchAmenity` — the actual selected amenities for a *specific branch*

  A merchant with multiple branches may have different amenities per branch. Concrete example:
  - Coffee shop "Acme Coffee" with three branches:
    - Branch A: Wi-Fi + Outdoor Seating
    - Branch B: Wi-Fi only
    - Branch C: Click & Collect + Wheelchair Access

  Downstream consumers (merchant onboarding in Phase 4, customer-facing display in Plan 2, admin UI in Phase 5) **must always treat amenities as branch-level data**. There is no "merchant amenities" concept; queries and aggregations operate at the branch grain. This distinction is preserved by the existing schema (`BranchAmenity.branchId` not `merchantId`) and Plan 1.5's helpers (`getEligibleAmenitiesForSubcategory` returns the eligible *list*, not assignments — assignments live on `BranchAmenity`).

  In Plan 1.5's seed data, all 6 taxonomy test merchants happen to have a single branch each. The seed does not exercise the per-branch differentiation, but the helper signature (`linkBranchAmenities(branchId, ...)`) reflects the correct level. See §4.5 for details.

### 3.4 Unchanged

- `Amenity` model itself: `{ id, name, iconUrl, isActive }` — no new fields.
- `BranchAmenity` join — branch-level join unchanged; orthogonal to eligibility.
- `Category.merchantCountByCity` — still drives `CITY` vs `DISTANT` tier classification.
- Plan 1 taxonomy intact: `Tag`, `SubcategoryTag`, `RedundantHighlight`, `MerchantHighlight`, `MerchantSuggestedTag`.

### 3.5 Migration safety

Single Prisma migration:
1. ADD `CategoryIntentType` enum
2. ADD `Category.intentType` column (nullable)
3. DROP `Category.minSubcategoryCountForChips` column
4. CREATE `CategoryAmenity` table with FKs + unique constraint
5. ALTER `BranchAmenity.amenityId` FK to explicit `ON DELETE RESTRICT` (no behaviour change in PostgreSQL — codifies intent)

All operations are reversible. The dropped column has no non-internal consumer (no Plan 2 UI shipped), zero rollback risk. No data backfill required at the schema level — seed handles intent classification and amenity rules.

## 4. Seed-data changes

### 4.1 `Category.intentType` for the locked 11 top-levels

| # | Top-level | intentType | Reasoning |
|---|---|---|---|
| 1 | Food & Drink | LOCAL | Daily-use, proximity dominates |
| 2 | Beauty & Wellness | LOCAL | Salon/spa habits are local |
| 3 | Health & Fitness | LOCAL | Gym membership is local-by-design |
| 4 | Out & About | MIXED | Local pubs/cafés *and* destination cinemas/theatres/museums in the same parent |
| 5 | Shopping | MIXED | Local convenience *and* destination boutiques/specialist retailers |
| 6 | Home & Local Services | LOCAL | "Local" is in the name |
| 7 | Travel & Hotels | DESTINATION | Travel is destination by definition |
| 8 | Health & Medical | LOCAL | Clinics, GPs serve local catchment (specialty travel exists but is the exception) |
| 9 | Family & Kids | LOCAL | Daily-use family services |
| 10 | Auto & Garage | LOCAL | Mechanics, MOT, valeting all serve local catchment |
| 11 | Pet Services | LOCAL | Vets, groomers, pet shops are local |

**Split:** 8 LOCAL, 2 MIXED (Out & About, Shopping), 1 DESTINATION (Travel & Hotels). Subcategories left NULL → inherit from parent at runtime. No subcategory overrides in this initial seed; overrides added later as specific cases require.

**Idempotency:** updates keyed by `name + parentId IS NULL` (mirrors the existing top-level rename pattern in `seedCategories`).

### 4.2 Amenity starter set — *not the final universe*

Plan 1.5 commits a starter set of ~17 amenities sufficient to:
- Demonstrate the eligibility model across LOCAL / MIXED / DESTINATION categories.
- Cover all 11 top-levels with at least 1–2 amenities each.
- Exercise both top-level and subcategory-only rules (so the inheritance lookup is genuinely tested).

The list is documented as a *starter — admin Phase 5 will add more*. There is no final universe; eligibility is the control, not enumeration completeness.

| Amenity | Suggested eligibility |
|---|---|
| **Universal-ish** | |
| Wi-Fi | Food & Drink, Beauty & Wellness, Out & About, Travel & Hotels (top-level) |
| Wheelchair Access | All 11 top-levels (one rule per top-level) |
| Online Booking | All 11 top-levels (one rule per top-level) |
| **Food & Drink** | |
| Outdoor Seating | Food & Drink (top-level) |
| Late-Night Service | Bar + Pub & Gastropub subcategories only |
| Group Bookings | Food & Drink, Out & About (top-level) |
| **Beauty & Wellness, Health & Medical** | |
| Walk-Ins Welcome | Beauty & Wellness, Health & Medical (top-level) |
| Same-Day Appointments | Health & Medical (top-level) |
| **Health & Fitness** | |
| Showers | Health & Fitness (top-level) |
| Lockers | Health & Fitness, Travel & Hotels (top-level) |
| **Shopping** | |
| Click & Collect | Shopping (top-level) |
| Free Parking | Shopping, Out & About, Travel & Hotels, Auto & Garage (top-level) |
| **Travel & Hotels** | |
| Room Service | Hotel subcategory only |
| 24-Hour Reception | Travel & Hotels (top-level) |
| **Auto & Garage** | |
| Loan Vehicle | Auto & Garage (top-level) |
| Pickup & Drop-off | Auto & Garage, Pet Services (top-level — Pet Groomer use case) |
| **Pet Services** | |
| Boarding Available | Pet Services (top-level) |

**All seeded with `isActive=true`.**

### 4.3 Tags-vs-amenities semantic boundary (documented in seed file)

The seed file headers (`prisma/seed-data/amenities.ts` and `prisma/seed-data/tags.ts`) document the rule:

| | Tag (CUISINE / SPECIALTY / HIGHLIGHT / DETAIL) | Amenity |
|---|---|---|
| **Question** | What is this place? | What does this place have/offer? |
| **Domain** | Identity, brand, descriptor | Operational features, services |
| **Examples** | Italian, Specialty Coffee, Pet-Friendly | Wi-Fi, Outdoor Seating, Free Parking |

**A concept lives in EXACTLY ONE system.** No "Halal" tag AND "Halal Certified" amenity. Pick one.

Items previously considered for the amenity list but **rejected** because they overlap with existing tags: *Halal Certified* (overlaps with "Halal" CUISINE tag), *Vegan Options* (overlaps with "Vegan" CUISINE tag), *Family-Friendly* (existing HIGHLIGHT tag), *Pet-Friendly* (existing HIGHLIGHT tag).

**Wheelchair Access** is classified as an amenity (operational accessibility fact, used for filtering and detail-page display) rather than a HIGHLIGHT tag (which is reserved for the limited promoted card-level chips).

### 4.4 `CategoryAmenity` rule seed

Approximately 25–35 rows derived from the eligibility table above. Top-level rules expand implicitly to subcategories via the inheritance lookup at runtime — no per-subcategory expansion in seed data.

**Idempotency:** `createMany` with `skipDuplicates: true` (mirrors `seedSubcategoryTags()` pattern).

### 4.5 Test merchant amenity coverage

Plan 1's 6 taxonomy test merchants each have a single (main) branch in the seed. `BranchAmenity` rows are added to those branches so integration tests can pin realistic eligibility behaviour. **Amenities are branch-level (see §3.3)** — the bullets below name the merchant for readability, but the `linkBranchAmenities(branchId, …)` helper assigns to a specific branch:

- `dev-merchant-001` main branch (Restaurant + Italian) → Outdoor Seating, Wi-Fi, Online Booking
- `tax-merchant-cafe-001` main branch (Cafe & Coffee + Specialty Coffee) → Wi-Fi, Outdoor Seating
- `tax-merchant-foodhall-001` main branch (Food Hall, no descriptor tag) → Wi-Fi, Group Bookings
- `tax-merchant-pilates-001` main branch (Boutique Studio) → Showers, Lockers, Online Booking
- `tax-merchant-aesthetics-001` main branch (Aesthetics Clinic) → Same-Day Appointments, Online Booking, Wheelchair Access
- `tax-merchant-vet-001` main branch (Vet) → Online Booking, Pickup & Drop-off

Conservative set — just enough to exercise the eligibility helper. Per-branch differentiation isn't exercised in this seed because every test merchant has a single branch; that's a deliberate scope choice (the model already supports per-branch amenities — Plan 1.5 doesn't need to demonstrate it). When the customer app or merchant portal later seeds richer multi-branch test data, those entries can vary amenities per branch directly.

### 4.6 Unchanged in seed

- 262 tags
- 18 RedundantHighlight rules
- 89 subcategories' core fields (only adds `intentType` overrides if any — none in initial seed)
- Dev users, dev merchants, dev vouchers

### 4.7 No quantity caps on `BranchAmenity`

Per product direction: amenities are reference data, not limited promotional surface. No DB-level cap, no trigger. Eligibility is the structural control. Display caps come later via Plan 2 UI choices (cards may show 0–N selected; detail pages can group; filter chips show only amenities present in current result set).

This contrasts with `MerchantHighlight`'s hard 3-cap trigger — highlights compete for tile real estate; amenities don't.

## 5. Service / API changes

### 5.1 New ranking primitive (`src/api/lib/ranking.ts`)

Pure function, no DB. Three concerns: tier classification, intent-aware ordering, tier counts.

#### 5.1.1 Tier classification

```ts
type SupplyTier = 'NEARBY' | 'CITY' | 'DISTANT'

function classifyTier(merchant, ctx: {
  userLat: number | null
  userLng: number | null
  profileCity: string | null
}): SupplyTier
```

- **NEARBY** when `userLat`/`userLng` available AND nearest active branch ≤ `NEARBY_RADIUS_MILES` (2)
- **CITY** when any active branch's `city` matches `profileCity` (case-insensitive)
- **DISTANT** otherwise

When no location data at all (no coords, no profileCity), every merchant → `DISTANT` — semantically "everything is equally distant from a system that has no location signal".

#### 5.1.2 Intent-aware ranking

Three modes drive the post-classification ordering:

**LOCAL — strongly proximity-first**
1. NEARBY merchants — sorted by `distanceMetres ASC`
2. CITY merchants — sorted by `businessName ASC`
3. DISTANT merchants — sorted by `businessName ASC`

User reads: "Nearest first; then anything in my city; then everything else alphabetical."

For daily-use categories (food, gym, vet, garage), proximity is dominant. Quality differences within a tier don't override 10× distance differences.

**DESTINATION — quality-first after the local tier**
1. NEARBY merchants — sorted by `distanceMetres ASC` *(local destinations exist; they're still relevant)*
2. CITY + DISTANT merged into one group — sorted by quality-aware comparator (see 5.1.3)

User reads: "Local options first; then the highest-rated places, regardless of how far."

For travel-intent categories, a 5-star hotel 80 miles away is more relevant than a 3-star one in your town. Distance becomes irrelevant once you've cleared the local convenience tier.

**MIXED — proximity-led, quality-aware in the long tail**
1. NEARBY merchants — sorted by `distanceMetres ASC`
2. CITY merchants — sorted by `businessName ASC`
3. DISTANT merchants — sorted by quality-aware comparator (see 5.1.3)

User reads: "Nearest first; then anything in my city; then the *best* of what's further away."

The differentiation from LOCAL is exactly the secondary sort within DISTANT. For Out & About / Shopping, a Huddersfield user scrolling past local pubs benefits from seeing the West End theatre or top-rated Manchester boutique before alphabetical noise. The differentiation from DESTINATION is that MIXED still segments CITY and DISTANT — most MIXED users still prefer in-city over inter-region.

#### 5.1.3 Quality-aware comparator (DESTINATION CITY+DISTANT, MIXED DISTANT)

```ts
const MIN_REVIEW_COUNT_FOR_RATING_SORT = 3

merchants.sort((a, b) => {
  const aRated = (a.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  const bRated = (b.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  if (aRated && bRated) return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  if (aRated) return -1   // rated comes before unrated
  if (bRated) return 1
  return a.businessName.localeCompare(b.businessName)
})
```

- Merchants with ≥3 reviews → ordered by `avgRating DESC`
- Merchants with <3 reviews → ordered alphabetically, AFTER rated merchants
- At early launch (most merchants <3 reviews), most ordering is alphabetical — graceful degradation built in.
- Featured/curated as a future signal (admin Phase 5) is flagged but not implemented — would slot before `avgRating DESC` if added.

`MIN_REVIEW_COUNT_FOR_RATING_SORT` lives as a named constant in `ranking.ts` with comment explaining its purpose.

#### 5.1.4 Function signature

```ts
function rankMerchants<T extends MerchantTile>(
  merchants: T[],
  ctx: {
    intentType: CategoryIntentType
    userLat: number | null
    userLng: number | null
    profileCity: string | null
  },
): {
  ordered: Array<T & { supplyTier: SupplyTier; distanceMetres: number | null }>
  counts: { nearbyCount: number; cityCount: number; distantCount: number }
}
```

### 5.2 Helpers

**`resolveCategoryIntent`** (in `src/api/lib/ranking.ts`):

```ts
function resolveCategoryIntent(category: {
  intentType: CategoryIntentType | null
  parent: { intentType: CategoryIntentType | null } | null
}): CategoryIntentType {
  return category.intentType ?? category.parent?.intentType ?? 'LOCAL'
}
```

Default fallback `'LOCAL'` when both NULL — biases toward proximity (the more common case) when classification is missing.

**`getEligibleAmenitiesForSubcategory`** (in `src/api/lib/amenity.ts`):

```ts
async function getEligibleAmenitiesForSubcategory(
  prisma: PrismaClient,
  subcategoryId: string,
): Promise<Amenity[]>
```

Returns amenities where:
- `CategoryAmenity` matches `subcategoryId` OR matches `subcategory.parentId`
- `Amenity.isActive = true`

Ordered by `Amenity.name ASC`. Used by:
- Plan 1.5: tests only.
- Future Phase 4 (Merchant Portal): merchant onboarding endpoint will call this.
- Future Plan 2 / Phase 5: filter helpers + admin UIs.

Lives in `src/api/lib/amenity.ts` (new file). Not exposed via HTTP in Plan 1.5.

### 5.3 `scope` query param semantics

The `scope` query param has **dual semantics depending on whether it's explicitly passed by the caller**:

| Caller behaviour | Server response |
|---|---|
| `scope` omitted | Default by category intent (see 5.4 below). Rank-not-hide UK-wide for DESTINATION; auto-expand from NEARBY+CITY for LOCAL/MIXED |
| `scope=nearby` | Filter to NEARBY tier only. Cascading expansion if empty (see below) |
| `scope=city` | Filter to NEARBY+CITY tiers. Cascading expansion if empty (see below) |
| `scope=platform` | Return all tiers regardless of intent — explicit "give me everything" |
| `scope=region` | Reserved for future use; treated as `scope=city` for now |

This preserves user-explicit filter behaviour where it's needed (filter chips, deliberate narrowing) while making the **default** align with rank-not-hide.

**Cascading expansion rule.** When the originally-requested scope (or default-by-intent scope) yields zero merchants, expansion cascades to the next wider tier. If that tier is also empty, expansion continues until either a non-empty tier is reached OR all tiers are exhausted (true empty). When any expansion happens, `meta.scopeExpanded=true`. The `meta.emptyStateReason` field (see §5.7) signals which terminal state was reached.

Concrete examples:
- `scope=nearby`, NEARBY empty, CITY has 5 → expand to CITY, return 5; `scopeExpanded=true`, `emptyStateReason='expanded_to_wider'`
- `scope=nearby`, NEARBY+CITY empty, DISTANT has 3 → cascade to DISTANT, return 3; same flags
- `scope=platform`, all tiers empty → `merchants=[]`; `scopeExpanded=false`, `emptyStateReason='no_uk_supply'`

### 5.4 Default scope behaviour by intent

When `scope` is omitted, the default scope is determined by the effective category intent:

| Effective intent | Default scope | Auto-expand |
|---|---|---|
| LOCAL | NEARBY + CITY tiers | If both tiers yield zero merchants (i.e. `nearbyCount + cityCount === 0`), expand to DISTANT and set `scopeExpanded=true` |
| MIXED | NEARBY + CITY tiers | Same expansion rule as LOCAL |
| DESTINATION | All tiers | No expansion needed — already widest |

Free-text `searchMerchants` without `categoryId` defaults to LOCAL intent (most search terms are local).

**Crucial invariant:** `meta.{nearby,city,distant}Count` ALWAYS reflect full UK supply, regardless of what the response actually returns. The existence of distant supply is **never hidden**, only deferred from the first page.

**Empty-state decision matrix.** The combination of `merchants.length`, `scopeExpanded`, and the new `emptyStateReason` field (§5.7) drives three distinct UX states. The frontend reads `emptyStateReason` as the single source of truth — no composition required.

| State | Backend produces | Frontend renders |
|---|---|---|
| Normal results in originally-requested or default scope | `merchants > 0`, `scopeExpanded: false`, `emptyStateReason: 'none'` | Standard list |
| Fallback applied (no local supply, found in wider tier) | `merchants > 0`, `scopeExpanded: true`, `emptyStateReason: 'expanded_to_wider'` | "No {term} in {area} yet — closest option:" + list |
| True empty (zero UK supply) | `merchants: []`, all tier counts: `0`, `emptyStateReason: 'no_uk_supply'` | "No {term} found anywhere yet" |

Note on `scopeExpanded` in the true-empty case: it can be either `false` (caller used `scope=platform` from the start, no expansion attempted) or `true` (caller used `scope=nearby` or `scope=city` and the API cascaded through tiers but found nothing). Frontend should treat `emptyStateReason: 'no_uk_supply'` as authoritative — `scopeExpanded` is informational only in this case.

The enum is intentionally backend/product-oriented, not tied to final UI copy. Plan 2 chooses the user-facing wording per surface; the API just signals the state.

### 5.5 Service-layer integration

**`getCategoryMerchants` rewrite:**
1. Fetch category + parent (for intent resolution).
2. Drop the supply-aware city filter (no longer constrains to merchants with city supply).
3. Fetch UK-wide matching merchants (top-level OR subcategory match, as before).
4. Apply `rankMerchants` with `resolveCategoryIntent(category)`.
5. Apply default-scope filter by intent (5.4) if `scope` omitted; otherwise apply explicit-scope filter (5.3).
6. Compute meta envelope (5.7).
7. Return `{ merchants, total, meta }` — `chipsHidden` removed from response.

**`searchMerchants` changes:**
- Same ranking logic. When `categoryId` provided → that category's intent. When free-text only → default LOCAL.
- Drop the existing `scope='city'` hard filter (replaced by the explicit-scope behaviour above).
- Otherwise as `getCategoryMerchants`.

**`listActiveCategories` changes:**
- **Always returns all 11 top-level categories** regardless of supply (top-levels are structural).
- Subcategories: returns only those with ≥1 UK active merchant.
- Drop `chipsHidden` from response.
- Drop `scope`/`lat`/`lng`/`userId` parameters (endpoint becomes parameter-less again).
- Drop `minSubcategoryCountForChips` from select (column gone).

The query becomes a two-step fetch:
1. Fetch all top-levels (no supply filter).
2. Fetch subcategories with the supply filter.
3. Merge into a single response.

**`enrichMerchantTile` extension:**
- Adds `supplyTier` to the per-tile output (forwarded from `rankMerchants`).
- No other changes.

### 5.6 `resolveScope` helper

`src/api/lib/scope.ts` keeps its current job — it's the descriptive layer (what scope describes the user's location context based on §4.6 fallback). New file `src/api/lib/ranking.ts` is the relevance layer (how do results break down given that context).

Two clearly separated concerns; two files; one clean import surface.

### 5.7 `meta` envelope — final shape

For `searchMerchants`, `getCategoryMerchants`:

```ts
type EmptyStateReason = 'none' | 'expanded_to_wider' | 'no_uk_supply'

meta: {
  scope: 'nearby' | 'city' | 'region' | 'platform'   // resolved scope of the response
  resolvedArea: string                                // human-readable label
  scopeExpanded: boolean                              // true when expansion happened
  nearbyCount: number                                 // FULL UK supply count for this tier
  cityCount: number                                   // FULL UK supply count for this tier
  distantCount: number                                // FULL UK supply count for this tier
  emptyStateReason: EmptyStateReason                  // single source of truth for empty-state UX
  // chipsHidden REMOVED
}
```

- `scope` answers "WHERE is this response about?" (user's location context resolution)
- Tier counts answer "HOW are the returned results distributed?" (full UK supply composition)
- `emptyStateReason` answers "WHAT empty/fallback state should the UI render?" (single field, no composition required by the frontend)

**`emptyStateReason` is the canonical signal for empty-state UX.** Values:
- `'none'` — results in originally-requested or default scope, no fallback
- `'expanded_to_wider'` — results came from a wider scope than originally requested/defaulted (cascade expansion happened); UI may surface a "no local supply, closest is" header
- `'no_uk_supply'` — zero results anywhere across all tiers; UI renders true-empty state

The enum is **backend/product-oriented**, not tied to final UI copy — Plan 2 chooses user-facing wording per surface. Future reasons (e.g., `'filter_too_narrow'` when filter chips arrive) can be added additively without breaking this contract.

For `listActiveCategories`: returns a flat array under `{ categories }`. **No meta envelope** — it's a static taxonomy lookup, not a search.

### 5.8 API contract changes — summary

| Endpoint | Plan 1.5 changes | Backward compat |
|---|---|---|
| `GET /search` | + `supplyTier` per merchant; meta gains tier counts + `emptyStateReason`; meta drops `chipsHidden`; `scope=city` becomes a user-explicit filter (not a default); ranking by intent applied | Soft-breaking (drops `chipsHidden`; no UI consumer yet) |
| `GET /category/:id/merchants` | Same as `/search`. Plus: drops the city filter; returns UK-wide ranked list | Soft-breaking (drops `chipsHidden`; no UI consumer yet) |
| `GET /categories` | Drops `chipsHidden` from response; drops `scope`/`lat`/`lng` query params; returns all 11 top-levels regardless of supply; subcategories filtered to ≥1 UK active merchant | Soft-breaking (drops `chipsHidden`; no UI consumer yet) |
| `GET /merchants/:id` | **No changes** | ✅ |
| New: `getEligibleAmenitiesForSubcategory(...)` | Internal helper only — not exposed via HTTP in Plan 1.5 | N/A |

### 5.9 Code removed

- `chipsHidden` compute in `getCategoryMerchants` (~20 lines)
- `chipsHidden` compute + supply-aware city filter in `listActiveCategories` (~40 lines)
- `if (resolved.scope === 'city' && profileCity)` city-filter block in `searchMerchants` (~10 lines, replaced by explicit-scope behaviour)
- `Category.minSubcategoryCountForChips` references throughout (selects, types, comments)

Net reduction in `discovery/service.ts`: ~70 lines deleted, ~30 lines added (rankMerchants integration + tier-count compute). The file gets shorter.

## 6. Test impact

### 6.1 Existing tests that need updating

| File | Action | Notes |
|---|---|---|
| `tests/api/customer/discovery.routes.test.ts` | UPDATE | Remove `chipsHidden` assertions; add tier-count assertions; remove `/categories` query-param tests |
| `tests/api/customer/discovery.service.test.ts` | UPDATE | Delete the 4 `chipsHidden` tests added in Plan 1; the tagIds + meta envelope tests stay (drop only the `chipsHidden=false` assertion line) |
| `tests/api/customer/discovery.merchant.test.ts` | EXTEND | Existing descriptor + privacy tests unchanged. Add: `supplyTier` field present on tile shape (when location provided); eligible amenities E2E for `dev-merchant-001` |
| `tests/prisma/taxonomy-seed.test.ts` | EXTEND | Add `intentType` assertions: 11 top-levels each have a non-NULL `intentType` matching the locked classification; add `CategoryAmenity` row count + a few specific eligibility assertions |
| `tests/api/lib/scope.test.ts` | UNCHANGED | `resolveScope` keeps its job |
| `tests/api/lib/tile.test.ts` | UNCHANGED | Descriptor + redundancy unchanged |
| `tests/api/lib/merchantCount.test.ts` | UNCHANGED | |
| `tests/prisma/merchant-highlight-cap.test.ts` | UNCHANGED | |

### 6.2 New test files

**`tests/api/lib/ranking.test.ts`** (new, ~12 tests, pure unit):
- `classifyTier`: returns NEARBY/CITY/DISTANT correctly across all input combinations; honours nearest branch for multi-branch merchants.
- `rankMerchants`: LOCAL strict tier order, distance ASC within NEARBY; DESTINATION NEARBY first then quality-merged CITY+DISTANT; DESTINATION fallback (rated before unrated, alphabetical within unrated); MIXED matches LOCAL except for DISTANT tier rating-sort.
- Tier counts accurate across all intents.

**`tests/api/lib/amenity.test.ts`** (new, ~6 tests, pure unit with mocked Prisma):
- Returns amenities matching direct subcategory rules.
- Returns amenities matching parent top-level rules (inheritance).
- Returns union without duplicates.
- Excludes `isActive=false` amenities.
- Returns empty array when no rules match.
- Ordered by `Amenity.name ASC`.

**`tests/api/customer/amenity-eligibility.test.ts`** (new, ~5 tests, integration vs real Neon DB):
- For Restaurant subcategory, eligible amenity list includes Wi-Fi, Outdoor Seating, Online Booking, Wheelchair Access.
- Excludes Room Service (Hotel-only), Showers (Health & Fitness-only), Boarding Available (Pet Services-only).
- For Vet (Pet Services), eligible list includes Boarding Available, Pickup & Drop-off, Online Booking, Wheelchair Access.
- Soft-deactivation: setting an amenity's `isActive=false` excludes it from eligibility (cleanup in `afterEach`).

### 6.3 Tests that EXTEND `discovery.service.test.ts`

~13 new tests covering:
- `searchMerchants` with LOCAL category default returns NEARBY+CITY merchants only; `meta.distantCount` reports full DISTANT supply count.
- `searchMerchants` with DESTINATION category default returns all tiers.
- `searchMerchants` free-text search defaults to LOCAL.
- Auto-expand: when default scope is empty, response uses next tier and `meta.scopeExpanded=true`.
- Cascading expansion: when both NEARBY and CITY are empty under `scope=nearby`, response cascades through to DISTANT.
- `scope=platform` returns all tiers regardless of intent.
- `scope=nearby` filters to NEARBY tier only.
- `scope=city` filters to NEARBY+CITY tiers.
- Each merchant in response includes `supplyTier`.
- `listActiveCategories` always returns all 11 top-levels.
- `listActiveCategories` filters subcategories with zero UK supply.
- **`emptyStateReason: 'none'`** when results are present in originally-requested or default scope (no expansion).
- **`emptyStateReason: 'expanded_to_wider'`** when local tiers are empty but a wider tier yielded results (`scopeExpanded=true`, `merchants.length > 0`).
- **`emptyStateReason: 'no_uk_supply'`** when all tiers are empty (`merchants=[]`, all tier counts `0`, `scopeExpanded=false`).

### 6.4 Tests that EXTEND `discovery.routes.test.ts`

~4 new tests covering:
- `/categories` is parameter-less (scope/lat/lng query params are ignored or rejected).
- `/category/:id/merchants` response `meta` includes tier counts.
- `/category/:id/merchants` each merchant tile has `supplyTier`.
- `/search?scope=platform` returns full UK ranked list.

### 6.5 Test count delta

| | Tests |
|---|---|
| Current (post-Plan-1) | 327 |
| Remove (chipsHidden contracts) | −6 |
| Add (ranking unit) | +12 |
| Add (amenity unit) | +6 |
| Add (amenity integration) | +5 |
| Add (service ranking + intent + emptyStateReason) | +13 |
| Add (route corrections) | +4 |
| Add (taxonomy seed extensions) | +3 |
| Add (merchant E2E extensions) | +2 |
| **Estimated post-Plan-1.5 total** | **~360** |

## 7. Risks and trade-offs

### 7.1 Risks

1. **API contract changes are soft-breaking.** No frontend consumes the changed fields yet. Out-of-band consumers (admin scripts, future Phase 4 in development on a parallel branch) might break.
   *Mitigation:* document removals clearly in migration commit and PR description; pre-merge `grep` for `chipsHidden` and `minSubcategoryCountForChips` across all branches/worktrees.

2. **`MIN_REVIEW_COUNT_FOR_RATING_SORT = 3` is a guess.** Too low makes early ratings noisy; too high keeps everything alphabetical too long.
   *Mitigation:* named constant with comment; revise post-launch based on actual review-count distribution.

3. **Default-scope-by-intent surprises borderline categories.** A user looking for a cinema (Out & About → MIXED) might want UK-wide; gets NEARBY+CITY by default. Mitigation via `scopeExpanded` + tier counts.

4. **Auto-expand creates pagination edge case.** Default scope yields fewer than `limit` merchants → frontend gets a short page; must escalate scope to load more. Mitigation via `meta.scopeExpanded=true` signal + clear pagination contract documented in spec.

5. **MIXED behaviour is subtly different from LOCAL only in the DISTANT tier.** Risk of code-review confusion. Mitigation via explicit comments in `ranking.ts` and pin tests showing the divergence.

6. **Intent classification at top-level may not fit all subcategories.** Aesthetics Clinic, Live Venue, etc. might benefit from per-subcategory overrides. Schema supports them; Plan 1.5 doesn't pre-empt.

7. **Migration drops a column.** `Category.minSubcategoryCountForChips` removal is destructive. Mitigation via tested migration on a fresh Neon branch.

### 7.2 Trade-offs accepted

1. Backend owns ranking → no per-user preference customisation. (Personalisation deferred.)
2. Intent on `Category`, not `Merchant`. (Merchant-level intent override is future work.)
3. Helper-only amenity exposure → Phase 4 wires HTTP later. (YAGNI.)
4. Default scope for LOCAL/MIXED requires auto-expand for low-supply users. (Common in low-density areas; well-handled via `scopeExpanded`.)
5. `scope` query param has dual semantics. (Documented clearly in route handler comments and OpenAPI.)
6. Test count grows ~10% (327 → ~363). (Acceptable for foundation correction.)
7. Two ranking helpers (`scope.ts` + `ranking.ts`) instead of one merged file. (Two clear responsibilities.)

## 8. Deferred boundary — what Plan 1.5 explicitly does NOT include

| Deferred concern | Why deferred | Future home |
|---|---|---|
| Personalisation (user preferences, behaviour tracking) | Out of scope per product direction | Future phase, post-Plan 2 |
| Recommendation engine | Out of scope per product direction | Future phase |
| Trending / popularity scoring beyond existing logic | Out of scope per product direction | Future phase |
| Advanced geolocation (drive-time, route-aware) | Out of scope per product direction | Future phase |
| UI/UX design | Plan 2 territory | Plan 2 |
| Featured / curated as ranking signal | Schema doesn't have merchant-attribute level for it yet | Phase 5 (Admin Panel) |
| HTTP endpoint for `getEligibleAmenitiesForSubcategory` | YAGNI — no Plan 1.5 consumer | Phase 4 (Merchant Portal) |
| Customer-facing amenity response changes | Per product direction | Plan 2 / Phase 5 |
| Subcategory-level intent overrides | Schema supports them; seed doesn't pre-populate | Add as specific cases require |
| Quantity caps on `BranchAmenity` | Per product direction — eligibility is the control | Never (UI limits when needed) |
| Filter helpers for "amenities in result set" | Plan 2 territory | Plan 2 |
| Relevance-based reordering of `/categories` rows | Top-levels sorted by `sortOrder` ASC (locked) | Out of scope until product calls for it |
| Plan 1 follow-ups (`recomputeTagCounts` N+1, `primaryCategoryId` guard, `tagIds` length cap, remaining `as any` casts) | Different concerns; bundling would dilute focus | Opportunistic, or a small Plan 1.7 |
| Doha test merchants integration | Explicitly parked on `chore/doha-test-merchants` | After Plan 2 |
| Merchant-level intent override | YAGNI — category-level is sufficient now | Future phase |

### Boundary statement

**Plan 1.5 = backend foundation correction + amenity eligibility data layer.**

Everything user-facing (UI work, customer flow changes) is Plan 2.
Everything intelligent (personalisation, recommendations, trending algorithms) is post-Plan 2.
Everything admin-tooling (amenity CRUD UI, intent classification UI, low-supply alerts) is Phase 5.

This is a tightly-scoped phase that **fixes incorrect logic and lays foundations**, nothing more.

---

## Appendix A — Naming consistency

- **API/service response field removed:** `chipsHidden` (was on `/categories` top-level rows and `/category/:id/merchants` meta envelope).
- **API/service response fields added:** `meta.nearbyCount`, `meta.cityCount`, `meta.distantCount`, `meta.emptyStateReason` (on `/search` and `/category/:id/merchants` meta envelope); `supplyTier` per merchant tile.
- **Schema column dropped:** `Category.minSubcategoryCountForChips`.
- **Schema column added:** `Category.intentType` (nullable, enum).
- **Schema model added:** `CategoryAmenity` (categoryId at any level + amenityId, both ON DELETE CASCADE).
- **Schema FK clarified:** `BranchAmenity.amenityId` made explicit `ON DELETE RESTRICT`.
- **Files added:** `src/api/lib/ranking.ts`, `src/api/lib/amenity.ts`, `prisma/seed-data/amenities.ts` (if not already present), `tests/api/lib/ranking.test.ts`, `tests/api/lib/amenity.test.ts`, `tests/api/customer/amenity-eligibility.test.ts`.
- **Files modified (substantively):** `src/api/customer/discovery/service.ts`, `src/api/customer/discovery/routes.ts`, `prisma/schema.prisma`, `prisma/seed.ts`, related test files.

## Appendix B — Cross-references

- Plan 1: `docs/superpowers/plans/2026-04-28-category-taxonomy-foundation.md`
- Plan 1 spec: `docs/superpowers/specs/2026-04-28-category-taxonomy-design.md`
- Plan 1 PR: MSC23-bot/Redeemo#15
- Memory: `project_supply_aware_visibility_revision.md` (origin of this correction)
- Memory: `project_amenity_eligibility_extension.md` (origin of the amenity eligibility scope)
- Memory: `project_card_display_direction.md` (descriptor on cards, highlights backend-only — preserved through Plan 1.5)
- Memory: `project_post_plan1_direction.md` (Home/Discovery section-by-section QA — Plan 2 territory)
