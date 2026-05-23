// §DG v1.1 spec 2026-05-23-popular-ranking-design.md — rolling popularity
// window for Popular + Trending rail inclusion queries.
//
// Owner-locked at 30 days (Option B from the pre-T1 audit).  Eliminates
// the start-of-month cliff the previous calendar-month window had —
// popularityScore now slides forward continuously rather than resetting
// at 00:00 UTC on the 1st of each month.
//
// Both rails use the same window.  Trending may switch to a shorter
// 7-day rolling window in a follow-up brainstorm once real customer
// volume materialises (spec §13 deferred).
//
// `now` is parameterised for deterministic testing; production callers
// pass `new Date()`.

export const ROLLING_POPULARITY_WINDOW_DAYS = 30

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

export function startOfRollingPopularityWindow(now: Date): Date {
  return new Date(now.getTime() - ROLLING_POPULARITY_WINDOW_DAYS * MILLIS_PER_DAY)
}
