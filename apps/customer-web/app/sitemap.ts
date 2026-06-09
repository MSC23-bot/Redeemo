import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN, isMarketplaceLive, sitemapPaths } from '@/lib/seoRoutes'

// Flag-aware sitemap: only the public marketing/legal pages pre-launch; the
// marketplace routes are added once NEXT_PUBLIC_MARKETPLACE_LIVE === 'true'
// (so we never advertise routes the middleware redirects away). Apex URLs (D-E).
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths(isMarketplaceLive()).map((path) => ({
    url: `${CANONICAL_ORIGIN}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
