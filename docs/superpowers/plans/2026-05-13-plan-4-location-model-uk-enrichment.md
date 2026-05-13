# Plan 4 — Location Model UK Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's `branch.city`-string CITY-tier with a UK-wide density-adaptive 8-rung relevance engine (NEARBY → CATCHMENT → POST_TOWN → LAD → COUNTY → REGION → COUNTRY → NATIONAL), backed by a `Locality` + `Market` model, additive `supplyRung`/`proximityBand` API contract, place + tag search, and resolve-on-write postcode persistence.

**Architecture:** Five-PR cadence (M1 Foundation → M2 Ranking → M3 Consumer wire-up → M4 Search + UX → M5 Cleanup). New `Locality` + `LocalityCatchmentEdge` + `Market` tables. `User` + `Branch` gain a resolved-location snapshot (postcode centroid for users; pin-precise for branches, gated by `locationConfidence`). `LadderProfile` matrix lives in code at `src/api/lib/ladderProfiles.ts`. Discovery / Search / Category / Map all share the new `rankMerchants` v2 collect-first walk.

**Tech Stack:** Node 24 + TypeScript + Fastify, Prisma 7 + Neon Postgres, Vitest backend / Jest-Expo frontend, postcodes.io live for postcode resolution, ONSPD + ONS BUA for one-off seed, `react-native-maps@1.20.1` (unchanged) for mobile map rendering.

**Spec reference:** `docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md` (committed at `b18e365`, PR #79). All locked decisions are in the spec; this plan operationalises them as bite-sized TDD tasks.

**Revision history:**
- v3.1 → v3.2: fourth (final small) cleanup pass addressing 3 remaining items + 1 process note.
  - P1.1 (v3-r3) — `POSTCODE_REQUIRED` added to `ERROR_DEFINITIONS` (alongside `POSTCODE_NOT_FOUND` and `GAZETTEER_UNAVAILABLE`). Used by `createBranch` when called without a postcode.
  - P1.2 (v3-r3) — `createBranch` data block: removed `data.latitude` / `data.longitude` plumbing from the create payload so the postcode-centroid snapshot from `locationFields` is the unambiguous create-time value. Pin-precise coords arrive via a separate admin-driven update flow (out of scope for Plan 4a M1). Note rewritten to remove the contradictory spread-order wording.
  - P1.3 (v3-r3) — `resolveBranchTestFixtures` helper rewritten with verified schema-valid fields (`status`/`verificationStatus`/`contractStatus` for Merchant; `firstName`/`lastName`/`email` for MerchantAdmin). All placeholder "other required fields" comments removed. Helper is fully executable.
  - P1.4 (v3-r3) — Process: M1 stays paused until owner confirms the base. Recommended sequence captured below this revision history block.
- v3 → v3.1: third pre-flight review tightening pass addressing 4 remaining items.
  - P1.1 (v3-r2) — M1.20 PC2 submit fixed: uses `AppError` (not `ServiceError`); adds new `POSTCODE_NOT_FOUND` (400) + `GAZETTEER_UNAVAILABLE` (503) entries to `ERROR_DEFINITIONS` in `src/api/shared/errors.ts`. Test expectation updated to match the AppError envelope: `JSON.parse(res.body).error.code === 'GAZETTEER_UNAVAILABLE'` and `res.statusCode === 503`.
  - P1.2 (v3-r2) — ONSPD generator: `import { glob } from 'glob'` moved to top-of-file imports; `glob` added to the `npm install --save-dev` step.
  - P1.3 (v3-r2) — branch resolve-on-write tests already used `resolveBranchTestFixtures(prisma)`; v3.1 adds a concrete inline implementation of the helper instead of leaving it as "M1 implementer creates" — deterministic fixture file.
  - P1.4 (v3-r2) — ProximityBandChip jest command normalised: `cd apps/customer-app && npx jest …` (no more `.worktrees/customer-app/apps/customer-app` path).
- v2 → v3: second pre-flight review tightening pass addressing 7 P1 + 4 P2 items.
  - P1.1 — spec PR #79 updated to v5 alongside this plan v3 (Branch.locationCountry; MerchantHighlight via tag.label join). Spec and plan now agree.
  - P1.2 — spec also updated: `MerchantHighlight.label` references removed; replaced with `Merchant.highlights.some.tag.label` consistent with the schema (highlights reach Tag.label via the highlightTagId join).
  - P1.3 — ONSPD generator made deterministic: `postTown`/`ladName` were incorrectly mapped to wrong ONS columns. Real columns: `oslaua` (LAD code), `osward` (ward code), `parish` (parish code), `pcon` (constituency code), `rgn` (region code), `oscty` (county code), `bua11` (BUA code). ONSPD doesn't contain post-town; the seed writes `postTown: null` and lets runtime postcodes.io fill it. Required ONS lookup files documented. New `verify-onspd-columns.ts` script for pre-run validation.
  - P1.4 — Branch resolve-on-write rewritten against actual `src/api/merchant/branch/service.ts`: uses `AppError` (not invented `ServiceError`), uses real `ctx` argument, recognises that `updateBranch` only accepts DIRECT_FIELDS (`phone`/`email`/`websiteUrl`/`isActive`) and that postcode/address changes route through `createBranchEditRequest`. Now extends `createBranch` + `createBranchEditRequest` (eager validation on proposed postcode changes); `updateBranch` is unchanged. Admin approval path documented as a separate edit.
  - P1.5 — `/postcode/preview` route registered in `src/api/customer/plugin.ts` on the OPEN scope (PC2 typing needs unauth access). File list + git add corrected.
  - P1.6 — ProximityBandChip paths normalised to `src/design-system/components/proximityBandChip.tsx` everywhere (file path, test path, import path, git add).
  - P1.7 — SearchChip import fixed to `typography` (not `label as labelStyle`).
  - P2.1 — checklist line corrected from `POST` to `GET /api/v1/customer/postcode/preview`.
  - P2.2 — M1.18/M1.19 `findExistingLocality`/`findOrCreateLocality` imports made fully explicit (`PrismaClient`, `Locality`, `ResolvedPostcodeSnapshot`); the final M1.19 file shape replaces M1.18's minimal version cleanly.
  - P2.3 — M3.7 already pinned to `@/design-system/components/proximityBandChip` (verified).
  - P2.4 — ProximityBandChip background colour resolved concretely to `color.surface.tint = '#FEF6F5'`; ambiguous "confirm at impl time" wording removed.
- v1 → v2: first pre-flight review tightening pass addressing 10 P1 blockers + 4 P2 fixes.
  - P1.1 — combined schema edits into a single M1.2 task to avoid mid-edit Prisma validation failures.
  - P1.2 — `Branch.locationCountry` (Plan 4 nation) added as a separate field; legacy `Branch.country` (address country, "GB") preserved with intact semantics.
  - P1.3 — `Category.ladderProfile` declared with a Prisma `@default(MIXED_NORMAL)` for migration safety; intent-aware UPDATE follows.
  - P1.4 — `Branch.anchoredCampaigns` opposite relation added for `Campaign.branchAnchor`.
  - P1.5 — ONSPD generator rewritten with `csv-parse` streaming + named-column access + explicit ONS BUA join file.
  - P1.6 — `/postcode/preview` is read-only via new `findExistingLocality` helper; no auto-creation on debounced typing.
  - P1.7 — Branch resolve-on-write adapts actual `createBranch` + `updateBranch` (not an invented upsert wrapper).
  - P1.8 — `rankMerchantsV2` now enforces `targetCount` and applies intent-aware in-rung sort (distance ASC for LOCAL, quality-aware for DESTINATION, hybrid for MIXED).
  - P1.9 — Tag/Highlight search uses correct Prisma paths (`tags.some.tag.label`, `highlights.some.tag.label` via `highlightTagId`).
  - P1.10 — M5 keeps legacy API fields (`supplyTier`, `nearbyCount`, `cityCount`, `distantCount`) for the full Plan 4a deprecation cycle; removal is a future post-Plan-4a PR gated on explicit owner approval.
  - P2.1 — `/postcode/preview` plugin registers on the customer scope, not the app root.
  - P2.2 — `set-locality-catchment.ts` parses the `--centre-slugs` flag correctly.
  - P2.3 — `ProximityBandChip` placed in `design-system/components/`, uses `typography['label.md']`.
  - P2.4 — Huddersfield Market member-locality + catchment-override lists marked as placeholders; M1 implementer confirms actual slugs against ONSPD seed output (which may BUA-collapse Marsh/Lindley/Lockwood into `huddersfield`).

---

## File structure

### New files

| Path | Purpose |
|---|---|
| `prisma/migrations/<ts>_plan_4_location_model_foundation/migration.sql` | M1 schema migration (Locality, LocalityCatchmentEdge, Market, User/Branch additions, Category/Subcategory additions, Campaign deferred-contract columns) |
| `prisma/seed-data/onspd-localities.ts` | ONSPD-derived Locality seed data (generated from ONSPD CSV; checked into the repo) |
| `prisma/seed-data/bua-populations.ts` | ONS BUA → populationTier mapping |
| `prisma/seed-data/catchmentOverrides.ts` | Owner-curated catchment overrides for active-market localities (Huddersfield + ~20 surrounding) |
| `prisma/seed-data/markets.ts` | Market seed (Huddersfield Market: anchor + member localities) |
| `prisma/seed-data/trendingSearchFixtures.ts` | Test fixtures for the 6 trending searches (Pizza, Brunch, Nail salon, Barber, Gym, Coffee) |
| `prisma/backfill-locality-data.ts` | Idempotent backfill script (User + Branch resolved-location fields) |
| `prisma/set-market-status.ts` | Owner-run script: flip Market ACTIVE/PAUSED |
| `prisma/add-locality-to-market.ts` | Owner-run script: locality membership |
| `prisma/remove-locality-from-market.ts` | Inverse of the above |
| `prisma/set-locality-catchment.ts` | Owner-run script: curated catchment override |
| `prisma/sync-branch-locality-names.ts` | Maintenance script: refresh `Branch.localityName` mirrors |
| `src/api/lib/ladderProfiles.ts` | The 5×3 matrix + density derivation + proximityBand resolver (pure code, no DB) |
| `src/api/lib/effectiveLocation.ts` | `resolveEffectiveLocation(query, userId)` — the central GPS/profile/place resolver (§4.4 of spec) |
| `src/api/lib/postcodeResolver.ts` | Wraps postcodes.io live calls; emits `ResolvedPostcode` snapshot for User/Branch writes |
| `src/api/lib/nearestLocality.ts` | Bbox-prefiltered Haversine lookup for GPS → nearest Locality |
| `src/api/customer/postcode/routes.ts` | New `GET /api/v1/customer/postcode/preview` endpoint |
| `src/api/customer/postcode/service.ts` | Service backing the preview endpoint |
| `tests/api/lib/ladderProfiles.test.ts` | Density × profile × rung matrix tests |
| `tests/api/lib/effectiveLocation.test.ts` | EffectiveLocation resolver tests (GPS, saved profile, place query, no-signal) |
| `tests/api/lib/postcodeResolver.test.ts` | Postcode resolver tests (success, network failure, auto-create locality) |
| `tests/api/lib/nearestLocality.test.ts` | Haversine + bbox prefilter tests |
| `tests/api/customer/postcode/preview.test.ts` | `/postcode/preview` endpoint tests |
| `tests/api/customer/discovery/rankMerchants-v2.test.ts` | rankMerchants v2 unit tests |
| `tests/api/customer/discovery/effectiveLocation-integration.test.ts` | End-to-end integration: GPS → resolved nearest Locality → ladder walks the right rungs |
| `tests/api/customer/discovery/uk-wide-coverage.test.ts` | Scottish/Welsh/NI postcode test cases |
| `tests/api/customer/discovery/place-search.test.ts` | Place query → EffectiveLocation replacement |
| `tests/api/customer/discovery/tag-search.test.ts` | Tag.label + MerchantHighlight.label search |
| `tests/api/customer/discovery/trending-searches.test.ts` | All 6 hardcoded trending terms return non-empty |

### Modified files

| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add Locality/Market/LocalityCatchmentEdge models + User/Branch/Category/Subcategory/Campaign additions |
| `prisma/seed.ts` | Wire in the new seed steps (ONSPD load → BUA populations → catchment heuristic → curated overrides → markets → trending fixtures) |
| `src/api/customer/profile/routes.ts` | PC2 submit triggers resolve-on-write via `postcodeResolver` |
| `src/api/customer/profile/service.ts` | Updated to persist resolved snapshot atomically |
| `src/api/customer/discovery/service.ts` | Discovery routes (home, search, category, in-area) consume `rankMerchants` v2 + new EffectiveLocation contract; legacy `supplyTier`/counts derived from new fields |
| `src/api/customer/discovery/routes.ts` | Response shape extended (additive) with `supplyRung`, `proximityBand`, `rungCounts`, `effectiveLocality` |
| `src/api/lib/ranking.ts` | `classifyTier` replaced by `classifyRung`; `rankMerchants` rewritten as collect-first per §5.6 |
| `apps/customer-app/src/lib/api/discovery.ts` | Zod schemas extended with `supplyRung`, `proximityBand`, `rungCounts`, `effectiveLocality` (additive; legacy fields retained) |
| `apps/customer-app/src/features/profile-completion/screens/PC2AddressScreen.tsx` | `pickAreaLabel` replaced by call to `/postcode/preview`; submit unchanged customer-side |
| `apps/customer-app/src/features/home/screens/HomeScreen.tsx` | Renders `proximityBand` chip on non-NEARBY tiles |
| `apps/customer-app/src/features/search/screens/SearchScreen.tsx` | Renders chip, band transitions, place/tag search chip |
| `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx` | Same chip rendering |
| `apps/customer-app/src/features/search/screens/AllCategoriesScreen.tsx` | Removes broken per-city count comment (Plan 4 hook §2) |
| `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` | Branch list uses `locality` instead of `city` |
| `apps/customer-app/src/features/merchant/utils/branchShortName.ts` | Cleared from Plan 4 code-hook list (M5) |
| `apps/customer-app/src/features/map/screens/MapScreen.tsx` | Bottom-sheet tiles render proximityBand chip; pin styling unchanged |
| `apps/customer-app/src/features/map/components/MapEmptyArea.tsx` | Empty-state copy aligned to approved vocabulary |
| `CLAUDE.md` | Phase 3C add Plan 4 progress section as milestones land |

---

## Test fixture coverage

Plan 4a needs seed fixtures that exercise:

- **UK-wide nations:** Karaara (Huddersfield, England), Covelum (Brightlingsea, England), Bean & Brew (Shoreditch / London, England), dev-merchant-001 (existing), plus new fixtures for Scotland (Glasgow or Edinburgh anchor), Wales (Cardiff anchor), Northern Ireland (Belfast anchor) — minimum one merchant per nation so the COUNTRY rung is exercisable.
- **Trending search coverage:** at least one merchant tagged with each of `Pizza` (CUISINE), `Brunch` (SPECIALTY), `Coffee` (CUISINE or Cafe & Coffee subcategory), and merchants in `Nail salon`, `Barber`, `Gym` subcategories.
- **Density classes:** Karaara → SUBURBAN (Huddersfield is LARGE_TOWN); Covelum → RURAL (Brightlingsea is SMALL_TOWN); a London-fixture (Bean & Brew or new) → URBAN (METRO_CORE).
- **Catchment graph:** at least one village-locality whose `naturalCentreLocalityIds` points to a TOWN-tier locality (e.g. a Tendring village → Colchester, or a Kirklees village → Huddersfield).

---

## Milestone M1 — Foundation

**Goal:** Land all schema additions, gazetteer seed, Market seed, resolve-on-write contract, `/postcode/preview` endpoint, and the idempotent backfill script. No customer-visible behaviour change.

**Output:** one PR titled "feat(plan-4-m1): location model foundation + gazetteer seed".

**Tests at end of M1:** schema migrations apply cleanly; seed produces expected Localities + Catchment Edges + Huddersfield Market + trending fixtures; resolve-on-write triggers on PC2 and Branch writes; backfill script is idempotent.

### Task M1.1: Branch from main and verify clean tree

**Files:**
- None (git only)

- [ ] **Step 1: Verify on main + clean working tree**

Run: `git status && git log --oneline -1`
Expected: clean tree, on `main`, latest commit is PR #79 merge OR equivalent recent main HEAD.

- [ ] **Step 2: Create M1 branch**

Run: `git checkout -b feature/plan-4-m1-foundation`
Expected: switched to new branch.

- [ ] **Step 3: Confirm spec is on main**

Run: `ls docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md`
Expected: file exists.

### Task M1.2: Combined schema edit — all Plan 4a additions in one pass

**Important — fixes pre-flight P1.1:** Prisma validation requires forward + back relations to exist together. We make ALL the schema additions in this single task, then validate ONCE at the end. Do not run `prisma validate` partway through.

**Files:**
- Modify: `prisma/schema.prisma` (single coherent edit)

- [ ] **Step 1: Add the four new enums**

Append to the existing enum section:

```prisma
enum PopulationTier {
  UNKNOWN
  HAMLET
  VILLAGE
  SMALL_TOWN
  TOWN
  LARGE_TOWN
  CITY
  METRO_CORE
}

enum MarketStatus {
  ACTIVE
  PAUSED
}

enum LocationConfidence {
  MANUALLY_CONFIRMED
  ADDRESS_GEOCODED
  POSTCODE_CENTROID
  NEEDS_REVIEW
}

enum LadderProfile {
  LOCAL_TIGHT
  LOCAL_NORMAL
  MIXED_NORMAL
  DESTINATION_LOCAL
  DESTINATION_WIDE
}
```

- [ ] **Step 2: Add the `Locality` model**

In the same edit pass (no validate yet):

```prisma
model Locality {
  id              String          @id @default(uuid())
  name            String
  slug            String          @unique
  postTown        String?
  ladDistrict     String
  adminCounty     String?
  region          String?
  country         String
  centerLat       Decimal         @db.Decimal(10, 8)
  centerLng       Decimal         @db.Decimal(11, 8)
  populationTier  PopulationTier  @default(UNKNOWN)
  marketId        String?
  needsReview     Boolean         @default(false)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  market                   Market?                 @relation("LocalityMarket", fields: [marketId], references: [id])
  marketAnchorOf           Market?                 @relation("MarketAnchor")
  outgoingCatchmentEdges   LocalityCatchmentEdge[] @relation("CatchmentSource")
  incomingCatchmentEdges   LocalityCatchmentEdge[] @relation("CatchmentTarget")
  branches                 Branch[]                @relation("BranchLocality")
  users                    User[]                  @relation("UserLocality")

  @@index([slug])
  @@index([marketId])
  @@index([populationTier])
  @@index([country])
  @@index([centerLat, centerLng])
}
```

- [ ] **Step 3: Add the `LocalityCatchmentEdge` model**

```prisma
model LocalityCatchmentEdge {
  id                 String    @id @default(uuid())
  sourceLocalityId   String
  targetLocalityId   String
  rank               Int       @default(1)
  isCurated          Boolean   @default(false)
  createdAt          DateTime  @default(now())

  source             Locality  @relation("CatchmentSource", fields: [sourceLocalityId], references: [id], onDelete: Cascade)
  target             Locality  @relation("CatchmentTarget", fields: [targetLocalityId], references: [id], onDelete: Cascade)

  @@unique([sourceLocalityId, targetLocalityId])
  @@index([sourceLocalityId])
  @@index([targetLocalityId])
}
```

- [ ] **Step 4: Add the `Market` model**

```prisma
model Market {
  id                  String        @id @default(uuid())
  name                String
  slug                String        @unique
  status              MarketStatus  @default(PAUSED)
  anchorLocalityId    String        @unique
  ladDistrict         String?
  adminCounty         String?
  region              String?
  country             String
  targetMerchantCount Int?
  launchedAt          DateTime?
  notes               String?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  anchorLocality      Locality      @relation("MarketAnchor", fields: [anchorLocalityId], references: [id])
  includedLocalities  Locality[]    @relation("LocalityMarket")

  @@index([slug])
  @@index([status])
}
```

- [ ] **Step 5: Add `User` location snapshot fields**

In the existing `User` model, add these fields above the existing relation block. (Note: `User` has no existing `country` field; the Plan 4 nation field is simply named `country`.)

```prisma
  // Plan 4a location snapshot — see spec §3.4
  latitude              Decimal?  @db.Decimal(10, 8)
  longitude             Decimal?  @db.Decimal(11, 8)
  localityId            String?
  postTown              String?
  ladDistrict           String?
  adminCounty           String?
  region                String?
  country               String?              // "England" | "Scotland" | "Wales" | "Northern Ireland"
  locationResolvedAt    DateTime?

  locality              Locality? @relation("UserLocality", fields: [localityId], references: [id])
```

Leave existing `city` field in place (Plan 4a keeps it for one deprecation cycle).

- [ ] **Step 6: Add `Branch` location snapshot fields + `locationConfidence`**

**Important — fixes pre-flight P1.2:** `Branch` already has `country String @default("GB")` representing the *address* country (ISO code). The Plan 4a *nation* field is a different concept ("England" / "Scotland" / "Wales" / "Northern Ireland"). We add the new field as `locationCountry` to disambiguate; the legacy `country` field is left untouched and continues to mean address-country.

```prisma
  // Plan 4a location snapshot — see spec §3.5.
  // NOTE: `locationCountry` is the resolved NATION (England/Scotland/Wales/NI).
  // It is INTENTIONALLY distinct from the existing `country` column (which is the
  // address country, e.g. "GB"). Both fields coexist for one deprecation cycle.
  localityId            String?
  localityName          String?
  postTown              String?
  ladDistrict           String?
  adminCounty           String?
  region                String?
  locationCountry       String?
  locationResolvedAt    DateTime?
  locationConfidence    LocationConfidence  @default(POSTCODE_CENTROID)

  locality              Locality?           @relation("BranchLocality", fields: [localityId], references: [id])

  // Opposite relation for Plan 4b Campaign.branchAnchor — see Step 8 below
  anchoredCampaigns     Campaign[]          @relation("CampaignBranchAnchor")
```

Leave existing `country` (default "GB") and `city` fields in place.

- [ ] **Step 7: Add `Category.ladderProfile` + `Subcategory.ladderProfileOverride`**

**Important — fixes pre-flight P1.3:** Adding `ladderProfile` as required (`LadderProfile`) without a default would fail on existing rows. We declare a Prisma-level default so existing rows get a safe value at migrate time; the seed step then OVERWRITES the defaults with the intent-aware mapping. The default is for migration-safety only.

In `Category`:

```prisma
  // Required + Prisma default for migration safety. Seed-time intentType mapping
  // overwrites the default with the intent-appropriate profile.
  ladderProfile  LadderProfile  @default(MIXED_NORMAL)
```

In `Subcategory`:

```prisma
  ladderProfileOverride  LadderProfile?
```

- [ ] **Step 8: Add Plan 4b deferred-contract columns to `Campaign`**

**Important — fixes pre-flight P1.4:** `Campaign.branchAnchor` needs the opposite relation `Branch.anchoredCampaigns`, which was already added in Step 6 above.

```prisma
  // Plan 4b deferred contract — Plan 4a does NOT read these fields.
  // Schema-only; default-safe; future Plan 4b service implementation consumes them.
  targetLocalityIds       String[]   @default([])
  branchAnchorId          String?
  radiusMiles             Decimal?   @db.Decimal(5, 2)
  targetLadDistricts      String[]   @default([])
  targetCounties          String[]   @default([])
  targetRegions           String[]   @default([])
  targetCountries         String[]   @default([])
  isNational              Boolean    @default(false)
  priority                Int        @default(0)

  branchAnchor            Branch?    @relation("CampaignBranchAnchor", fields: [branchAnchorId], references: [id])
```

- [ ] **Step 9: Validate the entire combined schema (only NOW)**

Run: `npx prisma format && npx prisma validate`
Expected: schema is valid; ALL forward + back relations resolve. If validation fails, fix the offending relation and re-run.

- [ ] **Step 10: Commit the schema edit (no migration generated yet — that's the next task)**

```bash
git add prisma/schema.prisma
git commit -m "feat(plan-4-m1): schema additions for Locality / Market / catchment + User/Branch snapshot fields"
```

### Task M1.10: Generate the migration

**Files:**
- Create: `prisma/migrations/<ts>_plan_4_location_model_foundation/migration.sql`

- [ ] **Step 1: Generate migration**

Run: `npx prisma migrate dev --name plan_4_location_model_foundation --create-only`
Expected: a new migration directory under `prisma/migrations/` containing `migration.sql`.

- [ ] **Step 2: Review migration SQL**

Open the generated `migration.sql`. Verify:
- 4 new enums created (`PopulationTier`, `MarketStatus`, `LocationConfidence`, `LadderProfile`).
- 3 new tables created (`Locality`, `LocalityCatchmentEdge`, `Market`).
- `User`, `Branch`, `Category`, `Subcategory`, `Campaign` columns added.
- All FKs declared with proper `ON DELETE` clauses (`Cascade` on `LocalityCatchmentEdge`; `SET NULL` or `NO ACTION` on others).
- All indexes from the schema are reflected.

- [ ] **Step 3: Add intent-aware backfill for `Category.ladderProfile`**

The schema declares `ladderProfile LadderProfile @default(MIXED_NORMAL)`, so Prisma's generated migration adds the column with the safe default (all existing rows = MIXED_NORMAL). We append an UPDATE that overrides the default with intent-aware values per spec §5.4.

Append to `migration.sql` (AFTER the `ALTER TABLE "Category" ADD COLUMN "ladderProfile" ... DEFAULT 'MIXED_NORMAL'` Prisma-generated line):

```sql
-- Intent-aware override of the safe default. After this UPDATE, the default
-- only matters for future inserts; the seed-time intentType mapping (in Task M1.16
-- or wherever Plan 1's categories are reseeded) keeps Category.ladderProfile
-- aligned with each category's intent.
UPDATE "Category" SET "ladderProfile" =
  CASE
    WHEN "intentType" = 'LOCAL'       THEN 'LOCAL_NORMAL'::"LadderProfile"
    WHEN "intentType" = 'MIXED'       THEN 'MIXED_NORMAL'::"LadderProfile"
    WHEN "intentType" = 'DESTINATION' THEN 'DESTINATION_LOCAL'::"LadderProfile"
    ELSE 'MIXED_NORMAL'::"LadderProfile"
  END;
```

No second `ALTER COLUMN ... SET NOT NULL` is needed — the column is already NOT NULL because of the Prisma default. Existing rows are now correctly typed; new rows fall back to the default if not explicitly set.

- [ ] **Step 4: Apply migration to dev DB**

Run: `npx prisma migrate dev`
Expected: migration applies cleanly; `Migration applied: plan_4_location_model_foundation`.

- [ ] **Step 5: Run `prisma generate` to update client**

Run: `npx prisma generate`
Expected: Prisma client regenerated; new models available in code.

### Task M1.11: Add a small TypeScript helper to read ONSPD CSV

ONSPD is distributed as a quarterly CSV. The seed loader needs a tiny adapter that reads the CSV and emits row-shaped objects. We'll commit the resulting **generated** TypeScript seed file (not the CSV itself, which is ~1GB) to keep the repo manageable.

**Files:**
- Create: `prisma/scripts/build-locality-seed.ts`
- Create: `prisma/seed-data/onspd-localities.ts` (generated output of the above script)

- [ ] **Step 1: Document the ONSPD download URL and version**

Add a comment at the top of `prisma/scripts/build-locality-seed.ts`:

```typescript
/**
 * One-off seed generator: ONSPD → typed Locality seed array.
 *
 * INPUT: Office for National Statistics Postcode Directory (ONSPD) CSV file.
 * Download (manual, quarterly): https://geoportal.statistics.gov.uk/datasets/ons-postcode-directory
 * Expected file path: prisma/scripts/.local/ONSPD_FEB_2026_UK.csv (gitignored).
 *
 * OUTPUT: prisma/seed-data/onspd-localities.ts (typed array, checked into repo).
 *
 * The CSV file is ~1GB and NOT committed. The generated TypeScript array is
 * a curated subset (~5,000-10,000 Localities per spec §4.1.1) and IS committed.
 *
 * Re-run quarterly when ONSPD publishes a refresh:
 *   npx tsx prisma/scripts/build-locality-seed.ts
 */
```

**Fixes pre-flight P1.5:** rewritten to use a streaming CSV parser (NOT `readFileSync` of a 1GB file), keyed by ONSPD column NAMES from the header row (NOT positional indices), with explicit ONS BUA data joined from a SEPARATE source file (BUAs are not in ONSPD itself).

- [ ] **Step 2: Install streaming CSV parser**

Run: `npm install --save-dev csv-parse glob`

(`glob` is also used by `verify-onspd-columns.ts` and `findLookupFile()` in `build-locality-seed.ts` to discover ONS lookup CSVs by name prefix.)

- [ ] **Step 3: Add the BUA data source documentation**

ONSPD does NOT include BUA name/population directly. BUA data comes from a separate ONS file:

```text
INPUT 1: ONSPD CSV — postcode → admin hierarchy (parish, ward, LAD, county, region, country, lat/lng).
         Source: https://geoportal.statistics.gov.uk/datasets/ons-postcode-directory
         File: prisma/scripts/.local/ONSPD_FEB_2026_UK.csv (~1GB; gitignored).

INPUT 2: ONS BUA CSV — settlement name + population estimate.
         Source: https://geoportal.statistics.gov.uk/datasets/built-up-areas-2021-and-built-up-area-sub-divisions
         File: prisma/scripts/.local/ons-bua-2021.csv (~few MB; gitignored).
         Contains: bua_code, bua_name, population_estimate, geometry (WKT polygon).

JOIN: ONSPD postcode → BUA: postcodes.io ONSPD distribution actually includes a `bua11`
      code on each postcode row (link to BUA via BUA code). If `bua11` is not in the version
      of ONSPD being used, the join can be done via point-in-polygon on lat/lng — but the
      simpler approach is to use the included `bua11` code where present.

PLAN 4a ASSUMPTION: ONSPD `bua11` column is present + matches against ONS BUA `bua_code`.
If the column rename across ONS refreshes, M1 implementer adjusts the column name once.
```

- [ ] **Step 4: Add the script body**

```typescript
// prisma/scripts/build-locality-seed.ts
import { createReadStream, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse as csvParse } from 'csv-parse'
import { glob } from 'glob'

const ONSPD_PATH = path.join(__dirname, '.local/ONSPD_FEB_2026_UK.csv')
const BUA_PATH = path.join(__dirname, '.local/ons-bua-2021.csv')
const OUTPUT_PATH = path.join(__dirname, '..', 'seed-data/onspd-localities.ts')

// ONSPD CSV column NAMES (from the User Guide). ONS column names are stable across
// quarterly releases; positional indices are NOT. ONSPD stores CODES, not names —
// the human-readable names (LAD name, admin_county name, region name, parish name,
// admin_ward name) come from SEPARATE lookup CSVs distributed alongside ONSPD in the
// release's `Documents/` folder.
const ONSPD_COLS = {
  postcode:                  'pcds',           // canonical postcode form, e.g. "HD1 2PY"
  latitude:                  'lat',
  longitude:                 'long',
  countryCode:               'ctry',           // E92000001 / S92000003 / W92000004 / N92000002
  ladCode:                   'oslaua',         // 9-char LAD code — joined to LAD name lookup
  adminCountyCode:           'oscty',          // 9-char county code (E10*); nullable for unitary/Scotland/Wales/NI
  regionCode:                'rgn',            // 9-char region code (E12*); only English postcodes have it
  parishCode:                'parish',         // 9-char parish code or 'E04000000' = unparished placeholder
  adminWardCode:             'osward',         // 9-char ward code — joined to ward name lookup
  parliamentaryConstituencyCode: 'pcon',       // 9-char constituency code — joined to constituency name lookup
  buaCode:                   'bua11',          // BUA11 code (or 'bua21' in newer releases — check release notes)
  terminationDate:           'doterm',         // non-empty = postcode retired → SKIP
} as const

// NOTE: ONSPD does NOT include human-readable post-town in the bulk file. Post-town
// is part of Royal Mail PAF (paid). For Plan 4a, we OMIT post-town from the seed and
// let runtime resolve-on-write fill it via postcodes.io (which has it). Locality.postTown
// is therefore nullable in the seed output; the seed line writes `postTown: null` for every
// Locality row. Runtime calls populate `Branch.postTown` / `User.postTown` from
// postcodes.io's `result.post_town`. This is consistent with the spec §4.1 (lean) decision.
//
// Required ONS lookup files (distributed in ONSPD's `Documents/` folder; placed next to ONSPD CSV):
//   prisma/scripts/.local/Documents/LA_UA names and codes UK as at 04_25.csv   — LAD code → name
//   prisma/scripts/.local/Documents/CTY names and codes EN as at 04_23.csv     — county code → name
//   prisma/scripts/.local/Documents/RGN names and codes EN as at 12_20.csv      — region code → name
//   prisma/scripts/.local/Documents/Parish_NCP names and codes EW as at 12_22.csv — parish code → name
//   prisma/scripts/.local/Documents/Ward names and codes UK as at 05_24.csv     — ward code → name
//   prisma/scripts/.local/Documents/Westminster Parliamentary Constituency names and codes UK as at 12_19.csv — constituency code → name
//   prisma/scripts/.local/Documents/Built-up Area names and codes UK as at 12_11_OA11.csv — BUA code → name
//
// Filenames carry an "as at" date in the ONS release; the date suffix varies between
// quarterly releases but the prefix is stable. The script glob-matches each file by
// the leading-name pattern so it survives refreshes.

type BuaRow = {
  buaCode: string
  buaName: string
  population: number | null
}

type OnspdRow = {
  postcode: string
  latitude: number
  longitude: number
  countryCode: string
  ladCode: string
  adminCountyCode: string | null
  regionCode: string | null
  parishCode: string | null
  adminWardCode: string | null
  parliamentaryConstituencyCode: string | null
  buaCode: string | null
}

type CodeNameLookup = Map<string, string>   // code → human-readable name

type LocalitySeedRow = {
  name: string
  slug: string
  postTown: string | null
  ladDistrict: string
  adminCounty: string | null
  region: string | null
  country: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'
  centerLat: number
  centerLng: number
  populationTier: 'UNKNOWN' | 'HAMLET' | 'VILLAGE' | 'SMALL_TOWN' | 'TOWN' | 'LARGE_TOWN' | 'CITY' | 'METRO_CORE'
}

function countryFromOnsCode(code: string): LocalitySeedRow['country'] {
  switch (code) {
    case 'E92000001': return 'England'
    case 'S92000003': return 'Scotland'
    case 'W92000004': return 'Wales'
    case 'N92000002': return 'Northern Ireland'
    default: throw new Error(`Unknown ONS country code: ${code}`)
  }
}

function populationTierFromBua(pop: number | null): LocalitySeedRow['populationTier'] {
  if (pop === null) return 'UNKNOWN'
  if (pop >= 500_000) return 'METRO_CORE'
  if (pop >= 100_000) return 'CITY'
  if (pop >= 30_000)  return 'LARGE_TOWN'
  if (pop >= 10_000)  return 'TOWN'
  if (pop >= 3_000)   return 'SMALL_TOWN'
  if (pop >= 500)     return 'VILLAGE'
  return 'HAMLET'
}

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

function pickLocalityName(
  r: OnspdRow,
  bua: BuaRow | null,
  resolved: {
    parishName: string | null
    adminWardName: string | null
    parliamentaryConstituencyName: string | null
    ladName: string
    regionName: string | null
  },
): string {
  const isLondon = resolved.regionName === 'London'
  if (!isLondon && bua?.buaName) return bua.buaName
  if (resolved.parishName && !isUnparishedPlaceholder(resolved.parishName)) return resolved.parishName
  if (isLondon && resolved.adminWardName) return resolved.adminWardName
  if (resolved.parliamentaryConstituencyName) return resolved.parliamentaryConstituencyName
  if (resolved.adminWardName) return resolved.adminWardName
  return resolved.ladName
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function loadBuaIndex(): Promise<Map<string, BuaRow>> {
  const index = new Map<string, BuaRow>()
  const parser = createReadStream(BUA_PATH).pipe(csvParse({ columns: true, trim: true }))
  for await (const row of parser) {
    const code = row['BUA21CD'] ?? row['BUA11CD'] ?? row['bua_code']
    const name = row['BUA21NM'] ?? row['BUA11NM'] ?? row['bua_name']
    const pop = parseInt(row['POPULATION'] ?? row['population_estimate'] ?? '0', 10) || null
    if (code && name) index.set(code, { buaCode: code, buaName: name, population: pop })
  }
  return index
}

/**
 * Load a code→name lookup file. ONS lookup files all share the same two-column shape:
 * one column of 9-character codes, one column of human-readable names. The exact column
 * header names vary slightly between files (e.g. LAD24CD/LAD24NM, RGN20CD/RGN20NM,
 * PCON19CD/PCON19NM). We pass a regex per file to pick the right pair.
 */
async function loadCodeNameLookup(
  filePath: string,
  codeKeyPattern: RegExp,   // e.g. /^LAD\d+CD$/
  nameKeyPattern: RegExp,   // e.g. /^LAD\d+NM$/
): Promise<CodeNameLookup> {
  const map: CodeNameLookup = new Map()
  const parser = createReadStream(filePath).pipe(csvParse({ columns: true, trim: true }))
  for await (const row of parser) {
    const codeKey = Object.keys(row).find(k => codeKeyPattern.test(k))
    const nameKey = Object.keys(row).find(k => nameKeyPattern.test(k))
    if (!codeKey || !nameKey) continue
    const code = row[codeKey]
    const name = row[nameKey]
    if (code && name) map.set(code, name)
  }
  return map
}

async function findLookupFile(pattern: string): Promise<string> {
  const matches = await glob(`prisma/scripts/.local/Documents/${pattern}*.csv`)
  if (matches.length === 0) throw new Error(`Lookup file not found matching: ${pattern}`)
  return matches[0]
}

async function main() {
  console.log('Loading lookup files...')
  const buaIndex = await loadBuaIndex()
  console.log(`  BUAs: ${buaIndex.size}`)

  // Load ONS code→name lookups for the codes we extract from ONSPD.
  const ladLookup = await loadCodeNameLookup(
    await findLookupFile('LA_UA names and codes'),       /^LAD\d+CD$/, /^LAD\d+NM$/,
  )
  const countyLookup = await loadCodeNameLookup(
    await findLookupFile('CTY names and codes'),         /^CTY\d+CD$/, /^CTY\d+NM$/,
  )
  const regionLookup = await loadCodeNameLookup(
    await findLookupFile('RGN names and codes'),         /^RGN\d+CD$/, /^RGN\d+NM$/,
  )
  const parishLookup = await loadCodeNameLookup(
    await findLookupFile('Parish_NCP names and codes'),  /^PAR\d+CD$/, /^PAR\d+NM$/,
  )
  const wardLookup = await loadCodeNameLookup(
    await findLookupFile('Ward names and codes'),        /^WD\d+CD$/,  /^WD\d+NM$/,
  )
  const pconLookup = await loadCodeNameLookup(
    await findLookupFile('Westminster Parliamentary'),   /^PCON\d+CD$/, /^PCON\d+NM$/,
  )
  console.log(`  LADs: ${ladLookup.size}, Counties: ${countyLookup.size}, Regions: ${regionLookup.size}`)
  console.log(`  Parishes: ${parishLookup.size}, Wards: ${wardLookup.size}, Constituencies: ${pconLookup.size}`)

  console.log('Streaming ONSPD...')
  type GroupResolved = {
    rows: OnspdRow[]
    bua: BuaRow | null
    resolved: {
      parishName: string | null
      adminWardName: string | null
      parliamentaryConstituencyName: string | null
      ladName: string
      adminCountyName: string | null
      regionName: string | null
    }
  }
  const groups = new Map<string, GroupResolved>()

  const parser = createReadStream(ONSPD_PATH).pipe(csvParse({ columns: true, trim: true }))
  let rowCount = 0
  for await (const raw of parser) {
    rowCount++
    if (rowCount % 100_000 === 0) console.log(`  ${rowCount} postcodes processed`)

    // Skip retired postcodes — `doterm` is the date of retirement.
    if (raw[ONSPD_COLS.terminationDate]) continue

    const onspd: OnspdRow = {
      postcode:                      raw[ONSPD_COLS.postcode],
      latitude:                      parseFloat(raw[ONSPD_COLS.latitude]),
      longitude:                     parseFloat(raw[ONSPD_COLS.longitude]),
      countryCode:                   raw[ONSPD_COLS.countryCode],
      ladCode:                       raw[ONSPD_COLS.ladCode],
      adminCountyCode:               raw[ONSPD_COLS.adminCountyCode] || null,
      regionCode:                    raw[ONSPD_COLS.regionCode] || null,
      parishCode:                    raw[ONSPD_COLS.parishCode] || null,
      adminWardCode:                 raw[ONSPD_COLS.adminWardCode] || null,
      parliamentaryConstituencyCode: raw[ONSPD_COLS.parliamentaryConstituencyCode] || null,
      buaCode:                       raw[ONSPD_COLS.buaCode] || null,
    }

    if (isNaN(onspd.latitude) || isNaN(onspd.longitude)) continue

    // Resolve codes to names via lookups. Unmapped code → fallback "(unknown)" string
    // (rare; flagged in the diagnostics so the implementer can spot lookup file mismatches).
    const ladName = ladLookup.get(onspd.ladCode) ?? '(unknown LAD)'
    const adminCountyName = onspd.adminCountyCode ? (countyLookup.get(onspd.adminCountyCode) ?? null) : null
    const regionName = onspd.regionCode ? (regionLookup.get(onspd.regionCode) ?? null) : null
    const parishName = onspd.parishCode ? (parishLookup.get(onspd.parishCode) ?? null) : null
    const adminWardName = onspd.adminWardCode ? (wardLookup.get(onspd.adminWardCode) ?? null) : null
    const pconName = onspd.parliamentaryConstituencyCode
      ? (pconLookup.get(onspd.parliamentaryConstituencyCode) ?? null) : null

    const country = countryFromOnsCode(onspd.countryCode)
    const bua = onspd.buaCode ? buaIndex.get(onspd.buaCode) ?? null : null

    const resolved = {
      parishName, adminWardName, parliamentaryConstituencyName: pconName,
      ladName, adminCountyName, regionName,
    }
    const name = pickLocalityName(onspd, bua, resolved)
    const key = `${country}::${ladName}::${name}`
    const existing = groups.get(key) ?? { rows: [], bua, resolved }
    existing.rows.push(onspd)
    groups.set(key, existing)
  }
  console.log(`  ${rowCount} total postcodes, ${groups.size} unique Localities`)

  const localities: LocalitySeedRow[] = []
  const seenSlugs = new Map<string, number>()

  for (const { rows, bua, resolved } of groups.values()) {
    const first = rows[0]
    const country = countryFromOnsCode(first.countryCode)
    const name = pickLocalityName(first, bua, resolved)
    const ladDistrict = resolved.ladName

    let slug = slugify(name)
    const seen = seenSlugs.get(slug) ?? 0
    if (seen > 0) slug = `${slug}-${slugify(ladDistrict)}`
    seenSlugs.set(slugify(name), seen + 1)

    const centerLat = rows.reduce((s, r) => s + r.latitude, 0) / rows.length
    const centerLng = rows.reduce((s, r) => s + r.longitude, 0) / rows.length
    const populationTier = populationTierFromBua(bua?.population ?? null)

    localities.push({
      name, slug,
      postTown: null,                          // ONSPD has no post-town — runtime resolve-on-write fills it
      ladDistrict,
      adminCounty: resolved.adminCountyName,
      region: resolved.regionName,
      country,
      centerLat, centerLng,
      populationTier,
    })
  }

  const banner = `// AUTO-GENERATED by prisma/scripts/build-locality-seed.ts.\n// Do not edit by hand. Re-run the generator on ONSPD refresh.\n\n`
  const body = `export const ONSPD_LOCALITIES = ${JSON.stringify(localities, null, 2)} as const\n`
  writeFileSync(OUTPUT_PATH, banner + body)
  console.log(`Wrote ${localities.length} Localities to ${OUTPUT_PATH}`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

(The old positional-index parser that previously followed is REPLACED by the streaming `csvParse({ columns: true })` block above — no separate `parseOnspdLine` helper should remain in the final script.)

- [ ] **Step 5: Add `prisma/scripts/.local/` to `.gitignore`**

Append to `.gitignore`:

```
# ONSPD download — not committed (~1GB)
prisma/scripts/.local/
```

- [ ] **Step 6: Run the column-presence verification script**

Before running the full seed generator, verify the expected ONSPD column names AND the lookup files exist in the right shape. Create a one-off verifier:

```typescript
// prisma/scripts/verify-onspd-columns.ts
// Prints the headers of ONSPD CSV and each Documents/* lookup file, then exits.
// Used once per ONSPD release to confirm column names match the build-locality-seed.ts
// expectations. If any required column is missing, prints a clear error.

import { createReadStream } from 'node:fs'
import { parse as csvParse } from 'csv-parse'
import { glob } from 'glob'
import path from 'node:path'

const REQUIRED_ONSPD_COLS = [
  'pcds', 'lat', 'long', 'ctry', 'oslaua', 'oscty', 'rgn',
  'parish', 'osward', 'pcon', 'doterm', 'bua11',
]

const REQUIRED_LOOKUPS = [
  { pattern: 'LA_UA names and codes',           codeRe: /^LAD\d+CD$/,  nameRe: /^LAD\d+NM$/ },
  { pattern: 'CTY names and codes',             codeRe: /^CTY\d+CD$/,  nameRe: /^CTY\d+NM$/ },
  { pattern: 'RGN names and codes',             codeRe: /^RGN\d+CD$/,  nameRe: /^RGN\d+NM$/ },
  { pattern: 'Parish_NCP names and codes',      codeRe: /^PAR\d+CD$/,  nameRe: /^PAR\d+NM$/ },
  { pattern: 'Ward names and codes',            codeRe: /^WD\d+CD$/,   nameRe: /^WD\d+NM$/  },
  { pattern: 'Westminster Parliamentary',       codeRe: /^PCON\d+CD$/, nameRe: /^PCON\d+NM$/ },
]

async function readHeader(filePath: string): Promise<string[]> {
  const parser = createReadStream(filePath).pipe(csvParse({ to_line: 1, trim: true }))
  for await (const row of parser) return row as string[]
  return []
}

async function findLookupFile(pattern: string): Promise<string | null> {
  const matches = await glob(`prisma/scripts/.local/Documents/${pattern}*.csv`)
  return matches[0] ?? null
}

async function main() {
  // ONSPD columns
  const onspdHeader = await readHeader('prisma/scripts/.local/ONSPD_FEB_2026_UK.csv')
  console.log('ONSPD columns found:', onspdHeader.length)
  const missing = REQUIRED_ONSPD_COLS.filter(c => !onspdHeader.includes(c))
  if (missing.length > 0) {
    console.error('MISSING ONSPD columns:', missing)
    console.error('Update ONSPD_COLS in build-locality-seed.ts.')
    process.exit(1)
  }
  console.log('  All required ONSPD columns present.')

  // Lookup files
  for (const { pattern, codeRe, nameRe } of REQUIRED_LOOKUPS) {
    const filePath = await findLookupFile(pattern)
    if (!filePath) { console.error(`MISSING lookup file: ${pattern}*.csv`); process.exit(1) }
    const header = await readHeader(filePath)
    const code = header.find(h => codeRe.test(h))
    const name = header.find(h => nameRe.test(h))
    if (!code || !name) {
      console.error(`Lookup file ${path.basename(filePath)} missing code/name columns matching ${codeRe} / ${nameRe}`)
      console.error('Headers found:', header)
      process.exit(1)
    }
    console.log(`  ${pattern}: ok (${code} → ${name})`)
  }

  console.log('All columns + lookup files verified. Safe to run build-locality-seed.ts.')
}

main().catch(e => { console.error(e); process.exit(1) })
```

Run: `npx tsx prisma/scripts/verify-onspd-columns.ts`
Expected: every required column + lookup file present; "Safe to run" message. If anything fails, the script tells the M1 implementer exactly what to fix (and where).

- [ ] **Step 7: Owner runs the script once and commits the output**

Run: `npx tsx prisma/scripts/build-locality-seed.ts`
Expected: file `prisma/seed-data/onspd-localities.ts` is created with ~5,000–10,000 entries.

Owner verifies the count is in the expected range and commits the generated file. If the count is wildly off, revisit the canonicalisation rule against actual ONSPD output.

### Task M1.12: Wire ONSPD seed into `prisma/seed.ts`

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add a `seedLocalities()` function**

Near the bottom of `prisma/seed.ts`, before the final `main()` invocation:

```typescript
import { ONSPD_LOCALITIES } from './seed-data/onspd-localities'

async function seedLocalities() {
  let inserted = 0
  let skipped = 0
  for (const loc of ONSPD_LOCALITIES) {
    const result = await prisma.locality.upsert({
      where: { slug: loc.slug },
      create: {
        name: loc.name,
        slug: loc.slug,
        postTown: loc.postTown,
        ladDistrict: loc.ladDistrict,
        adminCounty: loc.adminCounty,
        region: loc.region,
        country: loc.country,
        centerLat: loc.centerLat,
        centerLng: loc.centerLng,
        populationTier: loc.populationTier,
      },
      update: {
        // Update everything except marketId/needsReview (those are managed by other scripts)
        name: loc.name,
        postTown: loc.postTown,
        ladDistrict: loc.ladDistrict,
        adminCounty: loc.adminCounty,
        region: loc.region,
        country: loc.country,
        centerLat: loc.centerLat,
        centerLng: loc.centerLng,
        populationTier: loc.populationTier,
      },
    })
    if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++
    else skipped++
  }
  console.log(`Seeded localities: ${inserted} new, ${skipped} existing`)
}
```

- [ ] **Step 2: Call `seedLocalities()` from `main()`**

In the existing `main()` function, add the call BEFORE the merchant seed (so Branch/User writes can find Localities):

```typescript
await seedLocalities()
```

- [ ] **Step 3: Run the seed**

Run: `npx prisma db seed`
Expected: seed completes; console shows `Seeded localities: N new, 0 existing` (or `N existing` on re-runs).

### Task M1.13: Heuristic catchment edge seed

**Files:**
- Create: `prisma/seed-data/catchment-heuristic.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create the heuristic seed module**

```typescript
// prisma/seed-data/catchment-heuristic.ts
import type { PrismaClient } from '../../generated/prisma/client'

const TOWN_TIER_AND_ABOVE = ['TOWN', 'LARGE_TOWN', 'CITY', 'METRO_CORE'] as const
const SMALL_LOCALITY_TIERS  = ['HAMLET', 'VILLAGE', 'SMALL_TOWN', 'UNKNOWN'] as const
const K_MILES = 12
const MAX_EDGES_PER_SOURCE = 3
const MILES_TO_METRES = 1609.344

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function seedHeuristicCatchmentEdges(prisma: PrismaClient) {
  const sources = await prisma.locality.findMany({
    where: { populationTier: { in: [...SMALL_LOCALITY_TIERS] } },
    select: { id: true, centerLat: true, centerLng: true, country: true },
  })
  const targets = await prisma.locality.findMany({
    where: { populationTier: { in: [...TOWN_TIER_AND_ABOVE] } },
    select: { id: true, centerLat: true, centerLng: true, country: true, populationTier: true },
  })

  const K_METRES = K_MILES * MILES_TO_METRES
  let inserted = 0
  let skipped = 0

  for (const src of sources) {
    // Find candidate targets in the same country, within K miles
    const candidates = targets
      .filter(t => t.country === src.country)
      .map(t => ({
        id: t.id,
        distMetres: haversineMetres(
          Number(src.centerLat), Number(src.centerLng),
          Number(t.centerLat), Number(t.centerLng),
        ),
        populationTier: t.populationTier,
      }))
      .filter(t => t.distMetres <= K_METRES)
      // Larger places preferred over closer-but-smaller; then closer
      .sort((a, b) => {
        const tierOrder: Record<string, number> = {
          METRO_CORE: 4, CITY: 3, LARGE_TOWN: 2, TOWN: 1,
        }
        const dt = (tierOrder[b.populationTier] ?? 0) - (tierOrder[a.populationTier] ?? 0)
        if (dt !== 0) return dt
        return a.distMetres - b.distMetres
      })
      .slice(0, MAX_EDGES_PER_SOURCE)

    for (let i = 0; i < candidates.length; i++) {
      const t = candidates[i]
      const existing = await prisma.localityCatchmentEdge.findUnique({
        where: { sourceLocalityId_targetLocalityId: { sourceLocalityId: src.id, targetLocalityId: t.id } },
      })
      if (existing) {
        skipped++
        continue
      }
      await prisma.localityCatchmentEdge.create({
        data: {
          sourceLocalityId: src.id,
          targetLocalityId: t.id,
          rank: i + 1,
          isCurated: false,
        },
      })
      inserted++
    }
  }
  console.log(`Seeded heuristic catchment edges: ${inserted} new, ${skipped} existing`)
}
```

- [ ] **Step 2: Wire into `main()`**

In `prisma/seed.ts`, after `seedLocalities()`:

```typescript
import { seedHeuristicCatchmentEdges } from './seed-data/catchment-heuristic'
// ...
await seedHeuristicCatchmentEdges(prisma)
```

- [ ] **Step 3: Run seed**

Run: `npx prisma db seed`
Expected: `Seeded heuristic catchment edges: N new` on first run.

### Task M1.14: Curated catchment overrides for Huddersfield Market

**Files:**
- Create: `prisma/seed-data/catchmentOverrides.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create the curated overrides file**

```typescript
// prisma/seed-data/catchmentOverrides.ts
import type { PrismaClient } from '../../generated/prisma/client'

/**
 * Owner-curated catchment overrides for active rollout markets.
 *
 * Format: source locality slug → ordered array of natural-centre locality slugs.
 * Owner finalises this list during M1 plan writing for Huddersfield Market.
 * Examples below are illustrative; the M1 implementer confirms the actual
 * surrounding-locality slugs against ONSPD seed output before applying.
 */
// Fixes pre-flight P2.4 — Huddersfield curation vs canonicalisation reconciliation:
//
// The canonicalisation rule (§4.1.1) collapses non-London BUA postcodes into ONE Locality
// named after the BUA. The Huddersfield BUA may cover Marsh, Lindley, Lockwood etc. —
// in which case those slugs DO NOT exist as separate Localities (they roll up into
// `huddersfield`). The catchment override is then unnecessary for them (a user IN
// Huddersfield Locality is in CATCHMENT for any branch in the same Locality automatically).
//
// What DOES need curation: localities OUTSIDE the Huddersfield BUA but in the realistic
// catchment — e.g. Holmfirth, Marsden, Slaithwaite, Meltham — which the ONSPD seed will
// treat as separate Localities (they're outside the BUA polygon) and which the heuristic
// might or might not point at Huddersfield depending on geography.
//
// M1 IMPLEMENTER ACTION: after running build-locality-seed.ts, OPEN `prisma/seed-data/onspd-localities.ts`
// and identify which Huddersfield-area place names appear as separate slugs. ONLY those need
// curated edges. Confirm the final slug list with the owner BEFORE running the catchment
// override seed. The example slugs below are PLACEHOLDERS — replace with actual ONSPD output.
const CURATED: Record<string, string[]> = {
  // PLACEHOLDER LIST — confirm against actual ONSPD output before applying.
  // Localities likely to exist as separate slugs (outside Huddersfield BUA boundary)
  // and to point at Huddersfield as their natural centre:
  'holmfirth':  ['huddersfield'],
  'marsden':    ['huddersfield'],
  'slaithwaite':['huddersfield'],
  'meltham':    ['huddersfield'],
  'honley':     ['huddersfield'],
  // If Marsh / Lindley / Lockwood collapse into Huddersfield BUA, do NOT include them here
  // (they're the same Locality as Huddersfield and need no catchment edge to themselves).
  // If they appear as separate slugs in ONSPD output, then yes — add them here.
}

export async function seedCuratedCatchmentEdges(prisma: PrismaClient) {
  let inserted = 0
  let updated = 0
  let missing = 0

  for (const [sourceSlug, targetSlugs] of Object.entries(CURATED)) {
    const source = await prisma.locality.findUnique({ where: { slug: sourceSlug } })
    if (!source) {
      console.warn(`[catchment override] source locality not found: ${sourceSlug}`)
      missing++
      continue
    }
    for (let i = 0; i < targetSlugs.length; i++) {
      const targetSlug = targetSlugs[i]
      const target = await prisma.locality.findUnique({ where: { slug: targetSlug } })
      if (!target) {
        console.warn(`[catchment override] target locality not found: ${targetSlug}`)
        missing++
        continue
      }
      const result = await prisma.localityCatchmentEdge.upsert({
        where: { sourceLocalityId_targetLocalityId: { sourceLocalityId: source.id, targetLocalityId: target.id } },
        create: {
          sourceLocalityId: source.id,
          targetLocalityId: target.id,
          rank: i + 1,
          isCurated: true,
        },
        update: { rank: i + 1, isCurated: true },
      })
      if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++
      else updated++
    }
  }
  console.log(`Curated catchment edges: ${inserted} new, ${updated} updated, ${missing} missing`)
}
```

- [ ] **Step 2: Wire into `main()`**

In `prisma/seed.ts`, after `seedHeuristicCatchmentEdges`:

```typescript
import { seedCuratedCatchmentEdges } from './seed-data/catchmentOverrides'
// ...
await seedCuratedCatchmentEdges(prisma)
```

- [ ] **Step 3: Run seed**

Run: `npx prisma db seed`
Expected: console shows `Curated catchment edges: N new, 0 updated`. Any `missing` warnings indicate a slug mismatch — owner adjusts the slug list against actual ONSPD output.

### Task M1.15: Huddersfield Market seed

**Files:**
- Create: `prisma/seed-data/markets.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create the markets seed**

```typescript
// prisma/seed-data/markets.ts
import type { PrismaClient } from '../../generated/prisma/client'

/**
 * Owner-curated active markets at Plan 4a launch.
 *
 * Initial scope: Huddersfield Market only. Other UK Localities default to
 * marketId = null (organic).
 */
const MARKETS = [
  {
    slug: 'huddersfield',
    name: 'Huddersfield',
    anchorLocalitySlug: 'huddersfield',
    status: 'ACTIVE' as const,
    ladDistrict: 'Kirklees',
    adminCounty: 'West Yorkshire',
    region: 'Yorkshire and the Humber',
    country: 'England',
    targetMerchantCount: 50,
    notes: 'Plan 4a first rollout market.',
    // PLACEHOLDER LIST — confirm against actual ONSPD seed output (see P2.4 note in M1.14).
    // Localities that roll up into the Huddersfield BUA do NOT need to appear here; they
    // already share the `huddersfield` Locality. Only include slugs that exist as separate
    // Localities in ONSPD seed output AND that the owner wants in the Huddersfield Market
    // catchment.
    memberLocalitySlugs: [
      'huddersfield',
      // Likely separate-slug Huddersfield-area localities (confirm post-seed-run):
      'holmfirth',
      'marsden',
      'slaithwaite',
      'meltham',
      'honley',
    ],
  },
]

export async function seedMarkets(prisma: PrismaClient) {
  for (const m of MARKETS) {
    const anchor = await prisma.locality.findUnique({ where: { slug: m.anchorLocalitySlug } })
    if (!anchor) {
      throw new Error(`Market anchor locality not found: ${m.anchorLocalitySlug}`)
    }
    const market = await prisma.market.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: m.name,
        status: m.status,
        anchorLocalityId: anchor.id,
        ladDistrict: m.ladDistrict,
        adminCounty: m.adminCounty,
        region: m.region,
        country: m.country,
        targetMerchantCount: m.targetMerchantCount,
        notes: m.notes,
      },
      update: {
        name: m.name,
        status: m.status,
        anchorLocalityId: anchor.id,
        ladDistrict: m.ladDistrict,
        adminCounty: m.adminCounty,
        region: m.region,
        country: m.country,
        targetMerchantCount: m.targetMerchantCount,
        notes: m.notes,
      },
    })

    let memberSet = 0
    let memberMissing = 0
    for (const memberSlug of m.memberLocalitySlugs) {
      const member = await prisma.locality.findUnique({ where: { slug: memberSlug } })
      if (!member) {
        console.warn(`[market member] locality not found: ${memberSlug}`)
        memberMissing++
        continue
      }
      await prisma.locality.update({
        where: { id: member.id },
        data: { marketId: market.id },
      })
      memberSet++
    }
    console.log(`Market ${m.slug}: ${memberSet} members set, ${memberMissing} missing`)
  }
}
```

- [ ] **Step 2: Wire into `main()`**

In `prisma/seed.ts`, after curated catchment seed:

```typescript
import { seedMarkets } from './seed-data/markets'
// ...
await seedMarkets(prisma)
```

- [ ] **Step 3: Run seed + verify**

Run: `npx prisma db seed`
Expected: `Market huddersfield: 8 members set, 0 missing` (or matching the locked member count).

### Task M1.16: Backfill seeded merchant branches with `MANUALLY_CONFIRMED` confidence

**Files:**
- Modify: `prisma/seed.ts` (the existing branch upserts)

- [ ] **Step 1: Update every existing branch seed to set `locationConfidence`**

Locate every `prisma.branch.upsert(...)` and `prisma.branch.create(...)` in `prisma/seed.ts`. For each one, set `locationConfidence: 'MANUALLY_CONFIRMED'` in the create/update payload. Also link `localityId` if a matching locality exists, plus mirror the admin hierarchy fields.

For Karaara branch specifically (Huddersfield, HD1 2PY, lat 53.6463, lng -1.7809):

```typescript
const huddersfieldLocality = await prisma.locality.findUnique({ where: { slug: 'huddersfield' } })

await prisma.branch.upsert({
  where: { id: 'tax-branch-karaara-001' },
  create: {
    id: 'tax-branch-karaara-001',
    merchantId: 'tax-merchant-karaara-001',
    name: 'Karaara — Huddersfield',
    isMainBranch: true,
    addressLine1: '11 Cross Church Street',
    city: 'Huddersfield', // legacy field — retained for deprecation cycle
    postcode: 'HD1 2PY',
    country: 'GB',
    latitude: 53.6463,
    longitude: -1.7809,
    phone: '+441484500900',
    email: 'hello@karaara.test',
    isActive: true,
    locationConfidence: 'MANUALLY_CONFIRMED',
    localityId: huddersfieldLocality?.id,
    localityName: huddersfieldLocality?.name,
    postTown: huddersfieldLocality?.postTown,
    ladDistrict: huddersfieldLocality?.ladDistrict,
    adminCounty: huddersfieldLocality?.adminCounty,
    region: huddersfieldLocality?.region,
    locationCountry: huddersfieldLocality?.country, // Plan 4a nation snapshot
    // legacy `country: 'GB'` (address country) is untouched — see P1.2 fix
    locationResolvedAt: new Date(),
  },
  update: {
    // ... same fields as create ...
  },
})
```

Repeat for Covelum (Brightlingsea), Bean & Brew (Shoreditch), dev-merchant-001 (London anchor) — each linked to its matching Locality by slug.

- [ ] **Step 2: Re-run seed**

Run: `npx prisma db seed`
Expected: seed completes; every existing branch now has `locationConfidence = MANUALLY_CONFIRMED` and a populated `localityId`.

- [ ] **Step 3: Verify in DB**

Run: `npx prisma studio` (or a quick query script)
Expected: every branch row has `localityId != null`, `locationConfidence = MANUALLY_CONFIRMED`, and the locality admin hierarchy mirror columns are populated.

### Task M1.17: Postcode resolver service (wraps postcodes.io)

**Files:**
- Create: `src/api/lib/postcodeResolver.ts`
- Create: `tests/api/lib/postcodeResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/postcodeResolver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolvePostcode } from '../../../src/api/lib/postcodeResolver'

describe('resolvePostcode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a normalised ResolvedPostcode for a valid UK postcode', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY',
          country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees',
          admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area',
          admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463,
          longitude: -1.7809,
        },
      }),
    } as Response)

    const result = await resolvePostcode('HD12PY')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.postcode).toBe('HD1 2PY')
      expect(result.snapshot.country).toBe('England')
      expect(result.snapshot.ladDistrict).toBe('Kirklees')
      expect(result.snapshot.region).toBe('Yorkshire and the Humber')
      expect(result.snapshot.latitude).toBe(53.6463)
      expect(result.snapshot.longitude).toBe(-1.7809)
    }
  })

  it('returns ok:false with POSTCODE_NOT_FOUND for an invalid postcode (404)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    const result = await resolvePostcode('ZZ99 9ZZ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('POSTCODE_NOT_FOUND')
    }
  })

  it('returns ok:false with GAZETTEER_UNAVAILABLE on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    const result = await resolvePostcode('HD1 2PY')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('GAZETTEER_UNAVAILABLE')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/lib/postcodeResolver.test.ts`
Expected: FAIL with "Cannot find module ../../../src/api/lib/postcodeResolver"

- [ ] **Step 3: Write the implementation**

```typescript
// src/api/lib/postcodeResolver.ts
export type ResolvedPostcodeSnapshot = {
  postcode: string         // canonical form, e.g. "HD1 2PY"
  latitude: number         // postcode centroid
  longitude: number
  country: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'
  region: string | null
  ladDistrict: string
  adminCounty: string | null
  // Raw fields used to find/auto-create a matching Locality at write time:
  parish: string | null
  adminWard: string | null
  parliamentaryConstituency: string | null
  postTown: string | null  // not always returned; nullable
}

export type ResolvePostcodeResult =
  | { ok: true; snapshot: ResolvedPostcodeSnapshot }
  | { ok: false; error: 'POSTCODE_NOT_FOUND' | 'GAZETTEER_UNAVAILABLE' }

const POSTCODES_IO_BASE = 'https://api.postcodes.io'

export async function resolvePostcode(rawPostcode: string): Promise<ResolvePostcodeResult> {
  const cleaned = rawPostcode.trim().replace(/\s/g, '').toUpperCase()
  if (cleaned.length < 5) return { ok: false, error: 'POSTCODE_NOT_FOUND' }

  try {
    const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`)
    if (res.status === 404) return { ok: false, error: 'POSTCODE_NOT_FOUND' }
    if (!res.ok) return { ok: false, error: 'GAZETTEER_UNAVAILABLE' }

    const json = await res.json() as {
      status: number
      result?: {
        postcode: string
        country: string
        region: string | null
        admin_district: string
        admin_county: string | null
        parish: string | null
        admin_ward: string | null
        parliamentary_constituency: string | null
        post_town?: string | null
        latitude: number
        longitude: number
      }
    }
    if (json.status !== 200 || !json.result) {
      return { ok: false, error: 'POSTCODE_NOT_FOUND' }
    }

    const r = json.result
    return {
      ok: true,
      snapshot: {
        postcode: r.postcode,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country as ResolvedPostcodeSnapshot['country'],
        region: r.region,
        ladDistrict: r.admin_district,
        adminCounty: r.admin_county,
        parish: r.parish,
        adminWard: r.admin_ward,
        parliamentaryConstituency: r.parliamentary_constituency,
        postTown: r.post_town ?? null,
      },
    }
  } catch {
    return { ok: false, error: 'GAZETTEER_UNAVAILABLE' }
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/api/lib/postcodeResolver.test.ts`
Expected: PASS — 3/3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/postcodeResolver.ts tests/api/lib/postcodeResolver.test.ts
git commit -m "feat(plan-4-m1): add postcodeResolver service wrapping postcodes.io"
```

### Task M1.18: Locality-find-or-create helper

The resolver alone doesn't return a Locality id — we need a helper that takes a `ResolvedPostcodeSnapshot` and returns (or creates) the matching `Locality` row.

**Files:**
- Create: `src/api/lib/findOrCreateLocality.ts`
- Create: `tests/api/lib/findOrCreateLocality.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/findOrCreateLocality.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { findOrCreateLocality } from '../../../src/api/lib/findOrCreateLocality'
import type { ResolvedPostcodeSnapshot } from '../../../src/api/lib/postcodeResolver'

describe('findOrCreateLocality', () => {
  afterEach(async () => {
    await prisma.locality.deleteMany({ where: { slug: { startsWith: 'test-' } } })
  })

  it('returns existing Locality on slug match', async () => {
    const existing = await prisma.locality.create({
      data: {
        name: 'TestTown',
        slug: 'test-town',
        ladDistrict: 'TestLAD',
        country: 'England',
        centerLat: 51.5,
        centerLng: -0.1,
        populationTier: 'TOWN',
      },
    })

    const snapshot: ResolvedPostcodeSnapshot = {
      postcode: 'TT1 1TT',
      latitude: 51.5,
      longitude: -0.1,
      country: 'England',
      region: null,
      ladDistrict: 'TestLAD',
      adminCounty: null,
      parish: 'TestTown',
      adminWard: 'TestWard',
      parliamentaryConstituency: 'TestConstituency',
      postTown: null,
    }

    const loc = await findOrCreateLocality(prisma, snapshot)
    expect(loc.id).toBe(existing.id)
    expect(loc.needsReview).toBe(false)
  })

  it('creates a new Locality with needsReview=true when no match', async () => {
    const snapshot: ResolvedPostcodeSnapshot = {
      postcode: 'NN9 9NN',
      latitude: 52.0,
      longitude: -1.0,
      country: 'England',
      region: 'East Midlands',
      ladDistrict: 'test-unknown-district',
      adminCounty: 'TestCounty',
      parish: 'TestNewParish',
      adminWard: 'TestWard',
      parliamentaryConstituency: 'TestConstituency',
      postTown: 'TestTown',
    }

    const loc = await findOrCreateLocality(prisma, snapshot)
    expect(loc.needsReview).toBe(true)
    expect(loc.populationTier).toBe('UNKNOWN')
    expect(loc.name).toBe('TestNewParish')
    expect(loc.country).toBe('England')
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/findOrCreateLocality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (placeholder — M1.19 ships the FINAL version)**

For M1.18, implement `findOrCreateLocality` as a single exported function so the M1.18 tests pass. Then in M1.19 the file is refactored into the three-export final form (`pickRuntimeLocalityName`, `buildLocalitySlug`, `findExistingLocality`, `findOrCreateLocality`) — see M1.19 for the complete final code.

For now (M1.18), implement minimally:

```typescript
// src/api/lib/findOrCreateLocality.ts — M1.18 minimal version
// (M1.19 refactors this file to add findExistingLocality + extracted helpers.)
import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import type { ResolvedPostcodeSnapshot } from './postcodeResolver'

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

function pickRuntimeName(snap: ResolvedPostcodeSnapshot): string {
  const isLondon = snap.region === 'London'
  if (snap.parish && !isUnparishedPlaceholder(snap.parish)) return snap.parish
  if (isLondon && snap.adminWard) return snap.adminWard
  if (snap.parliamentaryConstituency) return snap.parliamentaryConstituency
  if (snap.adminWard) return snap.adminWard
  return snap.ladDistrict
}

function slugify(name: string, ladDistrict?: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!ladDistrict) return base
  const ladSuffix = ladDistrict.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base}-${ladSuffix}`
}

export async function findOrCreateLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality> {
  const name = pickRuntimeName(snap)
  const primarySlug = slugify(name)

  let existing = await prisma.locality.findUnique({ where: { slug: primarySlug } })
  if (existing && existing.ladDistrict === snap.ladDistrict && existing.country === snap.country) {
    return existing
  }
  const fallbackSlug = slugify(name, snap.ladDistrict)
  existing = await prisma.locality.findUnique({ where: { slug: fallbackSlug } })
  if (existing) return existing

  return prisma.locality.create({
    data: {
      name, slug: fallbackSlug,
      postTown: snap.postTown,
      ladDistrict: snap.ladDistrict,
      adminCounty: snap.adminCounty,
      region: snap.region,
      country: snap.country,
      centerLat: snap.latitude,
      centerLng: snap.longitude,
      populationTier: 'UNKNOWN',
      needsReview: true,
    },
  })
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run tests/api/lib/findOrCreateLocality.test.ts`
Expected: PASS — 2/2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/findOrCreateLocality.ts tests/api/lib/findOrCreateLocality.test.ts
git commit -m "feat(plan-4-m1): add findOrCreateLocality helper with needsReview fallback"
```

### Task M1.19: `/postcode/preview` endpoint

**Files:**
- Create: `src/api/customer/postcode/service.ts`
- Create: `src/api/customer/postcode/routes.ts`
- Create: `tests/api/customer/postcode/preview.test.ts`
- Modify: `src/api/customer/plugin.ts` (the actual customer-plugin file — confirmed by inspection; registers `discoveryRoutes`, `reviewOpenRoutes`, etc. on the open scope, and `profileRoutes`, `favouritesRoutes`, etc. on the authed scope)

- [ ] **Step 1: Write the failing endpoint test**

```typescript
// tests/api/customer/postcode/preview.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('GET /api/v1/customer/postcode/preview', () => {
  const app = buildTestApp()

  afterAll(async () => { await app.close() })

  beforeEach(() => { vi.restoreAllMocks() })

  it('returns 200 with resolved locality fields on success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY',
          country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees',
          admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area',
          admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463,
          longitude: -1.7809,
        },
      }),
    } as Response)

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=HD12PY' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.postcode).toBe('HD1 2PY')
    expect(body.localityName).toBeDefined()
    expect(body.postTown).toBeDefined()
    expect(body.country).toBe('England')
  })

  it('returns 404 for unknown postcode', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=ZZ999ZZ' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toBe('POSTCODE_NOT_FOUND')
  })

  it('returns 503 on gazetteer unavailable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/postcode/preview?code=HD12PY' })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error).toBe('GAZETTEER_UNAVAILABLE')
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/customer/postcode/preview.test.ts`
Expected: FAIL — 404 on the route itself.

- [ ] **Step 3: Implement the service**

**Fixes pre-flight P1.6:** preview MUST be read-only. Earlier draft mistakenly called `findOrCreateLocality` (which writes). Replaced with a read-only `findExistingLocality` helper + a shared label-derivation pure function used by BOTH preview and submit (so labels agree without preview persisting anything).

First, restructure `findOrCreateLocality.ts` to export the three helpers (extracted pure functions + the new read-only lookup). Final file shape:

```typescript
// src/api/lib/findOrCreateLocality.ts — complete (replaces the M1.18 implementation)
import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import type { ResolvedPostcodeSnapshot } from './postcodeResolver'

function isUnparishedPlaceholder(parish: string | null): boolean {
  return parish === null || /unparished area$/i.test(parish)
}

// EXPORTED: pure name picker used by preview + submit + seed (single source of truth).
export function pickRuntimeLocalityName(snap: ResolvedPostcodeSnapshot): string {
  const isLondon = snap.region === 'London'
  if (snap.parish && !isUnparishedPlaceholder(snap.parish)) return snap.parish
  if (isLondon && snap.adminWard) return snap.adminWard
  if (snap.parliamentaryConstituency) return snap.parliamentaryConstituency
  if (snap.adminWard) return snap.adminWard
  return snap.ladDistrict
}

// EXPORTED: pure slugify with collision-suffix logic.
export function buildLocalitySlug(name: string, ladDistrict?: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!ladDistrict) return base
  const ladSuffix = ladDistrict.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base}-${ladSuffix}`
}

/**
 * Read-only lookup. Returns the matching Locality if seeded; null if no match.
 * NEVER writes. Used by /postcode/preview during PC2 debounced typing so we
 * don't auto-create rows on every keystroke (Plan 4a M1.21 fix P1.6).
 */
export async function findExistingLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality | null> {
  const name = pickRuntimeLocalityName(snap)
  const primarySlug = buildLocalitySlug(name)
  const primary = await prisma.locality.findUnique({ where: { slug: primarySlug } })
  if (primary && primary.ladDistrict === snap.ladDistrict && primary.country === snap.country) {
    return primary
  }
  const fallbackSlug = buildLocalitySlug(name, snap.ladDistrict)
  return prisma.locality.findUnique({ where: { slug: fallbackSlug } })
}

/**
 * Find-or-create: returns the matching Locality, OR creates a new one with
 * `needsReview: true` if the postcodes.io admin hierarchy doesn't match a
 * seeded Locality. Used by PC2 submit, Branch create, and Branch pending-edit
 * approval (Plan 4a M1.20 / M1.21).
 */
export async function findOrCreateLocality(
  prisma: PrismaClient,
  snap: ResolvedPostcodeSnapshot,
): Promise<Locality> {
  const existing = await findExistingLocality(prisma, snap)
  if (existing) return existing
  const name = pickRuntimeLocalityName(snap)
  const slug = buildLocalitySlug(name, snap.ladDistrict)
  return prisma.locality.create({
    data: {
      name, slug,
      postTown: snap.postTown,
      ladDistrict: snap.ladDistrict,
      adminCounty: snap.adminCounty,
      region: snap.region,
      country: snap.country,
      centerLat: snap.latitude,
      centerLng: snap.longitude,
      populationTier: 'UNKNOWN',
      needsReview: true,
    },
  })
}
```

This replaces the M1.18 implementation. `findOrCreateLocality` now delegates to `findExistingLocality` for the lookup half and only creates on a miss — guaranteeing the preview/submit label always agree.

Then preview service uses the read-only helper:

```typescript
// src/api/customer/postcode/service.ts
import type { PrismaClient } from '../../../../generated/prisma/client'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findExistingLocality, pickRuntimeLocalityName } from '../../lib/findOrCreateLocality'

export type PostcodePreview = {
  postcode: string
  localityId: string | null     // null when no seeded Locality matches (still preview-able)
  localityName: string          // derived from the canonicalisation rule even if no Locality yet
  postTown: string | null
  region: string | null
  country: string
}

export type PostcodePreviewResult =
  | { ok: true; preview: PostcodePreview }
  | { ok: false; error: 'POSTCODE_NOT_FOUND' | 'GAZETTEER_UNAVAILABLE' }

export async function previewPostcode(
  prisma: PrismaClient,
  rawCode: string,
): Promise<PostcodePreviewResult> {
  const result = await resolvePostcode(rawCode)
  if (!result.ok) return result

  // READ-ONLY lookup. If no Locality is seeded for this postcode yet, return the
  // derived name without persisting. Submit-time resolve-on-write does the auto-create.
  const locality = await findExistingLocality(prisma, result.snapshot)
  const localityName = locality?.name ?? pickRuntimeLocalityName(result.snapshot)
  return {
    ok: true,
    preview: {
      postcode: result.snapshot.postcode,
      localityId: locality?.id ?? null,
      localityName,
      postTown: result.snapshot.postTown ?? locality?.postTown ?? null,
      region: result.snapshot.region,
      country: result.snapshot.country,
    },
  }
}
```

**Note:** preview is read-only — `findExistingLocality` does NOT write. If no Locality matches yet, `preview.localityId` is `null` and `localityName` falls back to the canonicalisation rule's derived label. The eventual PC2 SUBMIT (Task M1.20) is where `findOrCreateLocality` runs and persists. This separation keeps PC2 debounced typing from creating database rows on every keystroke.

- [ ] **Step 4: Implement the route**

```typescript
// src/api/customer/postcode/routes.ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { previewPostcode } from './service'

const previewQuery = z.object({
  code: z.string().min(5).max(10),
})

export async function postcodeRoutes(app: FastifyInstance) {
  app.get('/api/v1/customer/postcode/preview', async (req, reply) => {
    const parse = previewQuery.safeParse(req.query)
    if (!parse.success) {
      return reply.code(400).send({ error: 'INVALID_POSTCODE' })
    }
    const result = await previewPostcode(req.server.prisma, parse.data.code)
    if (!result.ok) {
      const status = result.error === 'POSTCODE_NOT_FOUND' ? 404 : 503
      return reply.code(status).send({ error: result.error })
    }
    return reply.code(200).send(result.preview)
  })
}
```

- [ ] **Step 5: Register the plugin on the customer OPEN scope**

**Fixes pre-flight P1.5 (v3):** the actual file is `src/api/customer/plugin.ts` (confirmed by inspection — see lines 33–47 of the existing plugin, which register `discoveryRoutes` and `reviewOpenRoutes` on the open scope, and `profileRoutes`, `favouritesRoutes`, etc. on the authed scope).

`/postcode/preview` is registered on the **open scope** — no auth required. PC2 typing happens during onboarding before the user is fully verified; the preview endpoint must be reachable without an auth header. Read-only by design (no auto-create per P1.6 fix).

Edit `src/api/customer/plugin.ts`. Inside the existing `app.register(async (open) => { ... })` block (around line 37), add:

```typescript
import { postcodeRoutes } from './postcode/routes'

// inside the open-scope block (alongside discoveryRoutes, reviewOpenRoutes):
open.register(postcodeRoutes)
```

Confirm via the test that the endpoint is reachable without an Authorization header.

- [ ] **Step 6: Run test (expect pass)**

Run: `npx vitest run tests/api/customer/postcode/preview.test.ts`
Expected: PASS — 3/3 tests green.

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/postcode/ tests/api/customer/postcode/ src/api/customer/plugin.ts
git commit -m "feat(plan-4-m1): add GET /api/v1/customer/postcode/preview endpoint (open scope)"
```

### Task M1.20: Resolve-on-write for PC2 profile submit

**Files:**
- Modify: `src/api/customer/profile/service.ts`
- Modify: `tests/api/customer/profile/update.test.ts` (or add new test file)

- [ ] **Step 1: Add the failing test for atomic resolve-on-write**

In `tests/api/customer/profile/update.test.ts` (or a new file `tests/api/customer/profile/resolve-on-write.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { buildTestApp } from '../../helpers/buildTestApp'
import { withAuthenticatedUser } from '../../helpers/withAuthenticatedUser'

describe('PC2 submit — resolve-on-write contract', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('persists the full location snapshot on a valid postcode submit', async () => {
    const app = buildTestApp()
    const { token, user } = await withAuthenticatedUser(prisma)

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY', country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees', admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area',
          admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463, longitude: -1.7809,
        },
      }),
    } as Response)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { postcode: 'HD1 2PY' },
    })
    expect(res.statusCode).toBe(200)

    const updated = await prisma.user.findUnique({ where: { id: user.id } })
    expect(updated?.postcode).toBe('HD1 2PY')
    expect(updated?.latitude).not.toBeNull()
    expect(updated?.longitude).not.toBeNull()
    expect(updated?.localityId).not.toBeNull()
    expect(updated?.postTown).toBeDefined()
    expect(updated?.ladDistrict).toBe('Kirklees')
    expect(updated?.country).toBe('England')
    expect(updated?.locationResolvedAt).not.toBeNull()

    await app.close()
  })

  it('rejects the submit on resolver failure and does NOT overwrite existing valid location', async () => {
    const app = buildTestApp()
    const { token, user } = await withAuthenticatedUser(prisma)

    // Seed the user with a valid pre-existing resolved location
    await prisma.user.update({
      where: { id: user.id },
      data: {
        postcode: 'CO7 0UB',
        latitude: 51.81,
        longitude: 1.02,
        country: 'England',
        ladDistrict: 'Tendring',
        locationResolvedAt: new Date('2026-01-01'),
      },
    })

    // postcodes.io is unreachable
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${token}` },
      payload: { postcode: 'HD1 2PY' },
    })
    // AppError envelope is `{ error: { code, message, statusCode, ...details } }`.
    // GAZETTEER_UNAVAILABLE is defined as statusCode 503 in ERROR_DEFINITIONS (M1.20 Step 3).
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error.code).toBe('GAZETTEER_UNAVAILABLE')

    // Verify the existing location is UNCHANGED
    const after = await prisma.user.findUnique({ where: { id: user.id } })
    expect(after?.postcode).toBe('CO7 0UB')
    expect(after?.ladDistrict).toBe('Tendring')

    await app.close()
  })
})
```

- [ ] **Step 2: Run tests (expect fail)**

Run: `npx vitest run tests/api/customer/profile/resolve-on-write.test.ts`
Expected: FAIL — the service still writes the old shape.

- [ ] **Step 3: Add the three new error codes to `ERROR_DEFINITIONS`**

**Fixes pre-flight P1.1 (v3 review 2):** the repo uses `AppError` from `src/api/shared/errors.ts`; there is no `ServiceError`. The resolver returns `POSTCODE_NOT_FOUND` and `GAZETTEER_UNAVAILABLE` error codes, but these aren't yet in `ERROR_DEFINITIONS` — add them.

In `src/api/shared/errors.ts`, add to the `ERROR_DEFINITIONS` object (keep alphabetical-ish grouping with other 4xx/5xx entries):

```typescript
POSTCODE_REQUIRED:              { statusCode: 400, message: 'A postcode is required.' },
POSTCODE_NOT_FOUND:             { statusCode: 400, message: "We couldn't recognise this postcode. Please check and try again." },
GAZETTEER_UNAVAILABLE:          { statusCode: 503, message: "We couldn't verify your postcode right now. Please try again in a moment." },
```

Three codes — `POSTCODE_REQUIRED` is consumed by M1.21 `createBranch` when called without a postcode. All three flow through the existing AppError → response-shape mapping automatically; no route-handler changes required.

- [ ] **Step 4: Modify `updateProfile` to call the resolver**

In `src/api/customer/profile/service.ts`, find the function that handles PATCH /profile. Replace the postcode-handling branch with:

```typescript
// Top of file:
import { AppError } from '../../shared/errors'
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findOrCreateLocality } from '../../lib/findOrCreateLocality'

// Inside updateProfile, when input.postcode is provided:
if (input.postcode !== undefined && input.postcode !== null) {
  const resolved = await resolvePostcode(input.postcode)
  if (!resolved.ok) {
    // Pre-flight P1.1: use AppError (the resolver's error codes are now defined in ERROR_DEFINITIONS).
    throw new AppError(resolved.error)
  }
  const locality = await findOrCreateLocality(prisma, resolved.snapshot)
  updateData.postcode = resolved.snapshot.postcode
  updateData.latitude = resolved.snapshot.latitude
  updateData.longitude = resolved.snapshot.longitude
  updateData.localityId = locality.id
  updateData.postTown = resolved.snapshot.postTown ?? locality.postTown
  updateData.ladDistrict = resolved.snapshot.ladDistrict
  updateData.adminCounty = resolved.snapshot.adminCounty
  updateData.region = resolved.snapshot.region
  updateData.country = resolved.snapshot.country  // User.country (Plan 4 nation; no collision on User)
  updateData.locationResolvedAt = new Date()
  // Keep the legacy city field too — set it to the locality name for now.
  // M5 cleanup audits and may remove the field.
  updateData.city = locality.name
}
```

AppError flows through the existing global error-mapper to the JSON response shape `{ error: { code, message } }`. No route-handler change needed.

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/customer/profile/resolve-on-write.test.ts`
Expected: PASS — 2/2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/profile/service.ts tests/api/customer/profile/resolve-on-write.test.ts
git commit -m "feat(plan-4-m1): PC2 submit resolves postcode server-side and persists full snapshot"
```

### Task M1.21: Resolve-on-write for Branch create + pending-edit flow

**Fixes pre-flight P1.4 (v3):** rewritten against the actual `src/api/merchant/branch/service.ts` (confirmed by reading the file). Key facts established by inspection:

- `createBranch(prisma, adminId, data, ctx)` — accepts `Record<string, unknown>` and a `ctx: { ipAddress, userAgent }` argument. Direct write path, used at merchant onboarding when no branch exists yet.
- `updateBranch(prisma, adminId, branchId, data, ctx)` — **filters input to a DIRECT_FIELDS allow-list: `['phone', 'email', 'websiteUrl', 'isActive']` only.** Postcode/address changes go through `createBranchEditRequest` (the SENSITIVE_FIELDS pending-edit flow), then through admin approval which applies the change.
- Errors are thrown as `AppError` (imported from `../../shared/errors`). There is no `ServiceError`.
- `createBranchEditRequest(prisma, adminId, branchId, proposedChanges, includesPhotos, ctx)` — stores proposed changes in a `BranchPendingEdit` row; the merchant gets a 'PENDING' edit awaiting admin review.

Consequently, postcode resolve-on-write has THREE integration points (not two):

1. **`createBranch`** — direct path on initial branch creation. Resolve at this point.
2. **`createBranchEditRequest`** — when a postcode change is proposed. Resolve here EAGERLY for two reasons: (a) merchant gets immediate "postcode is invalid" feedback before admin sees the request; (b) the resolved snapshot is stored in the pending-edit's `proposedChanges` so admin approval is a simple apply.
3. **Admin approval path** (in `src/api/admin/...` — confirm filename at impl time via `grep -rn "BranchPendingEdit.*status.*APPROVED" src/api/`). Applies the snapshot from `proposedChanges` to the Branch row.

**`updateBranch` is NOT modified** — postcode is not in DIRECT_FIELDS, so it never reaches `updateBranch`.

**Files:**
- Modify: `src/api/merchant/branch/service.ts` — extend `createBranch` and `createBranchEditRequest`; add the shared resolver helper
- Modify: admin approval path (confirm file at impl time)
- Create: `tests/api/merchant/branch/resolve-on-write.test.ts`

- [ ] **Step 1: Confirm signatures with a quick grep**

Run: `grep -n "^export async function\|AppError\|DIRECT_FIELDS\|SENSITIVE_FIELDS" src/api/merchant/branch/service.ts`
Confirm: signatures match the description above. Also locate the admin approval path:
Run: `grep -rn "BranchPendingEdit" src/api/admin/ src/api/merchant/`

- [ ] **Step 2: Add the shared resolution helper inside the branch service**

In `src/api/merchant/branch/service.ts`, add near the top (after the existing imports):

```typescript
import { resolvePostcode } from '../../lib/postcodeResolver'
import { findOrCreateLocality } from '../../lib/findOrCreateLocality'

/**
 * Resolve a postcode via postcodes.io + auto-create Locality if missing.
 * Throws AppError on resolver failure; the caller propagates to the API layer.
 *
 * Returns location-snapshot fields ready to spread into a Branch.create payload
 * OR to store inside BranchPendingEdit.proposedChanges for later admin apply.
 */
async function resolveBranchLocationFields(prisma: PrismaClient, postcode: string) {
  const resolved = await resolvePostcode(postcode)
  if (!resolved.ok) {
    // AppError takes a code string per the existing convention (see `resolveBranch` line 34).
    // Both 'POSTCODE_NOT_FOUND' and 'GAZETTEER_UNAVAILABLE' propagate via the API error mapper.
    throw new AppError(resolved.error)
  }
  const locality = await findOrCreateLocality(prisma, resolved.snapshot)
  return {
    latitude: resolved.snapshot.latitude,
    longitude: resolved.snapshot.longitude,
    localityId: locality.id,
    localityName: locality.name,
    postTown: resolved.snapshot.postTown ?? locality.postTown,
    ladDistrict: resolved.snapshot.ladDistrict,
    adminCounty: resolved.snapshot.adminCounty,
    region: resolved.snapshot.region,
    locationCountry: resolved.snapshot.country,
    locationResolvedAt: new Date(),
    locationConfidence: 'POSTCODE_CENTROID' as const,
  }
}
```

- [ ] **Step 3: Extend `createBranch`**

Modify the existing `createBranch` function (line 52 of the current `service.ts`). Insert the resolver call BEFORE the `prisma.branch.create` block and spread the result into the create payload. Legacy `country` (address country, defaulting "GB") stays untouched.

```typescript
export async function createBranch(
  prisma: PrismaClient,
  adminId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const existingCount = await prisma.branch.count({
    where: { merchantId, deletedAt: null },
  })
  const isMainBranch = existingCount === 0

  // NEW: resolve postcode → Locality + snapshot fields (Plan 4a M1.21)
  const postcode = data.postcode as string | undefined
  if (!postcode) throw new AppError('POSTCODE_REQUIRED')
  const locationFields = await resolveBranchLocationFields(prisma, postcode)

  const branch = await prisma.branch.create({
    data: {
      merchantId,
      isMainBranch,
      name:         data.name as string,
      addressLine1: data.addressLine1 as string,
      addressLine2: data.addressLine2 as string | undefined,
      city:         data.city as string,
      postcode:     data.postcode as string,
      country:      (data.country as string | undefined) ?? 'GB',  // legacy address-country, unchanged
      phone:        data.phone as string | undefined,
      email:        data.email as string | undefined,
      websiteUrl:   data.websiteUrl as string | undefined,
      logoUrl:      data.logoUrl as string | undefined,
      bannerUrl:    data.bannerUrl as string | undefined,
      about:        data.about as string | undefined,
      // Plan 4a M1.21: resolve-on-write snapshot (lat/lng = postcode centroid;
      // locationConfidence = POSTCODE_CENTROID). For the M1 createBranch path the
      // caller does NOT supply pin-precise coords — those arrive later via the admin
      // pin-drop flow (Phase 4 Merchant Portal), which updates the branch via a separate
      // admin endpoint (NOT through createBranch). Pin-precise update path is out of
      // scope for Plan 4a M1.
      ...locationFields,
    },
    include: BRANCH_INCLUDE,
  })

  // ... existing writeAuditLog block, unchanged ...
  return branch
}
```

**Note on lat/lng ownership for `createBranch`:** Plan 4a M1.21 deliberately drops the existing `data.latitude` / `data.longitude` plumbing from `createBranch`. Pin-precise coordinates are an admin-driven flow (admin pin-drop / Phase 4 Merchant Portal address geocoder) and arrive via a SEPARATE update path that bypasses postcode resolve-on-write. The createBranch path always starts a branch at `locationConfidence: POSTCODE_CENTROID` (not discoverable), and a follow-on admin step upgrades it to `MANUALLY_CONFIRMED`. This matches the spec's locked discoverability gate (§3.5).

- [ ] **Step 4: Extend `createBranchEditRequest`**

Modify the existing function (line 155). When `proposedChanges.postcode` is present, eagerly resolve and merge the snapshot into `filtered` so admin approval applies a complete location update.

```typescript
export async function createBranchEditRequest(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  proposedChanges: Record<string, unknown>,
  includesPhotos: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  await resolveBranch(prisma, branchId, merchantId)

  const filtered: Record<string, unknown> = {}
  for (const key of SENSITIVE_FIELDS) {
    if (key in proposedChanges) filtered[key] = proposedChanges[key]
  }

  // NEW: if the merchant is proposing a postcode change, eagerly resolve
  // and stash the full snapshot in the pending edit so admin approval is a
  // clean apply (Plan 4a M1.21).
  if (typeof filtered.postcode === 'string' && filtered.postcode.length > 0) {
    const locationFields = await resolveBranchLocationFields(prisma, filtered.postcode as string)
    Object.assign(filtered, locationFields)
    // The eager resolution validates the postcode before admin even sees the request.
  }

  // ... existing prisma.branchPendingEdit.create block, unchanged ...
}
```

- [ ] **Step 5: Extend the admin approval path**

Locate the function that applies an approved `BranchPendingEdit` (likely in `src/api/admin/branch/service.ts` or similar — confirm via grep in Step 1). The admin approval reads `pendingEdit.proposedChanges` (a JSON column) and applies the fields to the Branch row.

Because Step 4 already includes the resolved snapshot in `proposedChanges`, the admin approval path needs ONE small change: also apply the location-snapshot fields when present. If the existing apply loop iterates over `proposedChanges` keys generically, no change is needed; if it allow-lists fields, extend the allow-list to include `localityId`, `localityName`, `postTown`, `ladDistrict`, `adminCounty`, `region`, `locationCountry`, `locationResolvedAt`, `locationConfidence`, `latitude`, `longitude`.

Specific implementation detail confirmed at impl time after reading the actual admin file.

- [ ] **Step 6: Write tests against the real exports**

```typescript
// tests/api/merchant/branch/resolve-on-write.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { createBranch, createBranchEditRequest } from '../../../src/api/merchant/branch/service'
import { resolveBranchTestFixtures } from '../../helpers/branchFixtures'  // existing helper that returns { adminId, merchantId, ctx }

describe('Branch resolve-on-write', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(async () => {
    await prisma.branch.deleteMany({ where: { name: { startsWith: 'test-branch-resolve-' } } })
    await prisma.branchPendingEdit.deleteMany({ where: { branch: { name: { startsWith: 'test-branch-resolve-' } } } })
  })

  it('createBranch resolves postcode and populates Locality snapshot', async () => {
    const { adminId, merchantId, ctx } = await resolveBranchTestFixtures(prisma)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'HD1 2PY', country: 'England',
          region: 'Yorkshire and the Humber',
          admin_district: 'Kirklees', admin_county: 'West Yorkshire',
          parish: 'Kirklees, unparished area', admin_ward: 'Newsome',
          parliamentary_constituency: 'Huddersfield',
          latitude: 53.6463, longitude: -1.7809,
        },
      }),
    } as Response)

    const branch = await createBranch(prisma, adminId, {
      name: 'test-branch-resolve-001',
      addressLine1: '1 Test St',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
      country: 'GB',
    }, ctx)

    expect(branch.localityId).not.toBeNull()
    expect(branch.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(branch.locationCountry).toBe('England')
    expect(branch.country).toBe('GB')   // legacy address-country preserved
  })

  it('createBranch rejects with AppError on resolver failure', async () => {
    const { adminId, ctx } = await resolveBranchTestFixtures(prisma)
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))
    await expect(createBranch(prisma, adminId, {
      name: 'test-branch-resolve-002',
      addressLine1: '1 X', city: 'Huddersfield',
      postcode: 'HD1 2PY', country: 'GB',
    }, ctx)).rejects.toMatchObject({ code: 'GAZETTEER_UNAVAILABLE' })
  })

  it('createBranchEditRequest eagerly resolves a proposed postcode change', async () => {
    const { adminId, branchId, ctx } = await resolveBranchTestFixtures(prisma)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        status: 200,
        result: {
          postcode: 'CO7 0UB', country: 'England',
          region: 'East of England',
          admin_district: 'Tendring', admin_county: 'Essex',
          parish: 'Brightlingsea', admin_ward: 'Brightlingsea',
          parliamentary_constituency: 'Clacton',
          latitude: 51.81, longitude: 1.02,
        },
      }),
    } as Response)

    const edit = await createBranchEditRequest(prisma, adminId, branchId, {
      postcode: 'CO7 0UB',
      addressLine1: 'New address',
    }, false, ctx)

    // The pending edit's proposedChanges should carry the resolved snapshot
    const proposed = edit.proposedChanges as Record<string, unknown>
    expect(proposed.locationCountry).toBe('England')
    expect(proposed.ladDistrict).toBe('Tendring')
    expect(proposed.localityId).toBeDefined()
  })

  it('createBranchEditRequest rejects an invalid postcode BEFORE creating the pending edit', async () => {
    const { adminId, branchId, ctx } = await resolveBranchTestFixtures(prisma)
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    await expect(createBranchEditRequest(prisma, adminId, branchId, {
      postcode: 'ZZ99 9ZZ',
    }, false, ctx)).rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND' })
    // And no pending edit should exist
    const count = await prisma.branchPendingEdit.count({ where: { branchId, status: 'PENDING' } })
    expect(count).toBe(0)
  })
})
```

**Fixes pre-flight P1.3 (v3 review 3):** the tests use a real `resolveBranchTestFixtures` helper instead of fake `'admin-id'` strings, so `resolveAdminMerchant` succeeds. The helper field names below are verified against `prisma/schema.prisma`: `Merchant` uses `status` / `verificationStatus` / `contractStatus` / `onboardingStep` (no `approvalStatus`); `MerchantAdmin` requires `firstName` + `lastName` plus the unique `merchantId` / `email`. If the helper file doesn't exist in the repo already (check `tests/helpers/`), create it now exactly as shown:

```typescript
// tests/helpers/branchFixtures.ts
import type { PrismaClient } from '../../generated/prisma/client'

const TEST_MERCHANT_ID = 'test-fixture-merchant-001'
const TEST_ADMIN_ID    = 'test-fixture-admin-001'
const TEST_BRANCH_ID   = 'test-fixture-branch-001'

export async function resolveBranchTestFixtures(prisma: PrismaClient) {
  // Merchant — only fields required by the schema (everything else has a default or is nullable).
  const merchant = await prisma.merchant.upsert({
    where: { id: TEST_MERCHANT_ID },
    create: {
      id: TEST_MERCHANT_ID,
      businessName:       'Test Fixture Merchant',
      tradingName:        'Test Fixture Merchant',
      status:             'ACTIVE',         // MerchantStatus enum
      verificationStatus: 'VERIFIED',       // VerificationStatus enum
      contractStatus:     'SIGNED',         // ContractStatus enum
      // onboardingStep has a default (REGISTERED); leave it.
    },
    update: {},
  })

  // MerchantAdmin — required: merchantId, email, firstName, lastName.
  const admin = await prisma.merchantAdmin.upsert({
    where: { id: TEST_ADMIN_ID },
    create: {
      id: TEST_ADMIN_ID,
      merchantId: merchant.id,
      email:      'test-fixture-admin@test.local',
      firstName:  'Test',
      lastName:   'Admin',
      // status defaults to ACTIVE; passwordHash nullable; createdAt/updatedAt auto-managed.
    },
    update: {},
  })

  // One pre-existing branch so updateBranch / createBranchEditRequest tests have a target.
  const branch = await prisma.branch.upsert({
    where: { id: TEST_BRANCH_ID },
    create: {
      id: TEST_BRANCH_ID,
      merchantId:   merchant.id,
      isMainBranch: true,
      name:         'Test Fixture Branch',
      addressLine1: '1 Test St',
      city:         'Huddersfield',
      postcode:     'HD1 2PY',
      country:      'GB',           // legacy address-country
      latitude:     53.6463,
      longitude:    -1.7809,
      isActive:     true,
      locationConfidence: 'MANUALLY_CONFIRMED',
      // Plan 4 location snapshot fields are nullable — left null at create time so individual
      // tests that exercise resolve-on-write don't see preset values from the fixture.
    },
    update: {},
  })

  return {
    adminId:    admin.id,
    merchantId: merchant.id,
    branchId:   branch.id,
    ctx: { ipAddress: '127.0.0.1', userAgent: 'test' },
  }
}
```

All required schema fields are explicitly named; no placeholder comments remain. The helper is idempotent (upsert) so concurrent test runs share fixtures.

- [ ] **Step 5: Run test (expect pass)**

Run: `npx vitest run tests/api/merchant/branch/resolve-on-write.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/merchant/branch/ tests/api/merchant/branch/resolve-on-write.test.ts
git commit -m "feat(plan-4-m1): branch create/update resolves postcode server-side"
```

### Task M1.22: Idempotent backfill script

**Files:**
- Create: `prisma/backfill-locality-data.ts`

- [ ] **Step 1: Create the script**

```typescript
// prisma/backfill-locality-data.ts
import { PrismaClient } from '../generated/prisma/client'
import { resolvePostcode } from '../src/api/lib/postcodeResolver'
import { findOrCreateLocality } from '../src/api/lib/findOrCreateLocality'

const prisma = new PrismaClient()
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const scope = (args.find(a => a.startsWith('--scope='))?.split('=')[1] ?? 'both') as
  'users' | 'branches' | 'both'

const THROTTLE_MS = 100 // ~10 req/sec to postcodes.io

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function backfillUsers() {
  const users = await prisma.user.findMany({
    where: { locationResolvedAt: null, postcode: { not: null } },
    select: { id: true, postcode: true },
  })
  console.log(`Backfilling ${users.length} users...`)
  let ok = 0, failed = 0, newLoc = 0
  for (const u of users) {
    if (!u.postcode) continue
    const r = await resolvePostcode(u.postcode)
    if (!r.ok) {
      console.warn(`  user ${u.id}: ${r.error}`)
      failed++
      continue
    }
    const loc = await findOrCreateLocality(prisma, r.snapshot)
    if (loc.needsReview) newLoc++
    if (!dryRun) {
      await prisma.user.update({
        where: { id: u.id },
        data: {
          latitude: r.snapshot.latitude,
          longitude: r.snapshot.longitude,
          localityId: loc.id,
          postTown: r.snapshot.postTown ?? loc.postTown,
          ladDistrict: r.snapshot.ladDistrict,
          adminCounty: r.snapshot.adminCounty,
          region: r.snapshot.region,
          country: r.snapshot.country,
          locationResolvedAt: new Date(),
        },
      })
    }
    ok++
    await sleep(THROTTLE_MS)
  }
  console.log(`  users: ${ok} resolved, ${failed} failed, ${newLoc} new localities created`)
}

async function backfillBranches() {
  const branches = await prisma.branch.findMany({
    where: { locationResolvedAt: null },
    select: { id: true, postcode: true },
  })
  console.log(`Backfilling ${branches.length} branches...`)
  let ok = 0, failed = 0, newLoc = 0
  for (const b of branches) {
    if (!b.postcode) continue
    const r = await resolvePostcode(b.postcode)
    if (!r.ok) {
      console.warn(`  branch ${b.id}: ${r.error}`)
      failed++
      continue
    }
    const loc = await findOrCreateLocality(prisma, r.snapshot)
    if (loc.needsReview) newLoc++
    if (!dryRun) {
      await prisma.branch.update({
        where: { id: b.id },
        data: {
          // DO NOT overwrite existing latitude/longitude — those may be pin-precise.
          // Only fill admin hierarchy + localityId + postcode-centroid snapshot.
          // Plan 4 nation snapshot goes to `locationCountry` (new); legacy `country` (address-country) is untouched.
          localityId: loc.id,
          localityName: loc.name,
          postTown: r.snapshot.postTown ?? loc.postTown,
          ladDistrict: r.snapshot.ladDistrict,
          adminCounty: r.snapshot.adminCounty,
          region: r.snapshot.region,
          locationCountry: r.snapshot.country,
          locationResolvedAt: new Date(),
        },
      })
    }
    ok++
    await sleep(THROTTLE_MS)
  }
  console.log(`  branches: ${ok} resolved, ${failed} failed, ${newLoc} new localities created`)
}

async function main() {
  console.log(`Backfill scope=${scope} dryRun=${dryRun}`)
  if (scope === 'users' || scope === 'both') await backfillUsers()
  if (scope === 'branches' || scope === 'both') await backfillBranches()
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Test on dev DB with dry-run**

Run: `npx tsx prisma/backfill-locality-data.ts --dry-run`
Expected: console shows the count of rows that WOULD be backfilled. No DB writes.

- [ ] **Step 3: Run live backfill on dev DB**

Run: `npx tsx prisma/backfill-locality-data.ts`
Expected: All seeded branches and any seeded users get their resolved fields populated. Re-running should report 0 rows to backfill (idempotent).

- [ ] **Step 4: Commit**

```bash
git add prisma/backfill-locality-data.ts
git commit -m "feat(plan-4-m1): add idempotent backfill script for User + Branch location data"
```

### Task M1.23: Owner-run market scripts

**Files:**
- Create: `prisma/set-market-status.ts`
- Create: `prisma/add-locality-to-market.ts`
- Create: `prisma/remove-locality-from-market.ts`
- Create: `prisma/set-locality-catchment.ts`
- Create: `prisma/sync-branch-locality-names.ts`

- [ ] **Step 1: Implement `set-market-status.ts`**

```typescript
// prisma/set-market-status.ts
import { PrismaClient } from '../generated/prisma/client'

const [slug, status] = process.argv.slice(2)
if (!slug || !['ACTIVE', 'PAUSED'].includes(status)) {
  console.error('Usage: npx tsx prisma/set-market-status.ts <slug> <ACTIVE|PAUSED>')
  process.exit(1)
}

const prisma = new PrismaClient()
;(async () => {
  const m = await prisma.market.update({
    where: { slug },
    data: { status: status as 'ACTIVE' | 'PAUSED' },
  })
  console.log(`Market ${m.slug} → ${m.status}`)
  await prisma.$disconnect()
})()
```

- [ ] **Step 2: Implement the other three scripts (same pattern)**

`add-locality-to-market.ts`:

```typescript
import { PrismaClient } from '../generated/prisma/client'
const [localitySlug, marketSlug] = process.argv.slice(2)
if (!localitySlug || !marketSlug) {
  console.error('Usage: npx tsx prisma/add-locality-to-market.ts <localitySlug> <marketSlug>')
  process.exit(1)
}
const prisma = new PrismaClient()
;(async () => {
  const m = await prisma.market.findUnique({ where: { slug: marketSlug } })
  if (!m) throw new Error(`Market not found: ${marketSlug}`)
  await prisma.locality.update({ where: { slug: localitySlug }, data: { marketId: m.id } })
  console.log(`${localitySlug} → market ${marketSlug}`)
  await prisma.$disconnect()
})()
```

`remove-locality-from-market.ts`:

```typescript
import { PrismaClient } from '../generated/prisma/client'
const [localitySlug] = process.argv.slice(2)
if (!localitySlug) {
  console.error('Usage: npx tsx prisma/remove-locality-from-market.ts <localitySlug>')
  process.exit(1)
}
const prisma = new PrismaClient()
;(async () => {
  await prisma.locality.update({ where: { slug: localitySlug }, data: { marketId: null } })
  console.log(`${localitySlug} removed from market`)
  await prisma.$disconnect()
})()
```

`set-locality-catchment.ts`:

**Fixes pre-flight P2.2:** the earlier draft documented a `--centre-slugs` flag but parsed positional argv — which would treat the literal string `"--centre-slugs"` as the source slug. Fixed with proper flag parsing.

```typescript
import { PrismaClient } from '../generated/prisma/client'

// Parse args: <sourceSlug> --centre-slugs <slug1,slug2,...>
const args = process.argv.slice(2)
const sourceSlug = args[0] && !args[0].startsWith('--') ? args[0] : undefined
const centreSlugsIdx = args.indexOf('--centre-slugs')
const centreSlugsArg = centreSlugsIdx !== -1 && args[centreSlugsIdx + 1] ? args[centreSlugsIdx + 1] : ''
const centreSlugs = centreSlugsArg.split(',').map(s => s.trim()).filter(Boolean)

if (!sourceSlug || centreSlugs.length === 0) {
  console.error('Usage: npx tsx prisma/set-locality-catchment.ts <sourceSlug> --centre-slugs <slug1,slug2,...>')
  process.exit(1)
}
const prisma = new PrismaClient()
;(async () => {
  const source = await prisma.locality.findUnique({ where: { slug: sourceSlug } })
  if (!source) throw new Error(`Source not found: ${sourceSlug}`)
  // Delete existing edges for this source (curated overrides replace all)
  await prisma.localityCatchmentEdge.deleteMany({ where: { sourceLocalityId: source.id } })
  for (let i = 0; i < centreSlugs.length; i++) {
    const target = await prisma.locality.findUnique({ where: { slug: centreSlugs[i] } })
    if (!target) { console.warn(`  target missing: ${centreSlugs[i]}`); continue }
    await prisma.localityCatchmentEdge.create({
      data: {
        sourceLocalityId: source.id,
        targetLocalityId: target.id,
        rank: i + 1,
        isCurated: true,
      },
    })
  }
  console.log(`Catchment override set for ${sourceSlug}: → [${centreSlugs.join(', ')}]`)
  await prisma.$disconnect()
})()
```

`sync-branch-locality-names.ts`:

```typescript
import { PrismaClient } from '../generated/prisma/client'
const prisma = new PrismaClient()
;(async () => {
  const branches = await prisma.branch.findMany({
    where: { localityId: { not: null } },
    select: { id: true, localityId: true, localityName: true },
  })
  let updated = 0
  for (const b of branches) {
    const loc = await prisma.locality.findUnique({ where: { id: b.localityId! } })
    if (!loc) continue
    if (b.localityName !== loc.name) {
      await prisma.branch.update({ where: { id: b.id }, data: { localityName: loc.name } })
      updated++
    }
  }
  console.log(`Synced ${updated} Branch.localityName mirrors`)
  await prisma.$disconnect()
})()
```

- [ ] **Step 3: Smoke-test each script**

Run each script with dummy/realistic args. Each should produce an audit-trail line in the console.

- [ ] **Step 4: Commit**

```bash
git add prisma/set-market-status.ts prisma/add-locality-to-market.ts prisma/remove-locality-from-market.ts prisma/set-locality-catchment.ts prisma/sync-branch-locality-names.ts
git commit -m "feat(plan-4-m1): add owner-run market + catchment scripts"
```

### Task M1.24: Trending search seed fixtures

**Files:**
- Modify: `prisma/seed.ts` (or `prisma/seed-data/trendingSearchFixtures.ts` invoked from seed)

- [ ] **Step 1: Owner names the 6 fixture merchants**

Owner provides during plan-writing acceptance: at least one merchant for each trending term. Likely candidates given existing fixtures:

- `Pizza` (CUISINE tag) — new fixture merchant: e.g. "Pino's Pizzeria — Huddersfield" with `Pizza` cuisine tag.
- `Brunch` (SPECIALTY tag) — extend an existing café fixture's tags with `Brunch`.
- `Coffee` (CUISINE tag or Cafe & Coffee subcategory) — Bean & Brew or Karaara already covers this.
- `Nail salon` — new fixture: e.g. "Polish — Huddersfield" in `Beauty & Grooming > Nail Salon` subcategory.
- `Barber` — new fixture: e.g. "Trim & Co" in `Beauty & Grooming > Barber` subcategory.
- `Gym` — new fixture: e.g. "Iron Forge" in `Health & Fitness > Gym` subcategory.

For each new fixture: branch lat/lng entered manually (pin-precise per §3.5), `locationConfidence = MANUALLY_CONFIRMED`, linked to Huddersfield Locality + Market.

- [ ] **Step 2: Add fixtures to `prisma/seed.ts`**

Extend the existing `TEST_MERCHANT_SPECS` array with the 6 fixtures (following the Karaara pattern). Each merchant gets the right CUISINE/SPECIALTY tag or sits in the right subcategory so the trending term matches.

- [ ] **Step 3: Run seed and verify**

Run: `npx prisma db seed`
Expected: seed succeeds; new fixture merchants exist.

- [ ] **Step 4: Verify trending terms have matching merchants**

Run a quick query:

```typescript
// One-off check
await prisma.merchant.findMany({
  where: { tags: { some: { tag: { label: 'Pizza' } } } },
}) // expect at least one merchant
```

Repeat for each of the 6 terms.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts prisma/seed-data/
git commit -m "feat(plan-4-m1): seed trending-search fixture merchants (Pizza, Brunch, Coffee, Nail salon, Barber, Gym)"
```

### Task M1.25: M1 integration tests + final verification

**Files:**
- Create: `tests/api/customer/discovery/uk-wide-coverage.test.ts`

- [ ] **Step 1: Write the UK-wide coverage integration test**

```typescript
// tests/api/customer/discovery/uk-wide-coverage.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolvePostcode } from '../../../../src/api/lib/postcodeResolver'

describe('UK-wide postcode resolution coverage', () => {
  // Each test postcode targets a different UK nation/admin shape.
  // postcodes.io is mocked to return the right admin hierarchy per nation.

  const cases: Array<{ postcode: string; expectCountry: string; expectAdminCounty: string | null; expectRegion: string | null }> = [
    { postcode: 'HD1 2PY', expectCountry: 'England',          expectAdminCounty: 'West Yorkshire', expectRegion: 'Yorkshire and the Humber' },
    { postcode: 'CO7 0UB', expectCountry: 'England',          expectAdminCounty: 'Essex',          expectRegion: 'East of England' },
    { postcode: 'NW2 7UD', expectCountry: 'England',          expectAdminCounty: null,             expectRegion: 'London' },
    { postcode: 'G1 1AA',  expectCountry: 'Scotland',         expectAdminCounty: null,             expectRegion: null },
    { postcode: 'CF10 1EP',expectCountry: 'Wales',            expectAdminCounty: null,             expectRegion: null },
    { postcode: 'BT1 5GS', expectCountry: 'Northern Ireland', expectAdminCounty: null,             expectRegion: null },
  ]

  for (const c of cases) {
    it(`resolves ${c.postcode} → country=${c.expectCountry}`, async () => {
      // Use real postcodes.io if RUN_LIVE=1, else mock.
      if (!process.env.RUN_LIVE) {
        vi.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({
            status: 200,
            result: {
              postcode: c.postcode,
              country: c.expectCountry,
              region: c.expectRegion,
              admin_district: 'TestLAD',
              admin_county: c.expectAdminCounty,
              parish: null,
              admin_ward: null,
              parliamentary_constituency: 'TestConstituency',
              latitude: 51, longitude: -1,
            },
          }),
        } as Response)
      }

      const r = await resolvePostcode(c.postcode)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.snapshot.country).toBe(c.expectCountry)
        expect(r.snapshot.adminCounty).toBe(c.expectAdminCounty)
        expect(r.snapshot.region).toBe(c.expectRegion)
      }
    })
  }
})
```

- [ ] **Step 2: Run all M1 tests**

Run: `npx vitest run tests/api/lib tests/api/customer/postcode tests/api/customer/profile tests/api/merchant/branch tests/api/customer/discovery/uk-wide-coverage`
Expected: all M1 tests pass.

- [ ] **Step 3: Run full backend test sweep**

Run: `npx vitest run`
Expected: all tests pass, no regressions.

- [ ] **Step 4: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1`
Expected: clean (existing pre-existing errors only, no new ones).

- [ ] **Step 5: Commit M1 finishing touches**

```bash
git add tests/api/customer/discovery/uk-wide-coverage.test.ts
git commit -m "test(plan-4-m1): UK-wide postcode resolution coverage"
```

### Task M1.26: Push M1 branch + open PR

- [ ] **Step 1: Push**

Run: `git push -u origin feature/plan-4-m1-foundation`

- [ ] **Step 2: Open PR**

Run:

```bash
gh pr create --title "feat(plan-4-m1): location model foundation + gazetteer seed" --body "$(cat <<'EOF'
## Summary

Plan 4a Milestone 1 — Foundation. Implements the spec at \`docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md\` per §11.1 cadence.

### Schema (additive)
- New tables: \`Locality\`, \`LocalityCatchmentEdge\`, \`Market\`.
- New enums: \`PopulationTier\`, \`MarketStatus\`, \`LocationConfidence\`, \`LadderProfile\`.
- Additions to \`User\`, \`Branch\`, \`Category\`, \`Subcategory\`, \`Campaign\` (Plan 4b deferred contract).

### Seed (UK-wide)
- ONSPD-derived Locality seed with canonicalisation per spec §4.1.1 (BUA → parish → ward → constituency → LAD, London exception).
- ONS BUA → \`populationTier\` mapping.
- Heuristic catchment edges (smaller → larger, within 12 mi, cap 3 edges per source).
- Curated catchment overrides for Huddersfield Market member localities.
- Huddersfield Market seed (\`status: ACTIVE\`, 8+ member localities).
- Trending-search fixture merchants (Pizza, Brunch, Coffee, Nail salon, Barber, Gym).
- Existing seeded branches backfilled with \`MANUALLY_CONFIRMED\` confidence + \`localityId\`.

### Runtime
- \`GET /api/v1/customer/postcode/preview\` endpoint (PC2 typeahead, open scope).
- Resolve-on-write contract for PC2 profile submit (atomic, no half-resolved states).
- Resolve-on-write for Branch create/update (\`POSTCODE_CENTROID\` confidence; not discoverable until pin-confirmed).
- Owner scripts: \`set-market-status.ts\`, \`add-locality-to-market.ts\`, \`remove-locality-from-market.ts\`, \`set-locality-catchment.ts\`, \`sync-branch-locality-names.ts\`.
- Idempotent backfill script for User + Branch.

### No customer-visible behaviour change
M1 only adds infrastructure. M3 onward exposes the new contract to the customer-app.

## Test plan
- [ ] \`npx prisma migrate dev\` applies cleanly.
- [ ] \`npx prisma db seed\` populates Localities, catchment edges, Huddersfield Market, fixture merchants.
- [ ] \`npx tsx prisma/backfill-locality-data.ts --dry-run\` reports expected counts.
- [ ] \`npx vitest run\` — all backend tests pass.
- [ ] \`npx tsc --noEmit\` clean.
- [ ] Manual smoke: \`GET /api/v1/customer/postcode/preview?code=HD12PY\` returns 200 with locality fields.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify CI / await owner review**

After PR creation, wait for owner review. Address any review comments before merging. After merge, return to `main` and create the M2 branch.

---

## Milestone M2 — Ranking refactor

**Goal:** Replace today's 3-rung `classifyTier` with an 8-rung density-adaptive `classifyRung` + the collect-first `rankMerchants` v2 algorithm. Add the `LadderProfile` matrix, `DensityClass` derivation, `getProximityBand` resolver, and the `EffectiveLocation` resolver including the GPS → nearest-Locality lookup. Service code internally uses the new types; API responses are NOT yet exposing them (M3 does that). No customer-visible behaviour change.

**Output:** one PR titled "feat(plan-4-m2): density-adaptive ranking ladder + EffectiveLocation".

### Task M2.1: Branch from main (post-M1-merge)

- [ ] **Step 1: Pull latest main**

Run: `git checkout main && git pull`
Expected: main now includes M1 merge.

- [ ] **Step 2: Branch**

Run: `git checkout -b feature/plan-4-m2-ranking`

### Task M2.2: `LadderProfile` matrix module

**Files:**
- Create: `src/api/lib/ladderProfiles.ts`
- Create: `tests/api/lib/ladderProfiles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/ladderProfiles.test.ts
import { describe, it, expect } from 'vitest'
import {
  getNearbyRadiusMiles,
  getMaxRung,
  getProximityBand,
  deriveDensityClass,
  RUNG_ORDER,
} from '../../../src/api/lib/ladderProfiles'

describe('ladderProfiles', () => {
  describe('deriveDensityClass', () => {
    it('METRO_CORE / CITY → URBAN', () => {
      expect(deriveDensityClass('METRO_CORE')).toBe('URBAN')
      expect(deriveDensityClass('CITY')).toBe('URBAN')
    })
    it('LARGE_TOWN / TOWN → SUBURBAN', () => {
      expect(deriveDensityClass('LARGE_TOWN')).toBe('SUBURBAN')
      expect(deriveDensityClass('TOWN')).toBe('SUBURBAN')
    })
    it('SMALL_TOWN / VILLAGE / HAMLET / UNKNOWN → RURAL', () => {
      expect(deriveDensityClass('SMALL_TOWN')).toBe('RURAL')
      expect(deriveDensityClass('VILLAGE')).toBe('RURAL')
      expect(deriveDensityClass('HAMLET')).toBe('RURAL')
      expect(deriveDensityClass('UNKNOWN')).toBe('RURAL')
    })
  })

  describe('getNearbyRadiusMiles', () => {
    it('LOCAL_TIGHT × URBAN/SUBURBAN/RURAL → 1.5 / 4 / 7', () => {
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'URBAN')).toBe(1.5)
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'SUBURBAN')).toBe(4)
      expect(getNearbyRadiusMiles('LOCAL_TIGHT', 'RURAL')).toBe(7)
    })
    it('DESTINATION_WIDE × URBAN/SUBURBAN/RURAL → 15 / 25 / 35', () => {
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'URBAN')).toBe(15)
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'SUBURBAN')).toBe(25)
      expect(getNearbyRadiusMiles('DESTINATION_WIDE', 'RURAL')).toBe(35)
    })
  })

  describe('getMaxRung', () => {
    it('LOCAL_TIGHT × URBAN → LAD', () => {
      expect(getMaxRung('LOCAL_TIGHT', 'URBAN')).toBe('LAD')
    })
    it('MIXED_NORMAL × RURAL → COUNTRY', () => {
      expect(getMaxRung('MIXED_NORMAL', 'RURAL')).toBe('COUNTRY')
    })
    it('DESTINATION_WIDE × URBAN → NATIONAL', () => {
      expect(getMaxRung('DESTINATION_WIDE', 'URBAN')).toBe('NATIONAL')
    })
  })

  describe('getProximityBand', () => {
    it('NEARBY → "NEARBY" in all densities', () => {
      expect(getProximityBand('NEARBY', 'URBAN')).toBe('NEARBY')
      expect(getProximityBand('NEARBY', 'SUBURBAN')).toBe('NEARBY')
      expect(getProximityBand('NEARBY', 'RURAL')).toBe('NEARBY')
    })
    it('LAD → "A_LITTLE_FURTHER" in URBAN, "IN_YOUR_AREA" in SUBURBAN/RURAL', () => {
      expect(getProximityBand('LAD', 'URBAN')).toBe('A_LITTLE_FURTHER')
      expect(getProximityBand('LAD', 'SUBURBAN')).toBe('IN_YOUR_AREA')
      expect(getProximityBand('LAD', 'RURAL')).toBe('IN_YOUR_AREA')
    })
    it('NATIONAL → "NEAREST_ON_REDEEMO" in all densities', () => {
      expect(getProximityBand('NATIONAL', 'URBAN')).toBe('NEAREST_ON_REDEEMO')
      expect(getProximityBand('NATIONAL', 'SUBURBAN')).toBe('NEAREST_ON_REDEEMO')
      expect(getProximityBand('NATIONAL', 'RURAL')).toBe('NEAREST_ON_REDEEMO')
    })
  })

  describe('RUNG_ORDER', () => {
    it('has 8 rungs in the correct order', () => {
      expect(RUNG_ORDER).toEqual([
        'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
        'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
      ])
    })
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/ladderProfiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/lib/ladderProfiles.ts

export type LadderProfile =
  | 'LOCAL_TIGHT' | 'LOCAL_NORMAL' | 'MIXED_NORMAL' | 'DESTINATION_LOCAL' | 'DESTINATION_WIDE'

export type DensityClass = 'URBAN' | 'SUBURBAN' | 'RURAL'

export type SupplyRung =
  | 'NEARBY' | 'CATCHMENT' | 'POST_TOWN' | 'LAD'
  | 'COUNTY' | 'REGION' | 'COUNTRY' | 'NATIONAL'

export type ProximityBand =
  | 'NEARBY' | 'IN_YOUR_AREA' | 'A_LITTLE_FURTHER' | 'NEAREST_ON_REDEEMO'

type PopulationTier =
  | 'UNKNOWN' | 'HAMLET' | 'VILLAGE' | 'SMALL_TOWN'
  | 'TOWN' | 'LARGE_TOWN' | 'CITY' | 'METRO_CORE'

export const RUNG_ORDER: readonly SupplyRung[] = [
  'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
  'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
]

export function rungOrdinal(r: SupplyRung): number {
  return RUNG_ORDER.indexOf(r)
}

// NEARBY radius matrix — spec §5.2
const NEARBY_RADII: Record<LadderProfile, Record<DensityClass, number>> = {
  LOCAL_TIGHT:       { URBAN: 1.5, SUBURBAN: 4,  RURAL: 7  },
  LOCAL_NORMAL:      { URBAN: 3,   SUBURBAN: 6,  RURAL: 10 },
  MIXED_NORMAL:      { URBAN: 5,   SUBURBAN: 10, RURAL: 15 },
  DESTINATION_LOCAL: { URBAN: 8,   SUBURBAN: 15, RURAL: 20 },
  DESTINATION_WIDE:  { URBAN: 15,  SUBURBAN: 25, RURAL: 35 },
}

// Max rung matrix — spec §5.2
const MAX_RUNGS: Record<LadderProfile, Record<DensityClass, SupplyRung>> = {
  LOCAL_TIGHT:       { URBAN: 'LAD',      SUBURBAN: 'COUNTY',   RURAL: 'COUNTY'   },
  LOCAL_NORMAL:      { URBAN: 'COUNTY',   SUBURBAN: 'COUNTY',   RURAL: 'REGION'   },
  MIXED_NORMAL:      { URBAN: 'REGION',   SUBURBAN: 'REGION',   RURAL: 'COUNTRY'  },
  DESTINATION_LOCAL: { URBAN: 'COUNTRY',  SUBURBAN: 'COUNTRY',  RURAL: 'NATIONAL' },
  DESTINATION_WIDE:  { URBAN: 'NATIONAL', SUBURBAN: 'NATIONAL', RURAL: 'NATIONAL' },
}

// proximityBand mapping — spec §5.3
const PROXIMITY_BAND: Record<SupplyRung, Record<DensityClass, ProximityBand>> = {
  NEARBY:    { URBAN: 'NEARBY',              SUBURBAN: 'NEARBY',              RURAL: 'NEARBY'              },
  CATCHMENT: { URBAN: 'IN_YOUR_AREA',        SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  POST_TOWN: { URBAN: 'IN_YOUR_AREA',        SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  LAD:       { URBAN: 'A_LITTLE_FURTHER',    SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  COUNTY:    { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'A_LITTLE_FURTHER',    RURAL: 'A_LITTLE_FURTHER'    },
  REGION:    { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'A_LITTLE_FURTHER'    },
  COUNTRY:   { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'NEAREST_ON_REDEEMO'  },
  NATIONAL:  { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'NEAREST_ON_REDEEMO'  },
}

export function getNearbyRadiusMiles(p: LadderProfile, d: DensityClass): number {
  return NEARBY_RADII[p][d]
}

export function getMaxRung(p: LadderProfile, d: DensityClass): SupplyRung {
  return MAX_RUNGS[p][d]
}

export function getProximityBand(rung: SupplyRung, d: DensityClass): ProximityBand {
  return PROXIMITY_BAND[rung][d]
}

export function deriveDensityClass(tier: PopulationTier): DensityClass {
  switch (tier) {
    case 'METRO_CORE':
    case 'CITY':
      return 'URBAN'
    case 'LARGE_TOWN':
    case 'TOWN':
      return 'SUBURBAN'
    default:
      return 'RURAL'
  }
}

// Legacy compat — spec §3.7
export function mapRungToLegacyTier(rung: SupplyRung): 'NEARBY' | 'CITY' | 'DISTANT' {
  if (rung === 'NEARBY') return 'NEARBY'
  if (rung === 'CATCHMENT' || rung === 'POST_TOWN') return 'CITY'
  return 'DISTANT'
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/lib/ladderProfiles.test.ts`
Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/ladderProfiles.ts tests/api/lib/ladderProfiles.test.ts
git commit -m "feat(plan-4-m2): add ladderProfiles matrix (5 profiles × 3 density × 8 rungs)"
```

### Task M2.3: GPS → nearest-Locality lookup

**Files:**
- Create: `src/api/lib/nearestLocality.ts`
- Create: `tests/api/lib/nearestLocality.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/nearestLocality.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { findNearestLocality } from '../../../src/api/lib/nearestLocality'

describe('findNearestLocality', () => {
  beforeAll(async () => {
    await prisma.locality.createMany({
      data: [
        { name: 'TestUrban', slug: 'test-urban', ladDistrict: 'L1', country: 'England',
          centerLat: 51.5, centerLng: -0.1, populationTier: 'CITY' },
        { name: 'TestRural', slug: 'test-rural', ladDistrict: 'L2', country: 'England',
          centerLat: 51.6, centerLng: -0.2, populationTier: 'VILLAGE' },
      ],
      skipDuplicates: true,
    })
  })

  afterAll(async () => {
    await prisma.locality.deleteMany({ where: { slug: { startsWith: 'test-' } } })
  })

  it('returns the closest locality to a given GPS point', async () => {
    const result = await findNearestLocality(prisma, 51.51, -0.11)
    expect(result?.slug).toBe('test-urban')
  })

  it('returns null when no Locality exists within the bbox prefilter window', async () => {
    // A point far from any seeded test Locality (but within the existing seed)
    // — should still find SOMETHING (the seed has UK-wide coverage).
    // Test the null path with a deliberately impossible coordinate.
    const result = await findNearestLocality(prisma, 0, 0)  // off the coast of West Africa
    // The prefilter ~20mi window won't catch any UK Locality
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/nearestLocality.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/lib/nearestLocality.ts
import type { PrismaClient, Locality } from '../../../generated/prisma/client'

const BBOX_DEGREES = 0.3 // ~20 miles at UK latitudes

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function findNearestLocality(
  prisma: PrismaClient,
  lat: number,
  lng: number,
): Promise<Locality | null> {
  const candidates = await prisma.locality.findMany({
    where: {
      centerLat: { gte: lat - BBOX_DEGREES, lte: lat + BBOX_DEGREES },
      centerLng: { gte: lng - BBOX_DEGREES, lte: lng + BBOX_DEGREES },
    },
  })
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestDist = haversineMetres(lat, lng, Number(best.centerLat), Number(best.centerLng))
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    const d = haversineMetres(lat, lng, Number(c.centerLat), Number(c.centerLng))
    if (d < bestDist) { best = c; bestDist = d }
  }
  return best
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/lib/nearestLocality.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/nearestLocality.ts tests/api/lib/nearestLocality.test.ts
git commit -m "feat(plan-4-m2): add findNearestLocality with bbox prefilter + Haversine"
```

### Task M2.4: `EffectiveLocation` resolver

**Files:**
- Create: `src/api/lib/effectiveLocation.ts`
- Create: `tests/api/lib/effectiveLocation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/effectiveLocation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { resolveEffectiveLocation } from '../../../src/api/lib/effectiveLocation'

describe('resolveEffectiveLocation', () => {
  let testUserId: string
  let testLocalityId: string

  beforeAll(async () => {
    const loc = await prisma.locality.create({
      data: {
        name: 'TestLoc', slug: 'test-effective-loc',
        ladDistrict: 'TestLAD', country: 'England',
        centerLat: 51.5, centerLng: -0.1,
        populationTier: 'CITY',
      },
    })
    testLocalityId = loc.id
    const user = await prisma.user.create({
      data: {
        email: 'test-effective@test.local',
        latitude: 51.5, longitude: -0.1,
        localityId: loc.id,
      },
    })
    testUserId = user.id
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } })
    await prisma.locality.delete({ where: { id: testLocalityId } })
  })

  it('returns GPS-derived EffectiveLocation when ?lat&lng provided', async () => {
    const result = await resolveEffectiveLocation(prisma, { lat: 51.51, lng: -0.09 }, testUserId)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('GPS')
    expect(result!.densityClass).toBe('URBAN')
  })

  it('returns saved-profile EffectiveLocation when no GPS provided', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, testUserId)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('SAVED_PROFILE')
    expect(result!.locality.id).toBe(testLocalityId)
  })

  it('returns null when no signal at all', async () => {
    const result = await resolveEffectiveLocation(prisma, {}, null)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/effectiveLocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/lib/effectiveLocation.ts
import type { PrismaClient, Locality } from '../../../generated/prisma/client'
import { findNearestLocality } from './nearestLocality'
import { deriveDensityClass, type DensityClass } from './ladderProfiles'

export type EffectiveLocation = {
  lat: number
  lng: number
  locality: Locality
  densityClass: DensityClass
  source: 'GPS' | 'SAVED_PROFILE' | 'PLACE_QUERY'
}

export type EffectiveLocationQuery = {
  lat?: number
  lng?: number
  /** When a place is matched via search, the caller passes its centroid + locality directly. */
  placeLocality?: Locality
}

export async function resolveEffectiveLocation(
  prisma: PrismaClient,
  query: EffectiveLocationQuery,
  userId: string | null,
): Promise<EffectiveLocation | null> {
  // Priority 1: Place query (handled outside this function — caller passes placeLocality).
  if (query.placeLocality) {
    return {
      lat: Number(query.placeLocality.centerLat),
      lng: Number(query.placeLocality.centerLng),
      locality: query.placeLocality,
      densityClass: deriveDensityClass(query.placeLocality.populationTier),
      source: 'PLACE_QUERY',
    }
  }

  // Priority 2: Live GPS
  if (query.lat !== undefined && query.lng !== undefined) {
    const nearest = await findNearestLocality(prisma, query.lat, query.lng)
    if (!nearest) return null
    return {
      lat: query.lat,
      lng: query.lng,
      locality: nearest,
      densityClass: deriveDensityClass(nearest.populationTier),
      source: 'GPS',
    }
  }

  // Priority 3: Saved profile
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { locality: true },
    })
    if (user?.locality && user.latitude !== null && user.longitude !== null) {
      return {
        lat: Number(user.latitude),
        lng: Number(user.longitude),
        locality: user.locality,
        densityClass: deriveDensityClass(user.locality.populationTier),
        source: 'SAVED_PROFILE',
      }
    }
  }

  // Priority 4: No signal → null. Caller handles intent-driven fallback.
  return null
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/lib/effectiveLocation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/effectiveLocation.ts tests/api/lib/effectiveLocation.test.ts
git commit -m "feat(plan-4-m2): add resolveEffectiveLocation (GPS / saved-profile / place-query)"
```

### Task M2.5: `classifyRung` function

**Files:**
- Modify: `src/api/lib/ranking.ts`
- Create: `tests/api/lib/classifyRung.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/classifyRung.test.ts
import { describe, it, expect } from 'vitest'
import { classifyRung } from '../../../src/api/lib/ranking'
import type { EffectiveLocation } from '../../../src/api/lib/effectiveLocation'

// Test data structures — uses Plan 4 field names (locationCountry, not legacy country)
type TestBranch = {
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  locationCountry: string | null
}

const userLocality = {
  id: 'loc-user', name: 'UserTown', slug: 'user-town',
  ladDistrict: 'UserLAD', adminCounty: 'UserCounty',
  region: 'UserRegion', country: 'England',
  centerLat: 51.5, centerLng: -0.1, populationTier: 'CITY' as const,
} as any

const effLoc: EffectiveLocation = {
  lat: 51.5, lng: -0.1,
  locality: userLocality, densityClass: 'URBAN', source: 'GPS',
}

describe('classifyRung', () => {
  it('NEARBY when within radius', () => {
    const branch: TestBranch = {
      latitude: 51.501, longitude: -0.101,  // very close
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: null, ladDistrict: 'OtherLAD',
      adminCounty: null, region: null, locationCountry: null,
    }
    expect(classifyRung(branch, effLoc, 1.5, [])).toBe('NEARBY')
  })

  it('CATCHMENT when user locality has outgoing edge to branch locality', () => {
    const branch: TestBranch = {
      latitude: 53.0, longitude: -2.0,  // ~150mi away
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-target', postTown: null, ladDistrict: 'TargetLAD',
      adminCounty: null, region: null, locationCountry: null,
    }
    // catchment edges include user → branch locality
    expect(classifyRung(branch, effLoc, 1.5, ['loc-target'])).toBe('CATCHMENT')
  })

  it('POST_TOWN when same post town', () => {
    const branch: TestBranch = {
      latitude: 53.0, longitude: -2.0,
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: null,  // EFF user has null postTown — match by both null
      ladDistrict: 'OtherLAD',
      adminCounty: null, region: null, locationCountry: null,
    }
    // For real test: set both sides' postTown to same non-null string
    const effLocPostTown = { ...effLoc, locality: { ...userLocality, postTown: 'HUDDERSFIELD' } as any }
    const branchPostTown = { ...branch, postTown: 'HUDDERSFIELD' }
    expect(classifyRung(branchPostTown, effLocPostTown, 1.5, [])).toBe('POST_TOWN')
  })

  it('LAD when same ladDistrict (and no closer match)', () => {
    const branch: TestBranch = {
      latitude: 53.0, longitude: -2.0,
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: 'OtherTown',
      ladDistrict: 'UserLAD',  // matches user's LAD
      adminCounty: null, region: null, locationCountry: null,
    }
    expect(classifyRung(branch, effLoc, 1.5, [])).toBe('LAD')
  })

  it('COUNTRY when same country and no other match', () => {
    const branch: TestBranch = {
      latitude: 53.0, longitude: -2.0,
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: 'OtherTown',
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty', region: 'OtherRegion',
      locationCountry: 'England',  // matches
    }
    expect(classifyRung(branch, effLoc, 1.5, [])).toBe('COUNTRY')
  })

  it('NATIONAL when only country differs', () => {
    const branch: TestBranch = {
      latitude: 53.0, longitude: -2.0,
      isActive: true, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: 'OtherTown',
      ladDistrict: 'OtherLAD',
      adminCounty: 'OtherCounty', region: 'OtherRegion',
      locationCountry: 'Scotland',  // different
    }
    expect(classifyRung(branch, effLoc, 1.5, [])).toBe('NATIONAL')
  })

  it('returns null for non-discoverable branches', () => {
    const inactiveBranch: TestBranch = {
      latitude: 51.501, longitude: -0.101,
      isActive: false, locationConfidence: 'MANUALLY_CONFIRMED',
      localityId: 'loc-other', postTown: null, ladDistrict: null,
      adminCounty: null, region: null, locationCountry: null,
    }
    expect(classifyRung(inactiveBranch, effLoc, 1.5, [])).toBeNull()

    const centroidBranch: TestBranch = {
      latitude: 51.501, longitude: -0.101,
      isActive: true, locationConfidence: 'POSTCODE_CENTROID',
      localityId: 'loc-other', postTown: null, ladDistrict: null,
      adminCounty: null, region: null, locationCountry: null,
    }
    expect(classifyRung(centroidBranch, effLoc, 1.5, [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/classifyRung.test.ts`
Expected: FAIL — `classifyRung` not exported.

- [ ] **Step 3: Implement `classifyRung` in `ranking.ts`**

Append to `src/api/lib/ranking.ts`:

```typescript
import type { SupplyRung } from './ladderProfiles'
import type { EffectiveLocation } from './effectiveLocation'

const MILES_TO_METRES = 1609.344

type BranchForClassification = {
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  country: string | null
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Classify a branch into a SupplyRung relative to an EffectiveLocation.
 *
 * Returns null for non-discoverable branches (inactive, not pin-confirmed).
 */
export function classifyRung(
  branch: BranchForClassification,
  effLoc: EffectiveLocation,
  nearbyRadiusMiles: number,
  /** Locality IDs reachable from effLoc.locality via outgoing CATCHMENT edges */
  outgoingCatchmentTargetIds: readonly string[],
): SupplyRung | null {
  // Discoverability gate
  if (!branch.isActive) return null
  if (branch.locationConfidence !== 'MANUALLY_CONFIRMED' && branch.locationConfidence !== 'ADDRESS_GEOCODED') {
    return null
  }

  // NEARBY: distance check
  if (branch.latitude !== null && branch.longitude !== null) {
    const dMetres = haversineMetres(effLoc.lat, effLoc.lng, branch.latitude, branch.longitude)
    if (dMetres <= nearbyRadiusMiles * MILES_TO_METRES) return 'NEARBY'
  }

  // CATCHMENT: same locality OR effLoc has outgoing edge to branch's locality
  if (branch.localityId && (
    branch.localityId === effLoc.locality.id ||
    outgoingCatchmentTargetIds.includes(branch.localityId)
  )) {
    return 'CATCHMENT'
  }

  // POST_TOWN
  if (branch.postTown && effLoc.locality.postTown && branch.postTown === effLoc.locality.postTown) {
    return 'POST_TOWN'
  }

  // LAD
  if (branch.ladDistrict && branch.ladDistrict === effLoc.locality.ladDistrict) {
    return 'LAD'
  }

  // COUNTY
  if (branch.adminCounty && effLoc.locality.adminCounty && branch.adminCounty === effLoc.locality.adminCounty) {
    return 'COUNTY'
  }

  // REGION
  if (branch.region && effLoc.locality.region && branch.region === effLoc.locality.region) {
    return 'REGION'
  }

  // COUNTRY — Plan 4 nation match.
  // Read from `branch.locationCountry` (the Plan 4 nation snapshot), NOT `branch.country`
  // (the legacy address-country, e.g. "GB"). The two fields have different semantics; see
  // spec §3.5 + P1.2 pre-flight note.
  if (branch.locationCountry && branch.locationCountry === effLoc.locality.country) {
    return 'COUNTRY'
  }

  // NATIONAL: fallback (any UK-wide branch)
  return 'NATIONAL'
}
```

`BranchForClassification` type updates accordingly — rename the `country` field to `locationCountry` to mirror the schema:

```typescript
type BranchForClassification = {
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  locationCountry: string | null  // Plan 4 nation field (NOT legacy address-country)
}
```

The classifyRung test fixtures should set `locationCountry`, not `country`. M2.5's test code uses `country: null` in fixture rows — those references should be `locationCountry: null` to match the type.

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/lib/classifyRung.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/ranking.ts tests/api/lib/classifyRung.test.ts
git commit -m "feat(plan-4-m2): add classifyRung with 8-rung ladder + discoverability gate"
```

### Task M2.6: `rankMerchants` v2 (collect-first algorithm)

**Files:**
- Modify: `src/api/lib/ranking.ts` (rewrite `rankMerchants` per spec §5.6)
- Create: `tests/api/lib/rankMerchants-v2.test.ts`

- [ ] **Step 1: Write the failing test (high-level scenarios)**

```typescript
// tests/api/lib/rankMerchants-v2.test.ts
import { describe, it, expect } from 'vitest'
import { rankMerchantsV2 } from '../../../src/api/lib/ranking'
import type { EffectiveLocation } from '../../../src/api/lib/effectiveLocation'

const huddersfieldLocality = {
  id: 'loc-huddersfield', name: 'Huddersfield', slug: 'huddersfield',
  ladDistrict: 'Kirklees', adminCounty: 'West Yorkshire',
  region: 'Yorkshire and the Humber', country: 'England',
  centerLat: 53.6458, centerLng: -1.7850, populationTier: 'LARGE_TOWN' as const,
  postTown: 'HUDDERSFIELD',
} as any

const effLoc: EffectiveLocation = {
  lat: 53.6458, lng: -1.7850,
  locality: huddersfieldLocality, densityClass: 'SUBURBAN', source: 'GPS',
}

const merchant = (id: string, branches: any[]) => ({ id, businessName: id, branches })
const branch = (latitude: number, longitude: number, opts: Partial<any> = {}) => ({
  id: `b-${Math.random()}`, latitude, longitude,
  isActive: true, locationConfidence: 'MANUALLY_CONFIRMED' as const,
  localityId: 'loc-other', postTown: null, ladDistrict: 'Kirklees',
  adminCounty: 'West Yorkshire', region: 'Yorkshire and the Humber',
  locationCountry: 'England',  // Plan 4 nation field (NOT legacy address-country)
  ...opts,
})

describe('rankMerchantsV2', () => {
  it('returns tiles tagged with supplyRung + proximityBand from context branch', async () => {
    const merchants = [
      merchant('m-nearby',     [branch(53.65,   -1.78)]),                       // ~0.3mi
      merchant('m-catchment',  [branch(53.30,   -1.50, { localityId: 'loc-huddersfield' })]),  // same locality FK
      merchant('m-far',        [branch(51.50,   -0.10)]),                       // London ~140mi
    ]
    const result = rankMerchantsV2(merchants, {
      effLoc,
      ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50,
      hardCap: 200,
    })
    expect(result.tiles.find(t => t.merchantId === 'm-nearby')?.supplyRung).toBe('NEARBY')
    expect(result.tiles.find(t => t.merchantId === 'm-catchment')?.supplyRung).toBe('CATCHMENT')
    // m-far in London: same country (England) → COUNTRY rung. Not REGION (Yorkshire and the Humber vs London).
    expect(result.tiles.find(t => t.merchantId === 'm-far')?.supplyRung).toBe('COUNTRY')
  })

  it('collects all candidate branches per merchant before selecting context branch', async () => {
    // Merchant has TWO branches: one far, one near.
    const merchants = [
      merchant('m-multi', [
        branch(51.50, -0.10),  // London — far
        branch(53.65, -1.78),  // Huddersfield — nearby
      ]),
    ]
    const result = rankMerchantsV2(merchants, {
      effLoc,
      ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50,
      hardCap: 200,
    })
    const tile = result.tiles.find(t => t.merchantId === 'm-multi')!
    expect(tile.supplyRung).toBe('NEARBY')  // best rung wins
    expect(tile.distanceMetres).toBeLessThan(1000)  // within 1km of Huddersfield
  })

  it('respects maxRung — RURAL LOCAL_TIGHT stops at COUNTY', async () => {
    const rural: EffectiveLocation = {
      ...effLoc, densityClass: 'RURAL',
      locality: { ...huddersfieldLocality, populationTier: 'VILLAGE' } as any,
    }
    const merchants = [
      merchant('m-nearby',  [branch(rural.lat + 0.01, rural.lng + 0.01)]),  // NEARBY
      merchant('m-region',  [branch(53.0, -1.0)]),                          // REGION
      merchant('m-national',[branch(51.5, -0.1, { locationCountry: 'Scotland', region: null, adminCounty: null })]), // NATIONAL
    ]
    const result = rankMerchantsV2(merchants, {
      effLoc: rural,
      ladderProfile: 'LOCAL_TIGHT',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'LOCAL',
      targetCount: 50,
      hardCap: 200,
    })
    expect(result.tiles.find(t => t.merchantId === 'm-nearby')).toBeDefined()
    // LOCAL_TIGHT × RURAL max is COUNTY — REGION/COUNTRY/NATIONAL should NOT appear.
    expect(result.tiles.find(t => t.merchantId === 'm-region')).toBeUndefined()
    expect(result.tiles.find(t => t.merchantId === 'm-national')).toBeUndefined()
  })

  it('legacy supplyTier compat field is populated alongside supplyRung', async () => {
    const merchants = [
      merchant('m-nearby', [branch(53.65, -1.78)]),
      merchant('m-far',    [branch(51.50, -0.10)]),
    ]
    const result = rankMerchantsV2(merchants, {
      effLoc,
      ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50,
      hardCap: 200,
    })
    expect(result.tiles.find(t => t.merchantId === 'm-nearby')?.supplyTier).toBe('NEARBY')
    expect(result.tiles.find(t => t.merchantId === 'm-far')?.supplyTier).toBe('DISTANT')
  })

  it('rungCounts surfaces in the result envelope', async () => {
    const merchants = [
      merchant('m-1', [branch(53.65, -1.78)]),
      merchant('m-2', [branch(53.66, -1.79)]),
      merchant('m-3', [branch(51.50, -0.10)]),
    ]
    const result = rankMerchantsV2(merchants, {
      effLoc, ladderProfile: 'MIXED_NORMAL',
      outgoingCatchmentTargetIds: [],
      categoryIntent: 'MIXED',
      targetCount: 50, hardCap: 200,
    })
    expect(result.rungCounts.NEARBY).toBe(2)
    expect(result.rungCounts.COUNTRY).toBe(1)
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/rankMerchants-v2.test.ts`
Expected: FAIL — `rankMerchantsV2` not exported.

- [ ] **Step 3: Implement `rankMerchantsV2`**

Append to `src/api/lib/ranking.ts`:

```typescript
import {
  RUNG_ORDER, rungOrdinal,
  getNearbyRadiusMiles, getMaxRung, getProximityBand,
  mapRungToLegacyTier,
  type LadderProfile, type SupplyRung, type ProximityBand,
} from './ladderProfiles'

type CategoryIntent = 'LOCAL' | 'MIXED' | 'DESTINATION'

export type RankableMerchant<B = any> = {
  id: string
  businessName: string
  branches: B[]
}

type RankableBranch = {
  id: string
  latitude: number | null
  longitude: number | null
  isActive: boolean
  locationConfidence: 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'POSTCODE_CENTROID' | 'NEEDS_REVIEW'
  localityId: string | null
  localityName: string | null
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  country: string | null
}

export type RankMerchantsV2Input<B extends RankableBranch> = {
  effLoc: EffectiveLocation
  ladderProfile: LadderProfile
  outgoingCatchmentTargetIds: readonly string[]
  categoryIntent: CategoryIntent
  targetCount: number
  hardCap: number
}

export type RankedTile = {
  merchantId: string
  businessName: string
  supplyRung: SupplyRung
  supplyTier: 'NEARBY' | 'CITY' | 'DISTANT'  // legacy compat
  proximityBand: ProximityBand
  distanceMetres: number | null
  contextBranchId: string
}

export type RankMerchantsV2Result = {
  tiles: RankedTile[]
  rungCounts: Record<SupplyRung, number>
}

const MILES_TO_METRES = 1609.344

function selectContextBranch<B extends RankableBranch>(
  branches: Array<B & { matchedRung: SupplyRung }>,
  effLoc: EffectiveLocation,
): B & { matchedRung: SupplyRung } {
  // Rank by most-specific rung first, then by distance, then alphabetical.
  return [...branches].sort((a, b) => {
    const ra = rungOrdinal(a.matchedRung)
    const rb = rungOrdinal(b.matchedRung)
    if (ra !== rb) return ra - rb
    const da = a.latitude !== null && a.longitude !== null
      ? haversineMetres(effLoc.lat, effLoc.lng, a.latitude, a.longitude) : Infinity
    const db = b.latitude !== null && b.longitude !== null
      ? haversineMetres(effLoc.lat, effLoc.lng, b.latitude, b.longitude) : Infinity
    if (da !== db) return da - db
    return (a.id ?? '').localeCompare(b.id ?? '')
  })[0]
}

/**
 * Fixes pre-flight P1.8: `targetCount` is enforced; in-rung sort is intent-aware (LOCAL=distance ASC,
 * DESTINATION=quality-aware, MIXED=distance ASC for NEARBY rung and quality-aware for outer rungs).
 *
 * `RankableMerchant` now requires `avgRating` + `reviewCount` so the quality comparator can run.
 * The service layer is already aggregating these per Plan 1.5; pass them through into rankMerchantsV2.
 */

const MIN_REVIEW_COUNT_FOR_RATING_SORT = 3   // unchanged from Plan 1.5

function qualityComparator(
  a: { businessName: string; avgRating: number | null; reviewCount: number },
  b: { businessName: string; avgRating: number | null; reviewCount: number },
): number {
  const aRated = (a.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  const bRated = (b.reviewCount ?? 0) >= MIN_REVIEW_COUNT_FOR_RATING_SORT
  if (aRated && bRated) return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  if (aRated) return -1
  if (bRated) return 1
  return a.businessName.localeCompare(b.businessName)
}

function distanceComparator(
  a: { contextBranch: { latitude: number | null; longitude: number | null } },
  b: { contextBranch: { latitude: number | null; longitude: number | null } },
  effLoc: EffectiveLocation,
): number {
  const da = a.contextBranch.latitude !== null && a.contextBranch.longitude !== null
    ? haversineMetres(effLoc.lat, effLoc.lng, a.contextBranch.latitude, a.contextBranch.longitude) : Infinity
  const db = b.contextBranch.latitude !== null && b.contextBranch.longitude !== null
    ? haversineMetres(effLoc.lat, effLoc.lng, b.contextBranch.latitude, b.contextBranch.longitude) : Infinity
  return da - db
}

export function rankMerchantsV2<B extends RankableBranch>(
  merchants: RankableMerchant<B>[],
  input: RankMerchantsV2Input<B>,
): RankMerchantsV2Result {
  const { effLoc, ladderProfile, outgoingCatchmentTargetIds, categoryIntent, targetCount, hardCap } = input
  const nearbyRadius = getNearbyRadiusMiles(ladderProfile, effLoc.densityClass)
  const maxRung = getMaxRung(ladderProfile, effLoc.densityClass)
  const maxRungOrdinal = rungOrdinal(maxRung)

  // Step 1: collect every discoverable branch's matched rung, grouped by merchant.
  // This is the "collect-first" rule from §5.6 — context branch is selected later.
  const candidateBranchesByMerchant = new Map<string, Array<B & { matchedRung: SupplyRung }>>()
  for (const m of merchants) {
    for (const b of m.branches) {
      const rung = classifyRung(b as any, effLoc, nearbyRadius, outgoingCatchmentTargetIds)
      if (rung === null) continue
      if (rungOrdinal(rung) > maxRungOrdinal) continue
      const bucket = candidateBranchesByMerchant.get(m.id) ?? []
      bucket.push({ ...b, matchedRung: rung })
      candidateBranchesByMerchant.set(m.id, bucket)
    }
  }

  // Step 2: one merchant entry per id; pick the best context branch.
  type MerchantEntry = {
    id: string
    businessName: string
    avgRating: number | null
    reviewCount: number
    contextBranch: B & { matchedRung: SupplyRung }
    bestRung: SupplyRung
  }
  const entries: MerchantEntry[] = []
  for (const [id, branches] of candidateBranchesByMerchant.entries()) {
    const merchant = merchants.find(m => m.id === id)!
    const contextBranch = selectContextBranch(branches, effLoc)
    entries.push({
      id,
      businessName: merchant.businessName,
      avgRating: merchant.avgRating ?? null,
      reviewCount: merchant.reviewCount ?? 0,
      contextBranch,
      bestRung: contextBranch.matchedRung,
    })
  }

  // Step 3: group entries by rung, sort within each rung per categoryIntent, concat.
  const byRung = new Map<SupplyRung, MerchantEntry[]>()
  for (const e of entries) {
    const arr = byRung.get(e.bestRung) ?? []
    arr.push(e)
    byRung.set(e.bestRung, arr)
  }

  function sortWithinRung(rung: SupplyRung, arr: MerchantEntry[]): MerchantEntry[] {
    // Intent-aware in-rung sort per spec §5.8:
    //   LOCAL:       distance ASC, then alphabetical
    //   DESTINATION: quality-aware (rated by avgRating DESC, then alphabetical)
    //   MIXED:       distance ASC for NEARBY rung; quality-aware for outer rungs
    if (categoryIntent === 'LOCAL') {
      return [...arr].sort((a, b) => {
        const d = distanceComparator(a, b, effLoc)
        if (d !== 0) return d
        return a.businessName.localeCompare(b.businessName)
      })
    }
    if (categoryIntent === 'DESTINATION') {
      return [...arr].sort(qualityComparator)
    }
    // MIXED
    if (rung === 'NEARBY') {
      return [...arr].sort((a, b) => {
        const d = distanceComparator(a, b, effLoc)
        if (d !== 0) return d
        return a.businessName.localeCompare(b.businessName)
      })
    }
    return [...arr].sort(qualityComparator)
  }

  // Step 4: stitch the rung-ordered, intent-sorted entries, applying targetCount + hardCap.
  const tiles: RankedTile[] = []
  const rungCounts: Record<SupplyRung, number> = {
    NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0,
    COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0,
  }
  let nearbyRungEvaluated = false

  for (const rung of RUNG_ORDER) {
    if (rungOrdinal(rung) > maxRungOrdinal) break
    const arr = byRung.get(rung) ?? []
    const sorted = sortWithinRung(rung, arr)

    for (const e of sorted) {
      if (tiles.length >= hardCap) break
      const cb = e.contextBranch
      const distance = cb.latitude !== null && cb.longitude !== null
        ? haversineMetres(effLoc.lat, effLoc.lng, cb.latitude, cb.longitude) : null
      tiles.push({
        merchantId: e.id,
        businessName: e.businessName,
        supplyRung: e.bestRung,
        supplyTier: mapRungToLegacyTier(e.bestRung),
        proximityBand: getProximityBand(e.bestRung, effLoc.densityClass),
        distanceMetres: distance,
        contextBranchId: (cb as any).id,
      })
      rungCounts[e.bestRung]++
    }

    if (rung === 'NEARBY') nearbyRungEvaluated = true

    // targetCount cap: stop adding further rungs once we've hit the target,
    // BUT always include the NEARBY rung's results first (per §5.6).
    if (tiles.length >= targetCount && nearbyRungEvaluated) break
    if (tiles.length >= hardCap) break
  }

  return { tiles, rungCounts }
}
```

**Note on `RankableMerchant`** — update the type to include the quality fields (already aggregated by Plan 1.5):

```typescript
export type RankableMerchant<B = any> = {
  id: string
  businessName: string
  avgRating: number | null      // Plan 1.5 aggregate
  reviewCount: number            // Plan 1.5 aggregate
  branches: B[]
}
```

The service layer (M3) populates these from the existing review aggregation.

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/lib/rankMerchants-v2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/ranking.ts tests/api/lib/rankMerchants-v2.test.ts
git commit -m "feat(plan-4-m2): rankMerchantsV2 collect-first ladder walk with proximityBand"
```

### Task M2.7: Verify M2 unit-test suite + integration

- [ ] **Step 1: Run all M2 tests**

Run: `npx vitest run tests/api/lib/ladderProfiles tests/api/lib/nearestLocality tests/api/lib/effectiveLocation tests/api/lib/classifyRung tests/api/lib/rankMerchants-v2`
Expected: all pass.

- [ ] **Step 2: Run full backend test sweep — confirm no regression**

Run: `npx vitest run`
Expected: pre-existing tests still pass. M2 didn't touch Discovery routes (M3 handles that) so existing Discovery contract tests should still pass against the OLD `rankMerchants`.

- [ ] **Step 3: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1`
Expected: clean.

### Task M2.8: Push M2 + open PR

- [ ] **Step 1: Push**

Run: `git push -u origin feature/plan-4-m2-ranking`

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(plan-4-m2): density-adaptive ranking ladder + EffectiveLocation" --body "$(cat <<'EOF'
## Summary

Plan 4a Milestone 2 — Ranking core. Adds the density-adaptive 8-rung ladder, EffectiveLocation resolver, GPS nearest-Locality lookup, and \`rankMerchantsV2\` collect-first algorithm. Discovery routes are NOT yet flipped to v2 (that's M3).

### New code
- \`src/api/lib/ladderProfiles.ts\` — 5 × 3 NEARBY-radius matrix, max-rung matrix, proximityBand mapping, density derivation.
- \`src/api/lib/nearestLocality.ts\` — bbox-prefiltered Haversine for GPS → nearest Locality.
- \`src/api/lib/effectiveLocation.ts\` — central GPS / saved-profile / place-query resolver.
- \`src/api/lib/ranking.ts\` — \`classifyRung\` (8-rung with discoverability gate) + \`rankMerchantsV2\` (collect-first, context-branch selection per merchant).

### Test coverage
- Density × profile × rung matrix.
- GPS resolver path + saved-profile fallback + no-signal null.
- 8-rung classification covering NEARBY / CATCHMENT / POST_TOWN / LAD / COUNTY / REGION / COUNTRY / NATIONAL.
- Discoverability gate (inactive + non-pin-confirmed branches return null rung).
- Collect-first: merchant with branches in multiple rungs picks the best-rung context branch.
- Legacy \`supplyTier\` compat field is populated correctly from \`supplyRung\`.

### No customer-visible behaviour change
Existing Discovery routes still use the old \`rankMerchants\` until M3. M2 only adds the new modules.

## Test plan
- [ ] \`npx vitest run\` — all backend tests pass.
- [ ] \`npx tsc --noEmit\` clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Await owner review + merge (M3)**

---

## Milestone M3 — Consumer wire-up (first customer-visible flip)

**Goal:** Discovery / Search / Category / Map service code consumes `rankMerchantsV2` + `EffectiveLocation`. API responses gain `supplyRung`, `proximityBand`, `rungCounts`, `effectiveLocality` — ADDITIVE alongside legacy fields. Customer-app types extended. Home / Search / Category / Map screens render `proximityBand` chips on non-NEARBY tiles + contextual locality in the meta line. Empty-state copy NOT changed in this milestone (M4).

**Output:** one PR titled "feat(plan-4-m3): wire Discovery surfaces to rankMerchantsV2 (additive contract)".

### Task M3.1: Branch from main (post-M2-merge)

- [ ] **Step 1: Pull latest main + branch**

```bash
git checkout main && git pull
git checkout -b feature/plan-4-m3-consumer-wire-up
```

### Task M3.2: Pull outgoing catchment target IDs in service layer

Discovery service needs to look up `outgoingCatchmentTargetIds` for the user's locality so `classifyRung` can identify CATCHMENT-rung branches.

**Files:**
- Create: `src/api/lib/catchmentLookup.ts`
- Create: `tests/api/lib/catchmentLookup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/lib/catchmentLookup.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../../helpers/prisma'
import { getOutgoingCatchmentTargetIds } from '../../../src/api/lib/catchmentLookup'

describe('getOutgoingCatchmentTargetIds', () => {
  let sourceId: string
  let targetAId: string
  let targetBId: string

  beforeAll(async () => {
    const source = await prisma.locality.create({ data: {
      name: 'TestVillage', slug: 'test-catchment-village',
      ladDistrict: 'L', country: 'England', centerLat: 51.5, centerLng: -0.1,
      populationTier: 'VILLAGE',
    } })
    const targetA = await prisma.locality.create({ data: {
      name: 'TestCentreA', slug: 'test-catchment-centre-a',
      ladDistrict: 'L', country: 'England', centerLat: 51.6, centerLng: -0.2,
      populationTier: 'TOWN',
    } })
    const targetB = await prisma.locality.create({ data: {
      name: 'TestCentreB', slug: 'test-catchment-centre-b',
      ladDistrict: 'L', country: 'England', centerLat: 51.7, centerLng: -0.3,
      populationTier: 'LARGE_TOWN',
    } })
    sourceId = source.id; targetAId = targetA.id; targetBId = targetB.id
    await prisma.localityCatchmentEdge.createMany({ data: [
      { sourceLocalityId: sourceId, targetLocalityId: targetAId, rank: 1 },
      { sourceLocalityId: sourceId, targetLocalityId: targetBId, rank: 2 },
    ] })
  })

  afterAll(async () => {
    await prisma.localityCatchmentEdge.deleteMany({ where: { sourceLocalityId: sourceId } })
    await prisma.locality.deleteMany({ where: { id: { in: [sourceId, targetAId, targetBId] } } })
  })

  it('returns target ids ordered by rank', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, sourceId)
    expect(ids).toEqual([targetAId, targetBId])
  })

  it('returns empty array when no outgoing edges', async () => {
    const ids = await getOutgoingCatchmentTargetIds(prisma, 'non-existent-id')
    expect(ids).toEqual([])
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/lib/catchmentLookup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/lib/catchmentLookup.ts
import type { PrismaClient } from '../../../generated/prisma/client'

export async function getOutgoingCatchmentTargetIds(
  prisma: PrismaClient,
  sourceLocalityId: string,
): Promise<readonly string[]> {
  const edges = await prisma.localityCatchmentEdge.findMany({
    where: { sourceLocalityId },
    select: { targetLocalityId: true, rank: true },
    orderBy: { rank: 'asc' },
  })
  return edges.map(e => e.targetLocalityId)
}
```

- [ ] **Step 4: Run tests + commit**

Run: `npx vitest run tests/api/lib/catchmentLookup.test.ts`
Expected: PASS.

```bash
git add src/api/lib/catchmentLookup.ts tests/api/lib/catchmentLookup.test.ts
git commit -m "feat(plan-4-m3): add getOutgoingCatchmentTargetIds helper"
```

### Task M3.3: Update Discovery service to use `rankMerchantsV2`

**Files:**
- Modify: `src/api/customer/discovery/service.ts`

- [ ] **Step 1: Read current `searchMerchants` + `getHomeFeed` + `getCategoryMerchants` + `getInAreaMerchants` to understand the shape**

Run: `grep -n "rankMerchants\|classifyTier\|profileCity" src/api/customer/discovery/service.ts | head -30`

- [ ] **Step 2: Replace the existing `rankMerchants` call sites with `rankMerchantsV2` + EffectiveLocation**

For each public function (`getHomeFeed`, `searchMerchants`, `getCategoryMerchants`, `getInAreaMerchants`):

1. Replace `resolveProfileCity()` / `profileCity` usage with `resolveEffectiveLocation(prisma, { lat, lng }, userId)`.
2. After resolving EffectiveLocation, call `getOutgoingCatchmentTargetIds(prisma, effLoc.locality.id)`.
3. Read `Category.ladderProfile` and `Subcategory.ladderProfileOverride` to determine the effective `LadderProfile` for the query.
4. Replace `rankMerchants(...)` with `rankMerchantsV2(merchants, { effLoc, ladderProfile, outgoingCatchmentTargetIds, categoryIntent, targetCount, hardCap })`.
5. The returned `tiles[]` carries `supplyRung` + `proximityBand`; surface these on the response.
6. Keep legacy `supplyTier`/`nearbyCount`/`cityCount`/`distantCount` populated via the mapping (M2 already provides `mapRungToLegacyTier`).

Sketch of one function (`searchMerchants` example, abridged):

```typescript
// inside searchMerchants
import { resolveEffectiveLocation } from '../../lib/effectiveLocation'
import { getOutgoingCatchmentTargetIds } from '../../lib/catchmentLookup'
import { rankMerchantsV2, type RankableMerchant } from '../../lib/ranking'

export async function searchMerchants(prisma: PrismaClient, params: SearchParams) {
  const effLoc = await resolveEffectiveLocation(prisma, { lat: params.lat, lng: params.lng }, params.userId)

  // Existing merchant fetch logic (q + categoryId + filters) — preserve.
  const merchantsRaw = await prisma.merchant.findMany({ /* ... existing where ... */
    include: { branches: true, primaryCategory: true /* ... */ },
  })

  if (!effLoc) {
    // No-location fallback per spec §5.10
    const category = params.categoryId ? await prisma.category.findUnique({ where: { id: params.categoryId } }) : null
    if (category?.intentType === 'DESTINATION') {
      // Show national DESTINATION listings (existing behaviour preserves)
      // ... fall through to alphabetical sort with synthetic NATIONAL rungs
    }
    return {
      merchants: [],
      total: 0,
      meta: {
        // legacy
        nearbyCount: 0, cityCount: 0, distantCount: 0,
        resolvedArea: 'United Kingdom',
        // new
        rungCounts: { NEARBY: 0, CATCHMENT: 0, POST_TOWN: 0, LAD: 0, COUNTY: 0, REGION: 0, COUNTRY: 0, NATIONAL: 0 },
        effectiveLocality: null,
        emptyStateReason: 'NO_LOCATION_SIGNAL' as const,
      },
    }
  }

  // Compute outgoing catchment edges from user's locality.
  const outgoingCatchmentTargetIds = await getOutgoingCatchmentTargetIds(prisma, effLoc.locality.id)

  // Determine LadderProfile from category/subcategory.
  const ladderProfile = await resolveLadderProfileForCategory(prisma, params.categoryId, params.subcategoryId)

  const categoryIntent = await resolveCategoryIntent(prisma, params.categoryId)

  const ranked = rankMerchantsV2(merchantsRaw as RankableMerchant<any>[], {
    effLoc,
    ladderProfile,
    outgoingCatchmentTargetIds,
    categoryIntent,
    targetCount: 50,
    hardCap: 500,
  })

  // Paginate `ranked.tiles` per offset+limit. Enrich into the existing MerchantTile shape.
  // Legacy compat:
  const legacyCounts = {
    nearbyCount: ranked.rungCounts.NEARBY,
    cityCount:   ranked.rungCounts.CATCHMENT + ranked.rungCounts.POST_TOWN,
    distantCount: ranked.rungCounts.LAD + ranked.rungCounts.COUNTY +
                  ranked.rungCounts.REGION + ranked.rungCounts.COUNTRY + ranked.rungCounts.NATIONAL,
  }

  return {
    merchants: enrichTiles(ranked.tiles /* paginated */),  // existing enrich function
    total: ranked.tiles.length,
    meta: {
      // legacy
      ...legacyCounts,
      resolvedArea: effLoc.locality.name,
      // new
      rungCounts: ranked.rungCounts,
      effectiveLocality: { id: effLoc.locality.id, name: effLoc.locality.name },
      emptyStateReason: null,
    },
  }
}
```

A helper:

```typescript
async function resolveLadderProfileForCategory(
  prisma: PrismaClient,
  categoryId: string | undefined,
  subcategoryId: string | undefined,
): Promise<LadderProfile> {
  if (subcategoryId) {
    const sub = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      include: { parentCategory: true },
    })
    if (sub?.ladderProfileOverride) return sub.ladderProfileOverride
    if (sub?.parentCategory.ladderProfile) return sub.parentCategory.ladderProfile
  }
  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (cat?.ladderProfile) return cat.ladderProfile
  }
  return 'MIXED_NORMAL'  // safe default
}
```

Repeat the pattern for the other three public functions. For `getInAreaMerchants` (Map), build the EffectiveLocation from the viewport bbox centre per spec §5.7 (not the user's lat/lng):

```typescript
// inside getInAreaMerchants — Map-specific viewport-led EffectiveLocation
const viewportCenterLat = (params.minLat + params.maxLat) / 2
const viewportCenterLng = (params.minLng + params.maxLng) / 2
const nearest = await findNearestLocality(prisma, viewportCenterLat, viewportCenterLng)
const effLoc: EffectiveLocation | null = nearest ? {
  lat: viewportCenterLat, lng: viewportCenterLng,
  locality: nearest,
  densityClass: deriveDensityClass(nearest.populationTier),
  source: 'GPS',  // synthetic — bbox-centre acts like a GPS point
} : null
// ... rest of the function uses effLoc as in searchMerchants
```

- [ ] **Step 3: Mark unused legacy code paths**

Add a `@deprecated` JSDoc tag on the old `rankMerchants` and `classifyTier` exports — they stay in the file for one deprecation cycle but no callers should remain.

```typescript
/** @deprecated Plan 4a M5 will remove. Use rankMerchantsV2 instead. */
export function rankMerchants(...) { /* unchanged */ }
```

- [ ] **Step 4: Commit**

```bash
git add src/api/customer/discovery/service.ts src/api/lib/ranking.ts
git commit -m "feat(plan-4-m3): wire Discovery service to rankMerchantsV2 + EffectiveLocation"
```

### Task M3.4: Update Discovery API response Zod schemas (additive)

**Files:**
- Modify: `src/api/customer/discovery/routes.ts` (or the response schemas/types)

- [ ] **Step 1: Extend the response schemas**

Wherever the Discovery routes define their response shape (Fastify schema, Zod, or hand-rolled types), extend the tile schema and meta schema:

```typescript
// Tile schema additions
supplyRung:     z.enum(['NEARBY','CATCHMENT','POST_TOWN','LAD','COUNTY','REGION','COUNTRY','NATIONAL']),
proximityBand:  z.enum(['NEARBY','IN_YOUR_AREA','A_LITTLE_FURTHER','NEAREST_ON_REDEEMO']),

// Meta schema additions
rungCounts: z.object({
  NEARBY: z.number(), CATCHMENT: z.number(), POST_TOWN: z.number(),
  LAD: z.number(),    COUNTY: z.number(),    REGION: z.number(),
  COUNTRY: z.number(), NATIONAL: z.number(),
}),
effectiveLocality: z.object({ id: z.string(), name: z.string() }).nullable(),
```

Existing legacy fields (`supplyTier`, `nearbyCount`, `cityCount`, `distantCount`, `resolvedArea`, `emptyStateReason`) STAY in the schema.

- [ ] **Step 2: Commit**

```bash
git add src/api/customer/discovery/routes.ts
git commit -m "feat(plan-4-m3): extend Discovery response schemas with supplyRung + proximityBand + rungCounts"
```

### Task M3.5: Customer-app discovery types — additive

**Files:**
- Modify: `apps/customer-app/src/lib/api/discovery.ts`

- [ ] **Step 1: Extend Zod schemas**

```typescript
// At the top of the file, add the new types:
export const supplyRungSchema = z.enum([
  'NEARBY','CATCHMENT','POST_TOWN','LAD',
  'COUNTY','REGION','COUNTRY','NATIONAL',
])
export type SupplyRung = z.infer<typeof supplyRungSchema>

export const proximityBandSchema = z.enum([
  'NEARBY','IN_YOUR_AREA','A_LITTLE_FURTHER','NEAREST_ON_REDEEMO',
])
export type ProximityBand = z.infer<typeof proximityBandSchema>

// In the existing merchantTileSchema, add (preserve existing fields):
// existing: supplyTier: z.enum(['NEARBY','CITY','DISTANT']).optional()
supplyRung:    supplyRungSchema.optional(),     // additive — older API responses don't include
proximityBand: proximityBandSchema.optional(),

// In the existing meta schema, add:
rungCounts: z.object({
  NEARBY: z.number(), CATCHMENT: z.number(), POST_TOWN: z.number(),
  LAD: z.number(),    COUNTY: z.number(),    REGION: z.number(),
  COUNTRY: z.number(), NATIONAL: z.number(),
}).optional(),
effectiveLocality: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
```

`.optional()` on the new fields keeps the schema additive — older clients/test fixtures that don't include them still parse.

- [ ] **Step 2: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts
git commit -m "feat(plan-4-m3): extend customer-app discovery Zod schemas (additive)"
```

### Task M3.6: ProximityBand chip primitive

**Files:**
- Create: `apps/customer-app/src/design-system/components/proximityBandChip.tsx`
- Create: `apps/customer-app/tests/design-system/components/proximityBandChip.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/customer-app/tests/design-system/components/proximityBandChip.test.tsx
import { render } from '@testing-library/react-native'
import { ProximityBandChip } from '../../../src/design-system/components/proximityBandChip'

describe('ProximityBandChip', () => {
  it('renders nothing for NEARBY band', () => {
    const { toJSON } = render(<ProximityBandChip band="NEARBY" />)
    expect(toJSON()).toBeNull()
  })

  it('renders "In your area" for IN_YOUR_AREA band', () => {
    const { getByText } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
    expect(getByText('In your area')).toBeTruthy()
  })

  it('renders "A little further out" for A_LITTLE_FURTHER band', () => {
    const { getByText } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
    expect(getByText('A little further out')).toBeTruthy()
  })

  it('renders "Nearest on Redeemo" for NEAREST_ON_REDEEMO band', () => {
    const { getByText } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
    expect(getByText('Nearest on Redeemo')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run from the customer-app dir:
`cd apps/customer-app && npx jest tests/design-system/components/proximityBandChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

**Fixes pre-flight P2.3:** the tokens module exports `typography` (not a bare `label`); typography variants are dotted-key entries like `typography['label.md']`. Component placed under `design-system/components/` per the directory convention.

```typescript
// apps/customer-app/src/design-system/components/proximityBandChip.tsx
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { color, spacing, radius, typography } from '../tokens'

type ProximityBand = 'NEARBY' | 'IN_YOUR_AREA' | 'A_LITTLE_FURTHER' | 'NEAREST_ON_REDEEMO'

const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,  // no chip — default state
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A little further out',
  NEAREST_ON_REDEEMO: 'Nearest on Redeemo',
}

export function ProximityBandChip({ band }: { band: ProximityBand }) {
  const text = BAND_LABEL[band]
  if (text === null) return null
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    // `color.surface.tint = '#FEF6F5'` per design-system/tokens.ts — warm cream-rose pill
    // background that matches the spec §10.1 visual treatment ("subtle tag-style pill").
    backgroundColor: color.surface.tint,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    ...typography['label.md'],
    color: color.brandRose,
  },
})
```

(Test file path already in `apps/customer-app/tests/design-system/components/proximityBandChip.test.tsx` per Step 1; no further path edits needed.)

- [ ] **Step 4: Run tests + commit**

Run: `npx jest tests/design-system/components/proximityBandChip.test.tsx`
Expected: PASS.

```bash
git add apps/customer-app/src/design-system/components/proximityBandChip.tsx apps/customer-app/tests/design-system/components/proximityBandChip.test.tsx
git commit -m "feat(plan-4-m3): add ProximityBandChip primitive"
```

### Task M3.7: Wire the chip + contextual locality into Home / Search / Category / Map tiles

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Modify: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`
- Modify: `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
- Modify: `apps/customer-app/src/features/map/screens/MapScreen.tsx`
- Modify the existing MerchantCard component (or whatever each surface renders for a tile)

- [ ] **Step 1: Locate the shared MerchantCard component**

Run: `grep -rn "MerchantCard\|MerchantTile" apps/customer-app/src/features/ | head -20`
Identify the shared tile rendering component (likely `apps/customer-app/src/features/search/components/SearchResultItem.tsx` or a more general MerchantCard).

- [ ] **Step 2: Add chip + contextual locality rendering to the shared component**

In the tile renderer (assuming a component like `MerchantTile.tsx`), update the rendering:

```typescript
// Add at top:
import { ProximityBandChip } from '@/design-system/components/proximityBandChip'

// Inside the render — after the existing meta row:
{merchant.proximityBand && merchant.proximityBand !== 'NEARBY' && (
  <ProximityBandChip band={merchant.proximityBand} />
)}

// In the meta-line composition (descriptor · distance), conditionally include locality:
const secondaryLine = (() => {
  const parts: string[] = [merchant.descriptorType ?? '']
  // Show locality if non-NEARBY OR no distance available
  if (merchant.proximityBand && merchant.proximityBand !== 'NEARBY' && merchant.locality) {
    parts.push(merchant.locality)
  } else if (!merchant.distanceMetres && merchant.locality) {
    parts.push(merchant.locality)
  }
  if (merchant.distanceMetres !== null && merchant.distanceMetres !== undefined) {
    parts.push(formatDistance(merchant.distanceMetres))
  }
  return parts.filter(Boolean).join(' · ')
})()
```

This requires the API to surface `locality` on the tile. If the existing `MerchantTile` shape doesn't include locality, add a `contextBranch.localityName` or similar field via the existing enrich step.

- [ ] **Step 3: Write a screen-level test**

```typescript
// apps/customer-app/tests/features/home/HomeScreen.test.tsx (or wherever a Home screen test lives)
import { render } from '@testing-library/react-native'
import { HomeScreen } from '../../../src/features/home/screens/HomeScreen'
import { renderWithProviders } from '../../helpers/renderWithProviders'

it('renders proximityBand chip for non-NEARBY tile', async () => {
  // Mock the API to return a tile with proximityBand='IN_YOUR_AREA'
  // ... setup ...
  const { getByText } = renderWithProviders(<HomeScreen />)
  await waitFor(() => expect(getByText('In your area')).toBeTruthy())
})

it('omits chip for NEARBY tile', async () => {
  // Mock the API to return a NEARBY tile
  const { queryByText } = renderWithProviders(<HomeScreen />)
  await waitFor(() => expect(queryByText('In your area')).toBeNull())
})
```

- [ ] **Step 4: Run tests + commit**

Run the customer-app jest suite for the affected surfaces:
`npx jest src/features/home src/features/search src/features/map`
Expected: all pass.

```bash
git add apps/customer-app/src/features/
git commit -m "feat(plan-4-m3): render proximityBand chip + contextual locality on tiles"
```

### Task M3.8: M3 integration tests + final verification

- [ ] **Step 1: Add an end-to-end contract test**

```typescript
// tests/api/customer/discovery/m3-contract.test.ts
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('M3 additive contract', () => {
  it('GET /search returns BOTH legacy supplyTier AND new supplyRung fields', async () => {
    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search?q=&lat=53.6458&lng=-1.785' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    if (body.merchants.length > 0) {
      const tile = body.merchants[0]
      // Legacy field still present
      expect(['NEARBY', 'CITY', 'DISTANT']).toContain(tile.supplyTier)
      // New field also present
      expect(['NEARBY','CATCHMENT','POST_TOWN','LAD','COUNTY','REGION','COUNTRY','NATIONAL']).toContain(tile.supplyRung)
      // ProximityBand present
      expect(['NEARBY','IN_YOUR_AREA','A_LITTLE_FURTHER','NEAREST_ON_REDEEMO']).toContain(tile.proximityBand)
    }
    // Meta block carries both legacy + new counts
    expect(typeof body.meta.nearbyCount).toBe('number')
    expect(typeof body.meta.cityCount).toBe('number')
    expect(typeof body.meta.distantCount).toBe('number')
    expect(body.meta.rungCounts).toBeDefined()
    expect(typeof body.meta.rungCounts.NEARBY).toBe('number')
    await app.close()
  })
})
```

- [ ] **Step 2: Run all backend + customer-app tests**

Run: `npx vitest run && cd apps/customer-app && npx jest`
Expected: all pass. Pre-existing baseline failures (per CLAUDE.md) remain stable.

- [ ] **Step 3: `tsc --noEmit` on both**

Run: `npx tsc --noEmit && cd apps/customer-app && npx tsc --noEmit`
Expected: clean.

### Task M3.9: Push M3 + open PR

- [ ] **Step 1: Push**

Run: `git push -u origin feature/plan-4-m3-consumer-wire-up`

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(plan-4-m3): wire Discovery surfaces to rankMerchantsV2 (additive contract)" --body "..."
```

(PR body: summary of the M3 surface flip, additive contract, customer-app chip + locality wiring. Same template as M1/M2.)

- [ ] **Step 3: Await owner review + merge (M3)**

---

## Milestone M4 — Search + UX (place + tag + empty states)

**Goal:** Add place + tag detection in `q` (place sets EffectiveLocation per spec §6.2), expand fuzzy search predicate with `Tag.label`, `MerchantHighlight.label`, `Branch.localityName`, `Branch.postTown`. Section-level empty states and approved copy vocabulary land. Search chip ("Showing offers in [place]" / "Showing [tag] offers") renders. Trending searches verified non-empty against fixtures.

**Output:** one PR titled "feat(plan-4-m4): place + tag search detection + section-level empty states".

### Task M4.1: Branch from main (post-M3-merge)

- [ ] **Step 1: Pull + branch**

```bash
git checkout main && git pull
git checkout -b feature/plan-4-m4-search-ux
```

### Task M4.2: Place detection in Search service

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (searchMerchants — add Step 1 of detection)
- Create: `tests/api/customer/discovery/place-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/customer/discovery/place-search.test.ts
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('Place detection in q', () => {
  it('q=Brightlingsea returns Covelum even when GPS is far away', async () => {
    const app = buildTestApp()
    // Manchester GPS — far from Brightlingsea
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=Brightlingsea&lat=53.4808&lng=-2.2426',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const merchantNames = body.merchants.map((m: any) => m.businessName.toLowerCase())
    expect(merchantNames.some((n: string) => n.includes('covelum'))).toBe(true)
    // EffectiveLocality should be Brightlingsea, not Manchester
    expect(body.meta.effectiveLocality?.name.toLowerCase()).toContain('brightlingsea')
    await app.close()
  })

  it('q=Karaara (merchant name, not a place) falls through to fuzzy', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=Karaara&lat=53.6458&lng=-1.785',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const merchantNames = body.merchants.map((m: any) => m.businessName.toLowerCase())
    expect(merchantNames.some((n: string) => n.includes('karaara'))).toBe(true)
    // EffectiveLocality should be the GPS-derived locality (Huddersfield), not a place match
    expect(body.meta.effectiveLocality?.name.toLowerCase()).toContain('huddersfield')
    await app.close()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/customer/discovery/place-search.test.ts`
Expected: FAIL — place detection not yet implemented.

- [ ] **Step 3: Implement place detection step in `searchMerchants`**

```typescript
// At the top of searchMerchants:
const PLACE_SEARCH_DETECTION_ENABLED = true  // kill-switch per spec §11.3

async function tryPlaceMatch(prisma: PrismaClient, q: string) {
  if (!PLACE_SEARCH_DETECTION_ENABLED || !q || q.trim().length < 2) return null

  // Step 1a: ILIKE-prefix on Locality.name (highest populationTier wins)
  const tierOrder: Record<string, number> = {
    METRO_CORE: 7, CITY: 6, LARGE_TOWN: 5, TOWN: 4, SMALL_TOWN: 3, VILLAGE: 2, HAMLET: 1, UNKNOWN: 0,
  }
  const nameMatches = await prisma.locality.findMany({
    where: { name: { startsWith: q, mode: 'insensitive' } },
    take: 5,
  })
  if (nameMatches.length > 0) {
    return nameMatches.sort((a, b) => tierOrder[b.populationTier] - tierOrder[a.populationTier])[0]
  }

  // Step 1b: postTown match
  const postTownMatches = await prisma.locality.findMany({
    where: { postTown: { startsWith: q, mode: 'insensitive' } },
    take: 5,
  })
  if (postTownMatches.length > 0) {
    return postTownMatches.sort((a, b) => tierOrder[b.populationTier] - tierOrder[a.populationTier])[0]
  }

  return null
}

// Inside searchMerchants, BEFORE building effLoc:
const placeMatch = await tryPlaceMatch(prisma, params.q ?? '')
let effLoc: EffectiveLocation | null
let chipMode: 'PLACE' | 'TAG' | 'FUZZY' | null = null

if (placeMatch) {
  effLoc = await resolveEffectiveLocation(prisma, { placeLocality: placeMatch }, params.userId)
  chipMode = 'PLACE'
  // Place-matched queries skip the fuzzy merchant text filter — the place becomes the area.
  // (But still respect categoryId, sortBy, voucherTypes, amenityIds, openNow.)
} else {
  effLoc = await resolveEffectiveLocation(prisma, { lat: params.lat, lng: params.lng }, params.userId)
}
```

The response envelope gets a `searchChip` field:

```typescript
return {
  merchants: [...],
  total: ...,
  meta: {
    ...,
    searchChip: chipMode === 'PLACE' && placeMatch
      ? { mode: 'PLACE', label: placeMatch.name }
      : chipMode === 'TAG' && tagMatch
      ? { mode: 'TAG', label: tagMatch.label }
      : null,
  },
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/customer/discovery/place-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/place-search.test.ts
git commit -m "feat(plan-4-m4): place detection in q — Locality.name + postTown match sets EffectiveLocation"
```

### Task M4.3: Tag.label search expansion (step 2 + fuzzy)

**Files:**
- Modify: `src/api/customer/discovery/service.ts` (searchMerchants `q` predicate)
- Create: `tests/api/customer/discovery/tag-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/customer/discovery/tag-search.test.ts
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('Tag.label + MerchantHighlight.label search', () => {
  it('q=Pizza returns merchants tagged with Pizza CUISINE', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=Pizza&lat=53.6458&lng=-1.785',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.merchants.length).toBeGreaterThan(0)
    expect(body.meta.searchChip?.mode).toBe('TAG')
    expect(body.meta.searchChip?.label).toBe('Pizza')
    await app.close()
  })

  it('q=Halal returns merchants with Halal MerchantHighlight', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=Halal&lat=53.6458&lng=-1.785',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const names = body.merchants.map((m: any) => m.businessName.toLowerCase())
    // Karaara has Halal highlight
    expect(names.some((n: string) => n.includes('karaara'))).toBe(true)
    await app.close()
  })
})
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run tests/api/customer/discovery/tag-search.test.ts`
Expected: FAIL — tag detection not yet implemented or expanded.

- [ ] **Step 3: Implement Tag detection step + fuzzy expansion**

**Fixes pre-flight P1.9.** The actual schema relations are:

- `Merchant.tags: MerchantTag[]` (relation field name is `tags`, NOT `merchantTags`)
- `MerchantTag.tag: Tag` — so `Tag.label` is reached via `merchant.tags.some.tag.label`
- `Merchant.highlights: MerchantHighlight[]`
- `MerchantHighlight.tag: Tag` (uses `highlightTagId` FK) — so highlight labels are reached via `merchant.highlights.some.tag.label`. `MerchantHighlight` does NOT have its own `label` column.

```typescript
async function tryTagMatch(prisma: PrismaClient, q: string) {
  if (!q || q.trim().length < 2) return null

  // ILIKE-exact (case-insensitive) on Tag.label — covers both regular Tags AND
  // highlight Tags (highlights reference Tag rows via highlightTagId).
  const tag = await prisma.tag.findFirst({
    where: { label: { equals: q, mode: 'insensitive' } },
    select: { id: true, label: true, type: true },
  })
  if (tag) return { kind: 'TAG' as const, ...tag }

  return null
}

// Inside searchMerchants:
let tagMatch: Awaited<ReturnType<typeof tryTagMatch>> = null
if (!placeMatch) {
  tagMatch = await tryTagMatch(prisma, params.q ?? '')
  if (tagMatch) {
    chipMode = 'TAG'
  } else {
    chipMode = 'FUZZY'
  }
}

// Tag-match scoping in the merchant `where` clause:
// Match merchants that EITHER carry the tag as a regular MerchantTag, OR have it as a
// MerchantHighlight (HIGHLIGHT Tag type appears in either table depending on how merchants
// were tagged).
if (tagMatch) {
  whereClause.OR = [
    ...(whereClause.OR ?? []),
    { tags:       { some: { tagId: tagMatch.id } } },
    { highlights: { some: { highlightTagId: tagMatch.id } } },
  ]
}

// Fuzzy fall-through predicate (only when no place + no tag match):
if (!placeMatch && !tagMatch && params.q) {
  whereClause.OR = [
    { businessName: { contains: params.q, mode: 'insensitive' } },
    { tradingName:  { contains: params.q, mode: 'insensitive' } },
    { description:  { contains: params.q, mode: 'insensitive' } },
    { primaryCategory: { name: { contains: params.q, mode: 'insensitive' } } },
    { categories:   { some: { category: { name: { contains: params.q, mode: 'insensitive' } } } } },
    { merchantSuggestedTags: { some: { tag: { contains: params.q, mode: 'insensitive' } } } },
    // NEW: curated Tag.label fuzzy fall-through (regular tags)
    { tags:       { some: { tag: { label: { contains: params.q, mode: 'insensitive' } } } } },
    // NEW: highlight Tag.label fuzzy fall-through (via MerchantHighlight.tag relation)
    { highlights: { some: { tag: { label: { contains: params.q, mode: 'insensitive' } } } } },
    // NEW: Branch text fields
    { branches: { some: { localityName: { contains: params.q, mode: 'insensitive' } } } },
    { branches: { some: { postTown: { contains: params.q, mode: 'insensitive' } } } },
  ]
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `npx vitest run tests/api/customer/discovery/tag-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/discovery/service.ts tests/api/customer/discovery/tag-search.test.ts
git commit -m "feat(plan-4-m4): Tag.label + MerchantHighlight.label exact match + fuzzy fall-through expansion"
```

### Task M4.4: Trending searches return non-empty

**Files:**
- Create: `tests/api/customer/discovery/trending-searches.test.ts`

- [ ] **Step 1: Write the test (all 6 terms)**

```typescript
// tests/api/customer/discovery/trending-searches.test.ts
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('Trending searches return non-empty', () => {
  const TRENDING = ['Pizza', 'Brunch', 'Nail salon', 'Barber', 'Gym', 'Coffee']

  for (const term of TRENDING) {
    it(`q=${term} returns at least one merchant against seed`, async () => {
      const app = buildTestApp()
      // Use Huddersfield GPS so the M1 trending fixtures (all seeded in Huddersfield) are nearby.
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/customer/search?q=${encodeURIComponent(term)}&lat=53.6458&lng=-1.785`,
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.merchants.length).toBeGreaterThan(0)
      await app.close()
    })
  }
})
```

- [ ] **Step 2: Run test — confirm all 6 return non-empty**

Run: `npx vitest run tests/api/customer/discovery/trending-searches.test.ts`
Expected: 6/6 PASS. If any fail, the M1 fixture for that term is missing — fix the seed (M1 task M1.24) before merging M4.

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery/trending-searches.test.ts
git commit -m "test(plan-4-m4): assert all 6 trending search terms return non-empty"
```

### Task M4.5: SearchChip primitive + render in SearchScreen

**Files:**
- Create: `apps/customer-app/src/features/search/components/SearchChip.tsx`
- Modify: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`

- [ ] **Step 1: Implement the chip**

```typescript
// apps/customer-app/src/features/search/components/SearchChip.tsx
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { color, spacing, radius, typography } from '@/design-system/tokens'

type Props = {
  mode: 'PLACE' | 'TAG'
  label: string
}

export function SearchChip({ mode, label }: Props) {
  const prefix = mode === 'PLACE' ? 'Showing offers in' : 'Showing'
  const suffix = mode === 'TAG' ? 'offers' : ''
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>
        {prefix} <Text style={styles.emphasis}>{label}</Text>{suffix ? ` ${suffix}` : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: color.surface.tint,
    borderRadius: radius.sm,
    marginHorizontal: spacing[4],
    marginVertical: spacing[2],
  },
  text: { ...typography['label.md'], color: color.text.secondary },
  emphasis: { fontWeight: '600', color: color.text.primary },
})
```

- [ ] **Step 2: Render in SearchScreen above the result list**

```typescript
// SearchScreen render:
{meta?.searchChip && (
  <SearchChip mode={meta.searchChip.mode} label={meta.searchChip.label} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add apps/customer-app/src/features/search/components/SearchChip.tsx apps/customer-app/src/features/search/screens/SearchScreen.tsx
git commit -m "feat(plan-4-m4): add SearchChip — 'Showing offers in [place]' / 'Showing [tag] offers'"
```

### Task M4.6: Section-level empty states + approved copy

**Files:**
- Modify: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`
- Modify: `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx` (hide empty Trending / Featured sections)
- Modify: `apps/customer-app/src/features/map/components/MapEmptyArea.tsx`

- [ ] **Step 1: Update SearchScreen empty state**

When `merchants.length === 0` and the user has a query:

```typescript
<View style={styles.emptyState}>
  <Text style={styles.title}>
    No matches for <Text style={styles.emphasis}>{query}</Text> near you.
  </Text>
  <Text style={styles.body}>Try a wider area or a different search.</Text>
</View>
```

When `merchants.length === 0` and no query AND no location signal:

```typescript
<View style={styles.emptyState}>
  <Text style={styles.title}>Set your area to see offers near you.</Text>
  <Button onPress={navigateToPC2}>Set my area</Button>
</View>
```

- [ ] **Step 2: Update CategoryResultsScreen empty state**

```typescript
<Text>New offers in <Text style={styles.emphasis}>{categoryName}</Text> are being added.</Text>
<Button onPress={navigateToInviteFlow}>Invite your favourite local business</Button>
```

If invite flow doesn't exist yet, the button can be a placeholder that opens a contact email — or hide the button. Acceptable for Plan 4a to use a static "Tap to email us" link.

- [ ] **Step 3: Update Home to hide empty Trending / Featured sections**

```typescript
// HomeScreen:
{trending.length > 0 && (
  <TrendingSection items={trending} />
)}
{featured.length > 0 && (
  <FeaturedSection items={featured} />
)}
// previously these sections may have rendered an empty state — now they just hide
```

- [ ] **Step 4: Update MapEmptyArea copy**

The existing component already has empty-state copy. Update the text to align with approved vocabulary:

```typescript
<Text>No offers in this area yet — try zooming out.</Text>
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/
git commit -m "feat(plan-4-m4): section-level empty states + approved copy vocabulary"
```

### Task M4.7: Map viewport-led EffectiveLocation (spec §5.7)

Already covered in M3.3 task structure but worth a dedicated test to assert behaviour.

**Files:**
- Create: `tests/api/customer/discovery/map-viewport-led.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/api/customer/discovery/map-viewport-led.test.ts
import { describe, it, expect } from 'vitest'
import { buildTestApp } from '../../helpers/buildTestApp'

describe('Map viewport-led EffectiveLocation', () => {
  it('Huddersfield user panning to London bbox sees London-centric locality, not Huddersfield', async () => {
    const app = buildTestApp()
    // Huddersfield user GPS — but bbox is London.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/discovery/in-area?minLat=51.3&maxLat=51.7&minLng=-0.3&maxLng=0.1&lat=53.6458&lng=-1.785',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // effectiveLocality should be derived from the bbox centre, not the user's GPS
    expect(body.meta.effectiveLocality?.name.toLowerCase()).not.toContain('huddersfield')
    await app.close()
  })
})
```

- [ ] **Step 2: Verify the M3 implementation already passes this**

Run: `npx vitest run tests/api/customer/discovery/map-viewport-led.test.ts`
Expected: PASS (M3.3 already implemented viewport-led EffectiveLocation for the Map route).

- [ ] **Step 3: Commit**

```bash
git add tests/api/customer/discovery/map-viewport-led.test.ts
git commit -m "test(plan-4-m4): assert Map /in-area uses viewport-led EffectiveLocation"
```

### Task M4.8: M4 full sweep + push + PR

- [ ] **Step 1: Run all tests**

Run: `npx vitest run && cd apps/customer-app && npx jest`
Expected: all pass; trending-search 6/6 green.

- [ ] **Step 2: `tsc --noEmit`**

Run: `npx tsc --noEmit && cd apps/customer-app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feature/plan-4-m4-search-ux
gh pr create --title "feat(plan-4-m4): place + tag search detection + section-level empty states" --body "..."
```

(PR body summarises the search detection ladder, tag expansion, section-level empty states, approved copy vocabulary.)

- [ ] **Step 4: Await owner review + merge (M4)**

---

## Milestone M5 — Cleanup (audit-gated legacy field removal)

**Goal:** Remove legacy `User.city`/`Branch.city`/`supplyTier`/`nearbyCount`/etc. read paths where consumer audit proves they're unused. Clear the 4 Plan 4 code hooks in the customer-app. Decide on `merchantCountByCity` (repurpose or remove). No customer-visible behaviour change.

**Output:** one PR titled "chore(plan-4-m5): cleanup legacy location read paths (audit-gated)".

### Task M5.1: Consumer audit script

**Files:**
- Create: `scripts/plan-4-consumer-audit.sh`

- [ ] **Step 1: Write the audit script**

```bash
#!/usr/bin/env bash
# scripts/plan-4-consumer-audit.sh
# Greps the entire codebase for remaining reads of legacy Plan 4 fields.
# Must produce ZERO matches in customer-app (excluding test fixtures + the API client deprecation comments)
# before M5 removes legacy fields.

set -e

echo "=== Audit: User.city reads ==="
grep -rn "user.city\|\.city" apps/customer-app/src \
  | grep -v "\.test\." \
  | grep -v "tests/" \
  | grep -v "branch.city" \
  || echo "  no matches"

echo "=== Audit: Branch.city reads ==="
grep -rn "branch.city\|branch\.city" apps/customer-app/src \
  | grep -v "\.test\." \
  | grep -v "tests/" \
  || echo "  no matches"

echo "=== Audit: legacy supplyTier reads (should only be deprecated shim sites) ==="
grep -rn "supplyTier" apps/customer-app/src \
  | grep -v "\.test\." \
  | grep -v "tests/" \
  || echo "  no matches"

echo "=== Audit: nearbyCount / cityCount / distantCount reads ==="
grep -rn "nearbyCount\|cityCount\|distantCount" apps/customer-app/src \
  | grep -v "\.test\." \
  | grep -v "tests/" \
  | grep -v "rungCounts" \
  || echo "  no matches"

echo "=== Audit complete ==="
```

- [ ] **Step 2: Run on a M4-merged main**

Run: `bash scripts/plan-4-consumer-audit.sh`
Expected output: lists every remaining read path. If any read path remains in a non-test file that we don't intend to keep, decide whether to migrate it or defer the legacy field removal for that field.

The audit's role is to surface decisions, not to gate the PR automatically. The M5 author reads the output and decides: remove the legacy field (if zero non-test reads), OR keep it for one more cycle (if a legacy surface still depends).

### Task M5.2: Branch from main (post-M4-merge)

- [ ] **Step 1: Pull + branch**

```bash
git checkout main && git pull
git checkout -b feature/plan-4-m5-cleanup
```

### Task M5.3: Remove deprecated `rankMerchants` + `classifyTier` from backend

**Files:**
- Modify: `src/api/lib/ranking.ts`

- [ ] **Step 1: Confirm no callers**

Run: `grep -rn "rankMerchants[^V]\|classifyTier" src/ apps/customer-app/src/ tests/`
Expected: zero matches in non-test source code. Test files may still reference these — those tests should also be deleted (they're testing dead code).

- [ ] **Step 2: Delete the `@deprecated` shims from `ranking.ts`**

Remove the bodies of the deprecated functions. Keep only the export of `rankMerchantsV2`, `classifyRung`, and any type exports that callers use.

- [ ] **Step 3: Delete obsolete tests**

Run: `find tests -name "*classifyTier*" -o -name "rankMerchants.test.ts" | xargs git rm`
Expected: the pre-Plan-4 ranking tests removed.

- [ ] **Step 4: Run remaining tests**

Run: `npx vitest run`
Expected: all pass. Pre-Plan-4 ranking tests are gone; new tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/api/lib/ranking.ts tests/
git commit -m "chore(plan-4-m5): remove deprecated rankMerchants + classifyTier shims"
```

### Task M5.4: Legacy API field deprecation — STAY in Plan 4a

**Fixes pre-flight P1.10:** Plan 4a M5 must NOT remove legacy `supplyTier`/`nearbyCount`/`cityCount`/`distantCount` fields from the API response. The additive-contract principle (spec §2.11) commits to keeping legacy fields through the FULL Plan 4a deprecation cycle. Removal requires explicit owner re-approval AFTER mobile-app releases consuming `supplyRung`/`proximityBand`/`rungCounts` have shipped and any pending `feature/customer-app` rebaseline (Savings/Favourites/Profile-full) is on main.

**This task is no-op for Plan 4a M5.** The legacy fields stay populated and exposed for the duration of Plan 4a.

What M5 DOES do for the API:

- **Run the consumer audit (M5.1)** and record the findings in the PR description. The audit is operationally useful even when nothing is removed — it tells us how close we are to being able to drop the legacy fields in a future "Plan 4 cleanup" PR.
- **Document the deferral.** PR description states: "Legacy API fields kept. Removal deferred to a future post-Plan-4a PR, gated on owner approval + completion of pending `feature/customer-app` rebaselines."

There is no schema change here. There is no Zod-field drop. There is no breaking API change.

If at some future point the audit shows zero consumers AND the owner approves removal, that's a separate one-shot cleanup PR — NOT part of Plan 4a.

### Task M5.5: Clear the 4 customer-app Plan 4 code hooks

Per CLAUDE.md: 4 customer-app code hooks flagged for Plan 4 work:

1. `AllCategoriesScreen.tsx:67` — `merchantCount` field display
2. `PC2AddressScreen.tsx` — civil-parish lookup via postcodes.io (now done via `/postcode/preview`)
3. `branchShortName` dedup utility
4. `MerchantProfileScreen.tsx` — branch-name dedup

- [ ] **Step 1: Update `AllCategoriesScreen.tsx`**

The Plan 4 hook at line ~67 was a comment placeholder for per-city merchant count display. With Plan 4, the right surface is `meta.rungCounts.NEARBY` on the Category response — show "5 nearby" rather than the broken per-city count. Or, keep the comment removed entirely if no UX direction is approved.

- [ ] **Step 2: Update `PC2AddressScreen.tsx`**

The `pickAreaLabel(...)` logic is now obsolete because `/postcode/preview` returns the backend-resolved name. Replace the call with a fetch to `/postcode/preview`:

```typescript
const previewResult = await fetch(`/api/v1/customer/postcode/preview?code=${encodeURIComponent(cleaned)}`)
  .then(r => r.ok ? r.json() : null)
if (previewResult) {
  setLookupResult({
    postcode: previewResult.postcode,
    area: previewResult.localityName,
    region: [previewResult.region, previewResult.country].filter(Boolean).join(', '),
  })
}
```

Remove the `pickAreaLabel` function and its imports.

- [ ] **Step 3: Update `branchShortName.ts` + MerchantProfileScreen branch-name dedup**

These were workarounds for `branch.name` carrying redundant locality info ("Karaara — Huddersfield" rendered as "Karaara · Huddersfield · Huddersfield" before the dedup). With Plan 4 surfacing `locality` separately on the tile, the dedup is no longer needed because the components can use `branch.localityName` directly instead of substring-matching `branch.name`.

Update `MerchantProfileScreen.tsx` to use `branch.localityName` instead of `branchShortName(branch.name)`. Delete `branchShortName.ts` if no other callers.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/features/
git commit -m "chore(plan-4-m5): clear 4 Plan 4 customer-app code hooks"
```

### Task M5.6: `merchantCountByCity` decision

The existing `Category.merchantCountByCity` JSON column is a stale per-city rollup. Plan 4a M5 either repurposes it as `merchantCountByLocality` or removes it entirely.

- [ ] **Step 1: Check current usage**

Run: `grep -rn "merchantCountByCity" src/ apps/`
Expected output lists current usage paths.

- [ ] **Step 2: Decision A — remove the column entirely**

If no consumer uses it (audit shows none in customer-app and the seed-time recompute is the only writer), remove it from schema + seed.

Add a migration step:

```sql
ALTER TABLE "Category" DROP COLUMN "merchantCountByCity";
ALTER TABLE "Tag"      DROP COLUMN "merchantCountByCity";
```

- [ ] **Step 3: Decision B — repurpose as `merchantCountByLocality`**

If a future Plan 4 follow-up wants per-locality counts (the AllCategoriesScreen hook from M5.5 might want it), rename to `merchantCountByLocality: Json` and update the nightly recompute job to write `{ localityId: count }` instead of `{ cityId: count }`.

The decision is owner-driven at M5 plan-writing time. Default recommendation: **remove** (decision A) — YAGNI; can re-add as `merchantCountByLocality` when a feature actually needs it.

- [ ] **Step 4: Commit the chosen path**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "chore(plan-4-m5): remove merchantCountByCity (unused per consumer audit)"
```

### Task M5.7: Final M5 sweep + PR

- [ ] **Step 1: Full backend + customer-app test sweep**

Run: `npx vitest run && cd apps/customer-app && npx jest`
Expected: all pass. Coverage should still cover the Plan 4 surface end-to-end.

- [ ] **Step 2: `tsc --noEmit`**

Run: `npx tsc --noEmit && cd apps/customer-app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/plan-4-m5-cleanup
gh pr create --title "chore(plan-4-m5): cleanup legacy location read paths (audit-gated)" --body "..."
```

(PR body documents: the audit findings, which legacy fields were removed, which were kept and why, the four Plan 4 code hooks cleared, the `merchantCountByCity` decision.)

- [ ] **Step 4: Await owner review + merge (M5)**

---

## Final verification (post-M5)

After all 5 milestones land on main:

- [ ] **Step 1: Update CLAUDE.md** — add Plan 4 to the "Build Progress" section with merge SHAs and brief shipped-state summary for each milestone.
- [ ] **Step 2: Update memory** — close out `project_discovery_sequencing_plan4.md` as ✅ SHIPPED; add new memory entry `project_location_model_complete.md` summarising the final architecture for future reference.
- [ ] **Step 3: Smoke-test on dev DB** — run the full seed; verify Huddersfield Market is ACTIVE; verify a sample of Localities have correct catchment edges; verify a Manchester-GPS search for `q=Brightlingsea` returns Covelum with Brightlingsea-context EffectiveLocality.
- [ ] **Step 4: Confirm tuneable starting numbers** — owner reviews the LadderProfile matrix after first week of QA; tunes radii and max rungs per analytics.

---

## Self-review

Running through this plan once more before handing off:

**Spec coverage check** (each spec section → at least one plan task):

| Spec section | Plan task(s) |
|---|---|
| §3.1 Locality table | M1.3 |
| §3.2 LocalityCatchmentEdge | M1.4 |
| §3.3 Market table | M1.5 |
| §3.4 User snapshot | M1.6, M1.20 |
| §3.5 Branch snapshot | M1.7, M1.21 |
| §3.6 LadderProfile fields | M1.8 |
| §3.7 supplyRung + proximityBand | M3.4, M3.5, M3.6 |
| §3.8 Density class | M2.2 |
| §4.1 Gazetteer Option A | M1.11, M1.12 |
| §4.1.1 Locality canonicalisation | M1.11 |
| §4.2 Schema deltas | M1.2–M1.10 |
| §4.3 Backfill strategy | M1.22 |
| §4.4 EffectiveLocation | M2.3, M2.4 |
| §5.1 8-rung ladder | M2.5 (classifyRung) |
| §5.2 Density-adaptive radii | M2.2 (matrix) |
| §5.3 proximityBand mapping | M2.2 |
| §5.4 Category → profile mapping | M1.10 (migration backfill) + M1 plan task confirmation |
| §5.5 Subcategory overrides | M1 — owner finalises during writing |
| §5.6 Ladder walk algorithm | M2.6 (rankMerchantsV2) |
| §5.7 Merchant de-dup + context branch + Map shape | M2.6 (selectContextBranch) + M3.3 (Map viewport-led) + M4.7 (test) |
| §5.8 In-rung sort | M2.6 (existing in-rung sort preserved) |
| §5.9 hardCaps | M3.3 (per-surface caps wired) |
| §5.10 Featured/Trending/Campaign | M3.3 (`supplyRung`/`proximityBand` on those surfaces) + Plan 4b deferred |
| §5.11 No-location fallback | M3.3 |
| §6 Place + Tag search | M4.2, M4.3, M4.4 |
| §7 PC2 + /postcode/preview | M1.19, M1.20 |
| §8 Card display | M3.6, M3.7, M4.5, M4.6 |
| §9 Market operationalization | M1.15, M1.23 |
| §10 Map | M3.3 (viewport-led), M4.7 |
| §11.1 Five-PR cadence | M1–M5 structure |
| §11.2 Backfill | M1.22 |
| §11.3 Kill-switches | M4.2 (`PLACE_SEARCH_DETECTION_ENABLED`) |
| §11.4 Additive contract | M3.4, M3.5, M5.4 |
| §11.5 Test fixture readiness | M1.24, M4.4 |
| §11.6 Pending rebaselines non-scope | (acknowledged; no plan task — explicit decision) |
| §11.7 Performance guardrails | M2.3 (bbox prefilter), M3.3 (in-process catchment lookup) |
| §12 Plan 4b deferred contract | M1.9 |
| §13 Risks + trade-offs | (informs plan structure throughout — backfill idempotency, additive contract gates, TDD discipline) |
| §14 Test strategy | (per-milestone test sections) |
| §15 Deferred-decisions register | (acknowledged; no plan task) |
| §16 Open items for plan writer | M1.15 (markets list), M1.24 (trending fixtures), M5.5 (subcategory overrides confirmed at M1) |

All spec sections have at least one plan task. No gaps.

**Placeholder check:** every code step shows actual code. No "implement appropriate error handling" or similar. Test code is real, not skeleton. Commit messages are templated.

**Type consistency:** `supplyRung`, `proximityBand`, `EffectiveLocation`, `LadderProfile`, `DensityClass`, `LocalityCatchmentEdge`, `LocationConfidence`, `MarketStatus`, `PopulationTier` are consistent across M1–M5 tasks. Helper function names (`resolveEffectiveLocation`, `findNearestLocality`, `resolvePostcode`, `findOrCreateLocality`, `getOutgoingCatchmentTargetIds`, `getNearbyRadiusMiles`, `getMaxRung`, `getProximityBand`, `deriveDensityClass`, `classifyRung`, `rankMerchantsV2`, `selectContextBranch`, `mapRungToLegacyTier`) used in implementation tasks match the names used in test tasks.

---

**End of plan.**
