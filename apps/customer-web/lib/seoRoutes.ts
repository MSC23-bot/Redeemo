// SEO route config — single source of truth for robots.ts, sitemap.ts, and the
// SEO guard test. Pure (no Next/React imports) so the backend vitest guard can
// import it directly. Marketplace routes stay OUT of the sitemap and are
// Disallowed in robots while NEXT_PUBLIC_MARKETPLACE_LIVE is not 'true' — this
// mirrors the middleware.ts gate so gated routes are never advertised to crawlers.

export const CANONICAL_ORIGIN = 'https://redeemo.co.uk'

// Public marketing + legal pages — indexable + in the sitemap pre-launch.
export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/faq',
  '/how-it-works',
  '/pricing',
  '/for-businesses',
  '/insider',
  '/terms',
  '/privacy',
  '/cookies',
] as const

// Marketplace surfaces — gated by NEXT_PUBLIC_MARKETPLACE_LIVE (middleware
// redirects them to '/' pre-launch). Indexed + sitemapped only once live.
export const MARKETPLACE_ROUTES = [
  '/discover',
  '/map',
  '/merchants',
  '/search',
  '/categories',
] as const

// Private + auth + utility routes — never indexed, never in the sitemap.
export const PRIVATE_ROUTES = [
  '/account',
  '/login',
  '/register',
  '/verify',
  '/reset-password',
  '/forgot-password',
  '/subscribe',
] as const

export function isMarketplaceLive(
  flag: string | undefined = process.env.NEXT_PUBLIC_MARKETPLACE_LIVE,
): boolean {
  return flag === 'true'
}

/** Paths to include in the sitemap. Marketplace paths only once the marketplace is live. */
export function sitemapPaths(marketplaceLive: boolean): string[] {
  return marketplaceLive
    ? [...PUBLIC_ROUTES, ...MARKETPLACE_ROUTES]
    : [...PUBLIC_ROUTES]
}

/** Paths to Disallow in robots. Private/auth always; marketplace until live; plus /api. */
export function robotsDisallow(marketplaceLive: boolean): string[] {
  const base = [...PRIVATE_ROUTES, '/api/']
  return marketplaceLive ? base : [...base, ...MARKETPLACE_ROUTES]
}
