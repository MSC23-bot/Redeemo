// Phase 2 Slice 1 M4 — shared branch-location-confidence helper.
//
// `CONFIRMED_LOCATION_SET` is the single source of truth for "a branch's
// location is confirmed enough to (a) rank/surface it in discovery list views
// and (b) [M5] let its merchant go live". Discovery ranking (`classifyRung`)
// and the home/search rail partitions previously inlined this exact
// { MANUALLY_CONFIRMED, ADDRESS_GEOCODED } literal at every rail/search
// partition + the ranking gate; they now consume this constant/helper. The M5
// go-live gate will read the same helper so visibility-classification and
// go-live can never drift apart.
//
// IMPORTANT — this is the DISCOVERY/GO-LIVE confidence set, NOT the stricter
// "exact position" rule. Map pins + exact-distance derivations stay
// MANUALLY_CONFIRMED-only (see `exposeBranchPosition` / `hasExactPosition` in
// customer/discovery/service.ts), preserving the PR #81 list-vs-map asymmetry
// (spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md
// §4.1.1):
//   - MANUALLY_CONFIRMED → list + map, real coordinates
//   - ADDRESS_GEOCODED   → list only, coordinates redacted from the map
//   - POSTCODE_CENTROID  → list only, coordinates redacted from the map
//   - NEEDS_REVIEW       → excluded
// That PR #81 contract remains authoritative. Any future decision to tighten
// discovery visibility, hide POSTCODE_CENTROID from lists, or expose
// ADDRESS_GEOCODED on the map is a SEPARATE product/spec decision
// (Phase 2 Slice 1 M4 reconciliation, Option A — see slice spec §8).

/**
 * `LocationConfidence` enum values that mark a branch's location as confirmed
 * enough for discovery ranking + (M5) go-live. Kept as a readonly tuple so it
 * doubles as both a runtime membership source and — where needed later — a
 * Prisma `{ in: [...] }` value.
 */
export const CONFIRMED_LOCATION_SET = ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED'] as const

export type ConfirmedLocationConfidence = (typeof CONFIRMED_LOCATION_SET)[number]

/**
 * True iff the branch's `locationConfidence` is in `CONFIRMED_LOCATION_SET`.
 *
 * Accepts a loose `{ locationConfidence?: string | null }` so the discovery /
 * ranking rows (whose row types vary) can share one helper; `null` /
 * `undefined` / any out-of-set value → `false`. Derives its membership test
 * from `CONFIRMED_LOCATION_SET`, so the constant is the single point of change.
 */
export function isBranchLocationConfirmed(branch: { locationConfidence?: string | null }): boolean {
  const c = branch.locationConfidence
  return c != null && (CONFIRMED_LOCATION_SET as readonly string[]).includes(c)
}
