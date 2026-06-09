import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN, isMarketplaceLive, sitemapPaths } from '@/lib/seoRoutes'

// Flag-aware sitemap: only the public marketing/legal pages pre-launch; the
// marketplace routes are added once NEXT_PUBLIC_MARKETPLACE_LIVE === 'true'
// (so we never advertise routes the middleware redirects away). Apex URLs (D-E).
export default function sitemap(): MetadataRoute.Sitemap {
  // One build-time stamp shared across entries — a freshness signal for crawlers
  // (these are static marketing/legal pages; the stamp updates on each deploy).
  const lastModified = new Date()
  return sitemapPaths(isMarketplaceLive()).map((path) => ({
    url: `${CANONICAL_ORIGIN}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
