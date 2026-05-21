// prisma/seed-data/homeFeedFixtures.ts
//
// QA-only seed data for the Home tab rails that `getHomeFeed()` reads but
// the prior seed enrichment stages (Stage 1 audit / Stage 2 enrichment /
// Stage 4 leaked-fixture cleanup) did not populate.
//
// Stage 2's locked scope (D1-D7 in plan §0) covered media + 3 vouchers +
// 7-day opening hours + PIN on the 9 fake/demo merchants. It did NOT
// touch the `FeaturedMerchant` or `Campaign` tables, which are the
// inputs for `<FeaturedCarousel>` and `<CampaignCarousel>` on Home.
// Pre-PR-#117 audit on 2026-05-21 confirmed both tables were empty on
// dev DB, leaving Home Featured + Campaign rails visibly empty even
// after the Phase 2.3 branch-first migration code change.
//
// This module is the minimum-viable seed for those rails, owner-approved
// 2026-05-21. Tier 1 / seed-only. NOT a Phase 2.3 migration concern —
// Phase 2.3 ships against this data, but the data itself is independent.
//
// Plan-ref: pre-fix audit posted in the Phase 2.3 device-QA pause
// (no separate plan doc; this is a Tier 1 seed-only follow-up).

/**
 * Active FeaturedMerchant rows for the Home `<FeaturedCarousel>` rail.
 *
 * All 5 reference fully-enriched ACTIVE merchants (verified live
 * 2026-05-21). Includes Covelum Restaurant as the multi-branch fan-out
 * demonstration — Phase 2.3's `featuredBranches` arm will emit 2 tiles
 * for the single Featured row (Brightlingsea + Colchester) per the
 * locked spec §5.2 interim fan-out rule.
 *
 * Fields:
 * - `costGbp = 100.00` — round dev-fixture value, not visible to customers.
 * - `radiusMiles = 50` — locked at owner approval; no per-merchant variation.
 * - `paymentStatus = 'PAID'` — realism marker (admin-curated Featured is paid).
 * - `targetLocations = []` — locked at default.
 * - `sortByDistance = true` — schema default.
 * - `startDate` / `endDate` — set by the seed function (`now - 1d` / `now + 365d`).
 * - `isActive = true` — required for the home-feed query at
 *   `src/api/customer/discovery/service.ts:1221`.
 */
export type FeaturedMerchantFixture = {
  /** Stable ID per the `tax-…` taxonomy seed prefix convention. */
  id: string
  /** FK to an existing ACTIVE merchant. Verified 2026-05-21. */
  merchantId: string
  /** Human-readable label for logging/comments only. */
  merchantLabel: string
}

export const FEATURED_MERCHANT_FIXTURES: readonly FeaturedMerchantFixture[] = [
  {
    id:            'tax-featured-cafe-001',
    merchantId:    'tax-merchant-cafe-001',
    merchantLabel: 'Bean & Brew Specialty (Shoreditch / London)',
  },
  {
    id:            'tax-featured-aesthetics-001',
    merchantId:    'tax-merchant-aesthetics-001',
    merchantLabel: 'Lumière Aesthetics (Marylebone / London)',
  },
  {
    id:            'tax-featured-pinos-pizzeria-001',
    merchantId:    'tax-merchant-pinos-pizzeria-001',
    merchantLabel: "Pinos Pizzeria (Huddersfield)",
  },
  {
    id:            'tax-featured-iron-forge-gym-001',
    merchantId:    'tax-merchant-iron-forge-gym-001',
    merchantLabel: 'Iron Forge Gym (Marsden / Huddersfield catchment)',
  },
  {
    id:            'tax-featured-covelum-001',
    merchantId:    'tax-merchant-covelum-001',
    merchantLabel: 'Covelum Restaurant (Brightlingsea + Colchester — multi-branch fan-out)',
  },
] as const

/**
 * Active Campaign rows for the Home `<CampaignCarousel>` rail.
 *
 * All 3 are platform-wide (no `targetLocations` / `targetLadDistricts` /
 * `targetCounties` / `targetRegions` / `isNational` filters set — the
 * home-feed query at `service.ts:1270-1279` filters only by
 * `status: 'ACTIVE'` + date range).
 *
 * Banner URLs match the existing seed convention (Unsplash, w=1200,
 * non-controversial generic stock imagery). `CampaignCarousel.tsx` has
 * client-side gradient fallbacks too, so if a banner URL ever 404s the
 * carousel still renders.
 *
 * Plan 4b deferred fields (`targetLocalityIds`, `branchAnchorId`,
 * `radiusMiles`, `targetLadDistricts`, `targetCounties`,
 * `targetRegions`, `targetCountries`, `isNational`, `priority`) all
 * keep their schema defaults — Plan 4b service implementation will
 * consume them later; Plan 4a (current) does not read them.
 */
export type CampaignFixture = {
  /** Stable ID per the `tax-…` taxonomy seed prefix convention. */
  id: string
  /** Customer-visible name (rendered as carousel banner title). */
  name: string
  /** One-line description; nullable on schema but populated for realism. */
  description: string
  /** Unsplash banner URL — w=1200 standard. */
  bannerImageUrl: string
}

export const CAMPAIGN_FIXTURES: readonly CampaignFixture[] = [
  {
    id:             'tax-campaign-summer-sips-001',
    name:           'Summer Sips',
    description:    '30% off summer drinks at participating cafés & bars across the UK',
    bannerImageUrl: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1200&q=80',
  },
  {
    id:             'tax-campaign-weekend-workout-001',
    name:           'Weekend Workout',
    description:    'Free PT intros + class trials at gyms & boutique studios',
    bannerImageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80',
  },
  {
    id:             'tax-campaign-date-night-deals-001',
    name:           'Date Night Deals',
    description:    'BOGO mains + free desserts at participating restaurants',
    bannerImageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80',
  },
] as const
