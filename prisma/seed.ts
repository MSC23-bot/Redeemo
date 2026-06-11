import 'dotenv/config' // F8: load .env so ENCRYPTION_KEY / DATABASE_URL are available regardless of invocation
import { requireSeedEncryptionKey } from './seed-data/requireEncryptionKey'
import { PrismaClient, VoucherType } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as crypto from 'crypto'
import { encrypt } from '../src/api/shared/encryption'
import { seedHeuristicCatchmentEdges } from './seed-data/catchment-heuristic'
import { seedCuratedCatchmentEdges } from './seed-data/catchmentOverrides'
import { seedMarkets } from './seed-data/markets'
import { recomputeCategoryCounts, recomputeTagCounts } from '../src/api/lib/merchantCount'
import type { ResolvedPostcodeSnapshot } from '../src/api/lib/postcodeResolver'
import { findOrCreateLocality } from '../src/api/lib/findOrCreateLocality'
import { DEMO_MERCHANT_ENRICHMENT, DEV_QA_PIN, REAL_MERCHANT_PIN_BRANCH_IDS } from './seed-data/demoMerchantEnrichment'
import { FEATURED_MERCHANT_FIXTURES, CAMPAIGN_FIXTURES } from './seed-data/homeFeedFixtures'
import {
  seedCategories,
  seedTags,
  seedSubcategoryTags,
  seedRedundantHighlights,
  seedAmenities,
  seedCategoryAmenities,
  seedLocalities,
  seedSubscriptionPlans,
  seedRmvTemplates,
  seedInterests,
  seedCmsContent,
  topLevelIdByName,
  subcategoryIdByNameAndParent,
  tagIdByLabelAndType,
  amenityIdByName,
} from './seed-data/referencePhases'

requireSeedEncryptionKey() // F8: require the REAL ENCRYPTION_KEY (no repo-public fallback) before encrypting branch PINs

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Simple hash for dev seed only — use bcrypt in production API code
function devHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan 4 M1.16 — owner-curated branch → Locality mapping
//
// Every seeded branch is MANUALLY_CONFIRMED against its real-world postcode.
// The map drives buildBranchLocationSnapshot() below; the helper is called at
// every branch upsert site so the snapshot fields (localityId + admin-hierarchy
// mirror columns) stay current on every seed run.
//
// To add a new seeded branch:
//   1. Add the branch.upsert call site with `...locationSnapshot` in both
//      create AND update payloads.
//   2. Add a row to BRANCH_LOCALITY_MAP below mapping branchId → locality slug.
//   3. The buildBranchLocationSnapshot() helper will throw at seed time if
//      either lookup fails, so missing entries fail fast.
// ─────────────────────────────────────────────────────────────────────────────

const BRANCH_LOCALITY_MAP: Readonly<Record<string, string>> = {
  // 8 taxonomy-test merchants:
  'tax-branch-cafe-001':       'hoxton-east-shoreditch',  // London EC2A 3BJ (Hackney ward)
  'tax-branch-pilates-001':    'clapham-town',            // London SW4 7TR (Lambeth ward)
  'tax-branch-foodhall-001':   'borough-bankside',        // London SE1 9AA (Southwark ward)
  'tax-branch-aesthetics-001': 'marylebone',              // London W1U 4PB (Westminster ward)
  'tax-branch-vet-001':        'hackney-central',         // London E8 4RP  (Hackney ward)
  'tax-branch-covelum-001':    'brightlingsea',           // Brightlingsea CO7 0AY
  'tax-branch-mykerala-001':   'ipswich',                 // Ipswich IP4 1HJ
  'tax-branch-karaara-001':    'huddersfield',            // Huddersfield HD1 2PY (Plan 4a anchor)
  // Multi-branch fixture (Covelum 2nd branch):
  'tax-branch-covelum-002':    'colchester',              // Colchester CO1 1JN
  // Dev fixture:
  'dev-branch-001':            'aldersgate',              // London EC1A 1BB (City of London ward)
  // M1.24 trending-search fixtures (Pizza / Nail salon / Barber / Gym):
  'tax-branch-pinos-pizzeria-001':  'huddersfield',       // Huddersfield HD1 2BJ
  'tax-branch-polish-nails-001':    'holmfirth',          // Holmfirth     HD9 2DN
  'tax-branch-trim-co-barbers-001': 'huddersfield',       // Huddersfield HD1 2QT
  'tax-branch-iron-forge-gym-001':  'marsden',            // Marsden       HD7 6BR
}

type BranchLocationSnapshot = {
  locationConfidence: 'MANUALLY_CONFIRMED'
  localityId: string
  localityName: string
  postTown: string | null
  ladDistrict: string | null
  adminCounty: string | null
  region: string | null
  locationCountry: string  // Plan 4a nation snapshot ("England" etc.); distinct from legacy Branch.country (ISO-2)
  locationResolvedAt: Date
}

async function buildBranchLocationSnapshot(branchId: string): Promise<BranchLocationSnapshot> {
  const slug = BRANCH_LOCALITY_MAP[branchId]
  if (!slug) {
    throw new Error(`buildBranchLocationSnapshot: no Locality mapping for branchId="${branchId}". Add to BRANCH_LOCALITY_MAP.`)
  }
  const loc = await prisma.locality.findUnique({
    where: { slug },
    select: { id: true, name: true, postTown: true, ladDistrict: true, adminCounty: true, region: true, country: true },
  })
  if (!loc) {
    throw new Error(`buildBranchLocationSnapshot: Locality slug "${slug}" (for branch "${branchId}") not found. Did seedLocalities() run?`)
  }
  return {
    locationConfidence: 'MANUALLY_CONFIRMED',
    localityId: loc.id,
    localityName: loc.name,
    postTown: loc.postTown,
    ladDistrict: loc.ladDistrict,
    adminCounty: loc.adminCounty,
    region: loc.region,
    locationCountry: loc.country,
    locationResolvedAt: new Date(),
  }
}

type CustomerLocationSnapshot = {
  postcode: string
  latitude: number
  longitude: number
  localityId: string
  postTown: string | null
  ladDistrict: string
  adminCounty: string | null
  region: string | null
  country: string
  locationResolvedAt: Date
  city: string  // legacy alignment, mirrors production updateMyProfile
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixed postcode snapshots for the two demo customers.
//
// Why fixed snapshots (rather than calling resolvePostcode()):
//   1. DETERMINISM. Seed runs identically every time, with no dependency on
//      postcodes.io uptime, network connectivity, or transient 5xx responses.
//      `npx prisma db seed` must succeed offline — owner direction post PR #128.
//   2. SPEED. Skips two HTTPS round-trips on every fresh seed run.
//   3. STABILITY. ONS postcode centroid data for established postcodes does
//      not change between OS releases. The values below are the canonical
//      postcodes.io response captured on 2026-05-24 — they describe physical
//      reality, not a service response that might drift.
//
// To refresh a snapshot (if a postcode is ever re-issued or its admin
// hierarchy changes after a boundary review):
//   npx tsx -e "const{resolvePostcode}=require('./src/api/lib/postcodeResolver');resolvePostcode('HD1 1AA').then(r=>console.log(JSON.stringify(r,null,2)))"
//
// To add a new demo customer postcode: probe via the command above, then
// add a new SNAPSHOT_* constant + thread it into the relevant upsert in main().
//
// Test data is locked to these two postcodes (HD1 1AA Huddersfield / CO7 0AY
// Brightlingsea) so a wide range of cross-region scenarios — Plan 4a
// Huddersfield Market anchor + Tendring (East of England) reviewer — can be
// exercised without expanding the demo dataset.
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_HUDDERSFIELD_HD1_1AA: ResolvedPostcodeSnapshot = {
  postcode: 'HD1 1AA',
  latitude: 53.648438,
  longitude: -1.781546,
  country: 'England',
  region: 'Yorkshire and The Humber',
  ladDistrict: 'Kirklees',
  adminCounty: null,
  parish: 'Kirklees, unparished area',          // resolves through to constituency via pickRuntimeLocalityName
  adminWard: 'Newsome',
  parliamentaryConstituency: 'Huddersfield',
  postTown: null,
}

const SNAPSHOT_BRIGHTLINGSEA_CO7_0AY: ResolvedPostcodeSnapshot = {
  postcode: 'CO7 0AY',
  latitude: 51.806625,
  longitude: 1.023294,
  country: 'England',
  region: 'East of England',
  ladDistrict: 'Tendring',
  adminCounty: 'Essex',
  parish: 'Brightlingsea',                      // non-unparished → wins pickRuntimeLocalityName
  adminWard: 'Brightlingsea',
  parliamentaryConstituency: 'Harwich and North Essex',
  postTown: null,
}

async function enrichCustomerLocationFromSnapshot(
  snap: ResolvedPostcodeSnapshot,
): Promise<CustomerLocationSnapshot> {
  // findOrCreateLocality is deterministic — pure DB upsert keyed on
  // (name, ladDistrict, country). Seeded Localities (e.g. huddersfield,
  // brightlingsea) match by primary slug; any unseeded postcode would
  // auto-create a row with needsReview=true. The two snapshots above both
  // map to seeded Localities under the standard slug rules.
  const locality = await findOrCreateLocality(prisma, snap)
  return {
    postcode:           snap.postcode,
    latitude:           snap.latitude,
    longitude:          snap.longitude,
    localityId:         locality.id,
    postTown:           snap.postTown ?? locality.postTown,
    ladDistrict:        snap.ladDistrict,
    adminCounty:        snap.adminCounty,
    region:             snap.region,
    country:            snap.country,
    locationResolvedAt: new Date(),
    city:               locality.name,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy seeding
//
// Phase order (called from main() in this sequence):
//   1. seedCategories()          — 11 top-level + 89 subcategories
//   2. seedTags()                — 262 tags (32 cuisine + 182 specialty + 18 highlight + 30 detail)
//   3. seedSubcategoryTags()     — Cuisine/Specialty/Highlight/Detail joins
//   4. seedRedundantHighlights() — admin-curated redundancy rules
// Each phase is idempotent; re-running the seed produces zero new rows.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Test merchants — exercises descriptor + highlight scenarios for discovery API
//
// Six scenarios, six merchants total (one is the existing dev-merchant-001):
//   1. dev-merchant-001          → Restaurant + Italian          (cuisine descriptor, RECOMMENDED)
//   2. tax-merchant-cafe-001     → Cafe & Coffee + Specialty Coffee (specialty descriptor, OPTIONAL → "Specialty Coffee Cafe")
//   3. tax-merchant-pilates-001  → Boutique Studio + Reformer Pilates (specialty descriptor, RECOMMENDED → "Reformer Pilates Studio")
//   4. tax-merchant-foodhall-001 → Food Hall                     (HIDDEN — no primaryDescriptorTagId; UI falls back to bare subcat)
//   5. tax-merchant-aesthetics-001 → Aesthetics Clinic (Beauty & Wellness cross-listing) — exercises the (name, parentId) cross-list resolution
//   6. tax-merchant-vet-001      → Vet + Pet-Friendly + Independent + Wheelchair Accessible
//      (Pet-Friendly is REDUNDANT for Vet per redundantHighlights.ts; exists so the
//      filter test in Group 5 has something to filter; Independent and Wheelchair
//      Accessible remain visible.)
//
// Each merchant gets:
//   - 1 row in Merchant + MerchantCategory (isPrimary=true) at the chosen subcategory
//   - 1 row in Branch (so it appears on map / discovery)
//   - 5–8 MerchantTag rows (primary descriptor + secondary specialties + highlight + detail)
//   - 1–3 MerchantHighlight rows (HIGHLIGHT-type tags only, ≤3 per the DB trigger)
//   - primaryDescriptorTagId set per scenario (null for HIDDEN)
//
// Idempotent: each block uses upsert, createMany skipDuplicates, OR
// upsertMerchantHighlights() — the latter is required because the
// MerchantHighlight 3-cap trigger fires BEFORE INSERT and would reject
// duplicate-row inserts that ON CONFLICT DO NOTHING would otherwise skip.
// ─────────────────────────────────────────────────────────────────────────────

type TestMerchantVoucherSpec = {
  code: string
  isMandatory: boolean
  type: VoucherType
  title: string
  description: string
  terms: string
  estimatedSaving: number
  /** REUSABLE-only. Server floor 1800. Undefined for non-REUSABLE per DB CHECK constraint. */
  cooldownSeconds?: number
}

type TestMerchantSpec = {
  id: string
  businessName: string
  tradingName: string
  description: string
  parentCategoryName: string
  subcategoryName: string
  primaryDescriptorTag: { label: string; type: 'CUISINE' | 'SPECIALTY' } | null
  // MerchantTag rows: any tag type, deduplicated by (merchantId, tagId)
  tags: Array<{ label: string; type: 'CUISINE' | 'SPECIALTY' | 'HIGHLIGHT' | 'DETAIL' }>
  // MerchantHighlight rows (HIGHLIGHT-type tags only); cap is 3
  highlights: Array<{ label: string; sortOrder: number }>
  // BranchAmenity rows for the merchant's single main branch (branch-level, not merchant-level)
  amenities: string[]
  // Optional vouchers — older specs predate this field and skip voucher seeding;
  // newer UK regional QA fixtures include the 2 mandatory + N custom set.
  vouchers?: TestMerchantVoucherSpec[]
  branch: {
    id: string
    name: string
    addressLine1: string
    city: string
    postcode: string
    latitude: number
    longitude: number
    phone?: string
    email?: string
  }
}

const TEST_MERCHANT_SPECS: TestMerchantSpec[] = [
  // Scenario 2 — Cafe & Coffee + Specialty Coffee (specialty descriptor)
  {
    id: 'tax-merchant-cafe-001',
    businessName: 'Bean & Brew Specialty',
    tradingName: 'Bean & Brew',
    description: 'Independent specialty coffee bar with single-origin pour-overs and house pastries.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Cafe & Coffee',
    primaryDescriptorTag: { label: 'Specialty Coffee', type: 'SPECIALTY' },
    tags: [
      { label: 'Specialty Coffee', type: 'SPECIALTY' },
      { label: 'Matcha', type: 'SPECIALTY' },
      { label: 'Patisserie', type: 'SPECIALTY' },
      // M1.24 — Brunch trending-search coverage. The tag was already in this
      // fixture's tag list before M1.24; calling out here so the trending-
      // search audit doesn't flag Bean & Brew as Brunch-untagged.
      { label: 'Brunch', type: 'SPECIALTY' },
      { label: 'Independent', type: 'HIGHLIGHT' },
      { label: 'Vegan-Friendly', type: 'HIGHLIGHT' },
      { label: 'Free Wi-Fi', type: 'DETAIL' },
      { label: 'Bookable Online', type: 'DETAIL' },
    ],
    highlights: [
      { label: 'Independent', sortOrder: 0 },
      { label: 'Vegan-Friendly', sortOrder: 1 },
    ],
    amenities: ['Wi-Fi', 'Outdoor Seating'],
    branch: {
      id: 'tax-branch-cafe-001',
      name: 'Bean & Brew — Shoreditch',
      addressLine1: '88 Curtain Road',
      city: 'London',
      postcode: 'EC2A 3BJ',
      latitude: 51.5246,
      longitude: -0.0805,
      phone: '+442077001234',
      email: 'shoreditch@beanandbrew.test',
    },
  },

  // Scenario 3 — Boutique Studio + Reformer Pilates (specialty descriptor → "Reformer Pilates Studio")
  {
    id: 'tax-merchant-pilates-001',
    businessName: 'Core Reform Studio',
    tradingName: 'Core Reform',
    description: 'Boutique reformer pilates studio with small-group classes and one-to-one tuition.',
    parentCategoryName: 'Health & Fitness',
    subcategoryName: 'Boutique Studio',
    primaryDescriptorTag: { label: 'Reformer Pilates', type: 'SPECIALTY' },
    tags: [
      { label: 'Reformer Pilates', type: 'SPECIALTY' },
      { label: 'Pilates', type: 'SPECIALTY' },
      { label: 'Barre', type: 'SPECIALTY' },
      { label: 'Yoga', type: 'SPECIALTY' },
      { label: 'Women-Owned', type: 'HIGHLIGHT' },
      { label: 'Independent', type: 'HIGHLIGHT' },
      { label: 'Bookable Online', type: 'DETAIL' },
      { label: 'Free Wi-Fi', type: 'DETAIL' },
    ],
    highlights: [
      { label: 'Women-Owned', sortOrder: 0 },
      { label: 'Independent', sortOrder: 1 },
    ],
    amenities: ['Showers', 'Lockers', 'Online Booking'],
    branch: {
      id: 'tax-branch-pilates-001',
      name: 'Core Reform — Clapham',
      addressLine1: '23 Clapham High Street',
      city: 'London',
      postcode: 'SW4 7TR',
      latitude: 51.4625,
      longitude: -0.1376,
      phone: '+442075550199',
      email: 'clapham@corereform.test',
    },
  },

  // Scenario 4 — Food Hall (HIDDEN descriptor; UI falls back to bare subcat label)
  {
    id: 'tax-merchant-foodhall-001',
    businessName: 'Market Quarter Food Hall',
    tradingName: 'Market Quarter',
    description: 'Multi-vendor food hall showcasing fifteen independent kitchens under one roof.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Food Hall',
    primaryDescriptorTag: null,
    tags: [
      { label: 'Independent', type: 'HIGHLIGHT' },
      { label: 'Family-Friendly', type: 'HIGHLIGHT' },
      { label: 'Vegan-Friendly', type: 'HIGHLIGHT' },
      { label: 'Group-Friendly', type: 'DETAIL' },
      { label: 'Card-Only', type: 'DETAIL' },
      { label: 'Open Sundays', type: 'DETAIL' },
    ],
    highlights: [
      { label: 'Independent', sortOrder: 0 },
      { label: 'Family-Friendly', sortOrder: 1 },
      { label: 'Vegan-Friendly', sortOrder: 2 },
    ],
    amenities: ['Wi-Fi', 'Group Bookings'],
    branch: {
      id: 'tax-branch-foodhall-001',
      name: 'Market Quarter — Borough',
      addressLine1: '1 Stoney Street',
      city: 'London',
      postcode: 'SE1 9AA',
      latitude: 51.5055,
      longitude: -0.0902,
      phone: '+442075552020',
      email: 'borough@marketquarter.test',
    },
  },

  // Scenario 5 — Aesthetics Clinic (Beauty & Wellness cross-listing).
  // The (name, parentId) pair pins this merchant to the Beauty & Wellness instance
  // specifically — there is also a Health & Medical Aesthetics Clinic subcategory.
  {
    id: 'tax-merchant-aesthetics-001',
    businessName: 'Lumière Aesthetics',
    tradingName: 'Lumière',
    description: 'Boutique aesthetics clinic specialising in non-surgical facial treatments.',
    parentCategoryName: 'Beauty & Wellness',
    subcategoryName: 'Aesthetics Clinic',
    primaryDescriptorTag: null,
    tags: [
      { label: 'Botox', type: 'SPECIALTY' },
      { label: 'Dermal Fillers', type: 'SPECIALTY' },
      { label: 'Lip Filler', type: 'SPECIALTY' },
      { label: 'Skin Booster', type: 'SPECIALTY' },
      { label: 'Microneedling', type: 'SPECIALTY' },
      { label: 'Women-Owned', type: 'HIGHLIGHT' },
      { label: 'Reservation-Only', type: 'DETAIL' },
    ],
    highlights: [
      { label: 'Women-Owned', sortOrder: 0 },
    ],
    amenities: ['Same-Day Appointments', 'Online Booking', 'Wheelchair Access'],
    branch: {
      id: 'tax-branch-aesthetics-001',
      name: 'Lumière — Marylebone',
      addressLine1: '14 Marylebone High Street',
      city: 'London',
      postcode: 'W1U 4PB',
      latitude: 51.5193,
      longitude: -0.1497,
      phone: '+442075551717',
      email: 'marylebone@lumiere.test',
    },
  },

  // Scenario 6 — Vet (Pet Services). Pet-Friendly is REDUNDANT for Vet per
  // redundantHighlights.ts; exists so the filter test has something to filter.
  // Independent + Wheelchair Accessible remain visible after filtering.
  {
    id: 'tax-merchant-vet-001',
    businessName: 'Wagtail Veterinary Practice',
    tradingName: 'Wagtail Vets',
    description: 'Independent neighbourhood vet with on-site diagnostics and a soft-opening recovery suite.',
    parentCategoryName: 'Pet Services',
    subcategoryName: 'Vet',
    primaryDescriptorTag: null,
    tags: [
      { label: 'Pet-Friendly', type: 'HIGHLIGHT' },
      { label: 'Independent', type: 'HIGHLIGHT' },
      { label: 'Wheelchair Accessible', type: 'HIGHLIGHT' },
      { label: 'Bookable Online', type: 'DETAIL' },
      { label: 'Step-Free Access', type: 'DETAIL' },
      { label: 'Parking', type: 'DETAIL' },
    ],
    // 3 highlights total; Pet-Friendly will be filtered out by the redundancy
    // rule at API time, leaving Independent + Wheelchair Accessible visible.
    highlights: [
      { label: 'Pet-Friendly', sortOrder: 0 },
      { label: 'Independent', sortOrder: 1 },
      { label: 'Wheelchair Accessible', sortOrder: 2 },
    ],
    amenities: ['Online Booking', 'Pickup & Drop-off'],
    branch: {
      id: 'tax-branch-vet-001',
      name: 'Wagtail Vets — Hackney',
      addressLine1: '47 Mare Street',
      city: 'London',
      postcode: 'E8 4RP',
      latitude: 51.5436,
      longitude: -0.0571,
      phone: '+442075559090',
      email: 'hackney@wagtailvets.test',
    },
  },

  // Non-London QA fixtures (added 2026-05-01) — exercise the scope cascade
  // when supply is sparse outside London. Both are South Indian restaurants;
  // 'South Indian' isn't in the locked CUISINE tag set, so the descriptor
  // resolves as 'Indian Restaurant' (CUISINE 'Indian' + Restaurant suffix)
  // and the South-Indian specificity lives in the description text. Adding
  // 'South Indian' to the locked taxonomy is a separate, larger change.
  {
    id: 'tax-merchant-covelum-001',
    businessName: 'Covelum Restaurant',
    tradingName: 'Covelum',
    description: 'South Indian restaurant on the Brightlingsea waterfront — dosas, sambar, regional thali plates.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Restaurant',
    primaryDescriptorTag: { label: 'Indian', type: 'CUISINE' },
    tags: [
      { label: 'Indian', type: 'CUISINE' },
      { label: 'Vegetarian-Friendly', type: 'HIGHLIGHT' },
      { label: 'Family-Friendly', type: 'HIGHLIGHT' },
      { label: 'Independent', type: 'HIGHLIGHT' },
    ],
    highlights: [
      { label: 'Vegetarian-Friendly', sortOrder: 0 },
      { label: 'Family-Friendly',     sortOrder: 1 },
      { label: 'Independent',         sortOrder: 2 },
    ],
    amenities: ['Wi-Fi', 'Outdoor Seating'],
    vouchers: [
      {
        code: 'COV-RMV-001',
        isMandatory: true,
        type: 'DISCOUNT_PERCENT',
        title: '10% Off Your First Visit',
        description: 'Get 10% off your total food bill on your first visit.',
        terms: 'In-house only. New customers only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 4.00,
      },
      {
        code: 'COV-RMV-002',
        isMandatory: true,
        type: 'BOGO',
        title: 'Buy One Dosa, Get One Free',
        description: 'Buy any masala dosa and get a plain dosa of equal or lesser value free.',
        terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 6.50,
      },
      {
        // Canonical seeded REUSABLE QA/dev fixture (2026-05-12).
        // Originally seeded as FREEBIE; converted to REUSABLE during the
        // M5 (REUSABLE v1) device-QA cycle and kept post-merge as the
        // sole seeded REUSABLE voucher in the dev DB. `cooldownSeconds`
        // is set to the server floor (1800s = 30 min) for fast QA
        // cycling between states (state 1 / state 2 / state 4 / D44).
        // Terms stripped of "Once per cycle." which was misleading
        // copy for a REUSABLE voucher.
        code: 'COV-RCV-001',
        isMandatory: false,
        type: 'REUSABLE',
        title: 'Free Filter Coffee with Any Thali',
        description: 'Order any thali plate and get a complimentary South Indian filter coffee.',
        terms: 'In-house only. Cannot be combined with other offers.',
        estimatedSaving: 2.50,
        cooldownSeconds: 1800,
      },
    ],
    branch: {
      id: 'tax-branch-covelum-001',
      name: 'Covelum — Brightlingsea',
      addressLine1: '27 Waterside',
      city: 'Brightlingsea',
      postcode: 'CO7 0AY',
      // PR #113 fixup-1 (2026-05-20) — Google Places confirmation.
      // Was 51.8054, 1.0244 (pre-confirmation MANUALLY_CONFIRMED but
      // ~157m off the actual 27 Waterside, Waterside Marina address).
      // Owner device QA on Brightlingsea Map flagged the offset; Google
      // Places returned a single high-quality candidate (placeId
      // ChIJEbR0RqcR2UcRvqfZ5zndZGQ, types [subpremise, street_address]).
      // Applied to the dev DB via `prisma/suggest-branch-pin.ts
      // --confirm-place-id`; audit row logged. Seed lat/lng mirrored
      // here so future seed reruns persist the corrected coord.
      latitude: 51.8066107,
      longitude: 1.0231983,
      phone: '+441206302700',
      email: 'hello@covelum.test',
    },
  },
  {
    id: 'tax-merchant-mykerala-001',
    businessName: 'My Kerala',
    tradingName: 'My Kerala',
    description: 'South Indian restaurant in Ipswich — Kerala specialities, appam, coconut-based curries, fresh seafood.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Restaurant',
    primaryDescriptorTag: { label: 'Indian', type: 'CUISINE' },
    tags: [
      { label: 'Indian', type: 'CUISINE' },
      { label: 'Vegetarian-Friendly', type: 'HIGHLIGHT' },
      { label: 'Independent',         type: 'HIGHLIGHT' },
    ],
    highlights: [
      { label: 'Vegetarian-Friendly', sortOrder: 0 },
      { label: 'Independent',         sortOrder: 1 },
    ],
    amenities: ['Wi-Fi', 'Online Booking'],
    vouchers: [
      {
        code: 'MYK-RMV-001',
        isMandatory: true,
        type: 'DISCOUNT_PERCENT',
        title: '15% Off Mid-Week Lunch',
        description: 'Get 15% off your total bill Monday–Thursday lunchtime (12:00–15:00).',
        terms: 'In-house only. Mon–Thu 12:00–15:00 only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 5.50,
      },
      {
        code: 'MYK-RMV-002',
        isMandatory: true,
        type: 'FREEBIE',
        title: 'Free Appam with Any Curry',
        description: 'Order any curry main and get a complimentary appam.',
        terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 3.00,
      },
    ],
    branch: {
      id: 'tax-branch-mykerala-001',
      name: 'My Kerala — Ipswich',
      addressLine1: "24 St Helen's Street",
      city: 'Ipswich',
      postcode: 'IP4 1HJ',
      latitude: 52.0567,
      longitude: 1.1664,
      phone: '+441473200500',
      email: 'hello@mykerala.test',
    },
  },
  // Karaara — Huddersfield (Plan 4 locality-model fixture: Huddersfield / West Yorkshire).
  // Chai and Indian street kitchen. Category: Cafe & Coffee (chai-led counter-service
  // model). Descriptor resolves to "Indian Cafe" — closest available fit; taxonomy
  // gaps (Chai, Indian Street Food, Snacks, Casual Dining, Mocktails) noted for
  // future taxonomy-extension work.
  {
    id: 'tax-merchant-karaara-001',
    businessName: 'Karaara',
    tradingName: 'Karaara',
    description: 'Chai and Indian street kitchen in Huddersfield — handcrafted chai, small plates, and bold flavours in a casual counter-service setting.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Cafe & Coffee',
    primaryDescriptorTag: { label: 'Indian', type: 'CUISINE' },
    tags: [
      { label: 'Indian',              type: 'CUISINE'    },
      { label: 'Halal',               type: 'HIGHLIGHT'  },
      { label: 'Vegetarian-Friendly', type: 'HIGHLIGHT'  },
      { label: 'Independent',         type: 'HIGHLIGHT'  },
      { label: 'Takeaway Available',  type: 'DETAIL'     },
    ],
    highlights: [
      { label: 'Halal',               sortOrder: 0 },
      { label: 'Vegetarian-Friendly', sortOrder: 1 },
      { label: 'Independent',         sortOrder: 2 },
    ],
    amenities: ['Wi-Fi', 'Walk-Ins Welcome'],
    vouchers: [
      {
        code: 'KAR-RMV-001',
        isMandatory: true,
        type: 'BOGO',
        title: 'Buy One Chai, Get One Free',
        description: 'Buy any handcrafted chai and get a second chai of equal or lesser value free.',
        terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 3.00,
      },
      {
        code: 'KAR-RMV-002',
        isMandatory: true,
        type: 'FREEBIE',
        title: 'Free Samosa with Any Chai',
        description: 'Order any chai and get a complimentary samosa.',
        terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 2.00,
      },
    ],
    branch: {
      id:           'tax-branch-karaara-001',
      name:         'Karaara — Huddersfield',
      addressLine1: '11 Cross Church Street',
      city:         'Huddersfield',
      postcode:     'HD1 2PY',
      latitude:     53.6463,
      longitude:    -1.7809,
      phone:        '+441484500900',
      email:        'hello@karaara.test',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Plan 4 M1.24 — trending-search fixture merchants (Pizza / Nail / Barber /
  // Gym). Bean & Brew above covers Coffee + Brunch (Brunch tag added in M1.24).
  // All four fictional but realistic test/demo merchants; Huddersfield-area
  // distribution per owner approval (2026-05-14):
  //   - Pinos Pizzeria    → huddersfield (Kirklees)
  //   - Polish Nail Studio → holmfirth   (Kirklees, Huddersfield Market)
  //   - Trim & Co Barbers  → huddersfield (Kirklees)
  //   - Iron Forge Gym     → marsden     (Kirklees, Huddersfield Market)
  // BRANCH_LOCALITY_MAP (top of seed.ts) gets four matching entries so the
  // M1.16 buildBranchLocationSnapshot helper sets locationConfidence:
  // MANUALLY_CONFIRMED + the full Locality snapshot on each branch upsert.
  // ─────────────────────────────────────────────────────────────────────────

  // Scenario 10 — Pizza trending coverage. Pino's Pizzeria (apostrophe stripped
  // for ASCII-safety per owner direction). Restaurant subcategory + Italian
  // CUISINE + Pizza SPECIALTY → trending term "Pizza" hits via SPECIALTY tag.
  {
    id: 'tax-merchant-pinos-pizzeria-001',
    businessName: 'Pinos Pizzeria',
    tradingName: 'Pinos Pizzeria',
    description: 'Wood-fired pizzas and Italian small plates in central Huddersfield.',
    parentCategoryName: 'Food & Drink',
    subcategoryName: 'Restaurant',
    primaryDescriptorTag: { label: 'Italian', type: 'CUISINE' },
    tags: [
      { label: 'Italian',           type: 'CUISINE' },
      { label: 'Pizza',             type: 'SPECIALTY' },  // ← satisfies trending "Pizza"
      { label: 'Family-Friendly',   type: 'HIGHLIGHT' },
      { label: 'Independent',       type: 'HIGHLIGHT' },
    ],
    highlights: [
      { label: 'Family-Friendly', sortOrder: 0 },
      { label: 'Independent',     sortOrder: 1 },
    ],
    amenities: ['Wi-Fi', 'Outdoor Seating'],
    branch: {
      id:           'tax-branch-pinos-pizzeria-001',
      name:         'Pinos Pizzeria — Huddersfield',
      addressLine1: '47 New Street',
      city:         'Huddersfield',
      postcode:     'HD1 2BJ',
      latitude:     53.6485,
      longitude:    -1.7820,
      phone:        '+441484501100',
      email:        'info@pinos-pizzeria.test',
    },
  },

  // Scenario 11 — Nail Salon trending coverage. HIDDEN descriptor (Nail Salon
  // subcategory) → no primaryDescriptorTag; UI displays bare subcategory name.
  // Trending term "Nail salon" hits via the subcategory match.
  {
    id: 'tax-merchant-polish-nails-001',
    businessName: 'Polish Nail Studio',
    tradingName: 'Polish Nail Studio',
    description: 'Independent nail salon in Holmfirth — gel, BIAB, manicures and pedicures.',
    parentCategoryName: 'Beauty & Wellness',
    subcategoryName: 'Nail Salon',
    primaryDescriptorTag: null,
    tags: [
      { label: 'Manicure',     type: 'SPECIALTY' },
      { label: 'Pedicure',     type: 'SPECIALTY' },
      { label: 'Gel Nails',    type: 'SPECIALTY' },
      { label: 'BIAB',         type: 'SPECIALTY' },
      { label: 'Independent',  type: 'HIGHLIGHT' },
      { label: 'Women-Owned',  type: 'HIGHLIGHT' },
    ],
    highlights: [
      { label: 'Independent', sortOrder: 0 },
      { label: 'Women-Owned', sortOrder: 1 },
    ],
    amenities: ['Online Booking', 'Wi-Fi'],
    branch: {
      id:           'tax-branch-polish-nails-001',
      name:         'Polish Nail Studio — Holmfirth',
      addressLine1: '8 Victoria Square',
      city:         'Holmfirth',
      postcode:     'HD9 2DN',
      latitude:     53.5700,
      longitude:    -1.7885,
      phone:        '+441484501200',
      email:        'bookings@polish-nails.test',
    },
  },

  // Scenario 12 — Barber trending coverage. HIDDEN descriptor (Barber
  // subcategory). Walk-Ins Welcome DETAIL tag adds realism without breaking
  // the test data.
  {
    id: 'tax-merchant-trim-co-barbers-001',
    businessName: 'Trim & Co Barbers',
    tradingName: 'Trim & Co Barbers',
    description: 'Independent barbers in Huddersfield — walk-ins welcome, classic and modern cuts, hot towel shaves.',
    parentCategoryName: 'Beauty & Wellness',
    subcategoryName: 'Barber',
    primaryDescriptorTag: null,
    tags: [
      { label: "Men's Grooming",    type: 'SPECIALTY' },
      { label: 'Hot Towel Shave',   type: 'SPECIALTY' },
      { label: 'Independent',       type: 'HIGHLIGHT' },
      { label: 'Walk-Ins Welcome',  type: 'DETAIL' },
    ],
    highlights: [
      { label: 'Independent', sortOrder: 0 },
    ],
    amenities: ['Wi-Fi'],
    branch: {
      id:           'tax-branch-trim-co-barbers-001',
      name:         'Trim & Co Barbers — Huddersfield',
      addressLine1: '22 King Street',
      city:         'Huddersfield',
      postcode:     'HD1 2QT',
      latitude:     53.6470,
      longitude:    -1.7795,
      phone:        '+441484501300',
      email:        'hi@trim-co-barbers.test',
    },
  },

  // Scenario 13 — Gym trending coverage. RECOMMENDED descriptor on Gym
  // subcategory but we leave primaryDescriptorTag null (generic gym, no
  // dominant discipline) — UI falls back to bare "Gym".
  {
    id: 'tax-merchant-iron-forge-gym-001',
    businessName: 'Iron Forge Gym',
    tradingName: 'Iron Forge Gym',
    description: 'Independent strength and functional fitness gym in Marsden — heavy iron, kettlebells, and a small-group HIIT class schedule.',
    parentCategoryName: 'Health & Fitness',
    subcategoryName: 'Gym',
    primaryDescriptorTag: null,
    tags: [
      { label: 'Strength',           type: 'SPECIALTY' },
      { label: 'HIIT',               type: 'SPECIALTY' },
      { label: 'Functional',         type: 'SPECIALTY' },
      { label: 'Personal Training',  type: 'SPECIALTY' },
      { label: 'Independent',        type: 'HIGHLIGHT' },
    ],
    highlights: [
      { label: 'Independent', sortOrder: 0 },
    ],
    amenities: ['Showers', 'Lockers', 'Free Parking'],
    branch: {
      id:           'tax-branch-iron-forge-gym-001',
      name:         'Iron Forge Gym — Marsden',
      addressLine1: '15 Peel Street',
      city:         'Marsden',
      postcode:     'HD7 6BR',
      latitude:     53.6019,
      longitude:    -1.9303,
      phone:        '+441484501400',
      email:        'info@iron-forge-gym.test',
    },
  },
]

/**
 * Link a branch to amenities via BranchAmenity rows (idempotent — safe to call
 * on re-seed). Amenities are branch-level: a multi-branch merchant may have
 * different amenities per branch.
 */
async function linkBranchAmenities(branchId: string, amenityNames: string[]): Promise<void> {
  for (const name of amenityNames) {
    const amenityId = amenityIdByName.get(name)
    if (!amenityId) throw new Error(`linkBranchAmenities: amenity '${name}' not found`)
    await prisma.branchAmenity.upsert({
      where:  { branchId_amenityId: { branchId, amenityId } },
      update: {},
      create: { branchId, amenityId },
    })
  }
}

/**
 * Insert MerchantHighlight rows defensively against the 3-cap trigger.
 *
 * The DB trigger fires BEFORE INSERT and rejects when the merchant already
 * has ≥ 3 highlights — even if the new row would conflict and be skipped by
 * `ON CONFLICT DO NOTHING`. So we cannot rely on `createMany skipDuplicates`
 * for idempotency; we must filter to rows that do not yet exist before
 * inserting.
 */
async function upsertMerchantHighlights(
  rows: Array<{ merchantId: string; highlightTagId: string; sortOrder: number }>,
): Promise<void> {
  if (rows.length === 0) return
  const merchantId = rows[0]!.merchantId
  // Sanity: this helper assumes a single merchant per call to keep the
  // existing-row lookup tight; throw if mixed.
  if (rows.some((r) => r.merchantId !== merchantId)) {
    throw new Error('upsertMerchantHighlights: all rows must share the same merchantId')
  }
  const existing = await prisma.merchantHighlight.findMany({
    where: { merchantId },
    select: { highlightTagId: true },
  })
  const existingTagIds = new Set(existing.map((e) => e.highlightTagId))
  const toInsert = rows.filter((r) => !existingTagIds.has(r.highlightTagId))
  if (toInsert.length === 0) return
  // Defensive: re-assert the cap on the union before the trigger does, so
  // we surface a clearer error than the raw P0001.
  if (existing.length + toInsert.length > 3) {
    throw new Error(
      `upsertMerchantHighlights: ${merchantId} would exceed 3-cap (${existing.length} existing + ${toInsert.length} new)`,
    )
  }
  await prisma.merchantHighlight.createMany({ data: toInsert })
}

async function seedTaxonomyTestMerchants(): Promise<void> {
  // ── Scenario 1: backfill the existing dev-merchant-001 ──
  // Pin it to subcategory Restaurant under Food & Drink with Italian as the
  // primary cuisine descriptor.
  const foodCatId = topLevelIdByName.get('Food & Drink')
  if (!foodCatId) throw new Error('seedTaxonomyTestMerchants: missing Food & Drink top-level')
  const restaurantSubcatId = subcategoryIdByNameAndParent.get(`Restaurant::${foodCatId}`)
  if (!restaurantSubcatId) throw new Error('seedTaxonomyTestMerchants: missing Restaurant subcategory')

  const italianTagId = tagIdByLabelAndType.get('Italian:CUISINE')
  if (!italianTagId) throw new Error('seedTaxonomyTestMerchants: missing Italian cuisine tag')

  await prisma.merchant.update({
    where: { id: 'dev-merchant-001' },
    data: {
      primaryCategoryId: restaurantSubcatId,
      primaryDescriptorTagId: italianTagId,
    },
  })

  // Demote any existing MerchantCategory rows for the dev merchant so the
  // primary-flag invariant holds, then upsert the Restaurant link as primary.
  await prisma.merchantCategory.updateMany({
    where: { merchantId: 'dev-merchant-001' },
    data: { isPrimary: false },
  })
  await prisma.merchantCategory.upsert({
    where: {
      merchantId_categoryId: { merchantId: 'dev-merchant-001', categoryId: restaurantSubcatId },
    },
    update: { isPrimary: true },
    create: { merchantId: 'dev-merchant-001', categoryId: restaurantSubcatId, isPrimary: true },
  })

  // Tags + highlights for dev-merchant-001 (Italian Restaurant scenario).
  const devMerchantTagLabels: Array<{ label: string; type: 'CUISINE' | 'SPECIALTY' | 'HIGHLIGHT' | 'DETAIL' }> = [
    { label: 'Italian', type: 'CUISINE' },
    { label: 'Pizza', type: 'SPECIALTY' },
    { label: 'Vegetarian', type: 'SPECIALTY' },
    { label: 'Independent', type: 'HIGHLIGHT' },
    { label: 'Date Night', type: 'HIGHLIGHT' },
    { label: 'Outdoor Seating', type: 'HIGHLIGHT' },
    { label: 'Bookable Online', type: 'DETAIL' },
    { label: 'Card-Only', type: 'DETAIL' },
  ]
  const devMerchantTagRows = devMerchantTagLabels
    .map(({ label, type }) => {
      const tagId = tagIdByLabelAndType.get(`${label}:${type}`)
      if (!tagId) throw new Error(`seedTaxonomyTestMerchants: missing tag ${label}:${type} for dev-merchant-001`)
      return { merchantId: 'dev-merchant-001', tagId }
    })
  await prisma.merchantTag.createMany({ data: devMerchantTagRows, skipDuplicates: true })

  const devHighlights: Array<{ label: string; sortOrder: number }> = [
    { label: 'Independent', sortOrder: 0 },
    { label: 'Date Night', sortOrder: 1 },
    { label: 'Outdoor Seating', sortOrder: 2 },
  ]
  const devHighlightRows = devHighlights.map(({ label, sortOrder }) => {
    const tagId = tagIdByLabelAndType.get(`${label}:HIGHLIGHT`)
    if (!tagId) throw new Error(`seedTaxonomyTestMerchants: missing highlight tag '${label}' for dev-merchant-001`)
    return { merchantId: 'dev-merchant-001', highlightTagId: tagId, sortOrder }
  })
  await upsertMerchantHighlights(devHighlightRows)

  // BranchAmenity rows for dev-merchant-001's main branch.
  const devMerchantMainBranch = await prisma.branch.findFirst({
    where: { merchantId: 'dev-merchant-001', isMainBranch: true },
    select: { id: true },
  })
  if (devMerchantMainBranch) {
    await linkBranchAmenities(devMerchantMainBranch.id, ['Outdoor Seating', 'Wi-Fi', 'Online Booking'])
  }

  // ── Scenarios 2–6: create the new test merchants ──
  for (const spec of TEST_MERCHANT_SPECS) {
    const parentId = topLevelIdByName.get(spec.parentCategoryName)
    if (!parentId) {
      throw new Error(`seedTaxonomyTestMerchants: unknown parent category '${spec.parentCategoryName}' for ${spec.id}`)
    }
    const subcategoryId = subcategoryIdByNameAndParent.get(`${spec.subcategoryName}::${parentId}`)
    if (!subcategoryId) {
      throw new Error(
        `seedTaxonomyTestMerchants: subcategory '${spec.subcategoryName}' under '${spec.parentCategoryName}' not found for ${spec.id}`,
      )
    }

    const primaryDescriptorTagId = spec.primaryDescriptorTag
      ? tagIdByLabelAndType.get(`${spec.primaryDescriptorTag.label}:${spec.primaryDescriptorTag.type}`) ?? null
      : null
    if (spec.primaryDescriptorTag && !primaryDescriptorTagId) {
      throw new Error(
        `seedTaxonomyTestMerchants: primary descriptor tag '${spec.primaryDescriptorTag.label}:${spec.primaryDescriptorTag.type}' not found for ${spec.id}`,
      )
    }

    // Idempotent merchant creation. Use upsert keyed on the stable id.
    await prisma.merchant.upsert({
      where: { id: spec.id },
      update: {
        primaryCategoryId: subcategoryId,
        primaryDescriptorTagId,
      },
      create: {
        id: spec.id,
        businessName: spec.businessName,
        tradingName: spec.tradingName,
        description: spec.description,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        contractStatus: 'SIGNED',
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        primaryCategoryId: subcategoryId,
        primaryDescriptorTagId,
      },
    })

    // MerchantCategory (primary subcategory link).
    await prisma.merchantCategory.upsert({
      where: { merchantId_categoryId: { merchantId: spec.id, categoryId: subcategoryId } },
      update: { isPrimary: true },
      create: { merchantId: spec.id, categoryId: subcategoryId, isPrimary: true },
    })

    // Branch (with encrypted PIN, idempotent on stable id).
    // M1.16: branch location snapshot is refreshed on every seed run so
    // system-owned admin-hierarchy mirror columns stay current.
    const locationSnapshot = await buildBranchLocationSnapshot(spec.branch.id)
    await prisma.branch.upsert({
      where: { id: spec.branch.id },
      update: { ...locationSnapshot },
      create: {
        id: spec.branch.id,
        merchantId: spec.id,
        name: spec.branch.name,
        isMainBranch: true,
        addressLine1: spec.branch.addressLine1,
        city: spec.branch.city,
        postcode: spec.branch.postcode,
        country: 'GB',
        latitude: spec.branch.latitude,
        longitude: spec.branch.longitude,
        phone: spec.branch.phone ?? null,
        email: spec.branch.email ?? null,
        redemptionPin: encrypt('1234'),
        isActive: true,
        ...locationSnapshot,
      },
    })

    // MerchantTag rows — bulk insert, dedup via compound unique.
    const tagRows = spec.tags.map(({ label, type }) => {
      const tagId = tagIdByLabelAndType.get(`${label}:${type}`)
      if (!tagId) throw new Error(`seedTaxonomyTestMerchants: missing tag ${label}:${type} for ${spec.id}`)
      return { merchantId: spec.id, tagId }
    })
    if (tagRows.length > 0) {
      await prisma.merchantTag.createMany({ data: tagRows, skipDuplicates: true })
    }

    // MerchantHighlight rows — capped at 3 by the DB trigger; we self-enforce
    // here to fail fast in case a spec is mis-edited later.
    if (spec.highlights.length > 3) {
      throw new Error(`seedTaxonomyTestMerchants: ${spec.id} has > 3 highlights; trigger will reject`)
    }
    const highlightRows = spec.highlights.map(({ label, sortOrder }) => {
      const tagId = tagIdByLabelAndType.get(`${label}:HIGHLIGHT`)
      if (!tagId) throw new Error(`seedTaxonomyTestMerchants: missing highlight tag '${label}' for ${spec.id}`)
      return { merchantId: spec.id, highlightTagId: tagId, sortOrder }
    })
    await upsertMerchantHighlights(highlightRows)

    // BranchAmenity rows for this merchant's main branch (branch-level, not merchant-level).
    await linkBranchAmenities(spec.branch.id, spec.amenities)

    // Optional vouchers — older specs predate this field. New specs (e.g. the
    // UK regional QA fixtures) include 2 mandatory + N custom; codes are
    // namespaced per merchant since voucher.code is globally unique.
    if (spec.vouchers && spec.vouchers.length > 0) {
      for (const v of spec.vouchers) {
        await prisma.voucher.upsert({
          where: { code: v.code },
          update: {},
          create: {
            merchantId:      spec.id,
            code:            v.code,
            isMandatory:     v.isMandatory,
            type:            v.type,
            title:           v.title,
            description:     v.description,
            terms:           v.terms,
            estimatedSaving: v.estimatedSaving,
            // REUSABLE-only field — undefined for other types per the
            // DB CHECK constraint `Voucher_cooldownSeconds_reusable_only_check`.
            // Spec types pass `cooldownSeconds: 1800` (or similar ≥1800)
            // for REUSABLE entries; omitted for all others.
            cooldownSeconds: v.cooldownSeconds,
            status:          'ACTIVE',
            approvalStatus:  'APPROVED',
            approvedAt:      new Date(),
          },
        })
      }
    }
  }

  console.log(
    `✓ Seeded taxonomy test merchants: dev-merchant-001 (Restaurant + Italian) + ${TEST_MERCHANT_SPECS.length} new`,
  )
}

// ─────────────────────────────────────────
// Demo-ready merchant enrichment
//
// Scoped to ONE merchant (Covelum) so on-device QA + screenshots have a
// "golden" page exercising every UI element on the Merchant Profile
// surface. Without this enrichment, seeded merchants render with all the
// null-fallbacks (no logo, no banner, no photos, no opening hours,
// "Closed today", no rating pill, no website button, single branch →
// Branches tab hidden, no verified-badge path). Every UI component is
// correctly wired; this just gives them data to render.
//
// Idempotent — safe to re-run via `npx prisma db seed`.
//
// PR scope is one merchant only. To extend to other merchants, copy this
// pattern; do not generalise prematurely (YAGNI).
// ─────────────────────────────────────────

const COVELUM_MERCHANT_ID    = 'tax-merchant-covelum-001'
const COVELUM_MAIN_BRANCH_ID = 'tax-branch-covelum-001'
const COVELUM_2ND_BRANCH_ID  = 'tax-branch-covelum-002'

async function seedDemoMerchantEnrichment(reviewerLocation: CustomerLocationSnapshot): Promise<void> {
  // ───────────────────────────────────────────────────────────────────
  // 0. Stage 2 enrichment — 9 fake/demo merchants + dev-merchant-001
  //    (partial) + Cohort C real-merchant branch PINs.
  //
  //    Source of truth: prisma/seed-data/demoMerchantEnrichment.ts.
  //    Plan: docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md
  //    §Stage 2 final scope (locked 2026-05-20 post-implementation-pre-check).
  //
  //    The Covelum-specific block in §1-§6 below runs unchanged after
  //    this iteration; Covelum is NOT in DEMO_MERCHANT_ENRICHMENT
  //    (real merchant; receives PIN-only treatment via §0.2 below).
  // ───────────────────────────────────────────────────────────────────
  for (const entry of DEMO_MERCHANT_ENRICHMENT) {
    // 0.1.a — merchant media. Same fields for every entry; Cohort B
    //   (The Coffee House) gets media + website like everyone else.
    await prisma.merchant.update({
      where: { id: entry.merchantId },
      data: {
        logoUrl:    entry.logoUrl,
        bannerUrl:  entry.bannerUrl,
        websiteUrl: entry.websiteUrl,
      },
    })

    // 0.1.b — vouchers. Cohort B (dev-merchant-001) ships vouchers: []
    //   and is intentionally skipped (already has 2 RMV vouchers from
    //   the auth-flow demo fixture).
    if (entry.vouchers.length > 0) {
      for (const v of entry.vouchers) {
        await prisma.voucher.upsert({
          where: { id: v.id },
          create: {
            id:              v.id,
            merchantId:      entry.merchantId,
            code:            v.code,
            isMandatory:     false,
            type:            v.type,
            title:           v.title,
            description:     v.description,
            estimatedSaving: v.estimatedSaving,
            status:          'ACTIVE',
            approvalStatus:  'APPROVED',
            approvedAt:      new Date(),
          },
          update: {
            code:            v.code,
            type:            v.type,
            title:           v.title,
            description:     v.description,
            estimatedSaving: v.estimatedSaving,
            status:          'ACTIVE',
            approvalStatus:  'APPROVED',
          },
        })
      }
    }

    // 0.1.c — per-branch enrichment: PIN, opening hours, contact gap-fills.
    for (const [branchId, b] of Object.entries(entry.branches)) {
      // PIN idempotency guard: write encrypted PIN ONLY if currently null.
      //   - Fake/demo branches already have PIN set in the taxonomy seed
      //     (encrypt('1234') at line 1188), so this is a no-op there.
      //   - dev-branch-001 (Cohort B) PIN is preserved — owner-locked
      //     "Do NOT change redemptionPin (already set)".
      //   - Forward-compat: if any future branch lands without a PIN, the
      //     guard writes one without overwriting hand-set values.
      const current = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { redemptionPin: true, phone: true, email: true },
      })
      if (!current) continue
      const updates: { redemptionPin?: string; phone?: string; email?: string } = {}
      if (!current.redemptionPin) updates.redemptionPin = encrypt(b.redemptionPinPlaintext)
      if (!current.phone && b.phone) updates.phone = b.phone
      if (!current.email && b.email) updates.email = b.email
      if (Object.keys(updates).length > 0) {
        await prisma.branch.update({ where: { id: branchId }, data: updates })
      }

      // Opening hours: idempotent via per-row upsert on the compound
      // unique key. Matches the Covelum block pattern below (line ~1424)
      // — no destructive mid-loop window. Schema has
      // @@unique([branchId, dayOfWeek]) so split sessions are not
      // expressible (deferred to §SE.1).
      for (const oh of b.openingHours) {
        await prisma.branchOpeningHours.upsert({
          where:  { branchId_dayOfWeek: { branchId, dayOfWeek: oh.dayOfWeek } },
          update: { openTime: oh.openTime, closeTime: oh.closeTime, isClosed: oh.isClosed },
          create: { branchId, dayOfWeek: oh.dayOfWeek, openTime: oh.openTime, closeTime: oh.closeTime, isClosed: oh.isClosed },
        })
      }
    }
  }
  console.log(
    `✓ Stage 2 enrichment applied to ${DEMO_MERCHANT_ENRICHMENT.length} demo merchants ` +
    `(8 fake/demo full + Wagtail 2-voucher exception + The Coffee House partial)`,
  )

  // 0.2 — Cohort C real-merchant branches: PIN-only enrichment, IFF
  //   redemptionPin is currently null. Owner-locked: NO other field
  //   touched (no coords, no locationConfidence, no address, no
  //   contact, no vouchers, no media, no opening hours).
  for (const realBranchId of REAL_MERCHANT_PIN_BRANCH_IDS) {
    const current = await prisma.branch.findUnique({
      where: { id: realBranchId },
      select: { redemptionPin: true },
    })
    if (!current) continue
    if (current.redemptionPin) continue // already set — DO NOT overwrite
    await prisma.branch.update({
      where: { id: realBranchId },
      data:  { redemptionPin: encrypt(DEV_QA_PIN) },
    })
    console.log(`✓ Stage 2 Cohort C — set redemptionPin on ${realBranchId} (was null)`)
  }

  // ── 1. Merchant logo / banner / website ──
  // Logo uses placehold.co (deterministic, brand colour). Banner + photos
  // use Unsplash food/restaurant imagery for a realistic demo feel. If
  // either external host blocks hot-linking, swap to placehold.co
  // equivalents — UI handles null gracefully either way.
  await prisma.merchant.update({
    where: { id: COVELUM_MERCHANT_ID },
    data: {
      logoUrl:    'https://placehold.co/240x240/E20C04/FFFFFF/png?text=Covelum&font=lato',
      bannerUrl:  'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=80',
      websiteUrl: 'https://covelum.test',
    },
  })

  // ── 2. Opening hours — main branch (Brightlingsea) ──
  // Pattern: closed Monday; Tue-Thu evenings only; Fri-Sun all day.
  // dayOfWeek 0 = Sunday … 6 = Saturday.
  const mainBranchHours: Array<{ dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }> = [
    { dayOfWeek: 0, openTime: '12:00', closeTime: '22:00', isClosed: false }, // Sun
    { dayOfWeek: 1, openTime: null,    closeTime: null,    isClosed: true  }, // Mon
    { dayOfWeek: 2, openTime: '17:00', closeTime: '22:00', isClosed: false }, // Tue
    { dayOfWeek: 3, openTime: '17:00', closeTime: '22:00', isClosed: false }, // Wed
    { dayOfWeek: 4, openTime: '17:00', closeTime: '22:00', isClosed: false }, // Thu
    { dayOfWeek: 5, openTime: '12:00', closeTime: '22:30', isClosed: false }, // Fri
    { dayOfWeek: 6, openTime: '12:00', closeTime: '22:30', isClosed: false }, // Sat
  ]
  for (const h of mainBranchHours) {
    await prisma.branchOpeningHours.upsert({
      where:  { branchId_dayOfWeek: { branchId: COVELUM_MAIN_BRANCH_ID, dayOfWeek: h.dayOfWeek } },
      update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
      create: { branchId: COVELUM_MAIN_BRANCH_ID, ...h },
    })
  }

  // ── 3. Photos for the main branch ──
  // BranchPhoto has no compound unique on (branchId, url), so re-runs
  // would duplicate — clear and recreate scoped to the branch is the
  // simplest idempotency.
  await prisma.branchPhoto.deleteMany({ where: { branchId: COVELUM_MAIN_BRANCH_ID } })
  // PR-0.6: curated reference photos are pre-moderated → APPROVED, so they stay
  // visible under the discovery APPROVED filter (matches the migration backfill).
  await prisma.branchPhoto.createMany({
    data: [
      { branchId: COVELUM_MAIN_BRANCH_ID, url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=900&q=80', sortOrder: 0, moderationStatus: 'APPROVED' }, // dosa
      { branchId: COVELUM_MAIN_BRANCH_ID, url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=900&q=80', sortOrder: 1, moderationStatus: 'APPROVED' }, // thali plate
      { branchId: COVELUM_MAIN_BRANCH_ID, url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=900&q=80', sortOrder: 2, moderationStatus: 'APPROVED' }, // restaurant interior
      { branchId: COVELUM_MAIN_BRANCH_ID, url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80', sortOrder: 3, moderationStatus: 'APPROVED' }, // street view
    ],
  })

  // ── 4. Second branch — Colchester (multi-branch fixture) ──
  // Unblocks BranchesTab QA + the chip + picker (intentionally
  // hidden on single-branch merchants per the branch-aware spec).
  const covelum2ndLocationSnapshot = await buildBranchLocationSnapshot(COVELUM_2ND_BRANCH_ID)
  await prisma.branch.upsert({
    where:  { id: COVELUM_2ND_BRANCH_ID },
    update: { ...covelum2ndLocationSnapshot },
    create: {
      id:           COVELUM_2ND_BRANCH_ID,
      merchantId:   COVELUM_MERCHANT_ID,
      name:         'Covelum — Colchester',
      isMainBranch: false,
      addressLine1: '17 High Street',
      city:         'Colchester',
      postcode:     'CO1 1JN',
      country:      'GB',
      latitude:     51.8859,
      longitude:    0.9035,
      phone:        '+441206502800',
      email:        'colchester@covelum.test',
      redemptionPin: encrypt('1234'),
      isActive:     true,
      ...covelum2ndLocationSnapshot,
    },
  })
  // Slightly different schedule for variety so the two branches don't
  // look identical in the picker.
  const secondBranchHours: Array<{ dayOfWeek: number; openTime: string | null; closeTime: string | null; isClosed: boolean }> = [
    { dayOfWeek: 0, openTime: '12:00', closeTime: '21:00', isClosed: false }, // Sun
    { dayOfWeek: 1, openTime: '17:30', closeTime: '21:30', isClosed: false }, // Mon (open here, closed at main)
    { dayOfWeek: 2, openTime: '17:30', closeTime: '21:30', isClosed: false }, // Tue
    { dayOfWeek: 3, openTime: '17:30', closeTime: '21:30', isClosed: false }, // Wed
    { dayOfWeek: 4, openTime: '17:30', closeTime: '22:00', isClosed: false }, // Thu
    { dayOfWeek: 5, openTime: '12:00', closeTime: '22:30', isClosed: false }, // Fri
    { dayOfWeek: 6, openTime: '12:00', closeTime: '22:30', isClosed: false }, // Sat
  ]
  for (const h of secondBranchHours) {
    await prisma.branchOpeningHours.upsert({
      where:  { branchId_dayOfWeek: { branchId: COVELUM_2ND_BRANCH_ID, dayOfWeek: h.dayOfWeek } },
      update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
      create: { branchId: COVELUM_2ND_BRANCH_ID, ...h },
    })
  }

  // ── 5. Reviewer dev users + reviews ──
  // Review.@@unique([userId, branchId]) means each user can only review
  // each branch once → need 4 distinct users to seed 4 reviews on the main
  // branch. These are demo-only personas; emails resolve to redeemo.dev so
  // they're easy to spot in the User table.
  const reviewers: Array<{ email: string; phone: string; firstName: string; lastName: string }> = [
    { email: 'sarah.k@redeemo.dev',    phone: '+447700900101', firstName: 'Sarah',   lastName: 'Kennedy' },
    { email: 'james.m@redeemo.dev',    phone: '+447700900102', firstName: 'James',   lastName: 'Mitchell' },
    { email: 'priya.r@redeemo.dev',    phone: '+447700900103', firstName: 'Priya',   lastName: 'Rao' },
    { email: 'michael.b@redeemo.dev',  phone: '+447700900104', firstName: 'Michael', lastName: 'Bennett' },
  ]
  const reviewerIds: string[] = []
  for (const r of reviewers) {
    const u = await prisma.user.upsert({
      where:  { email: r.email },
      // Location fields set on BOTH update + create so re-runs restore
      // SAVED_PROFILE-fireable state even if columns were cleared.
      update: {
        postcode:           reviewerLocation.postcode,
        latitude:           reviewerLocation.latitude,
        longitude:          reviewerLocation.longitude,
        localityId:         reviewerLocation.localityId,
        postTown:           reviewerLocation.postTown,
        ladDistrict:        reviewerLocation.ladDistrict,
        adminCounty:        reviewerLocation.adminCounty,
        region:             reviewerLocation.region,
        country:            reviewerLocation.country,
        locationResolvedAt: reviewerLocation.locationResolvedAt,
        city:               reviewerLocation.city,
      },
      create: {
        email:            r.email,
        phone:            r.phone,
        phoneCountryCode: 'GB',
        passwordHash:     devHash('Reviewer1!'),
        firstName:        r.firstName,
        lastName:         r.lastName,
        status:           'ACTIVE',
        emailVerified:    true,
        phoneVerified:    true,
        tutorialSeen:     true,
        tcConsentVersion: '1.0',
        tcConsentAt:      new Date(),
        postcode:           reviewerLocation.postcode,
        latitude:           reviewerLocation.latitude,
        longitude:          reviewerLocation.longitude,
        localityId:         reviewerLocation.localityId,
        postTown:           reviewerLocation.postTown,
        ladDistrict:        reviewerLocation.ladDistrict,
        adminCounty:        reviewerLocation.adminCounty,
        region:             reviewerLocation.region,
        country:            reviewerLocation.country,
        locationResolvedAt: reviewerLocation.locationResolvedAt,
        city:               reviewerLocation.city,
      },
    })
    reviewerIds.push(u.id)
  }

  // 4 reviews on the main branch — varied ratings averaging ~4.5★. The
  // review upsert deliberately omits `isDeleted` (reserved schema field
  // for future admin-moderation hard-deletes; never set by customer-side
  // code). `isHidden:false` is the customer-side flag; revives or
  // recreates the visible state if a previous run left it hidden.
  //
  // INTENTIONAL DIVERGENCE from production `upsertBranchReview` (PR #33
  // fix-up #6 in src/api/customer/reviews/service.ts): on a hidden→visible
  // transition the production path runs a transaction that clears
  // ReviewHelpful + ReviewReport rows and resets `createdAt`. The seed
  // does NOT mirror that. Reasoning: the seed represents "deterministic
  // demo state restoration", not "user re-write". A tester re-running
  // the seed wants the same demo data back, not a fresh review whose
  // helpful counts and createdAt have been reset relative to what's
  // currently in the DB. The edge case where this matters (tester
  // manually marked a seeded review Helpful from another account, then
  // deleted it, then re-seeds) is acceptable to leave in the older
  // shape — production user-write paths get the cleanup, demo-state
  // restoration does not.
  const reviewCopy: Array<{ rating: number; comment: string }> = [
    { rating: 5, comment: 'Authentic South Indian food — the dosas are exceptional. Highly recommend the masala dosa with filter coffee.' },
    { rating: 4, comment: 'Lovely waterfront setting and great flavours. Service was a touch slow on a Saturday night but worth the wait.' },
    { rating: 5, comment: 'Properly authentic. Tasted just like home — the sambar and coconut chutney are spot on.' },
    { rating: 4, comment: 'Great find in Brightlingsea. Veggie-friendly menu and the staff are wonderful with kids.' },
  ]
  for (let i = 0; i < reviewerIds.length; i++) {
    const userId = reviewerIds[i]!
    const review = reviewCopy[i]!
    await prisma.review.upsert({
      where:  { userId_branchId: { userId, branchId: COVELUM_MAIN_BRANCH_ID } },
      update: { rating: review.rating, comment: review.comment, isHidden: false },
      create: { userId, branchId: COVELUM_MAIN_BRANCH_ID, rating: review.rating, comment: review.comment },
    })
  }

  // ── 6. Verified-redemption fixture ──
  // Sarah's review (index 0) becomes "verified" — the customer-app's
  // verified badge is gated on a validated VoucherRedemption for
  // (userId, branchId). Without a redemption, the verified-badge UX is
  // not exercisable in QA against this fixture. One redemption is enough
  // to demo the path; the other 3 reviewers stay unverified for visual
  // contrast.
  const sarahId = reviewerIds[0]!
  const covMainVoucher = await prisma.voucher.findUnique({
    where: { code: 'COV-RMV-001' },
    select: { id: true },
  })
  if (!covMainVoucher) {
    throw new Error("seedDemoMerchantEnrichment: COV-RMV-001 voucher missing — expected from seedTaxonomyTestMerchants")
  }
  // Stable redemptionCode for idempotency — VoucherRedemption.redemptionCode
  // is @unique, so re-runs upsert by code rather than creating duplicates.
  await prisma.voucherRedemption.upsert({
    where: { redemptionCode: 'DEMO-COV-VFY-001' },
    update: {
      isValidated:  true,
      isTestData:   true,
      // validatedAt set in `update` so re-runs refresh the timestamp; UI
      // doesn't display this for the verified-badge path but keeping it
      // current avoids stale "validated 6 months ago" data drift.
      validatedAt:  new Date(),
    },
    create: {
      redemptionCode:   'DEMO-COV-VFY-001',
      userId:           sarahId,
      voucherId:        covMainVoucher.id,
      branchId:         COVELUM_MAIN_BRANCH_ID,
      isValidated:      true,
      isTestData:       true,
      validatedAt:      new Date(),
      validationMethod: 'MANUAL',
      estimatedSaving:  4.00,
    },
  })

  console.log(
    `✓ Seeded demo enrichment for Covelum: logo + banner + website + ` +
    `opening hours (×2 branches) + 4 photos + 1 extra branch (Colchester) + ` +
    `4 reviewers + 4 reviews + 1 verified redemption`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home feed minimum-viable seed (Tier 1, owner-approved 2026-05-21)
//
// Populates `FeaturedMerchant` + `Campaign` tables so `getHomeFeed()`
// returns non-empty Featured + Campaign rails on dev DB. Stage 1-4
// seed enrichment did NOT scope these tables; Phase 2.3 Home device
// QA surfaced the gap. Source-of-truth data in
// `prisma/seed-data/homeFeedFixtures.ts`. All operations idempotent
// (upsert by stable id) — safe to re-run.
// ─────────────────────────────────────────────────────────────────────────────

async function seedHomeFeedFixtures(): Promise<void> {
  const now = new Date()
  // startDate intentionally in the past (1 day ago) so the home-feed
  // query's `startDate: { lte: now }` predicate fires immediately on
  // first seed run; endDate far in the future so the rails don't drift
  // out of range during demo.
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const endDate   = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  for (const f of FEATURED_MERCHANT_FIXTURES) {
    await prisma.featuredMerchant.upsert({
      where: { id: f.id },
      create: {
        id:             f.id,
        merchantId:     f.merchantId,
        startDate,
        endDate,
        costGbp:        100.00,
        radiusMiles:    50,
        targetLocations: [],
        sortByDistance: true,
        paymentStatus:  'PAID',
        isActive:       true,
      },
      update: {
        startDate,
        endDate,
        costGbp:        100.00,
        radiusMiles:    50,
        targetLocations: [],
        sortByDistance: true,
        paymentStatus:  'PAID',
        isActive:       true,
      },
    })
  }

  for (const c of CAMPAIGN_FIXTURES) {
    await prisma.campaign.upsert({
      where: { id: c.id },
      create: {
        id:              c.id,
        name:            c.name,
        description:     c.description,
        bannerImageUrl:  c.bannerImageUrl,
        startDate,
        endDate,
        status:          'ACTIVE',
        // Plan 4b deferred fields stay at schema defaults — explicit
        // empty arrays + nulls for clarity; the home-feed query at
        // service.ts:1270-1279 reads none of them in Plan 4a.
        targetLocations: [],
      },
      update: {
        name:            c.name,
        description:     c.description,
        bannerImageUrl:  c.bannerImageUrl,
        startDate,
        endDate,
        status:          'ACTIVE',
        targetLocations: [],
      },
    })
  }

  console.log(
    `✓ Home feed fixtures: ${FEATURED_MERCHANT_FIXTURES.length} active FeaturedMerchant ` +
    `+ ${CAMPAIGN_FIXTURES.length} active Campaign rows`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...')

  // ── Admin user ──
  const adminUser = await prisma.adminUser.upsert({
    where: { email: 'admin@redeemo.com' },
    update: {},
    create: {
      email: 'admin@redeemo.com',
      passwordHash: devHash('Admin1234!'),
      firstName: 'Redeemo',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  })
  console.log('Created admin user:', adminUser.email)

  // ── Subscription plans ──
  // Dev seed uses the dev placeholder price ids. The production-safe reference
  // seed (prisma/seed-reference.ts) passes REAL env-validated Stripe price ids.
  await seedSubscriptionPlans(prisma, {
    monthlyPriceId: 'price_monthly_dev',
    annualPriceId: 'price_annual_dev',
  })

  // ── Categories + Tags + Joins (taxonomy) ──
  await seedCategories(prisma)
  await seedTags(prisma)
  await seedSubcategoryTags(prisma)
  await seedRedundantHighlights(prisma)
  await seedAmenities(prisma)
  await seedCategoryAmenities(prisma)

  // ── Localities (UK gazetteer, ONSPD-derived; required before Branch/User writes can resolve postcodes) ──
  await seedLocalities(prisma)

  // ── Heuristic catchment edges (small Localities → up to 3 nearby big ones, within 12 mi) ──
  await seedHeuristicCatchmentEdges(prisma)

  // ── Curated catchment overrides (owner-approved natural-centre relationships per active Market) ──
  await seedCuratedCatchmentEdges(prisma)

  // ── Active Markets (Plan 4a rollout: Huddersfield Market only as of M1.15) ──
  await seedMarkets(prisma)

  // Fixed snapshots threaded into the customer-role upserts. NO postcodes.io
  // network call at seed time — see the SNAPSHOT_* constants block above for
  // the determinism rationale + how to refresh values if a postcode's admin
  // hierarchy ever changes.
  const customerLocation = await enrichCustomerLocationFromSnapshot(SNAPSHOT_HUDDERSFIELD_HD1_1AA)
  const reviewerLocation = await enrichCustomerLocationFromSnapshot(SNAPSHOT_BRIGHTLINGSEA_CO7_0AY)

  // Resolve top-level IDs needed for downstream RMV/merchant seeding.
  const foodCatId = topLevelIdByName.get('Food & Drink')
  const beautyCatId = topLevelIdByName.get('Beauty & Wellness')
  if (!foodCatId || !beautyCatId) {
    throw new Error('Expected top-level categories Food & Drink and Beauty & Wellness to exist after seedCategories')
  }

  // ── RMV Templates ──
  await seedRmvTemplates(prisma, foodCatId, beautyCatId)

  // ── Interests ──
  await seedInterests(prisma)

  // ── Dev customer ──
  const customer = await prisma.user.upsert({
    where: { email: 'customer@redeemo.com' },
    update: {
      postcode:           customerLocation.postcode,
      latitude:           customerLocation.latitude,
      longitude:          customerLocation.longitude,
      localityId:         customerLocation.localityId,
      postTown:           customerLocation.postTown,
      ladDistrict:        customerLocation.ladDistrict,
      adminCounty:        customerLocation.adminCounty,
      region:             customerLocation.region,
      country:            customerLocation.country,
      locationResolvedAt: customerLocation.locationResolvedAt,
      city:               customerLocation.city,
    },
    create: {
      email: 'customer@redeemo.com',
      phone: '+447700900001',
      phoneCountryCode: 'GB',
      passwordHash: devHash('Customer1234!'),
      firstName: 'Jane',
      lastName: 'Smith',
      status: 'ACTIVE',
      tutorialSeen: true,
      tcConsentVersion: '1.0',
      tcConsentAt: new Date(),
      postcode:           customerLocation.postcode,
      latitude:           customerLocation.latitude,
      longitude:          customerLocation.longitude,
      localityId:         customerLocation.localityId,
      postTown:           customerLocation.postTown,
      ladDistrict:        customerLocation.ladDistrict,
      adminCounty:        customerLocation.adminCounty,
      region:             customerLocation.region,
      country:            customerLocation.country,
      locationResolvedAt: customerLocation.locationResolvedAt,
      city:               customerLocation.city,
    },
  })
  console.log('Created dev customer:', customer.email)

  // ── Dev merchant ──
  const merchant = await prisma.merchant.upsert({
    where: { id: 'dev-merchant-001' },
    update: {},
    create: {
      id: 'dev-merchant-001',
      businessName: 'The Coffee House',
      tradingName: 'The Coffee House',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus: 'SIGNED',
      contractStartDate: new Date(),
      contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      description: 'A cosy independent coffee shop in central London.',
      categories: {
        create: [{ categoryId: foodCatId, isPrimary: true }],
      },
    },
  })

  // ── Dev merchant admin ──
  const merchantAdmin = await prisma.merchantAdmin.upsert({
    where: { email: 'merchant@redeemo.com' },
    update: {},
    create: {
      // M6b (D-1): no merchantId — the OWNER membership below is the sole link.
      email: 'merchant@redeemo.com',
      passwordHash: devHash('Merchant1234!'),
      firstName: 'John',
      lastName: 'Doe',
      jobTitle: 'Owner',
      status: 'ACTIVE',
    },
  })

  // ── Dev merchant OWNER membership (Phase 2 Slice 1 M1) ──
  // MerchantMembership is the ownership source of truth for management-side
  // resolution (resolveAdminMerchant). Created alongside the admin so a freshly
  // seeded DB resolves correctly — the migration backfill only covers admins
  // that existed when it ran. MerchantAdmin.merchantId is KEPT (transitional).
  await prisma.merchantMembership.upsert({
    where: { merchantId_merchantAdminId: { merchantId: merchant.id, merchantAdminId: merchantAdmin.id } },
    update: {},
    create: {
      merchantId: merchant.id,
      merchantAdminId: merchantAdmin.id,
      role: 'OWNER',
      allBranches: true,
      status: 'ACTIVE',
    },
  })

  // ── Dev branch ──
  const devBranchLocationSnapshot = await buildBranchLocationSnapshot('dev-branch-001')
  const branch = await prisma.branch.upsert({
    where: { id: 'dev-branch-001' },
    update: { ...devBranchLocationSnapshot },
    create: {
      id: 'dev-branch-001',
      merchantId: merchant.id,
      name: 'Main Branch',
      isMainBranch: true,
      addressLine1: '12 High Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      country: 'GB',
      latitude: 51.5194,
      longitude: -0.0988,
      phone: '+442071234567',
      email: 'london@thecoffeehouse.com',
      redemptionPin: encrypt('1234'),
      isActive: true,
      ...devBranchLocationSnapshot,
    },
  })

  // ── Dev branch user ──
  await prisma.branchUser.upsert({
    where: { email: 'staff@redeemo.com' },
    update: {},
    create: {
      branchId: branch.id,
      email: 'staff@redeemo.com',
      passwordHash: devHash('Staff1234!'),
      firstName: 'Alice',
      lastName: 'Staff',
      jobTitle: 'Barista',
      status: 'ACTIVE',
    },
  })
  console.log('Created dev merchant, branch, and users')

  // ── Dev vouchers ──
  await prisma.voucher.upsert({
    where: { code: 'RMV-001' },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'RMV-001',
      isMandatory: true,
      type: 'BOGO',
      title: 'Buy One Get One Free Coffee',
      description: 'Buy any coffee and get a second one of equal or lesser value for free.',
      terms: 'In-house only. Cannot be combined with other offers. Can only be redeemed once per month by the same user.',
      estimatedSaving: 3.50,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
    },
  })

  await prisma.voucher.upsert({
    where: { code: 'RMV-002' },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'RMV-002',
      isMandatory: true,
      type: 'DISCOUNT_PERCENT',
      title: '20% Off Any Meal',
      description: 'Get 20% off your total food bill.',
      terms: 'In-house only. Cannot be combined with other offers. Can only be redeemed once per month by the same user.',
      estimatedSaving: 5.00,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
    },
  })
  console.log('Created dev vouchers')

  // ── CMS content placeholders ──
  await seedCmsContent(prisma)

  // ── Test merchants exercising taxonomy descriptor + highlight scenarios ──
  await seedTaxonomyTestMerchants()

  // ── Demo-ready enrichment for one merchant (Covelum) ──
  // Runs AFTER taxonomy test merchants so the merchant + its main branch
  // already exist; this layer adds logo / banner / hours / photos / 2nd
  // branch / reviewers / reviews / verified redemption on top.
  await seedDemoMerchantEnrichment(reviewerLocation)

  // ── Home feed minimum-viable seed (Tier 1, owner-approved 2026-05-21) ──
  // Populates the `FeaturedMerchant` + `Campaign` tables that
  // `getHomeFeed()` reads but the Stage 1-4 seed enrichment did not
  // touch. Without these rows, Home's <FeaturedCarousel> and
  // <CampaignCarousel> rails render empty on dev DB. Runs AFTER demo
  // merchant enrichment so the FK targets (merchant IDs) exist + are
  // ACTIVE.
  await seedHomeFeedFixtures()

  // ── Backfill denormalised merchant counts ──
  await recomputeCategoryCounts(prisma)
  await recomputeTagCounts(prisma)
  console.log('✓ Recomputed merchantCountByCity for categories and tags')

  // ── SEC-C3 (Gate-PR-4a): mark ALL seeded marketplace rows as test data ──
  // The seed is the SOLE source of merchant/branch/voucher data in dev, so every
  // row it created is demo/test data. Customer-facing APIs exclude isTestData=true
  // (Gate-PR-4b) so this fake supply can never render as real pre-launch. Bulk
  // updateMany is correct here because the dev DB contains only seeded rows; the
  // seed is never run against production.
  const [mt, bt, vt] = await Promise.all([
    prisma.merchant.updateMany({ data: { isTestData: true } }),
    prisma.branch.updateMany({ data: { isTestData: true } }),
    prisma.voucher.updateMany({ data: { isTestData: true } }),
  ])
  console.log(`✓ Marked seed data as test: ${mt.count} merchants, ${bt.count} branches, ${vt.count} vouchers`)

  console.log('✅ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
