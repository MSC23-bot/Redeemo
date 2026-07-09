# Map in-area reliability slice (Tier 2)

**Status: IMPLEMENTED (this PR).** Bounded backend + customer-app fix for three owner-reported
Map symptoms; no schema change, no new UI surface.

## 1. Problem statement

Owner-reported symptoms on the Map tab (`/api/v1/customer/discovery/in-area`):

1. **Pins flicker in/out on identical viewports.** `getInAreaBranches`
   (`src/api/customer/discovery/service.ts`) fetched candidate branches with `take: limit`
   and no `orderBy` BEFORE `rankBranchesV3` ran. In a dense viewport, Postgres returns an
   arbitrary slice for an unordered `take`, so ranking never saw the full in-viewport set —
   two otherwise-identical requests for the same bbox could rank a different subset in.
2. **Every pan/zoom pays the full request cost.** The route always ran `getInAreaMerchants`
   (UK-wide merchant `findMany` + rank + enrich) in parallel with `getInAreaBranches`, even
   though Map only ever renders `branches` + `meta` (never the legacy `merchants` field).
3. **Panning back to a seen area always refetches.** `useInAreaBranches` keyed its React
   Query cache on the raw, continuously-varying camera bbox, so returning to an area the user
   already viewed a moment ago never hit the cache.

## 2. Changes

**Backend — deterministic candidate pool (service.ts, `getInAreaBranches`).** Candidates are
now fetched with `orderBy: { id: 'asc' }` (deterministic tiebreak) and
`take: Math.max(limit * 4, 200)` instead of `take: limit`. `rankBranchesV3` already applies
the caller's `limit` AFTER ranking via `targetCount`/`hardCap` — that step was already correct
and is unchanged; only the pre-rank candidate fetch was truncating too early.

**Backend — opt-in `branchesOnly` (routes.ts).** New optional query param
`branchesOnly: z.coerce.boolean().optional()`. When true, the route skips `getInAreaMerchants`
entirely and responds `{ branches, meta, locationContext }` where `meta` comes from the branch
arm. `getInAreaBranches` gained an `includeEmptyStateReason` param (only computed in this mode:
one extra indexed `count()` with no bbox constraint, mirroring `getInAreaMerchants`'s
UK-wide-supply check but branch-first) so `meta.emptyStateReason` and `meta.effectiveLocality`
— the only two `meta` fields Map actually reads (`mapDataView.ts` + `MapScreen.tsx`) — are
present and correct without the merchant arm. Absent/false is byte-for-byte identical to
today; regression-pinned by the existing route + service test suites.

**Customer-app — use it + stable cache keys.** `useInAreaBranches` now sends
`branchesOnly: 1` and quantizes the bbox (floor mins / ceil maxs to 3dp, ~110m grid — see
`features/map/utils/bboxQuantize.ts`) BEFORE both the query key and the request, so returning
to a previously-seen grid cell is a cache hit. `staleTime` raised 30s → 120s: viewport pin
supply does not change minute-to-minute; pull-to-refresh and a pan-away-then-back after the
window still refetch as before. The `useSearch`-with-bbox arm (filtered Map mode) is untouched.

## 3. Explicitly deferred

- **Clustering** — dense-viewport pin clustering/declumping. Out of scope; this slice only
  fixes which pins are candidates for ranking, not how they render once ranked.
- **Category-differentiated pins** — visually distinguishing pin colour/icon by category on
  the Map. Separate design-owned surface change.
- **Region accumulation cache** — a server- or client-side cache that accumulates/merges
  results across overlapping viewports (beyond the flat per-cell React Query cache added
  here). Needs its own invalidation design.
- **ADDRESS_GEOCODED pin policy** — Map currently pins MANUALLY_CONFIRMED branches only
  (locked contract, untouched by this slice). Whether/how ADDRESS_GEOCODED branches should
  ever surface on Map is an owner decision pending; not addressed here.
- **Request cancellation / `AbortSignal`** — in-flight requests for an abandoned viewport are
  not proactively cancelled on pan; React Query's `keepPreviousData` already prevents a blank
  map, but a stale in-flight response can still resolve after a newer one. Left for a
  dedicated follow-up.

## 4. Verification

Backend: `npx tsc --noEmit`, `npm run test:unit` (candidate-fetch cap/orderBy pin,
`branchesOnly=true` skips the merchant service + returns branch-arm meta, `branchesOnly`
absent leaves the legacy shape untouched). Customer-app: `apps/customer-app` jest (Node
20.19.4) for the bbox quantization helper and the map/discovery test subsets.
