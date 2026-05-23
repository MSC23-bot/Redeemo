# §DG Popular Ranking + Test-Redemption Cleanup — Design Spec

**Version:** 1.1
**Status:** Locked — ready for implementation planning
**Tier:** 2 — brainstorm-first + plan-first (multi-file: schema + backend + tests + spec doc)
**Brainstorm:** in-session 2026-05-23 (§DG scoping package + empirical probe via `prisma/audit-popular-ranking.ts` + owner locks for Option D + Option 4-light + v1.1 rolling-30-day window amendment)
**Trigger:** PR #126 device-QA-5 (London/Westminster observation: Popular surfaces Karaara/Pino's/Iron Forge — Huddersfield-area QA-redemption-heavy merchants — ahead of relevant London merchants); standing loose thread from PR #126 close-out.

## v1.1 changelog (2026-05-23) — rolling 30-day popularity window

Owner direction pre-T1: the v1.0 spec inherited the existing **calendar-month** window from `buildPopularRail` + `buildTrendingRail` without challenging it. The calendar-month boundary has a real product problem — at 00:00 UTC on the 1st of each month, every merchant's popularityScore resets to 0, creating a periodic "start-of-period cliff" where Trending can go dark and Popular's tiebreaker dormant-falls-through fires for everyone.

Owner-locked Option B from the pre-T1 audit:

- **Both Popular AND Trending switch to a rolling 30-day window**, ending at `now`.
- Eliminates the start-of-month cliff entirely — the window slides forward each second; no edge-case engineering for the boundary.
- Same compute cost as calendar-month (one date-range filter).
- Same window for both rails — the difference between Popular and Trending is V3 scope filter + sort key, NOT time horizon. Mental model stays clean.
- A shorter 7-day rolling window for Trending (more "what's hot now" semantics) is deferred to a follow-up brainstorm once real customer volume materialises.

Implementation change: replace inline `startOfMonthUTC(new Date())` calls with a new exported helper `startOfRollingPopularityWindow(now: Date): Date` living at `src/api/customer/discovery/popularityWindow.ts`. The helper takes `now` for deterministic testing; production callers pass `new Date()`. Window length is a module-level constant `ROLLING_POPULARITY_WINDOW_DAYS = 30`.

Affected sections: §1 (problem statement framing), §5.1 (step 2 helper rename), §6 (cleanup helper rename), §7 (caveat rephrase — no longer tied to month boundary), §8.1 (new §DG-8 pin verifying window-boundary behaviour), §11.1 (risk note), §13 (deferred follow-up: 7-day Trending window).

---

## 1. Problem statement

`buildPopularRail` ranks merchants by **current-month redemption count, UK-wide, location-blind** ([homeRailBuilders.ts:465-603](src/api/customer/discovery/homeRailBuilders.ts#L465-L603)). The empirical probe (2026-05-23) confirmed two reinforcing failures:

1. **Location-blind pre-filter.** The top-30 inclusion query runs BEFORE V3 sees the merchants. When the top-30 is dominated by non-local merchants (current state: every redeeming merchant is in Huddersfield/Colchester/Brightlingsea/Marsden), V3 has no local supply to rank for users outside those markets. London has 6 fully-rankable seed merchants — none surface on Popular because they have zero redemptions to make the cut.

2. **QA noise IS the entire dataset.** Of 17 current-month redemptions across the platform, 16 (94.1%) are from `customer@redeemo.com`. Without filtering QA accounts, *any* ranking strategy degenerates to "which merchants did the QA tester redeem most".

Both failures must be fixed together. Cleaning QA noise without changing the location-blind pre-filter still leaves Popular surfacing nothing for most users (no real volume). Changing the pre-filter without cleaning QA noise leaves the popularity tiebreaker dominated by QA volume.

---

## 2. Goal

Popular should:

- **Surface location-relevant merchants first.** A London user should see London-area merchants before merchants in other regions, ranked by genuine popularity within reach (with distance as the tiebreaker until real popularity volume materialises).
- **Honestly represent the platform supply.** Far-away merchants may appear on Popular when local cohort is sparse, with proximity chips signalling distance (mirrors v1.8 honesty contract).
- **Filter out QA / test redemptions** so the popularity signal reflects real customers.
- **Degrade gracefully** when real redemption volume is essentially zero (current state). The rail should still surface useful tiles — closest active merchants — even with no popularity gradient available.

Popular sits alongside Trending in the same vertical slot (`<TrendingSection>` if Trending has supply, `<PopularSection>` otherwise — spec §6.2 mutual exclusion preserved).

---

## 3. Locked design principles

| ID | Principle | Where it shows up |
|---|---|---|
| **P1** | **V3-first, popularity-as-tiebreaker.** Popular reuses `rankBranchesV3` over UK-wide active merchants; popularity is the intra-rung sort key, not the inclusion filter. | §5 ranking contract |
| **P2** | **No magic distance constants.** Distance ceilings come from V3's `maxRung` gate (LadderProfile / density-aware). No new thresholds introduced for §DG. | §5 ranking contract |
| **P3** | **Honesty over fill.** Tile distance chip + proximity band carry the per-tile honesty signal (same as v1.8 contract for filler tiles). | §5 ranking contract |
| **P4** | **QA noise is filtered at query time, not via post-fact cleanup.** `isTestData` flag + `QA_ACCOUNT_EMAILS` belt-and-braces filter run inside the popularity query. | §6 cleanup contract |
| **P5** | **Honesty caveat — dormant popularity is acceptable.** Until real customer redemption volume exists, Popular will behave as "closest active merchants" because the popularity tiebreaker has no signal to act on. This is the correct degenerate behaviour, not a bug. | §7 honesty caveat |
| **P6** | **Trending logic untouched.** Cleanup applies to Trending's inclusion query (same redemption-count pre-filter); ranking refactor applies only to Popular. | §5 + §6 |

---

## 4. Locked decisions

### 4.1 Ranking — Option D (V3-based with popularity as intra-rung tiebreaker)

- Drop the global top-30 redemption-count pre-filter from `buildPopularRail`.
- Rank UK-wide active merchant branches via `rankBranchesV3` with a new `categoryIntent` mode (or equivalent sort-key parameter — implementation choice for the plan).
- Within each rung: sort tiles by `merchant.popularityScore` descending, then by `distance` ascending as tiebreaker, then by existing tiebreaks (`businessName.localeCompare`, `id.localeCompare`).
- `popularityScore = COUNT(VoucherRedemption WHERE merchantId = m.id AND redeemedAt >= windowStart AND NOT isTestData AND user.email NOT IN QA_ACCOUNT_EMAILS)` where `windowStart = startOfRollingPopularityWindow(new Date())` per v1.1 (rolling 30 days; see v1.1 changelog).
- `resolveScopeForHomeRail('popular', ...)` retains every rung (unchanged from current behaviour).
- Cap at `POPULAR_TAKE = 10` (unchanged).
- Non-rankable tail (`POSTCODE_CENTROID` / `NEEDS_REVIEW`): append via `appendPermissiveTail` (unchanged).

### 4.2 Cleanup — Option 4-light (schema flag + QA account filter; no upfront seed reset)

- Add `VoucherRedemption.isTestData` (Boolean, default false, indexed).
- Set `isTestData = true` in:
  - All `prisma/qa-*.ts` scripts.
  - `prisma/seed.ts` (any seeded redemptions).
  - Integration test fixtures that create redemptions in `tests/api/**`.
- Maintain `QA_ACCOUNT_EMAILS` constant: `['customer@redeemo.com']` + any email ending in `@redeemo.dev` (compile-time regex check).
- Apply BOTH filters to:
  - Popular ranking query (per §5).
  - Trending inclusion query (`buildTrendingRail` top-30 by redemption count).
- **No upfront seed reset.** The 16 existing `customer@redeemo.com` redemptions are excluded via the email filter from day 1; no row-level cleanup needed.

### 4.3 Honesty caveat — dormant popularity

Spec explicitly notes Popular's degenerate state when no real volume exists. No special "no popularity signal" copy or visual treatment is added — the rail just renders V3-ranked closest active merchants. This is acceptable and more honest than ranking by QA noise.

---

## 5. Ranking contract

### 5.1 New `buildPopularRail` flow

```
INPUT:
  effLoc:        EffectiveLocation | null
  ladderProfile: LadderProfile
  locationCtx:   { locality: LocalityRef | null }

STEP 1 — Fetch UK-wide active merchant branches.
  SELECT branches WHERE:
    isActive = true
    AND merchant.status = 'ACTIVE'
  → allBranches: RankBranchRow[]
  No redemption-count pre-filter.  No cap (V3's hardCap=500 enforces).

STEP 2 — Compute per-merchant popularityScore (filtered).
  windowStart = startOfRollingPopularityWindow(now)   // v1.1 — rolling 30 days
  popularityScore(merchantId) = COUNT(VoucherRedemption WHERE
    redeemedAt >= windowStart
    AND NOT isTestData
    AND user.email NOT IN QA_ACCOUNT_EMAILS
    AND branch.merchantId = merchantId
  )
  Returns Map<merchantId, number>.  Merchants with no real redemptions
  get score = 0 (NOT excluded — they still appear in the ranking, just
  with no popularity signal).

STEP 3a — effLoc null path (unchanged from current).
  V3 NOT invoked.  Emit one branch per merchant in popularityScore desc
  order (with the new filter applied), cap POPULAR_TAKE=10, supplyRung/
  proximityBand/distance = null.  This path is the GPS-denied state until
  §DF postcode fallback lands.

STEP 3b — effLoc present path (new).
  Partition allBranches into rankable / nonRankable by locationConfidence
  (mirrors v1.5/v1.7 pattern).

  Rank rankable via rankBranchesV3 with NEW sort mode:
    intra-rung sort: popularityScore desc, then distance asc,
                     then businessName.localeCompare, then id.localeCompare.

  V3's existing maxRung gate handles cross-region cutoff naturally (no new
  distance thresholds introduced).

STEP 4 — Scope resolution.
  resolveScopeForHomeRail('popular', rungCounts) — retains every rung
  (unchanged from current behaviour).

STEP 5 — Tail.
  appendPermissiveTail(headInputs, tailCandidates) — non-rankable branches
  appended at end (unchanged).
  v1.8 deriveFillerProximityBand applied to NON-rankable tail if they have
  any usable distance — currently they don't (POSTCODE_CENTROID redaction),
  so chip stays null on tail tiles.  No change from v1.8.

STEP 6 — Cap + enrich.
  tailed.slice(0, POPULAR_TAKE=10) → enrichBranchTiles.

OUTPUT:
  HomeRail with meta = {
    locality:      null,           // Popular never claims a locality
    scope:         'platform',
    scopeExpanded: false,          // unchanged
    rungCounts:    v3.rungCounts,
  }
```

### 5.2 V3 sort mode — implementation hint (NOT locked)

Two viable approaches; pick during plan-writing:

- **(a) New `categoryIntent: 'POPULAR'` mode.** Add to `LOCAL | DESTINATION | MIXED | POPULAR`. `sortWithinRung` switches on `'POPULAR'` to use the popularityScore-first comparator. Cleanest API, but requires plumbing the popularity map into V3.
- **(b) Optional `sortBy` override.** Leave `categoryIntent` alone; add `sortBy?: 'distance' | 'quality' | 'popularity'` to `RankInputV3`. Popular passes `sortBy: 'popularity'` + the popularity map; other rails ignore it. Less coupling.

The plan picks one. Both honour the spec contract identically.

### 5.3 Popularity score is per-MERCHANT, applied to all branches

A multi-branch merchant (Covelum: Brightlingsea + Colchester) has ONE popularityScore = sum of redemptions across all branches. Both Covelum branches get the same score in the intra-rung sort. Distance tiebreaks them so the closest Covelum branch surfaces first.

This matches the v1.5/v1.6 "one tile per branch / popularity at merchant level" semantics already locked across Home.

---

## 6. Cleanup contract

### 6.1 Schema migration

```prisma
model VoucherRedemption {
  // ... existing fields ...

  /// True for redemptions created by QA / test paths (seed data, qa-*.ts
  /// scripts, integration test fixtures, dev/QA accounts). Filtered out
  /// of popularity ranking + trending inclusion queries so real customer
  /// signal isn't polluted by automation.  Default false (real customer).
  isTestData Boolean @default(false)

  @@index([isTestData])
  // ... existing indexes ...
}
```

Migration name: `add_voucher_redemption_is_test_data`. Idempotent on existing rows (default false). Index supports the `WHERE NOT isTestData` filter efficiently.

### 6.2 QA-account email filter

```ts
// src/api/customer/discovery/qaAccountFilter.ts (new)
export const QA_ACCOUNT_EMAILS: readonly string[] = [
  'customer@redeemo.com',
  // Future: any additional explicit QA accounts.
] as const

export const QA_ACCOUNT_EMAIL_DOMAINS: readonly string[] = [
  'redeemo.dev',
  // Future: any additional QA email domains.
] as const

export function isQaAccountEmail(email: string | null): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  if (QA_ACCOUNT_EMAILS.includes(lower)) return true
  return QA_ACCOUNT_EMAIL_DOMAINS.some(d => lower.endsWith(`@${d}`))
}
```

Compile-time constants — no DB lookup needed. Belt-and-braces against scripts that forget to set `isTestData`.

### 6.3 Combined Prisma filter shape

```ts
// Used in both buildPopularRail (popularity score) and buildTrendingRail
// (top-30 by redemption count) inclusion queries.
const realCustomerRedemptionFilter = {
  isTestData: false,
  user: {
    email: {
      notIn:  [...QA_ACCOUNT_EMAILS],
      // and a regex check for domains — Prisma supports `endsWith` per-domain
      // via OR / NOT OR; the plan can implement either via SQL raw OR via
      // multiple AND NOT endsWith checks.
    },
  },
}
```

Implementation detail (raw vs Prisma DSL) for the plan; spec just locks the semantic.

### 6.4 QA script + seed updates

Every redemption creation must set `isTestData: true` in:

- `prisma/seed.ts` (any seed redemptions).
- `prisma/qa-m4c-mixed-states.ts`.
- `prisma/qa-set-redeemed-at.ts`.
- `prisma/reset-qa-redemption-cycle.ts` (re-creates redemptions after reset).
- Integration test fixtures: `tests/api/_shared/fixtureSweep.ts` callers that create redemptions; per-test `prisma.voucherRedemption.create` calls in:
  - `tests/api/customer/savings.service.test.ts`
  - `tests/api/customer/discovery/home-feed-rail-states.test.ts` (where it creates redemptions for Trending/Popular scenarios)
  - Any other integration test that creates redemptions (audit during plan).

Each touched file gets a one-line `isTestData: true` addition.

### 6.5 No upfront seed reset

The 16 existing `customer@redeemo.com` redemptions are excluded via the email filter (QA_ACCOUNT_EMAILS) from the moment §DG ships. The `isTestData` flag will only mark NEW redemptions going forward. This is deliberate — the email filter is the immediate fix; the flag is the durable fix; together they cover the spectrum.

If a future audit shows the email filter is over- or under-filtering, a one-off backfill script can set `isTestData = true` on existing rows where `user.email` matches the QA list. That's a §DG follow-up if needed, NOT in scope.

---

## 7. Honesty caveat — dormant popularity (locked)

**Until real customer redemption volume accumulates across the rolling 30-day window in multiple markets, Popular will behave as "closest active merchants" because the popularity tiebreaker has no signal to act on.**

This is acceptable, intentional, and more honest than the alternative (ranking by QA noise). Specifically:

- For ALL users today (post-cleanup), every merchant's `popularityScore` will be ≤ 1 (essentially zero — only `sarah.k@redeemo.dev` contributed a real-shape redemption, and that's filtered out by the domain check).
- The intra-rung sort tiebreaker (distance ASC) takes over entirely. Popular for a London user = closest London-area merchants. Popular for a Manchester user = closest Manchester-area merchants. Popular for Bristol = closest UK-wide via cascade-equivalent rung walk.
- As real customer redemptions accumulate (post-launch), popularity activates organically — no code change required. A Westminster merchant with 50 real redemptions over the last 30 days will start ranking ahead of an Aldgate merchant with 5.
- The rolling 30-day window (v1.1) means popularity signal slides forward continuously — there is no "start-of-period" cliff that would re-trigger this dormant state across the entire platform.
- **Trending fallback when sparse:** if no recent local trending supply exists, Trending hides (existing behaviour, `meta = null`) and Popular / other Home rails carry the page. v1.1 does NOT introduce a lifetime-data fallback for Trending — Trending stays strictly within the rolling 30-day window.
- No customer-app UX treatment is added for the "dormant" state. The rail header stays "Popular on Redeemo"; tiles render with proximity chips per v1.8 contract.

Spec deliberately does NOT introduce a "trending soon" or "new on Redeemo" copy variant — that's polish (§DI / §DE territory) and risks coupling the rail to the absence of data.

---

## 8. Backend test strategy

Backend test coverage lives in `tests/api/customer/discovery/home-feed-rail-states.test.ts` (existing 16 pins) — extend with §DG-specific scenarios:

### 8.1 Required new pins

| Pin | Assertion |
|---|---|
| **§DG-1 — London Popular surfaces London merchants first** | Seed scenario with 1 London merchant having a real redemption + 1 non-London merchant having heavier QA-flagged redemptions. London Popular rail's first tile is the London merchant. |
| **§DG-2 — Popularity tiebreaker activates within rung** | Two merchants in the same rung (both London); one has 5 real redemptions, one has 1. The 5-redemption merchant comes first. |
| **§DG-3 — QA account filter excludes `customer@redeemo.com`** | Create a redemption for `customer@redeemo.com` against MerchantA; create one for `real@example.com` against MerchantB. MerchantB's popularityScore = 1; MerchantA's = 0. |
| **§DG-4 — `isTestData` flag excludes flagged redemptions** | Two redemptions on MerchantA, one with `isTestData=true`, one with `isTestData=false`. Popular ranks MerchantA's popularityScore = 1, not 2. |
| **§DG-5 — Dormant popularity falls through to distance** | All merchants have popularityScore = 0. London Popular rail returns closest-rung London merchants in distance-ASC order (verified by tile order). |
| **§DG-6 — Trending inclusion query also filters QA** | Trending's top-30 redemption-count query excludes QA-flagged + QA-email redemptions. With only QA redemptions present, Trending rail = empty (meta=null). |
| **§DG-7 — `effLoc null` path uses filtered popularity** | GPS denied + only QA redemptions → Popular returns empty (or zero tiles) instead of QA-noise tiles. |
| **§DG-8 — Rolling 30-day window boundary (v1.1)** | Two real-customer redemptions on MerchantA: one with `redeemedAt = now - 35 days` (OUTSIDE window) + one on MerchantB with `redeemedAt = now - 5 days` (INSIDE window). MerchantA's `popularityScore = 0`; MerchantB's = 1. Verified indirectly via tile ordering (MerchantB outranks MerchantA when distance is tied). The pin also pings the unit test for `startOfRollingPopularityWindow(now)` returning exactly 30 days × 24h × 60min × 60sec × 1000ms before `now` (deterministic input/output). |

### 8.2 Existing pin updates

- The 16 pins in `home-feed-rail-states.test.ts` use `prisma.voucherRedemption.create` to set up scenarios. Each call needs `isTestData: true` added — these tests are explicitly setting up scenarios, not testing real customer behaviour, so they should be flagged.
- Verify NO existing pin asserts on the global top-30 redemption ordering (which would break under Option D). Spec pre-walk: none of the current pins assert that specific ordering — Popular is currently tested via "meta scope state" assertions, not "first tile is MerchantX".

### 8.3 Audit-tool sanity check

After §DG ships, running `npx tsx prisma/audit-popular-ranking.ts` on a clean post-cleanup DB should report:
- Section 3: zero or near-zero current-month redemptions from QA accounts (after the email filter takes effect).
- Section 4: dominant root cause auto-detection should switch from "(A) top-30 dominated by non-London" to a healthier shape.

---

## 9. Customer-app impact

**Zero customer-app changes.** The Popular wire shape (`HomeRail` with `branches: BranchTile[]` + `meta: HomeRailMeta`) is unchanged. `<PopularSection>` continues to render exactly as today. v1.8 chip variants on filler tiles work without modification — tiles in mixed/cascade scenarios already carry the right `proximityBand` via the v1.8 `deriveFillerProximityBand` derivation if they're permissive-tail merchants.

This is one of the cleanest aspects of Option D: the architectural change is contained in `buildPopularRail`'s inclusion + intra-rung sort logic. The wire envelope, customer-app rendering, and all downstream contracts stay intact.

---

## 10. Out of scope

- §DF postcode/profile-location fallback — separate Plan 4 workstream. §DG's `effLoc null` path stays as-is until §DF activates; once §DF lands, GPS-denied users get a real `effLoc` and §DG's V3 path naturally activates for them too.
- §CU.1 customer-web migration.
- §CZ Map correctness.
- §DH branch locality on cards / §DI chip layout polish / §DD rail copy variation / §DE banner polish.
- Trending ranking refactor — Trending keeps its existing V3 + strict-scope logic. Only its INCLUSION query inherits the QA-filter improvement.
- Featured / NearbyByCategory ranking refactor — both already use V3 with appropriate sort modes (Featured: DESTINATION/quality; NBC: MIXED). Not touched.
- New customer-app copy / visual treatment for the dormant-popularity state.
- One-off backfill of `isTestData = true` on existing rows. Email filter covers today's noise; backfill is a follow-up if telemetry shows it's needed.
- Per-user personalisation (interest-weighted popularity) — §DB / §DD territory.
- Shorter window for Trending (e.g. rolling 7 days for "what's hot now" semantics). v1.1 ships both Popular AND Trending on the same rolling 30-day window — owner-locked simpler mental model. Splitting Trending to 7 days is a future refinement once real customer volume materialises.
- Real-time popularity decay (e.g. exponential decay over days vs the flat 30-day cutoff). v1.1 uses a flat rolling window; weighted decay is a future refinement.

---

## 11. Risks + open issues

### 11.1 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Schema migration on high-write `VoucherRedemption` table | Low | Nullable Boolean default false. No backfill. Standard Prisma migration. |
| Larger inclusion query (no top-30 pre-filter, fetches all active merchant branches) | Medium | V3's hardCap=500 limits ranked output. Add Prisma index on `Branch.merchantId` (likely already present). Benchmark during plan. |
| Popularity score subquery cost — one query per merchant OR one grouped query | Medium | Plan picks: single `GROUP BY merchantId` aggregate query returning Map<merchantId, count>; sourced ONCE per Popular call, not N+1. |
| `endsWith` check on `user.email` in Prisma — not natively supported with `in` | Low | Use raw SQL fragment OR multiple OR'd `endsWith` checks; both are ~5 LOC; pick during plan. |
| Existing tests creating redemptions might fail after `isTestData` defaults | Low | Audit existing tests during plan; tests that create redemptions for "real customer" scenarios keep `isTestData=false`; tests setting up Trending/Popular state add `isTestData=true` only where they explicitly want to verify the filter. |
| Trending breaks because top-30 inclusion now filters QA | Low — INTENDED behaviour | Trending pin #2 should verify that QA-only seed produces empty Trending. Anything else is a real bug. |
| Owner's device-QA on `customer@redeemo.com` continues to create redemptions that never count toward popularity → owner can't easily QA real popularity behaviour | Medium | Document the workaround in the plan: device-QA can create a temporary non-QA account to test popularity build-up. Long-term, dev-only override mechanism is a §DG follow-up if needed. |
| v1.1 rolling-30-day window — query planner cost vs anchored calendar-month | Low | Identical query shape (`redeemedAt >= <date>`). Existing index on `VoucherRedemption.redeemedAt` (verify during T1) handles both equally. Benchmark during T8 if any regression suspected. |
| v1.1 window helper called per-request — clock skew between requests | Negligible | `new Date()` is monotonic enough for a 30-day window; sub-second drift across requests doesn't shift the boundary meaningfully. |

### 11.2 Open issues (resolved during plan, not blocking spec)

- **Implementation: `categoryIntent: 'POPULAR'` vs `sortBy` override.** §5.2 — pick the cleaner option during plan.
- **Popularity calculation: aggregate query OR per-merchant subquery.** §11.1 — `GROUP BY` is preferred.
- **Audit tool runtime placement.** Currently lives at `prisma/audit-popular-ranking.ts` (committed as a reusable tool per owner direction). No further decision needed.

---

## 12. Deliverables (for plan-writing reference)

1. **Schema:** Prisma migration adding `VoucherRedemption.isTestData` Boolean + index.
2. **Backend code:**
   - `src/api/customer/discovery/qaAccountFilter.ts` (NEW) — `QA_ACCOUNT_EMAILS` + `QA_ACCOUNT_EMAIL_DOMAINS` + `isQaAccountEmail` helper.
   - `src/api/customer/discovery/popularityWindow.ts` (NEW, v1.1) — `ROLLING_POPULARITY_WINDOW_DAYS = 30` constant + `startOfRollingPopularityWindow(now: Date): Date` helper. Consumed by both `buildPopularRail` (`computePopularityScores`) and `buildTrendingRail` (inclusion query).
   - `src/api/customer/discovery/homeRailBuilders.ts` — `buildPopularRail` refactor per §5; `buildTrendingRail` inclusion query gets QA filter.
   - `src/api/lib/ranking.ts` — either new `categoryIntent: 'POPULAR'` mode OR new `sortBy` parameter (decided in plan).
3. **QA scripts + seed:** all redemption-creation paths add `isTestData: true`.
4. **Tests:** 7 new §DG pins per §8.1; audit/update of existing pins per §8.2.
5. **Spec doc:** this file at v1.0.
6. **Memory + deferred index:** §DG entry promoted from deferred → SHIPPED on merge; cross-refs to §DF, §DD, §DH/§DI/§DE preserved.
7. **Audit tool:** `prisma/audit-popular-ranking.ts` committed as a permanent reusable tool.

---

## 13. Deferred follow-ups (NOT in §DG)

- **Real-time popularity decay** (last-7-days weight × N vs last-30-days). Refinement once real volume exists. Tier 2 brainstorm-first.
- **Interest-weighted popularity** — user's onboarding interests weight category popularity. Already tracked under §DB / §DD.
- **One-off backfill of `isTestData = true`** on existing rows — only if email filter proves insufficient post-launch.
- **Trending ranking refactor** — Trending's V3 + strict-scope logic stays. If owner direction later wants Trending to use the same popularity tiebreaker within local rung, that's a separate brainstorm.
- **Device-QA override mechanism** for popularity testing without a real account — only if device-QA cycles regularly need to test popularity gradient and the QA-account workaround is too cumbersome.

---

## Spec self-review (2026-05-23)

- **Placeholder scan:** none. Every step has concrete contract + filter shape.
- **Internal consistency:** §5.3 (per-merchant popularity, multi-branch share score) aligns with §6.3 (combined filter applied at merchant-id level). §7 (dormant popularity) consistent with §5 (distance ASC tiebreaker activates when score=0).
- **Scope check:** single backend workstream, single migration, single new file, two modified files. Well-bounded for a Tier 2 plan-first PR.
- **Ambiguity:** §5.2 leaves implementation choice between (a) and (b) — DELIBERATE per plan-first discipline. Both honour the contract.

Ready for plan writing.
