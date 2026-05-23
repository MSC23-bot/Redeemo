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
// Examples:
//   "Food & Drink"      → "Food & drink picks"
//   "Beauty & Wellness" → "Beauty & wellness picks"
//   "Health & Fitness"  → "Health & fitness picks"
//   "Out & About"       → "Out & about picks"
//   "Shopping"          → "Shopping picks"

export function homeCategoryRailLabel(parentName: string): string {
  const trimmed = parentName.trim()
  if (trimmed.length === 0) return 'picks'
  const lower        = trimmed.toLowerCase()
  const sentenceCase = lower.charAt(0).toUpperCase() + lower.slice(1)
  return `${sentenceCase} picks`
}
