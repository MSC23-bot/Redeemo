# Plan 4 — Location Model UK Enrichment (design spec)

> **Status:** Tightened draft v4 (third targeted pass — approved direction; final touch-ups). Ready for implementation planning after owner sign-off.
> **Scope:** Plan 4a implementation; Plan 4b documented as deferred contract only.
> **Brainstorm reference:** Q1–Q11 conversation 2026-05-13.
> **Prior precursors:** Plan 1 (taxonomy), Plan 1.5 (rank-not-hide + supply-aware), Plan 2 (Home/Search/Categories/Map rebaseline), Karaara Huddersfield seed fixture (PR #77).
> **Revision history:**
> - v1 → v2: 12 owner review items — UK-wide admin geography, effective-location for GPS, place-search effective area, additive contract via `supplyRung`, Prisma relation validity + `LocalityCatchmentEdge` join table, removed fail-open kill-switch, CATCHMENT directional consistency, merchant de-dup + context-branch selection, `Branch.localityName` denormalisation, embedded risk table, removed IoM test case, Market wording.
> - v2 → v3: 9 targeted review items — Locality canonicalisation algorithm (§4.1.1), ladder-walk pseudo-code de-dup fix (§5.6), Map response shape clarification (§5.7), `Market.status` default flipped to PAUSED (§3.3), GPS nearest-Locality implementation note (§4.4), trending-search seed fixture requirement (§11.5), `targetCountries[]` provenance note (§12.4), §6.7 wording softened, explicit "no legacy customer-app rebaseline" non-scope (§1.3 + §11.6).
> - v3 → v4: 3 final clarifications — London BUA exception in §4.1.1 (London skips BUA matching to avoid "London" collapse), Map viewport-led EffectiveLocation in §5.7 (`/discovery/in-area` uses bbox centre, not user GPS, for relevance), new §11.7 performance guardrails (in-process caching allowed, no Redis/PostGIS/external cache in v1, required DB indexes listed).

---

## §1 Goal, scope, audience

### §1.1 Goal

Plan 4 is the location-and-relevance engine that makes Redeemo's Discovery, Search, Map, Featured, Trending, and (future) Campaign surfaces feel locally relevant across the UK — from dense urban centres to rural villages, from active rollout markets to organic-supply localities, across all four nations (England, Scotland, Wales, Northern Ireland).

The current implementation relies on simple `branch.city` string-equality matching for the CITY supply tier. That model breaks for non-major-city UK localities (Brightlingsea ↔ Colchester, Huddersfield village outskirts, Scottish council areas with no shire-county equivalent, etc.) and cannot express the asymmetric catchments (small locality borrows from larger nearby centre, never the reverse) that real UK travel behaviour requires.

### §1.2 Plan 4a scope

- **Schema foundation:** `Locality` + `Market` tables; `LocalityCatchmentEdge` join table for the directed catchment graph; resolved location snapshot on `User` and `Branch`; `LadderProfile` fields on `Category`/`Subcategory`; `locationConfidence` on `Branch`; Plan 4b deferred-contract columns on `Campaign`.
- **Gazetteer:** ONSPD-derived `Locality` seed with ONS BUA population tiers; live postcodes.io for runtime resolution; no separate `Postcode` cache table.
- **Catchment model:** hybrid — heuristic baseline + curated overrides for active markets + (future) per-branch extensions.
- **Ranking refactor:** density-adaptive 8-rung ladder (`NEARBY → CATCHMENT → POST_TOWN → LAD → COUNTY → REGION → COUNTRY → NATIONAL`) replacing today's 3-rung NEARBY/CITY/DISTANT logic.
- **Place + Tag search:** type-aware detection in `q` (place → tag → fuzzy); place query establishes a new effective location for that request.
- **PC2 onboarding:** server-side resolution at submit via new `/postcode/preview` endpoint.
- **Card display:** contextual locality + per-tile `proximityBand` chip.
- **Market operationalization:** `Market` table + `Locality.marketId` FK + owner-run admin scripts.
- **Migration:** five-PR cadence (Foundation → Ranking → Consumer wire-up → Search+UX → Cleanup).

### §1.3 Plan 4a non-goals

| Item | Tracked to |
|---|---|
| Featured / Trending / Campaign re-scoping implementation | Plan 4b — schema contract documented in this spec, behaviour deferred |
| Address-level merchant geocoder (Mapbox / Nominatim / Google / OS Places) | Phase 4 Merchant Portal |
| Map rendering provider swap (Mapbox vs `react-native-maps`) | Future Map Visual Polish PR |
| Multi-token natural-language search ("coffee Brightlingsea") | Search v2 |
| Tag alias / synonym curation | Search v2 |
| Autocomplete / typeahead beyond current debounce | Search v2 |
| Place-name disambiguation UI when query matches multiple localities | Search v2 |
| Dynamic per-locality trending search terms | Search v2 |
| Unifying Map's `LocationSearch` with main search place detection | Future UX brainstorm |
| Per-locality merchant rollup display on AllCategories | Plan 4 cleanup (M5) |
| PC3 interests → real `Category` migration | Deferred per `project_pc3_interests_category_migration.md` |
| Branch-level catchment extensions UI (self-serve) | Phase 4 Merchant Portal |
| `LocalityMarketStatusChange` audit table | Phase 5 admin tool |
| User notifications when a Locality flips ORGANIC → ACTIVE | Future marketing brainstorm |
| Branded basemap styling | Future Map Visual Polish PR |
| Map pin variants by `proximityBand` | Future Map Visual Polish PR |
| Crown Dependencies (Isle of Man, Channel Islands) support | Out of scope — UK only (England/Scotland/Wales/Northern Ireland) |
| **Rebaseline of legacy Discovery/Home/Search surfaces** from `feature/customer-app` reference branch | **OUT OF SCOPE.** Plan 4a wires the location model into the current mainline customer-app surfaces only. The large `feature/customer-app` reference branch's old Discovery/Home implementation must NOT be rebased into Plan 4a. Any legacy-surface rebaseline is a separate Tier 2 PR after Plan 4a, consuming the additive API contract (`supplyRung`, `proximityBand`, `rungCounts`, `effectiveLocality`) once Plan 4a's engine is stable on main. Reasons: Plan 4a is already a wide backend + current-consumer change; bundling a legacy screen rebase would make review materially harder and risk; the additive contract makes the rebase trivially safe to defer. |

### §1.4 Audience

Engineering owner; future implementers (Plan 4a M1–M5 PR authors); reviewers; future Plan 4b author; future Search v2 author.

---

## §2 Locked principles (top-level summary)

Full principles appear inline alongside the section that consumes them. Summary for orientation only:

1. **Discovery is geolocation-led, not city-string-led.**
2. The model supports real-world catchments — small localities can borrow from nearby larger centres, but never the reverse.
3. Campaign banners, Featured, and Trending will use the same location relevance model as Discovery (Plan 4b consumer of this spec's contract).
4. **Nearby is density-aware.** No universal mileage radius across the UK.
5. **Catchment relationships are directional and capped.** A locality has 0–3 natural-centre links; lookups are strictly directional.
6. **`Locality` is geography; `Market` is commerce.** Two separate concepts, FK-linked.
7. **User location is area-level by design** (postcode centroid only, privacy-preserving). **Branch location is pin-level by design** (`locationConfidence`-gated for discoverability).
8. **Resolve-on-write.** Every postcode capture path resolves authoritatively at write time; no half-resolved states; existing valid resolved data is never overwritten by a failure.
9. **MarketStatus stays internal** — drives algorithmic fallback generosity; never directly produces user-facing copy.
10. **Supply-context messaging is content-driven, not marketStatus-driven.** Section-level, positive framing, no global "we're growing" banners.
11. **API contract changes are additive.** Legacy fields (`supplyTier` 3-value, `nearbyCount`/`cityCount`/`distantCount`) stay populated for at least one deprecation cycle; new fields (`supplyRung` 8-value, `proximityBand`, `rungCounts`) added alongside. M5 cleanup gated on consumer audit including known pending rebaselines.
12. **UK-wide modelling.** Schema, gazetteer, and ranking work across all four UK nations from day one. Non-English admin hierarchies (Scotland: council area only; Wales: principal area only; NI: district only) are first-class.

---

## §3 Domain model

### §3.1 Locality (new table)

A geographic place — town, village, suburb, neighbourhood. Seeded UK-wide from ONSPD.

```prisma
// Conceptual schema — implementation-final Prisma to be written in M1 plan.
model Locality {
  id              String          @id @default(uuid())
  name            String
  slug            String          @unique
  postTown        String?         // Royal Mail post town
  ladDistrict     String          // admin_district from postcodes.io — always present UK-wide
  adminCounty     String?         // English shire county; null for unitary authority / Scotland / Wales / NI
  region          String?         // English region; null for Scotland / Wales / NI
  country         String          // "England" | "Scotland" | "Wales" | "Northern Ireland" — REQUIRED, no default
  centerLat       Decimal         @db.Decimal(10, 8)
  centerLng       Decimal         @db.Decimal(11, 8)
  populationTier  PopulationTier  @default(UNKNOWN)
  marketId        String?
  needsReview     Boolean         @default(false)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations — back-relations explicitly named for clarity
  market                   Market?                 @relation("LocalityMarket", fields: [marketId], references: [id])
  marketAnchorOf           Market?                 @relation("MarketAnchor")          // 0..1 — this Locality is the anchor of a Market
  outgoingCatchmentEdges   LocalityCatchmentEdge[] @relation("CatchmentSource")        // edges where this Locality is the source (the smaller place)
  incomingCatchmentEdges   LocalityCatchmentEdge[] @relation("CatchmentTarget")        // edges where this Locality is the target (the larger natural centre)
  branches                 Branch[]                @relation("BranchLocality")
  users                    User[]                  @relation("UserLocality")

  @@index([slug])
  @@index([marketId])
  @@index([populationTier])
  @@index([country])
  @@index([centerLat, centerLng])
}

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
```

**Inline principles:**

- *(§2.12 — UK-wide)* `country` is required and not defaulted. Resolved from postcodes.io's `country` field at write time. Acceptable values: `England | Scotland | Wales | Northern Ireland`. The schema enforces this via application-level validation (Zod) and ideally a Postgres CHECK constraint.
- *(§2.12 — UK-wide)* `adminCounty` and `region` are nullable because they don't apply universally. English shire postcodes have both; English unitary authorities have null `adminCounty` but non-null `region`; Scottish / Welsh / NI postcodes have both null. The ranking ladder (§5.1) handles these nulls gracefully.
- `ladDistrict` is required and always present (postcodes.io's `admin_district` is set UK-wide).
- *(§2.7)* `populationTier = UNKNOWN` is the safe default for any auto-created locality. UNKNOWN maps to RURAL density class (§3.7) — fail generous.
- `needsReview = true` on any locality created at runtime via resolve-on-write when ONSPD-seeded admin hierarchy doesn't yet contain a match. Admin reviews via SQL/script queue (no UI in Plan 4a).

### §3.2 LocalityCatchmentEdge (new join table — the directed catchment graph)

Replaces the v1-spec proposal of `Locality.naturalCentreLocalityIds: String[]`. Provides FK integrity, cascade-on-delete, and clean queries for "who points to this locality."

```prisma
// Conceptual schema — final in M1.
model LocalityCatchmentEdge {
  id                 String    @id @default(uuid())
  sourceLocalityId   String    // the smaller locality (e.g. Brightlingsea, Wivenhoe village)
  targetLocalityId   String    // the natural centre (e.g. Colchester, Huddersfield)
  rank               Int       // ordering when source has multiple targets (1 = primary)
  isCurated          Boolean   @default(false)  // true if owner override; false if heuristic-derived
  createdAt          DateTime  @default(now())

  source             Locality  @relation("CatchmentSource", fields: [sourceLocalityId], references: [id], onDelete: Cascade)
  target             Locality  @relation("CatchmentTarget", fields: [targetLocalityId], references: [id], onDelete: Cascade)

  @@unique([sourceLocalityId, targetLocalityId])
  @@index([sourceLocalityId])
  @@index([targetLocalityId])
}
```

**Inline principles:**

- *(§2.5 — directed and capped)* Edge is `source → target` only. The reverse direction is NEVER created automatically. Cap of 3 outgoing edges per source enforced at write time (seed script + admin override script).
- FK integrity: deleting a `Locality` cascades and removes its catchment edges (both incoming and outgoing). No dangling references.
- `rank` orders the natural centres for a single source (1 = primary, 2 = secondary). The ranking ladder uses all of them at the CATCHMENT rung; rank affects in-rung sort only.
- `isCurated = true` flags owner overrides (from `prisma/seed-data/catchmentOverrides.ts` or admin script). Heuristic-derived edges have `isCurated = false`. Useful for audit and re-seed (heuristic re-runs do not overwrite curated edges).

### §3.3 Market (new table)

A commercial rollout unit. One Market row per curated commercial area (status `ACTIVE` or `PAUSED`). Contains one anchor Locality + N member Localities.

```prisma
// Conceptual schema — final in M1.
model Market {
  id                  String        @id @default(uuid())
  name                String        // "Huddersfield"
  slug                String        @unique
  status              MarketStatus  @default(PAUSED)  // default safe — explicit activation required
  anchorLocalityId    String        @unique  // 1:1 — each Market has exactly one anchor; an anchor Locality is the anchor of at most one Market
  ladDistrict         String?       // display only
  adminCounty         String?       // display only
  region              String?       // display only
  country             String        // "England" | "Scotland" | "Wales" | "Northern Ireland"
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

enum MarketStatus {
  ACTIVE
  PAUSED
}
```

**Inline principles:**

- *(§2.6)* `Market` is commerce, not geography. A Market is a Redeemo-defined rollout area; it does not have to match LAD, county, or region boundaries. Huddersfield Market = central Huddersfield + curated nearby localities, not all of Kirklees.
- *(§2.9)* `MarketStatus` is internal-only. Never surfaced verbatim to users.
- Two states for v1 (`ACTIVE | PAUSED`). `PLANNED` and `LAUNCHING_SOON` may be added later as enum extensions if rollout-management requirements emerge. Plan 4a does NOT imply these states exist now.
- **Default `PAUSED`.** New `Market` rows default to `PAUSED`. Activation is always an explicit operator step — `prisma/set-market-status.ts <slug> ACTIVE` — so we never accidentally promote a draft Market to a live curated rollout. The seed file for Huddersfield (M1 plan writing) explicitly sets `status: ACTIVE` in the seed-data block; the script is only used post-seed for re-activation or status flips.
- `Locality.marketId = null` means **organic** (open-market, default UK-wide behaviour). `marketId` pointing to a `PAUSED` Market behaves like organic until resumed.
- Locality belongs to at most one Market (single FK). Catchment overlap between two markets is expressed via `LocalityCatchmentEdge`, not via dual market membership.

### §3.4 User location snapshot (additions to existing User model)

```prisma
// Additions to User (conceptual)
latitude              Decimal?  @db.Decimal(10, 8)
longitude             Decimal?  @db.Decimal(11, 8)
localityId            String?
postTown              String?
ladDistrict           String?
adminCounty           String?
region                String?
country               String?
locationResolvedAt    DateTime?

locality              Locality? @relation("UserLocality", fields: [localityId], references: [id])
```

**Inline principles:**

- *(§2.7 — User side)* User location is area-level. The persisted `latitude`/`longitude` is the **postcode centroid** returned by postcodes.io. Redeemo does not geocode user street addresses.
- All fields nullable for backward compatibility during M1 backfill.
- `User.city` (existing) stays for one deprecation cycle (§2.11). M5 cleanup audits before removing.

### §3.5 Branch location snapshot (additions to existing Branch model)

```prisma
// Additions to Branch (lat/lng already nullable on the existing model)
localityId            String?
localityName          String?              // denormalised mirror — kept in sync with Locality.name at branch write time
postTown              String?
ladDistrict           String?
adminCounty           String?
region                String?
country               String?
locationResolvedAt    DateTime?
locationConfidence    LocationConfidence  @default(POSTCODE_CENTROID)

locality              Locality?           @relation("BranchLocality", fields: [localityId], references: [id])

enum LocationConfidence {
  MANUALLY_CONFIRMED
  ADDRESS_GEOCODED
  POSTCODE_CENTROID
  NEEDS_REVIEW
}
```

**Inline principles:**

- *(§2.7 — Branch side)* Branch location is pin-level. The persisted `latitude`/`longitude` must be the **address-precise building location**, not the postcode centroid. Customers rely on this for map pins, directions, distance display, and trust.
- **Discoverability gate:** a branch is customer-discoverable only when (existing approval/`isActive` gates pass) AND `locationConfidence IN (MANUALLY_CONFIRMED, ADDRESS_GEOCODED)`. Branches with only `POSTCODE_CENTROID` or `NEEDS_REVIEW` remain in DB / admin views but do not appear in Discovery / Search / Map / Category surfaces.
- Plan 4a does not lock an address-level geocoder. Seeded branches ship `MANUALLY_CONFIRMED`. Admin-created branches use postcodes.io centroid + admin pin-drop UI → also `MANUALLY_CONFIRMED`. The geocoder choice belongs to Phase 4 Merchant Portal.
- `Branch.localityName` is a **denormalised mirror** of `Locality.name`. Kept in sync at branch write time (`Branch.localityId` is set/updated → `Branch.localityName` is written from the linked Locality). If `Locality.name` is corrected post-write, a maintenance script `prisma/sync-branch-locality-names.ts` can be re-run to refresh denormalised mirrors. Same pattern applies to `postTown`, `ladDistrict`, `adminCounty`, `region`, `country`. Trade-off: denormalisation avoids a JOIN on every Discovery query's text-search path; acceptable given Locality names rarely change.
- `Branch.city` (existing) stays for one deprecation cycle. M5 cleanup audits before removing.

### §3.6 LadderProfile (Category + Subcategory additions)

```prisma
// Additions to Category
ladderProfile          LadderProfile

// Additions to Subcategory
ladderProfileOverride  LadderProfile?

enum LadderProfile {
  LOCAL_TIGHT
  LOCAL_NORMAL
  MIXED_NORMAL
  DESTINATION_LOCAL
  DESTINATION_WIDE
}
```

The matrix mapping `(LadderProfile, DensityClass) → (nearbyRadiusMiles, maxRung)` lives in code at `src/api/lib/ladderProfiles.ts`. See §5.

**Inline principles:**

- *(§2.4 — code, not DB)* The matrix is in code: tuneable via deploy, not admin UI. Plan 4a does not have Admin Portal; values are tuned during QA and code-reviewed via PR.
- Subcategory override is sparing. Default behaviour is inheritance from parent Category. Override is recorded only when a subcat materially differs.

### §3.7 Tile-level fields surfaced via API (additive contract)

Plan 4a extends every Discovery / Search / Category / Map API response with new tile-level fields, kept ADDITIVE alongside legacy fields.

```typescript
type MerchantTile = {
  // ... existing fields ...

  // LEGACY (stays for one deprecation cycle; populated by deriving from supplyRung)
  supplyTier:     'NEARBY' | 'CITY' | 'DISTANT'  // 3-value, kept compatible

  // NEW
  supplyRung:     SupplyRung                      // 8-value rung tag
  proximityBand:  ProximityBand                   // 4-value UI label
  distanceMetres: number | null                   // existing
}

type SupplyRung =
  | 'NEARBY'
  | 'CATCHMENT'
  | 'POST_TOWN'
  | 'LAD'
  | 'COUNTY'
  | 'REGION'
  | 'COUNTRY'
  | 'NATIONAL'

type ProximityBand =
  | 'NEARBY'
  | 'IN_YOUR_AREA'
  | 'A_LITTLE_FURTHER'
  | 'NEAREST_ON_REDEEMO'
```

**Legacy → new mapping** (used to derive legacy `supplyTier` from new `supplyRung` for one deprecation cycle):

| supplyRung (new) | supplyTier (legacy) |
|---|---|
| NEARBY | NEARBY |
| CATCHMENT | CITY |
| POST_TOWN | CITY |
| LAD | DISTANT |
| COUNTY | DISTANT |
| REGION | DISTANT |
| COUNTRY | DISTANT |
| NATIONAL | DISTANT |

**Meta block (response envelope):**

```typescript
type DiscoveryMeta = {
  // LEGACY (stays one deprecation cycle; derived from rungCounts)
  nearbyCount:   number   // = rungCounts.NEARBY
  cityCount:     number   // = rungCounts.CATCHMENT + rungCounts.POST_TOWN
  distantCount:  number   // = sum of LAD..NATIONAL

  // NEW
  rungCounts:    Record<SupplyRung, number>
  resolvedArea:  string    // user-facing area label, existing
  effectiveLocality: { id: string, name: string } | null  // NEW — see §4.4
  emptyStateReason: string | null   // existing
}
```

**Inline principles:**

- *(§2.11 — additive contract)* The 3-value `supplyTier` and 3 legacy counts are NEVER removed in Plan 4a. They are kept populated alongside new fields. Older mobile clients that read only `supplyTier`/`nearbyCount`/etc. continue to work. Pending customer-app rebaseline surfaces from `feature/customer-app` (Savings/Favourites/Profile-full) continue to consume the legacy shape until they rebaseline.
- `supplyRung` is the new technical rung — drives ranking, meta counts, internal ladder logic.
- `proximityBand` is the user-facing label, density-adapted from `(supplyRung, densityClass)`. UI consumes this.

### §3.8 Density class derivation

```typescript
// src/api/lib/densityClass.ts
function deriveDensityClass(populationTier: PopulationTier): DensityClass {
  switch (populationTier) {
    case 'METRO_CORE':
    case 'CITY':                return 'URBAN'
    case 'LARGE_TOWN':
    case 'TOWN':                return 'SUBURBAN'
    case 'SMALL_TOWN':
    case 'VILLAGE':
    case 'HAMLET':
    case 'UNKNOWN':
    default:                    return 'RURAL'
  }
}

type DensityClass = 'URBAN' | 'SUBURBAN' | 'RURAL'
```

**Inline principles:**

- *(§2.7)* `UNKNOWN → RURAL` is deliberate. When we lack information about a place, we widen (fail-generous), not tighten.

---

## §4 Data architecture

### §4.1 Gazetteer source + ingestion strategy (Option A — lean)

**Locked:** lean gazetteer. ONSPD seeds `Locality`. ONS BUA seeds `populationTier`. No separate `Postcode` cache table. Branch + User rows ARE the cache for postcodes that matter.

**Seed pipeline (M1):**

1. **ONSPD bulk download** (Office for National Statistics Postcode Directory, quarterly file, Open Government Licence). Extract unique admin hierarchies UK-wide. Resolve each to a Locality row. ONSPD covers all four UK nations.
2. **ONS BUA (Built-up Areas) ingest.** ~3,000 named UK settlements with population estimates. Map each BUA to a Locality by name match; set `populationTier` from the population bucket. Localities not in BUA default to `UNKNOWN`.
3. **Heuristic catchment seed.** For each Locality with `populationTier < TOWN`, compute the 1–3 nearest Localities with `populationTier >= TOWN` within K miles (K = 12 default; tuneable). Write directed edges to `LocalityCatchmentEdge` with `isCurated = false`. Smaller→larger only.
4. **Curated catchment overrides for active markets.** From `prisma/seed-data/catchmentOverrides.ts`. Upserts edges with `isCurated = true`; does not affect heuristic edges of other localities.
5. **Market seed.** From `prisma/seed-data/markets.ts`. Creates `Market` rows; sets `Locality.marketId` on member localities.

**Runtime resolution (M1+):**

- Live calls to postcodes.io for any postcode capture (PC2, branch create/update, admin tools).
- Resolved fields persisted on User / Branch row at write time.
- No separate `Postcode` table.

**Upgrade triggers (deferred):**

- If postcodes.io reliability becomes a concern (memory §W), self-host postcodes.io (open-source).
- If a feature emerges that resolves postcodes without persisting on User/Branch, add a lazy `Postcode` cache.

**Inline principles:**

- *(§2.8 — resolve-on-write)* Every postcode capture is server-resolved at write time and persisted atomically. No half-resolved states.
- *(§2.12 — UK-wide)* ONSPD covers all four UK nations. Seed includes Scottish council areas, Welsh principal areas, NI districts as Localities with their proper `country`.
- ONS BUA + ONSPD are Open Government Licence — free, redistributable.

### §4.1.1 Locality canonicalisation (the seed-time naming rule)

The hardest part of the seed isn't the data fetch — it's deciding what a `Locality` *is*. Too granular and we create thousands of unfamiliar ward-named rows; too coarse and we lose meaningful places (Brightlingsea inside Tendring district disappears). The locked algorithm:

**Locality granularity = "best human-readable area the user would name."**

Target: roughly settlement / suburb / market-town granularity. Not ward-level. Not LAD-level. The names a person would say if asked "where do you live?"

**Naming priority (deterministic, applied per ONSPD postcode group):**

**Special case — Greater London:** if the postcode's `region = "London"`, BUA matching is **skipped**. The "Greater London" BUA covers ~9M people and would collapse central, west, east, north, south, and outer London into one Locality named "London" — too coarse to be useful for discovery. Instead, London postcodes use the priority below, starting at step 2, which falls through to **admin_ward** for recognisable neighbourhood-level names ("Dollis Hill", "St James's", "Bethnal Green").

**For non-London postcodes** (and as the regular priority order after the London exception):

1. **BUA settlement name** if the postcode's lat/lng falls inside an ONS Built-up Area polygon → use the BUA name (e.g. "Huddersfield" for HD1-HD9 inside Huddersfield BUA; "Brightlingsea" if the BUA covers it).
2. **Civil parish (non-placeholder)** if no BUA match and the parish field is not a placeholder like `"<LAD>, unparished area"` → use the parish name.
3. **Admin ward** (the primary signal for London postcodes per the special case above; otherwise the next fallback after parish).
4. **Parliamentary constituency** for other urban postcodes where parish is placeholder (HD1 4RU → "Huddersfield" via parliamentary constituency).
5. **Admin district** as last-resort fallback.

**Sub-BUA collapse rule (non-London):** outside London, all ONSPD postcodes whose lat/lng falls inside the same BUA polygon collapse to one Locality named after the BUA. A user in Marsh (a ward inside Huddersfield BUA) is in the "Huddersfield" Locality — not a "Marsh" Locality. This prevents the ward-level explosion outside London while keeping the London granularity that the special case requires.

**Postcodes where signals disagree:** the priority order above is deterministic. Conflicts (e.g. parish = "Brightlingsea" but BUA = larger surrounding area) are resolved by priority — BUA wins if present. If we discover edge cases where this gives the wrong answer, the curated-override path (`prisma/seed-data/catchmentOverrides.ts` style — extended to a `localityOverrides.ts` file for naming overrides) can fix specific cases.

**Slug uniqueness:**
- Slug = `kebab-case(name)` if unique UK-wide.
- On collision: append `-<kebab(ladDistrict)>` (e.g. `newport-newport` for Newport, Wales; `newport-isle-of-wight` for Newport, IoW; `newport-telford-and-wrekin` for Newport, Shropshire).
- On further collision (unlikely): append a deterministic short suffix from postcode area code.

**centerLat / centerLng:** computed at seed time as the centroid of all ONSPD postcodes within the Locality. Stable across re-runs; avoids floating-point drift.

**populationTier:** from BUA population if BUA-based. Otherwise `UNKNOWN` (mapped to RURAL density class). Curated overrides via admin script (`prisma/set-locality-population-tier.ts`).

**Expected scale:** ~5,000–10,000 Locality rows for the UK (target). Each row is a recognisable place name. Far fewer than ONSPD's ~30k admin hierarchies because the BUA-collapse + sub-BUA rule keeps it human-scale.

**Inline principles:**

- *(§2.12 — UK-wide)* The rule works UK-wide. Scotland/Wales/NI postcodes use the same priority — BUA settlement name first, then parish (where applicable), then ward, then constituency, then district.
- The rule is deterministic. Same ONSPD input → same seed output every run. M1 implementer codes this rule once; future quarterly re-seeds produce stable identity.

### §4.2 Schema deltas (M1 migration summary)

| Surface | Change |
|---|---|
| `Locality` | NEW table (§3.1) |
| `LocalityCatchmentEdge` | NEW join table (§3.2) |
| `Market` | NEW table (§3.3) |
| `User` | + lat, lng, localityId, postTown, ladDistrict, adminCounty, region, country, locationResolvedAt |
| `Branch` | + localityId, localityName, postTown, ladDistrict, adminCounty, region, country, locationResolvedAt, locationConfidence (existing lat/lng already nullable) |
| `Category` | + ladderProfile (required; defaulted in migration from intentType) |
| `Subcategory` | + ladderProfileOverride (nullable) |
| `Campaign` | + Plan 4b deferred-contract columns (§12) |
| `FeaturedMerchant` | no schema change — existing `radiusMiles` + `targetLocations[]` reused |

Existing `User.city` and `Branch.city` remain in M1 for one deprecation cycle.

### §4.3 Backfill strategy (M1)

Idempotent script `prisma/backfill-locality-data.ts`. Runs **post-M1 deploy** as an explicit owner-run step. Not inside a Prisma migration. No network calls at migrate time.

```
Usage: npx tsx prisma/backfill-locality-data.ts [--dry-run] [--scope=branches|users|both]

Per row (skip if locationResolvedAt IS NOT NULL):
  1. Read postcode.
  2. Call postcodes.io. Throttle: 10 req/sec. Retry with exponential backoff.
  3. Resolve to Locality by admin hierarchy match. If no match: auto-create with needsReview=true.
  4. Persist all resolved fields atomically (transaction).
  5. Log row outcome.

Final report:
  - rows resolved
  - rows failed (with reason)
  - new localities auto-created (with needsReview list)
```

**For seeded branches:** lat/lng entered manually in `prisma/seed.ts` are precise. M1 seed sets `locationConfidence = MANUALLY_CONFIRMED` for all seeded branches. Backfill does NOT overwrite manually-entered lat/lng — only fills admin hierarchy + localityId.

### §4.4 Effective location resolution (load-bearing contract — addresses owner review item #2)

Every Discovery / Search / Map / Category query resolves an **EffectiveLocation** before invoking the ranking ladder. This is the contract for combining live GPS, saved profile, place query, and platform fallback.

```typescript
type EffectiveLocation = {
  lat:          number       // for distance + NEARBY radius matching
  lng:          number
  locality:     Locality     // drives DensityClass, CATCHMENT, admin rungs
  densityClass: DensityClass
  source:       'GPS' | 'SAVED_PROFILE' | 'PLACE_QUERY' | 'NONE'
} | null
```

**Resolution order:**

1. **Place query (highest priority)** — when `q` matches a place (§6.2), use the matched Locality:
   - `lat, lng` = Locality.centerLat, Locality.centerLng
   - `locality` = the matched Locality
   - `densityClass` = derived from Locality.populationTier
   - `source = 'PLACE_QUERY'`
   - The user's GPS/profile location is NOT used for the ladder. (Distance display may still show "X miles from you" if `?lat&lng` is also passed — this is a separate display concern, not part of the ladder.)

2. **Live device GPS** (`?lat=...&lng=...` in the request) — Option A locked:
   - `lat, lng` = query params
   - `locality` = nearest Locality by Haversine distance from the centroid index (`Locality.centerLat`, `Locality.centerLng`). Indexed lookup, fast (~5-10ms).
   - `densityClass` = derived from the resolved Locality.populationTier
   - `source = 'GPS'`
   - GPS is primary for "near me", distance, AND density/catchment/admin rungs. A user physically in Edinburgh with a Huddersfield home profile experiences Edinburgh-context discovery while GPS is on.

   **Implementation note:** nearest-Locality lookup should not scan all rows on each request. The recommended pattern: a bounding-box prefilter around the GPS point (e.g. `latitude BETWEEN lat-0.3 AND lat+0.3 AND longitude BETWEEN lng-0.3 AND lng+0.3`, ~20-mile window) using the existing `@@index([centerLat, centerLng])`, then in-memory Haversine sort on the candidate set (typically <100 rows). PostGIS is NOT required for Plan 4a; a plain Postgres index suffices. Border / coastline / island edge cases (e.g. a GPS reading on the M25 between two LADs) are treated as QA tuning items — the heuristic is deterministic and the consequence of a "wrong" pick is "user sees offers from adjacent LAD" which is acceptable degradation.

3. **Saved profile** (no GPS query params; user logged in with `User.localityId` set):
   - `lat, lng` = `User.latitude`, `User.longitude`
   - `locality` = `User.locality`
   - `densityClass` = derived from `User.locality.populationTier`
   - `source = 'SAVED_PROFILE'`

4. **Manual area selection** (future capability; contract permits but no UI in Plan 4a) — would override (3) but not (1) or (2).

5. **Platform default (no signal at all):**
   - `EffectiveLocation = null`
   - LOCAL / MIXED categories: empty state with "Set your area" CTA.
   - DESTINATION categories: national DESTINATION listings honestly framed.

**Inline principles:**

- *(§2.1 — geolocation-led)* GPS is primary when available; saved profile is fallback. Plan 4a does not implement a "use saved locality even though GPS is on" mode — GPS supersedes saved profile because the user is physically somewhere different.
- *(§2.7 — privacy)* GPS coords are NOT persisted on User. They are query-time signals only.
- The resolver function is centralised: `src/api/lib/effectiveLocation.ts → resolveEffectiveLocation(query, userId)`. Every Discovery surface reads through it. Place-query resolution happens BEFORE this function (because place query changes the inputs entirely); see §6.
- `EffectiveLocation.effectiveLocality.id + name` is surfaced in `meta.effectiveLocality` for UI display (e.g. "Showing offers in Brightlingsea").

---

## §5 Ranking ladder

### §5.1 Eight-rung supplyRung ladder

| Rung | Definition | Powered by | UK-wide notes |
|---|---|---|---|
| `NEARBY` | within profile/density NEARBY radius of `EffectiveLocation.{lat,lng}` | distance | Always evaluable |
| `CATCHMENT` | same locality OR target of a `LocalityCatchmentEdge` from user's locality | `Locality.id` + `LocalityCatchmentEdge` | Directed (strict — see below) |
| `POST_TOWN` | same `postTown` as EffectiveLocation.locality | denormalised mirror column | Works UK-wide (postTown set on most localities) |
| `LAD` | same `ladDistrict` | denormalised mirror | Works UK-wide (always set: shire district / unitary / council area / principal area / NI district) |
| `COUNTY` | same `adminCounty` | denormalised mirror | English shire counties only; empty for unitary / Scotland / Wales / NI |
| `REGION` | same `region` | denormalised mirror | English regions only; empty for Scotland / Wales / NI |
| `COUNTRY` | same `country` | denormalised mirror | Works UK-wide; values are England/Scotland/Wales/Northern Ireland |
| `NATIONAL` | anywhere in UK | unfiltered | Always evaluable |

**Empty-rung handling:** when a rung's match field is null on the EffectiveLocation (e.g. a Scottish user has no `adminCounty` or `region`), the rung returns 0 results. The walk continues to the next rung up to `maxRung`. If `maxRung` itself is empty, the walk stops at the last non-empty rung that contributed results (no auto-promote past `maxRung`).

**CATCHMENT semantics (strict directional, addresses owner review items #2 and #7):**

A branch in Locality B is in CATCHMENT for an EffectiveLocation pointing at Locality A iff:

- `A.id = B.id`, OR
- There exists a `LocalityCatchmentEdge` where `sourceLocalityId = A.id` AND `targetLocalityId = B.id`.

**One-way only.** The catchment graph stores directed edges from smaller localities to their larger natural centres (e.g. Brightlingsea → Colchester, Wivenhoe → Colchester). A user in Brightlingsea (A) sees Colchester merchants (B) in CATCHMENT because the edge `Brightlingsea → Colchester` exists. A user in Colchester (A') does NOT see Brightlingsea merchants (B') in CATCHMENT because there is no `Colchester → Brightlingsea` edge. Colchester users find Brightlingsea merchants via wider rungs (POST_TOWN if shared; LAD: different — Colchester District vs Tendring District; COUNTY: Essex, shared — so the COUNTY rung is where Colchester users find Brightlingsea merchants).

Manchester users never see Colchester/Brightlingsea merchants in CATCHMENT because no such edges exist; if any of those merchants appear at all, it's via REGION/COUNTRY/NATIONAL rungs only when the user's profile reaches that wide.

### §5.2 Density-adaptive ladder profiles (the matrix)

Five profiles, three density classes. Code-defined in `src/api/lib/ladderProfiles.ts`.

**NEARBY radius (miles) — tuneable starting numbers:**

| Profile | URBAN | SUBURBAN | RURAL |
|---|---|---|---|
| `LOCAL_TIGHT` | 1.5 | 4 | 7 |
| `LOCAL_NORMAL` | 3 | 6 | 10 |
| `MIXED_NORMAL` | 5 | 10 | 15 |
| `DESTINATION_LOCAL` | 8 | 15 | 20 |
| `DESTINATION_WIDE` | 15 | 25 | 35 |

**Maximum rung reached — tuneable starting numbers:**

| Profile | URBAN max | SUBURBAN max | RURAL max |
|---|---|---|---|
| `LOCAL_TIGHT` | LAD | COUNTY | COUNTY |
| `LOCAL_NORMAL` | COUNTY | COUNTY | REGION |
| `MIXED_NORMAL` | REGION | REGION | COUNTRY |
| `DESTINATION_LOCAL` | COUNTRY | COUNTRY | NATIONAL |
| `DESTINATION_WIDE` | NATIONAL | NATIONAL | NATIONAL |

For Scottish / Welsh / NI users, `COUNTY` and `REGION` rungs are empty (null fields). The walk naturally skips them — a Scottish MIXED_NORMAL SUBURBAN user reaches LAD, then COUNTY (empty), then REGION (empty), then COUNTRY (Scotland) which is the effective fallback rung for those users. This is the natural consequence of Scotland's flatter admin hierarchy and is acceptable: the Scottish council area (LAD rung) is itself broader than most English LADs, and COUNTRY (Scotland) acts as the meaningful next rung.

### §5.3 Density-adaptive proximityBand mapping

| supplyRung | URBAN | SUBURBAN | RURAL |
|---|---|---|---|
| NEARBY | Nearby | Nearby | Nearby |
| CATCHMENT | In your area | In your area | In your area |
| POST_TOWN | In your area | In your area | In your area |
| LAD | A little further out | In your area | In your area |
| COUNTY | Nearest on Redeemo | A little further out | A little further out |
| REGION | Nearest on Redeemo | Nearest on Redeemo | A little further out |
| COUNTRY | Nearest on Redeemo | Nearest on Redeemo | Nearest on Redeemo |
| NATIONAL | Nearest on Redeemo | Nearest on Redeemo | Nearest on Redeemo |

Pure function: `getProximityBand(supplyRung, densityClass) → ProximityBand`.

### §5.4 Default Category → LadderProfile mapping

Top-level Categories (Plan 1 seeded 11):

| Category | Profile |
|---|---|
| Food & Drink | `MIXED_NORMAL` |
| Beauty & Grooming | `LOCAL_NORMAL` |
| Services | `LOCAL_TIGHT` |
| Health & Fitness | `LOCAL_NORMAL` |
| Retail & Shopping | `MIXED_NORMAL` |
| Entertainment & Leisure | `DESTINATION_LOCAL` |
| Travel & Stays | `DESTINATION_WIDE` |
| Education & Learning | `LOCAL_NORMAL` |
| Home & Lifestyle | `LOCAL_NORMAL` |
| Auto & Vehicles | `LOCAL_NORMAL` |
| Pets | `LOCAL_NORMAL` |

Exact category names confirmed at M1 against Plan 1's seed.

### §5.5 Subcategory override examples

Subcategory uses parent's profile unless override is set. Owner finalises during M1 plan writing. Initial examples:

| Subcategory | Override | Reason |
|---|---|---|
| Food & Drink → Cafe & Coffee | `LOCAL_TIGHT` | Walkable everyday |
| Health & Fitness → Pharmacy | `LOCAL_TIGHT` | Walkable everyday |
| Entertainment & Leisure → Theme Park | `DESTINATION_WIDE` | National-pull destination |
| Travel & Stays → Day Spa | `MIXED_NORMAL` | Drivable, not flown-to |

### §5.6 Supply-aware ladder walk algorithm

Helper functions (pure, in `src/api/lib/ladderProfiles.ts`):

- `getNearbyRadiusMiles(profile, density) → number`
- `getMaxRung(profile, density) → SupplyRung`
- `getProximityBand(supplyRung, density) → ProximityBand`

Algorithm (collect-first, dedupe-on-build):

```
1. Resolve EffectiveLocation (§4.4) → { lat, lng, locality, densityClass, source } | null
2. If null AND category is LOCAL/MIXED: return empty result with empty-state reason.
3. If null AND category is DESTINATION: walk only NATIONAL rung; return result.
4. Resolve effective LadderProfile from category/subcategory.
5. nearbyRadius   = getNearbyRadiusMiles(profile, densityClass)
6. maxRung        = getMaxRung(profile, densityClass)
7. targetCount    = surface-specific (Home: 20, Search: 50, Category: 50, Map: bbox-bounded)
8. hardCap        = surface-specific (Home: targetCount, Search: 500, Category: 500, Map: 200)

9. candidateBranchesByMerchant = new Map<merchantId, Branch[]>()
10. RUNG_ORDER = [NEARBY, CATCHMENT, POST_TOWN, LAD, COUNTY, REGION, COUNTRY, NATIONAL]
11. nearbyRungEvaluated = false
12. For each rung in RUNG_ORDER:
      IF rungOrdinal(rung) > rungOrdinal(maxRung): break
      fetchedBranches = fetch branches matching this rung (uses denormalised columns + edges)
      For each branch in fetchedBranches:
        IF branch.locationConfidence NOT IN (MANUALLY_CONFIRMED, ADDRESS_GEOCODED): continue
        IF NOT branch.isActive: continue
        branch.matchingRung = rung   // tag the branch with which rung it matched at
        candidateBranchesByMerchant.get(branch.merchantId, []).push(branch)
      IF rung == 'NEARBY': nearbyRungEvaluated = true
      // Cap checks operate on unique merchant count, not branch count
      uniqueMerchantCount = candidateBranchesByMerchant.size
      IF uniqueMerchantCount ≥ targetCount AND nearbyRungEvaluated: break
      IF uniqueMerchantCount ≥ hardCap: break

13. tiles = []
14. For each (merchantId, candidateBranches) in candidateBranchesByMerchant:
      contextBranch        = selectContextBranch(candidateBranches, EffectiveLocation)   // §5.7
      tile.merchantId      = merchantId
      tile.supplyRung      = contextBranch.matchingRung
      tile.proximityBand   = getProximityBand(tile.supplyRung, densityClass)
      tile.distanceMetres  = haversineMetres(EffectiveLocation, contextBranch)
      tile.supplyTier      = mapRungToLegacyTier(tile.supplyRung)   // §3.7 legacy compat
      tile.contextBranch   = contextBranch   // surfaced for card display (locality, name, address)
      tiles.push(tile)

15. Sort within rung per existing per-intent comparator (§5.8)
16. Return tiles ordered by rung, then in-rung sort.
```

**Key fix from v2 review:** branches for the same merchant are now collected across ALL rungs before context-branch selection runs. Earlier versions skipped later-rung branches once a merchant was first seen — that would have produced wrong context-branch choices for multi-branch merchants whose nearest-to-user branch wasn't the first one encountered in the walk.

**Cap evaluation is merchant-count based**, not branch-count based — prevents a merchant with many branches from filling the result set.

**`nearbyRungEvaluated` replaces** the earlier-version's reference to `t.bestRung === 'NEARBY'` (which referenced a field that wasn't set yet). Cleaner: the cap only triggers AFTER the NEARBY rung's results have been added to the candidate pool.

**Note on rungOrdinal:** ordinal index in `RUNG_ORDER` array. Used only for the maxRung cap comparison; the walk iterates the array directly so empty rungs are visited and naturally yield 0 results.

### §5.7 Merchant de-duplication + context-branch selection (addresses owner review item #8)

**Plan 4a customer discovery surfaces are merchant-level.** A merchant appears at most once per result set. Each tile represents the merchant in the context of one selected branch (the "context branch").

**Context-branch selection algorithm** (`selectContextBranch(branches, effectiveLocation)`):

1. **Filter to discoverable branches:** `locationConfidence IN (MANUALLY_CONFIRMED, ADDRESS_GEOCODED)` AND `isActive = true`.
2. **Rank candidates by best matching rung** (NEARBY > CATCHMENT > POST_TOWN > LAD > ... > NATIONAL):
   - Compute each candidate's matching rung against EffectiveLocation.
   - The candidate with the highest (most-specific) rung wins.
3. **Tie-break by distance:** if multiple branches tie on rung, pick the nearest by Haversine distance to EffectiveLocation.
4. **Final tie-break:** alphabetical by `Branch.name`.

The selected branch's matching rung becomes the merchant's `supplyRung` for this query. The tile's distance, locality, and band derive from this context branch.

**For Place-query EffectiveLocation:**

- "Nearest branch in the searched place's catchment + admin hierarchy" naturally falls out of the same algorithm — the EffectiveLocation IS the searched place, so the most-specific matching rung wins.

**For Map surface — Plan 4a response shape (clarification):**

The Map's `/discovery/in-area` endpoint returns a **merchant-level shape** in Plan 4a (one tile per merchant), keeping API parity with Discovery/Search/Category. For each merchant:

- The context branch is the one whose lat/lng falls within the bbox AND ranks best by §5.7's selection rules against the **viewport-derived EffectiveLocation** (see below).
- A merchant with multiple branches in the bbox appears as **one** tile (representing the context branch) AND **one** pin (at the context branch's lat/lng).
- The map list view (bottom sheet) renders the same tile list — consistent UX.

**Map effective-location rule (viewport-led, not GPS-led):**

The Map is the one surface where the user's intent is "show me what's *here* on the map," not "show me what's near me." When the user pans the map to a different area, `/discovery/in-area` builds its EffectiveLocation from the **viewport bbox centre**, not from the user's GPS or saved profile location:

- `EffectiveLocation.lat, lng` = viewport bbox geometric centre (computed from minLat/maxLat/minLng/maxLng).
- `EffectiveLocation.locality` = nearest Locality to that centre (same bounding-box prefilter + Haversine sort as §4.4 step 2).
- `EffectiveLocation.densityClass` = derived from that Locality's `populationTier`.
- `EffectiveLocation.source` = `'GPS'` (the resolver doesn't need a separate source tag for Map; the locality lookup is the same shape).
- The user's GPS, if supplied via `?lat&lng`, is used ONLY for the per-tile "distance from you" display. It does NOT drive the ladder rungs.
- The user's saved profile locality is NOT used for relevance when the viewport is remote.

Concrete effect: a Huddersfield user (GPS or saved profile = Huddersfield) panning the map to London sees London merchants ranked from London's perspective. Their context is the viewport, not their home. The "distance from you" line on the tile still shows the real distance from Huddersfield (~200 miles), but the `supplyRung`/`proximityBand` calculation uses the London-centric ladder.

**Multi-pin per merchant on the map (one pin per branch) is explicitly deferred** to a later Map enhancement. Plan 4a does not introduce a separate branch-level pins shape. Trade-off accepted: a 3-branch merchant in central London shows as one pin instead of three. The card on tap shows the context branch's address. Multi-pin support, if added later, would extend `/discovery/in-area` to return an optional `pins[]` array alongside `merchants[]`, leaving the existing shape additive.

This keeps the Plan 4a API contract uniform across all four merchant-level surfaces (Home / Search / Category / Map).

**Inline principles:**

- A merchant appears once per merchant-level surface (Home, Search, Category).
- The merchant's `supplyRung` is the BEST RUNG across its branches against the current EffectiveLocation.
- `proximityBand` and `distanceMetres` derive from the context branch.

### §5.8 In-rung sort + intent

Within each rung, sort by category intent (unchanged from Plan 1.5):

- LOCAL intent: distance ASC, then alphabetical
- DESTINATION intent: quality-aware (rated merchants by avgRating DESC, then alphabetical)
- MIXED intent: distance ASC for NEARBY, quality-aware for outer rungs

Intent comes from `Category.intentType` (Plan 1.5 enum). Plan 4a does not change intent semantics.

### §5.9 Surface-specific hardCaps

| Surface | targetCount | hardCap |
|---|---|---|
| Home (per section) | 20 | — (capped by targetCount in practice) |
| Search | 50 (paginated) | 500 |
| Category | 50 (paginated) | 500 |
| Map In-area | — (bbox bounded) | 200 (existing `limit` param max) |

### §5.10 Featured / Trending / Campaign (consumer hooks)

Plan 4b implements; Plan 4a contract:

- Tile responses for Featured/Trending surfaces include `supplyRung` + `proximityBand` like any other tile.
- **Featured:** default scope NEARBY + CATCHMENT only. `FeaturedMerchant.radiusMiles` extends; `targetLocations[]` extends.
- **Trending:** NEARBY + CATCHMENT only. If empty, section hidden. No national fallback.
- **Campaign:** own ladder (§12).

### §5.11 No-location fallback

EffectiveLocation = null (no GPS, no saved profile, no place query, no manual):

- LOCAL / MIXED: empty state, "Set your area to see offers near you" + PC2 CTA.
- DESTINATION: national DESTINATION listings honestly framed.

---

## §6 Place + Tag search (addresses owner review item #3)

### §6.1 Detection order

For every `q` query, the search service tries detection in this order. First match wins.

1. **Place match** — `q` exact or prefix-matches a `Locality.name` or `Locality.postTown` (case-insensitive). On match, EffectiveLocation is replaced with the matched Locality (see §6.2).
2. **Tag match** — `q` exact or case-insensitive matches a `Tag.label` across the 4 tag types. EffectiveLocation stays as the user's actual location (§6.3).
3. **Fuzzy fall-through** — `q` fuzzy `ILIKE` across merchant/branch/tag/place text. EffectiveLocation stays as the user's actual location.

### §6.2 Place detection — sets the EffectiveLocation

```
1. ILIKE-prefix on Locality.name (case-insensitive). Multiple matches? Pick highest populationTier.
2. If no match: ILIKE-prefix on Locality.postTown. Highest populationTier wins.
3. If matched:
   - EffectiveLocation.lat = Locality.centerLat
   - EffectiveLocation.lng = Locality.centerLng
   - EffectiveLocation.locality = matched Locality
   - EffectiveLocation.densityClass = derive(matched Locality.populationTier)
   - EffectiveLocation.source = 'PLACE_QUERY'
   - Ladder walk (§5.6) runs from this EffectiveLocation. User's GPS/profile location is NOT used for the ladder.
   - Distance display: optionally show "X miles from you" if the request also carries `?lat&lng` — purely a display concern, not part of the ladder.
   - UI chip: "Showing offers in **{place.name}**"
```

**Effective area for the query:** the searched place. A Manchester user searching `Brightlingsea` sees Brightlingsea catchment merchants ranked from Brightlingsea's perspective. Not Manchester results with Brightlingsea preference.

### §6.3 Tag detection (step 2 — does NOT change EffectiveLocation)

```
1. ILIKE-exact (case-insensitive) on Tag.label across all 4 types: CUISINE, SPECIALTY, HIGHLIGHT, DETAIL.
2. ILIKE-exact on MerchantHighlight.label.
3. If matched:
   - Scope merchant results to ones tagged with this tag.
   - Per-type ranking weight: CUISINE = 4, HIGHLIGHT = 4, SPECIALTY = 2, DETAIL = 1.
   - Within ranked results, apply the standard ladder walk against user's actual EffectiveLocation.
   - UI chip: "Showing **{tag.label}** offers"
```

### §6.4 Fuzzy fall-through (step 3)

Standard fuzzy `ILIKE` across:

- `Merchant.businessName`
- `Merchant.tradingName`
- `Merchant.description`
- `Category.name` (parent + child)
- `MerchantSuggestedTag.tag` (existing)
- `Tag.label` (NEW)
- `MerchantHighlight.label` (NEW)
- `Branch.localityName` (NEW — denormalised, §3.5)
- `Branch.postTown` (NEW)

Ladder walk uses user's actual EffectiveLocation. Multi-token NL queries fall here.

### §6.5 Search UI chip copy

| Detection mode | Chip copy template |
|---|---|
| Place matched | "Showing offers in **{place.name}**" |
| Tag matched | "Showing **{tag.label}** offers" |
| Fuzzy fall-through | No chip — standard search results |

### §6.6 Filter composition

Place and Tag detection compose with FilterSheet filters (category, sort, voucherTypes, amenityIds, openNow). FilterSheet contract unchanged.

### §6.7 Trending searches

Plan 4a does NOT change the hardcoded list (`Pizza, Brunch, Nail salon, Barber, Gym, Coffee`). After M4, the search logic supports all six query patterns: each term either matches a place (none of these do), a curated tag (`Pizza`, `Brunch`, `Coffee` via CUISINE / SPECIALTY tags), or falls through to fuzzy (`Nail salon`, `Barber`, `Gym` via subcategory + business-name fuzzy match). Whether a tap on any one term returns merchants in production depends on actual seeded/registered supply matching the term — Plan 4a does not promise supply, only that the search machinery resolves the term correctly. Dynamic per-locality trending stays Search v2.

### §6.8 Deferred to Search v2

(As §1.3 non-goals.)

---

## §7 PC2 onboarding

### §7.1 PC2 customer-side UX (unchanged)

Postcode typing → debounced lookup → area label preview → submit. Plan 4a keeps this UX unchanged customer-side.

### §7.2 New `GET /api/v1/customer/postcode/preview` endpoint

```
GET /api/v1/customer/postcode/preview?code=<postcode>

Response 200:
{
  postcode: "HD1 4RU",
  localityId: "<uuid>",
  localityName: "Huddersfield",
  postTown: "HUDDERSFIELD",
  region: "Yorkshire and the Humber",
  country: "England"
}

Response 404: { error: "POSTCODE_NOT_FOUND" }
Response 503: { error: "GAZETTEER_UNAVAILABLE" }
```

Same resolver as the submit path. No persistence. Customer-app debounces (300ms). Replaces client-side `pickAreaLabel` logic.

### §7.3 Server-side resolution at PC2 submit

`PATCH /api/v1/customer/profile` re-resolves the postcode authoritatively. Ignores any client-supplied resolved fields. Persists full snapshot atomically. If resolution fails, returns 4xx; profile NOT updated; existing valid resolved location stays untouched.

### §7.4 Failure semantics

| Failure | Behaviour |
|---|---|
| Preview lookup fails | Inline soft state: "Couldn't verify postcode yet — try again". Submit retries authoritatively. |
| Submit resolution fails | Hard error. Profile NOT saved with invalid location. Existing saved location stays untouched. |
| Preview returns unknown locality | Preview shows label as-is. On submit: auto-create Locality with `needsReview: true`. Silent to user. |
| Submit invoked with malformed postcode | 400 with validation error. |

### §7.5 Locality auto-create

```
On resolve-on-write, if no matching Locality:
  Create Locality with:
    name           = derived (parish if non-placeholder, else admin_ward, else parliamentary_constituency)
    slug           = generated
    postTown, ladDistrict, adminCounty, region, country = from response
    centerLat, centerLng = from response
    populationTier = UNKNOWN
    marketId       = null
    needsReview    = true
    (catchment edges = none; heuristic runs in seed, not at write time)
  Link User/Branch to it.
```

---

## §8 Card display + UI consumption

### §8.1 Per-tile proximityBand chip

`proximityBand !== 'NEARBY'` → chip. NEARBY tiles get no chip (default state).

Approved labels: `Nearby`, `In your area`, `A little further out`, `Nearest on Redeemo`.

Visual: subtle tag-style pill, cream/light background, rose/navy text, compact padding. Final visuals at implementation.

### §8.2 Contextual locality in secondary meta line

| State | Secondary line |
|---|---|
| `NEARBY` band, GPS or saved location | `{descriptorType} · {distance}` — unchanged |
| Non-`NEARBY` band, distance available | `{descriptorType} · {locality} · {distance}` |
| No GPS / no resolved location | `{descriptorType} · {locality}` |

### §8.3 Flat band-ordered lists with optional dividers

- Search / Category / Map list view: flat list ordered by `supplyRung`. Per-tile chips on non-NEARBY.
- Subtle band-transition dividers in Search and Category long lists. Thin rule + small muted caption ("— In your area"). Optional rhythm aid.
- Home Featured / Trending / Nearby-by-Category retain their existing section headers; per-tile chips appear inside.
- Map list view: chips only initially; dividers added if QA shows transitions feel unclear.

### §8.4 Map pins unchanged

`react-native-maps` pin rendering stays. Data feeding pins changes (each pin carries `supplyRung` + `proximityBand` for the bottom-sheet preview).

### §8.5 Merchant Profile branch list

`{branch.name} · {locality} · {distance}` — locality replaces existing `city`. PostTown not added separately.

### §8.6 Section-level empty states + approved copy vocabulary

(Identical to v1; reproduced for completeness.)

| Section state | Behaviour |
|---|---|
| Healthy supply | Show merchants. No supply-context copy. Chips handle widening honesty. |
| Some local + farther fallback | Tier-ordered list with chips + optional dividers. No banner. |
| Empty Home Trending / Featured / Nearby-by-Category | Hide section entirely |
| Empty Search | "No matches for **{query}** near you. Try a wider area or different search." |
| Empty Category | "New offers in **{category}** are being added. Invite your favourite local business" |
| Empty Map viewport | `MapEmptyArea` (existing) refreshed: "No offers in this area yet — try zooming out." |
| No location signal | Soft prompt in-section: "Set your area to see offers near you" + PC2 CTA. Not a top-of-screen banner. |

**Approved vocabulary** (locked):
- "Nearby"
- "In your area"
- "A little further out"
- "Nearest on Redeemo"
- "New local offers are being added soon"
- "Showing the nearest offers on Redeemo"
- "Explore offers nearby"
- "Invite your favourite local business"
- "Set your area to see offers near you"

**Banned patterns:**
- "We're growing in your area" / any platform-weakness signal as user copy.
- "No merchants near you" (negative absence).
- Global top-of-Home supply-state banners.
- "Active market" / "Organic market" or synonyms in user copy.

---

## §9 Market operationalization

### §9.1 Market lifecycle

`Market.status` enum: `ACTIVE | PAUSED`. Two states. Reversible. No `PLANNED`/`LAUNCHING` in v1.

A Locality with `marketId IS NULL` is **organic**. A Locality with `marketId` pointing to a `PAUSED` Market behaves like organic until resumed.

### §9.2 Operational scripts (Plan 4a)

```
# Create/edit a market
npx tsx prisma/seed-market.ts <slug> [--name] [--anchor-locality-slug] [--lad] [--county] [--region] [--country]

# Flip status
npx tsx prisma/set-market-status.ts <slug> <ACTIVE|PAUSED>

# Membership management
npx tsx prisma/add-locality-to-market.ts <localitySlug> <marketSlug>
npx tsx prisma/remove-locality-from-market.ts <localitySlug>

# Catchment override
npx tsx prisma/set-locality-catchment.ts <localitySlug> --centre-slugs <slug1>,<slug2>,<slug3>
```

Owner runs these. No admin UI in Plan 4a. Admin tool deferred to Phase 5.

### §9.3 Catchment overrides for ACTIVE markets

Curated overrides in `prisma/seed-data/catchmentOverrides.ts`. Plan 4a M1 includes the owner's curated list. Initial scope: **Huddersfield + ~20 surrounding localities**. Owner-time at spec/M1 writing: 30–60 minutes.

Heuristic-derived edges (`isCurated = false`) are not overwritten by override re-runs; the script upserts the curated edges only.

### §9.4 Initial Market list

Owner confirms at M1 plan writing. Default assumption: Huddersfield only. Other UK Localities default to `marketId: null` (organic).

### §9.5 Audit trail

No `LocalityMarketStatusChange` table in v1. Script invocation history + git commits of seed files are the trail. Audit table deferred to Phase 5.

### §9.6 User notifications on Market state change

Silent in v1. Future marketing brainstorm decides.

---

## §10 Map screen (Plan 4a)

### §10.1 Provider stays `react-native-maps`

`react-native-maps@1.20.1` + platform defaults (Apple Maps iOS, Google Maps Android) + `expo-location` geocoding + Apple Maps URL for directions. Unchanged.

### §10.2 Plan 4a Map-surface changes are data-only

Pin payload now carries `supplyRung` + `proximityBand`. List view (bottom sheet) renders MerchantCards honouring §8.1. Branch lat/lng are `MANUALLY_CONFIRMED` / `ADDRESS_GEOCODED` pin-precise coords.

No basemap styling. No pin visual changes. No directions handler changes. No `LocationSearch` changes.

### §10.3 Cross-platform divergence

Customer website uses Mapbox (locked 2026-04-14 website spec). Customer mobile uses `react-native-maps` (locked 2026-04-17 mobile plan). Pre-existing, intentional, not introduced by Plan 4a.

### §10.4 April 23–24 brainstorm 29364

Preserved as input for any future Map Visual Polish / Mapbox-swap PR. Recorded as visual exploration, not binding override.

### §10.5 Future provider triggers

Brand polish; Android/iOS visual inconsistency; Place Autocomplete need; cost concerns (Android Maps SDK $200/mo Google credit).

---

## §11 Migration strategy

### §11.1 Five-PR cadence

| Milestone | Scope | Customer-visible? |
|---|---|---|
| **M1 — Foundation** | Schema migration. ONSPD+BUA seed. Heuristic + curated catchments. Market seed. Resolve-on-write in branch+user writes. `/postcode/preview` endpoint. Idempotent backfill (owner-run). | No |
| **M2 — Ranking** | `rankMerchants` v2 with density-adaptive 8-rung ladder. `LadderProfile` matrix in code. `proximityBand` resolver. Per-rung counts. Comprehensive tests. | No |
| **M3 — Consumer wire-up** | Discovery routes return new contract (ADDITIVE — legacy fields retained). Customer-app tile types extended. Surfaces consume `supplyRung` + `proximityBand`. No empty-state copy changes. | Yes (first user-visible flip — tier-aware tile ordering, band-aware chip rendering) |
| **M4 — Search + UX** | Place + Tag search detection in `q` (place sets EffectiveLocation). Tag.label + MerchantHighlight.label fuzzy expansion. Section-level empty states + approved copy. Search chips. | Yes |
| **M5 — Cleanup** | Audit-then-remove legacy fields where superseded AND audit shows no consumer reads them. | No |

### §11.2 Backfill script

`prisma/backfill-locality-data.ts` — idempotent, throttled, reportable. Run post-M1 deploy.

### §11.3 Kill-switches (remediation, NOT feature-flagging)

One kill-switch in Plan 4a (addresses owner review item #6):

```typescript
// src/api/customer/discovery/service.ts
const PLACE_SEARCH_DETECTION_ENABLED = true   // M4 lock; flip to false to short-circuit place detection
                                              // and fall to fuzzy fallback only (matches pre-Plan-4 behaviour).
```

**`POSTCODES_IO_FAIL_OPEN` is removed.** Resolve-on-write is a load-bearing invariant. A fail-open mode would create half-resolved data that contradicts §2.8. If postcodes.io is down, write paths fail user-visibly per §7.4. The operational remediation for prolonged outage is self-hosting postcodes.io (open-source, ~1 afternoon — already noted as a deferred upgrade path).

### §11.4 Additive-only API contract (load-bearing, addresses owner review item #4)

For M3 and M5: API contract changes are additive only.

- **M3 additive:** new fields `supplyRung` (8-value), `proximityBand`, `rungCounts` (per-rung counts), `effectiveLocality` added to responses. Legacy `supplyTier` (3-value), `nearbyCount`, `cityCount`, `distantCount` stay populated as derived computed fields per the mapping in §3.7.
- **M5 audit-gated removal:** legacy fields removed only after:
  - Grep across current `main` confirms no read paths remain.
  - Audit of known pending rebaseline surfaces (`feature/customer-app` Savings/Favourites/Profile-full) confirms they consume new fields (or commit to consuming new fields before M5 lands).
  - If audit shows a consumer still reads a legacy field, that field stays until the consumer rebaselines.
- The new `supplyRung` field is named to differentiate from legacy `supplyTier`. Old clients reading only `supplyTier` see correct 3-value values (derived from `supplyRung`). New clients consume `supplyRung` directly.

### §11.5 Test fixture readiness

| Milestone | Fixtures |
|---|---|
| M1 | Seed produces all expected Localities (Karaara → Huddersfield Locality + Huddersfield Market; Covelum → Brightlingsea Locality; Bean & Brew → Shoreditch Locality; dev-merchant-001 → London Locality). All seeded branches `MANUALLY_CONFIRMED`. UK-wide test postcodes pinned: HD1 (Huddersfield, England), CO7 (Brightlingsea, England), NW2 (London, England), SW1A (Westminster, England), G1 (Glasgow, Scotland), CF10 (Cardiff, Wales), BT1 (Belfast, NI). Each test postcode resolves to a Locality with the correct `country`. |
| M2 | Synthetic merchant fixtures cover every (density, profile, rung) combination including null-COUNTY / null-REGION fall-through for Scottish/Welsh/NI users. Property tests: rural user sees same merchants as urban user with different `proximityBand`. |
| M3 | Additive contract tests: every existing Discovery response shape still validates against the legacy schema (`supplyTier` 3-value, `nearbyCount`/`cityCount`/`distantCount` present and consistent). New fields populated on every fixture. |
| M1/M4 | **Seed fixtures must cover the 6 hardcoded trending search terms** (`Pizza, Brunch, Nail salon, Barber, Gym, Coffee`). M1 seed additions: at least one merchant carrying each of the relevant tags/subcategories (e.g. a CUISINE=Pizza merchant; a SPECIALTY=Brunch merchant; a Cafe & Coffee subcat merchant; a Nail salon subcat merchant; a Barber subcat merchant; a Gym subcat merchant). M4 test asserts each of the 6 terms returns non-empty against the seed via the new detection logic. **The seed-fixture requirement is non-negotiable** — Plan 4a's fix to the trending-searches gap is only verifiable when fixtures back it. Owner picks the exact merchant names during M1 plan writing; the named test postcodes are pinned in M1 (above) and additional category/tag-bearing merchants are added there. `q=Huddersfield` returns Karaara via place detection. `q=Brightlingsea` returns Covelum. |
| M5 | Full Vitest + Jest sweep. `tsc --noEmit` clean. Consumer audit documented in PR description. |

### §11.6 Coordination with pending rebaselines (explicit non-scope)

**Plan 4a wires the location model into the current mainline customer-app surfaces only.** Plan 4a does **NOT** rebase any legacy Discovery/Home/Search/Map implementation from the `feature/customer-app` reference branch. That work is its own future Tier 2 PR(s).

Specifically out of scope for Plan 4a:

- Phase 3C.1f (Savings tab) — lives on `feature/customer-app`. Plan 4a's additive contract (§11.4) preserves the legacy `supplyTier`/counts shape so this surface can rebaseline at its own pace post-Plan 4a, consuming `supplyRung` + `proximityBand` if it chooses, OR continuing on legacy fields until a deprecation cycle expires.
- Phase 3C.1g (Favourites screen) — same as above.
- Phase 3C.1h (Profile full surface) — same as above.
- Any other legacy Discovery/Home implementation on `feature/customer-app` — explicitly NOT touched by Plan 4a.

Why this matters: Plan 4a is already a wide backend + first-consumer change touching schema, gazetteer, ranking core, search expansion, onboarding, and customer-app surfaces. Bundling a legacy-branch rebaseline into Plan 4a would materially expand the diff, slow review, and risk regressions across surfaces that don't share Plan 4a's core changes. The locked additive API contract is precisely the design that lets us defer this safely.

**Sequencing:** once Plan 4a's engine is stable on `main` (post M3 at minimum), each pending legacy surface gets its own dedicated Tier 2 rebaseline PR. Those PRs consume the additive contract (`supplyRung`, `proximityBand`, `rungCounts`, `effectiveLocality`) for proximityBand-aware tile rendering, but they are NOT part of Plan 4a's M1–M5 cadence.

### §11.7 Performance guardrails (Plan 4a posture, not a caching project)

Framed as guardrails for the implementer + reviewer, not new scope. Plan 4a's optimization posture is "stay simple; profile before adding infrastructure."

**Storage caching (locked):**

- **No separate `Postcode` cache table in Plan 4a** (Option A, locked in §4.1). The User row and the Branch row ARE the cache for every postcode that matters. Reaffirmed here.

**In-process caching (allowed for static-ish reference data):**

- `LadderProfile` matrices (`src/api/lib/ladderProfiles.ts`) — pure-code constants, JS module-scope, no caching layer needed.
- `Locality` lookup by id / slug — recommend a small in-process LRU (~1000 entries) or module-scope `Map` populated on demand. Localities are deeply static (refreshed quarterly via seed).
- `LocalityCatchmentEdge` lookups by sourceLocalityId — same pattern; small in-process cache.
- `Market` lookup by slug + member-list — same pattern; ~10–50 markets at most.

These are acceptable as in-process maps populated on first read, invalidated only on process restart. Plan 4a does NOT introduce Redis or any external cache for this data.

**GPS nearest-Locality lookup:**

- Already bounded by the bbox prefilter described in §4.4 (~20mi window using `@@index([centerLat, centerLng])`, then in-memory Haversine on the typically-<100-row candidate set).
- **Optional micro-optimisation:** the resolver MAY cache rounded coordinate-cell lookups briefly (e.g. round lat/lng to 0.01° grid, ~1km cells, in-process LRU keyed by cell). This is a deploy-time decision the M2 implementer can include or skip based on profiling. Not required.

**Required DB indexes (M1 plan should explicitly list these):**

- `Locality(slug)` — unique, for resolve-by-slug.
- `Locality(centerLat, centerLng)` — bbox prefilter for GPS nearest lookup + Map bbox queries.
- `Locality(country)` — country-rung match.
- `Locality(marketId)` — market membership query.
- `Locality(populationTier)` — density derivation in queries (rare; nice-to-have).
- `LocalityCatchmentEdge(sourceLocalityId)` — outgoing edges lookup at ladder walk time.
- `LocalityCatchmentEdge(targetLocalityId)` — for ops queries like "who points to this locality."
- `LocalityCatchmentEdge(sourceLocalityId, targetLocalityId)` — unique constraint already declared.
- `Branch(localityId)` — branch-by-locality fetch at LAD/COUNTY/REGION/COUNTRY rung resolution.
- `Branch(postTown)`, `Branch(ladDistrict)`, `Branch(adminCounty)`, `Branch(region)`, `Branch(country)` — denormalised-mirror rung matching.
- `Branch(locationConfidence)` — discoverability gate query.
- `Tag(label)`, `Tag(type)` — Search Tag.label expansion (existing `Tag.tag` index stays).
- `MerchantHighlight(label)` — Search HIGHLIGHT search.
- `Branch(localityName)` — Search fuzzy fall-through (denormalised mirror).

The M1 plan task list materialises each of these. Pre-launch a "DB index audit" task confirms each query the ranking ladder makes hits an index (covered already by memory §W production-resilience standing checklist).

**Observability (lightweight in Plan 4a):**

- Log slow Discovery queries (>500ms backend time) with a structured tag including `surface`, `categoryId`, `maxRungReached`, `rungCounts`.
- Optionally log per-rung result counts at info level (sampled) so we can spot if the ladder is widening to COUNTY/REGION/COUNTRY too often in production.
- Logs ship to the existing logging surface; no new dashboarding work in Plan 4a.
- Full dashboards belong to the pre-launch hardening track (memory §W reference).

**Explicitly out of scope for Plan 4a:**

- **No Redis.** No external cache. No CDN-edge caching for Discovery responses.
- **No PostGIS.** Plain Postgres indexes + Haversine in Node are sufficient. PostGIS becomes a candidate only if profiling shows the bbox prefilter is a real bottleneck at production scale.
- **No query-result caching of Discovery responses.** Discovery is personalised by user location signal; caching is hard to do correctly without complex invalidation. Plan 4a doesn't need it.
- **No materialised views.** Same reason — premature.

**Posture summary:** v1 stays simple. Add caching/infrastructure only when profiling shows a specific need. The standing production-resilience checklist (memory §W) flags scalability concerns to revisit; Plan 4a itself does not pre-engineer for them.

---

## §12 Plan 4b — Featured / Trending / Campaign deferred contract

### §12.1 Plan 4b implementation deferred

Plan 4b gets its own spec when implementation starts. This section documents only the **schema contract** added in Plan 4a M1.

### §12.2 Featured (no Plan 4a schema addition)

`FeaturedMerchant.radiusMiles` + `FeaturedMerchant.targetLocations[]` already exist (audit confirmed). Plan 4b teaches service code to read them.

### §12.3 Trending (no schema addition)

Plan 4b restricts scope to NEARBY + CATCHMENT (replacing today's `branch.city` string equality). Live-computed from redemption signal.

### §12.4 Campaign — schema additions in Plan 4a M1

These columns ARE added in Plan 4a M1. Nullable / default-safe. Unused by Plan 4a service code.

```prisma
// Additions to Campaign
targetLocalityIds       String[]   @default([])  // array of Locality.id; validation deferred — no Prisma-level FK
                                                  // for arrays. Plan 4b service code validates membership at read.
branchAnchorId          String?
radiusMiles             Decimal?   @db.Decimal(5, 2)
targetLadDistricts      String[]   @default([])  // array of ladDistrict strings; matched against Locality.ladDistrict
targetCounties          String[]   @default([])
targetRegions           String[]   @default([])
targetCountries         String[]   @default([])  // NEW from v2 tightening pass alongside the COUNTRY rung.
                                                   // Enables Plan 4b multi-country scoping (e.g. Scotland-only campaign).
                                                   // Default safe; no Plan 4a service code reads it. Marked here so
                                                   // future reviewers see this is intentional, not an accidental
                                                   // expansion of the originally-locked Plan 4b campaign contract.
isNational              Boolean    @default(false)
priority                Int        @default(0)

branchAnchor            Branch?    @relation("CampaignBranchAnchor", fields: [branchAnchorId], references: [id])
```

Note: `targetLocalityIds` is an array of UUIDs without Prisma-level FK enforcement (Prisma 7 does not support FK on array elements). Plan 4b service code validates at read; admin script that creates campaigns validates at write. Acceptable trade-off given campaigns are admin-curated and read paths fail gracefully on stale references.

### §12.5 Campaign matching ladder (Plan 4b, recorded for context)

1. **Specific locality** — campaign's `targetLocalityIds[]` intersects `user.localityId`
2. **Branch radius** — `distance(user, campaign.branchAnchor) ≤ radiusMiles`
3. **Catchment** — campaign's `targetLocalityIds[]` intersects (via `LocalityCatchmentEdge`) the user's outgoing catchment edges (same directional semantics as discovery CATCHMENT rung)
4. **LAD** — `targetLadDistricts[]` includes user's lad
5. **County** — `targetCounties[]` includes user's county
6. **Region** — `targetRegions[]` includes user's region
7. **Country** — `targetCountries[]` includes user's country
8. **National** — `isNational = true` only
9. **Platform fallback banner** — non-campaign template when no campaign matches

Ranking: more-specific rung outranks wider rung; within rung, `priority DESC`. Cap home carousel at 5 banners.

### §12.6 Platform fallback banner copy

Plan 4b spec finalizes. Approved vocabulary candidates: "New local offers are being added soon", "Invite your favourite local business", "Explore offers nearby". Never platform-weakness signals.

---

## §13 Risks + trade-offs

### §13.1 Risk register

**Data + third-party:**

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | postcodes.io downtime during user PC2 or branch creation | Medium | High — blocks onboarding | Resolve-on-write rejects the operation; user retries. No fail-open mode (locked §11.3). Standing memory §W flag. |
| 2 | postcodes.io rate-limiting during backfill of 100s/1000s of branches | Low | Medium — backfill slower | Backfill throttles 10 req/sec, retries with backoff. Documented in script. |
| 3 | ONSPD quarterly refresh diverges from postcodes.io live response | Very low | Low | Treat rare mismatch as auto-create + needsReview. Heals on next refresh. |
| 4 | New postcode added between our seed and a user's PC2 | Low | Low | Auto-create via resolve-on-write; admin reviews via needsReview queue. User unaffected. |
| 5 | Catchment heuristic mis-attaches outlier locality | Medium | Medium | Curated overrides for ACTIVE markets. Organic markets accept heuristic miss; admin can override via script. |
| 6 | populationTier seed wrong for edge cases | Low | Low | ONS BUA is upstream-authoritative. Admin script override per locality if needed. |

**Migration + cutover:**

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 7 | M1 backfill script fails partway | Medium | Medium | Script idempotent. Failures logged. Owner re-runs after fix. |
| 8 | M2 ranking regression caught only in M3 | Medium | High | TDD: every density × profile × rung combination unit-tested in M2 before M3. |
| 9 | M3 API contract changes break old clients or pending rebaselines | Medium | High | Additive contract (§11.4). Legacy fields stay one deprecation cycle. |
| 10 | M5 cleanup drops a column still used | Medium | Medium | Audit-then-remove gate. M5 PR documents the audit. |
| 11 | Existing seeded fixtures break with new schema | High | Low (seed only) | Seed updated in M1. Validation test confirms every seeded branch has `locationConfidence != null`. |

**Runtime + performance:**

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 12 | Search Tag.label join explosion at scale | Low at v1 | Medium at scale | DB indexes on `Tag.label`, `Tag.type`, `MerchantHighlight.label`. Memory §W index-audit flag pre-launch. |
| 13 | rankMerchants v2 ladder walk slower than v1 (8 rungs vs 3) | Low | Low at v1 | Pure in-memory after one DB fetch. ~2-3x in-memory work; negligible. |
| 14 | Map post-rank bbox filter slow as supply grows | Low at v1 | Medium long-term | Already memory §W flagged. DB-side bbox prefilter when warranted. NOT Plan 4a scope. |
| 15 | `/postcode/preview` adds backend chatter during PC2 typing | Low | Low | Existing PC2 already calls postcodes.io per keystroke. Same profile. |
| 16 | GPS → nearest-Locality lookup at every Discovery query adds latency | Low | Low | Indexed Haversine. ~5-10ms per query. |

**Product / UX:**

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 17 | Density-adaptive radii feel wrong in real QA | Medium | Medium | All radii tuneable via deploy. First-week post-launch is QA tuning. |
| 18 | Copy lands wrong for non-English / regional users | Low | Low | Vocabulary tuneable. No structural blocker. |
| 19 | Search chip confuses ("expected merchant, got area") | Medium | Low | Chip explains the mode. Fuzzy fallback still hits merchant matches. |
| 20 | Trending search matches feel unexpected (broader hits) | Medium | Low | Per-type weighting. Per-locality trending stays Search v2. |
| 21 | Place query with no GPS — distance display is missing | Low | Low | Distance optional when `?lat&lng` absent. Locality label remains. Acceptable. |

**Coordination + sequencing:**

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 22 | Plan 4a + Plan 3 (PC3) both touch User schema | Medium | Low | Both additive. No conflict. |
| 23 | Phase 3C.1f/g/h surfaces consume legacy 3-value supplyTier | Low | Medium | Additive contract (§11.4) lets them rebaseline at their own pace. |
| 24 | Legacy `feature/customer-app` branch consumption | Medium | Medium | Additive-only contract. No removal of fields legacy branch reads. |
| 25 | Map LocationSearch / main Search unification | Low | Low | Locked as deferred. Plan 4a doesn't change Map LocationSearch. |
| 26 | UK-wide modelling: Scottish/Welsh/NI users with null COUNTY/REGION rungs | Medium | Low | Walk handles nulls. COUNTRY rung provides meaningful widening. Acceptable. |

### §13.2 Articulated trade-offs

| Decision | Gained | Accepted cost |
|---|---|---|
| Option A lean gazetteer | No ingestion pipeline | postcodes.io is hot-path dependency on writes |
| Option D hybrid catchment | Scales UK-wide; curated where accuracy matters | Owner-time for active-market catchment curation |
| Density-adaptive radii in code | Tuneable via deploy; no admin UI | Retune needs deploy; no real-time A/B |
| Two-state Market (ACTIVE/PAUSED) | Simplest v1 model | No PLANNED state for rollout-roadmap |
| Single-FK Locality→Market | Atomicity; simple ops | Village in two market catchments must pick one |
| 8-rung ladder | UK-wide admin support; granular widening | Slightly more complex walk algorithm |
| `LocalityCatchmentEdge` join table | FK integrity; cascade delete; `rank` ordering | One extra join vs array column |
| `supplyRung` new field + legacy `supplyTier` retained | Additive contract; safe for old clients + pending rebaselines | Two fields populated on every response for one deprecation cycle |
| Five-PR cadence | Reviewable; revertable per-PR | Longer calendar; M2 ships invisible-to-user backend change |
| Plan 4b deferred | Plan 4a doesn't bloat | Featured/Trending/Campaign global scoping remains broken until 4b |
| No address-level geocoder in 4a | No lock-in; admin pin-drop sufficient | Phase 4 must choose geocoder for self-serve |
| Map provider stays `react-native-maps` | No Mapbox migration scope | Branded basemap deferred |
| Tag.label search bundled | Trending searches start working | 4 SQL tables added to Search JOIN footprint |
| GPS supersedes saved profile for ladder | User physically present = correct context | Holiday users in Edinburgh see Edinburgh, not Huddersfield (matches the locked principle) |
| Place query becomes EffectiveLocation | Manchester user searching Brightlingsea sees Brightlingsea results | User's actual location ignored for ladder during that query |

---

## §14 Test strategy outline

| Milestone | Focus | Approach |
|---|---|---|
| M1 | Schema integrity; backfill idempotency; resolve-on-write contract; auto-create flow; UK-wide postcodes | Vitest integration tests vs Neon test DB. Test postcodes pinned UK-wide (HD1, CO7, NW2, SW1A, G1, CF10, BT1). |
| M2 | Density × profile × rung math; catchment edge cases; null-COUNTY / null-REGION handling | Vitest unit tests on `rankMerchants`. Property tests: rural-vs-urban same fixtures, different `proximityBand`. Scottish user fixture with null county/region. |
| M3 | Additive API contract; tile contract; legacy field continuity | Vitest contract tests on each Discovery route. Jest tests on customer-app response parsing. Legacy schema validates against new responses. |
| M4 | Place / Tag detection ordering; effective-location override on place query | Vitest unit tests. All 6 trending searches return non-empty. `q=Brightlingsea` from Manchester user returns Brightlingsea catchment results. |
| M5 | No regression; consumer audit | Full Vitest + Jest sweep. `tsc --noEmit` clean. Consumer audit documented in PR. |

---

## §15 Deferred-decisions register

| Item | Deferred to | Re-evaluation trigger |
|---|---|---|
| Featured / Trending / Campaign implementation | Plan 4b | When Phase 4 / 5 readiness aligns |
| Address-level merchant geocoder choice | Phase 4 Merchant Portal | Self-serve onboarding |
| Map rendering provider swap | Future Map Visual Polish PR | Brand polish; A/iOS inconsistency; Place Autocomplete; cost concerns |
| Branded basemap / Mapbox style URL | Same | Same |
| Pin variants by `proximityBand` | Same | Same |
| Multi-token NL search | Search v2 | Usage + analytics |
| Tag alias / synonym curation | Search v2 | Same |
| Autocomplete / typeahead beyond debounce | Search v2 | Same |
| Place-name disambiguation UI | Search v2 | Same |
| Full relevance scoring overhaul | Search v2 | Same |
| Dynamic per-locality trending | Search v2 | Same |
| Map LocationSearch + main Search unification | Future UX brainstorm | Same |
| PC3 interests → real `Category` migration | Plan 3 deferred | Post-stability |
| Branch-level catchment extensions UI | Phase 4 Merchant Portal | Self-serve onboarding |
| `LocalityMarketStatusChange` audit table | Phase 5 admin tool | When admin tool ships |
| User notifications on Market state change | Future marketing brainstorm | Real launch happens |
| `PLANNED`, `LAUNCHING_SOON` Market states | Future schema delta | Rollout-management dashboard need |
| `Merchant.primaryMarketId` denormalisation | Future ops PR | Branch→Locality→Market join slows |
| Per-locality merchant count display | Plan 4 M5 cleanup | M5 |
| `merchantCountByCity` repurpose vs remove | Plan 4 M5 cleanup | M5, post-audit |
| Crown Dependencies (Isle of Man, Channel Islands) | Future schema decision | Product demand |
| `Locality.country` Postgres CHECK constraint | M1 implementation choice | M1 plan |

---

## §16 Open items for plan writer

1. **Initial ACTIVE markets list** — owner confirms at M1 plan writing. Default: Huddersfield only.
2. **Huddersfield Market member localities list** — owner provides ~20 surrounding localities.
3. **Subcategory override list** — owner reviews + confirms which subcategories deviate.
4. **Tuning observability scope** — what backend logs to emit (per-rung result counts, average band per query). Captured in M3 plan tasks.
5. **Final copy strings** for chips, empty states, dividers. Vocabulary locked; visual copy refined in M4.
6. **Backfill throttle rate** — `10 req/sec` proposed. Owner adjusts before M1 deploy if needed.
7. **Verify exact Plan 1 category names** when populating §5.4 default mappings.

---

## §17 References

- **Brainstorm conversation:** Q1–Q11 + tightening pass, 2026-05-13.
- **Karaara Huddersfield fixture:** PR #77 (merge `e73a849`, 2026-05-13).
- **Covelum Brightlingsea fixture:** existing seed.
- **Plan 1 (taxonomy):** `docs/superpowers/plans/2026-04-28-category-taxonomy-foundation.md` + spec `2026-04-28-category-taxonomy-design.md`.
- **Plan 1.5:** `docs/superpowers/plans/2026-04-29-supply-aware-correction.md` + spec `2026-04-29-supply-aware-correction-design.md`.
- **Plan 2 / PR-B remediation:** `docs/superpowers/plans/2026-04-30-customer-app-pr4-remediation.md`.
- **Customer-flow baseline:** `docs/customer-flow-current.md` v1.0.
- **April 23–24 brainstorm 29364:** `.superpowers/brainstorm/29364-1776892625/` (preserved for future Map Visual Polish input).
- **Memory:** `project_discovery_sequencing_plan4.md`; `project_pc3_interests_category_migration.md`; production-resilience standing checklist (memory §W).

---

**End of spec v2.**
