/**
 * Canonical slug for a top-level category, derived from its display name.
 *
 * Shared by the curated Home category cards (which carry canonical slugs) and
 * the All-Categories surface, so Home routing maps a card to a backend
 * `Category` by slug rather than by exact display-name string match — which
 * broke silently on any backend rename / casing / localization drift.
 *
 *   categorySlug('Food & Drink')          → 'food-drink'
 *   categorySlug('Home & Local Services') → 'home-local-services'
 *   categorySlug('Beauty & Wellness')     → 'beauty-wellness'
 *   categorySlug('Out & About')           → 'out-about'
 *   categorySlug('Shopping')              → 'shopping'
 */
export function categorySlug(name: string): string {
  return name.toLowerCase().replace(/ & /g, ' ').trim().replace(/\s+/g, '-')
}

/**
 * Sentinel passed by the "Explore all categories" capsule (it has no backend
 * category — it routes to the full /categories list).
 */
export const EXPLORE_ALL_SLUG = 'explore-all'

export type CategoryRouteTarget =
  | { kind: 'category'; id: string }
  | { kind: 'all'; reason: 'explore' | 'unresolved'; slug?: string }

/**
 * Resolve a curated Home category slug to its navigation target.
 *
 *  - the Explore sentinel → the all-categories list (`reason: 'explore'`)
 *  - a slug matching a loaded backend category → that category by id
 *  - anything else (categories not loaded yet, or no backend slug match) →
 *    the all-categories list flagged `reason: 'unresolved'`, so the caller can
 *    surface it in dev instead of silently pretending the specific category
 *    opened. This is the least-janky fallback: the user always lands on a
 *    useful surface (the full list) rather than a dead/disabled card.
 */
export function resolveCategoryRoute(
  slug: string,
  categories: ReadonlyArray<{ id: string; name: string }> | undefined,
): CategoryRouteTarget {
  if (slug === EXPLORE_ALL_SLUG) return { kind: 'all', reason: 'explore' }
  const match = categories?.find((c) => categorySlug(c.name) === slug)
  if (match) return { kind: 'category', id: match.id }
  return { kind: 'all', reason: 'unresolved', slug }
}
