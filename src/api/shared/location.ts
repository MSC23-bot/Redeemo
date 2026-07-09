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
// Branch Location Trust Slice 1 (spec 2026-07-09 §2.3) — customer exposure
// widens by exactly one tier: `exposeBranchPosition` / `hasExactPosition` and
// the Map in-area queries now expose real coordinates for CONFIRMED_LOCATION_SET
// (MANUALLY_CONFIRMED + ADDRESS_GEOCODED). An ADDRESS_GEOCODED pin is the exact
// Google-verified coordinate the merchant picked, cross-checked server-side, so
// it is a real exact position. This SUPERSEDES (owner-approved) the earlier PR
// #81 asymmetry that kept the map MANUALLY_CONFIRMED-only. The updated contract
// (spec docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md
// §4.1.1, as amended by the 2026-07-09 trust spec §2.3):
//   - MANUALLY_CONFIRMED → list + map, real coordinates
//   - ADDRESS_GEOCODED   → list + map, real coordinates (Slice 1)
//   - POSTCODE_CENTROID  → list only, coordinates redacted from the map (L3 LOCK)
//   - NEEDS_REVIEW       → excluded from the map; redacted (L3 LOCK)
// LOCKED (spec L3): POSTCODE_CENTROID + NEEDS_REVIEW branches NEVER expose
// lat/lng to customers — never present a fake-exact pin.

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
