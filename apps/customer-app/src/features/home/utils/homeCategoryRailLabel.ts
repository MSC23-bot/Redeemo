// Home NearbyByCategory rail header label.
//
// Owner direction PR #126 device-QA-4 (2026-05-23): underlying rail grouping
// shifted to parent-category in v1.6, but the visible rail labels must not
// feel like a plain duplicate of the top category navigation grid.  The grid
// reads "Food & Drink", "Beauty & Wellness", etc.; the rail labels read
// "Food & drink picks", "Beauty & wellness picks" — sentence-cased, suffixed
// with "picks", and identical for local and cascade rails.  The cascade
// "{Category} on Redeemo" variant (v1.5) is RETIRED — the <NearbyContextBanner>
// already carries the platform-claim message.
//
// 2026-06-03 (owner direction): the category NAME is title-cased ("Food &
// Drink", not "Food & drink") so it reads as a proper category label; only the
// soft " picks" suffix stays lowercase (and is rendered muted by RailHeader).
//
// Examples:
//   "Food & Drink"      → "Food & Drink picks"
//   "Beauty & Wellness" → "Beauty & Wellness picks"
//   "Health & Fitness"  → "Health & Fitness picks"
//   "Out & About"       → "Out & About picks"
//   "Shopping"          → "Shopping picks"

export function homeCategoryRailLabel(parentName: string): string {
  const trimmed = parentName.trim()
  if (trimmed.length === 0) return 'picks'
  // Lowercase then capitalise the first letter of each word → robust title case
  // for clean / lowercase / uppercase inputs alike.
  const titleCased = trimmed.toLowerCase().replace(/(^|\s)([a-z])/g, (_m, sp, c) => sp + c.toUpperCase())
  return `${titleCased} picks`
}
