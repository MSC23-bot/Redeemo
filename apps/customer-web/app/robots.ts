import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN, isMarketplaceLive, robotsDisallow } from '@/lib/seoRoutes'

// Allow crawling of the public marketing/legal pages; disallow private/auth and
// (while the marketplace is pre-launch) the gated marketplace routes. Host +
// sitemap point at the apex canonical (D-E). NEXT_PUBLIC_MARKETPLACE_LIVE is
// build-time inlined, so flipping it requires a rebuild (a deliberate launch action).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: robotsDisallow(isMarketplaceLive()),
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  }
}
