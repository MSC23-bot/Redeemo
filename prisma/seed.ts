import { PrismaClient, TagType, TagCreatedBy, VoucherType } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as crypto from 'crypto'
import { encrypt } from '../src/api/shared/encryption'
import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from './seed-data/categories'
import { ALL_TAGS, CUISINE_TAGS } from './seed-data/tags'
import {
  SPECIALTY_PARENT,
  FOOD_DRINK_SUBCATS_FOR_CUISINE,
  PRIMARY_CUISINE_SUBCATEGORIES,
} from './seed-data/subcategoryTags'
import { REDUNDANT_HIGHLIGHTS } from './seed-data/redundantHighlights'
import { AMENITIES } from './seed-data/amenities'
import { CATEGORY_AMENITIES } from './seed-data/categoryAmenities'
import { recomputeCategoryCounts, recomputeTagCounts } from '../src/api/lib/merchantCount'

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'a'.repeat(64)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Simple hash for dev seed only — use bcrypt in production API code
function devHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// ── Maps populated by the taxonomy phases below; consumed by later phases ──
type SubcatKey = `${string}::${string}`  // `${name}::${parentId}`
const topLevelIdByName = new Map<string, string>()
const subcategoryIdByNameAndParent = new Map<SubcatKey, string>()
const subcategoryIdsByName = new Map<string, string[]>()  // handles cross-listings (e.g. Aesthetics Clinic)
const tagIdByLabelAndType = new Map<string, string>()     // `${label}:${type}` → id
const amenityIdByName = new Map<string, string>()

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

async function seedCategories(): Promise<void> {
  // Migration step: rename old top-levels in place (preserves Category IDs so
  // existing RmvTemplate and MerchantCategory FK rows stay valid).
  await prisma.category.updateMany({
    where: { name: 'Retail & Shopping' },
    data: { name: 'Shopping' },
  })
  await prisma.category.updateMany({
    where: { name: 'Entertainment' },
    data: { name: 'Out & About' },
  })
  await prisma.category.updateMany({
    where: { name: 'Professional Services' },
    data: { name: 'Home & Local Services' },
  })

  // Migration step: delete legacy 5 sample subcategories. None of these names
  // match the new 89; if left in place they would collide with the integrity
  // test. Guard: if any MerchantCategory rows reference these legacy subcats,
  // skip the delete and warn — refuses to silently orphan merchant linkages.
  const LEGACY_SUBCAT_NAMES = ['Restaurants', 'Cafes & Coffee', 'Bars & Pubs', 'Hair Salons', 'Nail & Beauty']
  const orphanCount = await prisma.merchantCategory.count({
    where: {
      category: { name: { in: LEGACY_SUBCAT_NAMES }, parentId: { not: null } },
    },
  })
  if (orphanCount > 0) {
    console.warn(
      `⚠ seedCategories: ${orphanCount} MerchantCategory row(s) reference legacy subcategories ` +
      `(${LEGACY_SUBCAT_NAMES.join(', ')}). Skipping deleteMany to avoid orphaning. ` +
      `Run a one-off migration to relink merchants before re-running seed.`
    )
  } else {
    await prisma.category.deleteMany({
      where: {
        name: { in: LEGACY_SUBCAT_NAMES },
        parentId: { not: null },
      },
    })
  }

  // Top-level categories (11). The Category compound unique
  // `(name, parentId)` is `NULLS NOT DISTINCT` at the DB level, but Prisma's
  // generated TS types disallow `parentId: null` in the compound where clause.
  // Manual find-then-upsert keeps the seed type-safe and idempotent.
  for (const cat of TOP_LEVEL_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, parentId: null },
      select: { id: true },
    })
    const row = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: {
            sortOrder: cat.sortOrder,
            pinColour: cat.pinColour,
            pinIcon: cat.pinIcon,
            descriptorState: null,
            isActive: true,
            intentType: cat.intentType,
          },
        })
      : await prisma.category.create({
          data: {
            name: cat.name,
            sortOrder: cat.sortOrder,
            pinColour: cat.pinColour,
            pinIcon: cat.pinIcon,
            descriptorState: null,
            isActive: true,
            intentType: cat.intentType,
          },
        })
    topLevelIdByName.set(cat.name, row.id)
  }

  // Subcategories (89). Aesthetics Clinic appears under both Beauty & Wellness
  // and Health & Medical — the compound (name, parentId) unique gives us two
  // distinct IDs. We track both per-parent lookup AND a name → ids[] map for
  // RedundantHighlight fan-out.
  for (const sub of SUBCATEGORIES) {
    const parentId = topLevelIdByName.get(sub.parent)
    if (!parentId) {
      throw new Error(`seedCategories: subcategory '${sub.name}' references unknown parent '${sub.parent}'`)
    }
    const row = await prisma.category.upsert({
      where: { name_parentId: { name: sub.name, parentId } },
      update: {
        sortOrder: sub.sortOrder,
        descriptorState: sub.descriptorState,
        descriptorSuffix: sub.descriptorSuffix ?? null,
        isActive: true,
      },
      create: {
        name: sub.name,
        parent: { connect: { id: parentId } },
        sortOrder: sub.sortOrder,
        descriptorState: sub.descriptorState,
        descriptorSuffix: sub.descriptorSuffix ?? null,
        isActive: true,
      },
    })
    subcategoryIdByNameAndParent.set(`${sub.name}::${parentId}`, row.id)
    const existing = subcategoryIdsByName.get(sub.name) ?? []
    existing.push(row.id)
    subcategoryIdsByName.set(sub.name, existing)
  }

  console.log(`✓ Seeded ${TOP_LEVEL_CATEGORIES.length} top-level categories, ${SUBCATEGORIES.length} subcategories`)
}

async function seedTags(): Promise<void> {
  for (const t of ALL_TAGS) {
    const row = await prisma.tag.upsert({
      where: { label_type: { label: t.label, type: t.type } },
      update: {
        descriptorEligible: t.descriptorEligible,
        isActive: true,
        createdBy: TagCreatedBy.SYSTEM,
      },
      create: {
        label: t.label,
        type: t.type as TagType,
        descriptorEligible: t.descriptorEligible,
        isActive: true,
        createdBy: TagCreatedBy.SYSTEM,
      },
    })
    tagIdByLabelAndType.set(`${t.label}:${t.type}`, row.id)
  }
  console.log(`✓ Seeded ${ALL_TAGS.length} tags`)
}

async function seedSubcategoryTags(): Promise<void> {
  type Link = { subcategoryId: string; tagId: string; isPrimaryEligible: boolean }
  const links: Link[] = []
  // Some pairs may collide (e.g. specialty + universal both target the same
  // subcategory if a specialty tag were also a highlight — not in our data,
  // but defend anyway). Dedupe via `${subcategoryId}|${tagId}` key, preferring
  // isPrimaryEligible=true wins.
  const seen = new Map<string, Link>()
  const push = (link: Link) => {
    const k = `${link.subcategoryId}|${link.tagId}`
    const prior = seen.get(k)
    if (!prior) {
      seen.set(k, link)
      return
    }
    if (link.isPrimaryEligible && !prior.isPrimaryEligible) {
      seen.set(k, link)
    }
  }

  // Cuisine → all Food & Drink subcategories listed in FOOD_DRINK_SUBCATS_FOR_CUISINE.
  // isPrimaryEligible follows PRIMARY_CUISINE_SUBCATEGORIES.
  for (const cuisine of CUISINE_TAGS) {
    const tagId = tagIdByLabelAndType.get(`${cuisine.label}:${cuisine.type}`)
    if (!tagId) {
      throw new Error(`seedSubcategoryTags: missing tag id for cuisine '${cuisine.label}'`)
    }
    for (const subName of FOOD_DRINK_SUBCATS_FOR_CUISINE) {
      const subIds = subcategoryIdsByName.get(subName) ?? []
      if (subIds.length === 0) {
        throw new Error(`seedSubcategoryTags: missing subcategory '${subName}' for cuisine wiring`)
      }
      for (const subcategoryId of subIds) {
        push({
          subcategoryId,
          tagId,
          isPrimaryEligible: PRIMARY_CUISINE_SUBCATEGORIES.has(subName),
        })
      }
    }
  }

  // Specialty → every subcategory whose parent matches the specialty's parent
  // (per SPECIALTY_PARENT). isPrimaryEligible follows the tag's
  // descriptorEligible flag.
  for (const [specialtyLabel, parentName] of Object.entries(SPECIALTY_PARENT)) {
    const tagId = tagIdByLabelAndType.get(`${specialtyLabel}:SPECIALTY`)
    if (!tagId) {
      throw new Error(`seedSubcategoryTags: missing tag id for specialty '${specialtyLabel}'`)
    }
    const tag = ALL_TAGS.find((t) => t.label === specialtyLabel && t.type === 'SPECIALTY')
    const isPrimaryEligible = tag?.descriptorEligible ?? false
    const subcatsUnderParent = SUBCATEGORIES.filter((s) => s.parent === parentName)
    for (const sub of subcatsUnderParent) {
      const parentId = topLevelIdByName.get(sub.parent)
      if (!parentId) continue
      const subId = subcategoryIdByNameAndParent.get(`${sub.name}::${parentId}`)
      if (!subId) continue
      push({ subcategoryId: subId, tagId, isPrimaryEligible })
    }
  }

  // Highlights & Details → universal: link every tag to every subcategory.
  // isPrimaryEligible: false (highlights/details are never descriptor-eligible).
  const universalTagIds: string[] = []
  for (const t of ALL_TAGS) {
    if (t.type === 'HIGHLIGHT' || t.type === 'DETAIL') {
      const tagId = tagIdByLabelAndType.get(`${t.label}:${t.type}`)
      if (tagId) universalTagIds.push(tagId)
    }
  }
  for (const sub of SUBCATEGORIES) {
    const parentId = topLevelIdByName.get(sub.parent)
    if (!parentId) continue
    const subId = subcategoryIdByNameAndParent.get(`${sub.name}::${parentId}`)
    if (!subId) continue
    for (const tagId of universalTagIds) {
      push({ subcategoryId: subId, tagId, isPrimaryEligible: false })
    }
  }

  for (const link of seen.values()) {
    links.push(link)
  }

  // Idempotent: createMany skipDuplicates relies on the
  // (subcategoryId, tagId) compound unique. Re-running seed is safe.
  const result = await prisma.subcategoryTag.createMany({
    data: links,
    skipDuplicates: true,
  })

  console.log(`✓ Wired ${links.length} subcategory-tag link candidates (${result.count} new rows inserted)`)
}

async function seedRedundantHighlights(): Promise<void> {
  let rowsWritten = 0
  for (const rule of REDUNDANT_HIGHLIGHTS) {
    const subIds = subcategoryIdsByName.get(rule.subcategoryName) ?? []
    if (subIds.length === 0) {
      // Spec note: rules referencing names not in seed inventory are silently
      // skipped (Cocktail Bar / Dog-Friendly etc.). Current data has no such
      // gap, but stay defensive.
      continue
    }
    for (const highlightLabel of rule.highlightLabels) {
      const highlightId = tagIdByLabelAndType.get(`${highlightLabel}:HIGHLIGHT`)
      if (!highlightId) continue
      for (const subcategoryId of subIds) {
        await prisma.redundantHighlight.upsert({
          where: {
            subcategoryId_highlightTagId: { subcategoryId, highlightTagId: highlightId },
          },
          update: { reason: rule.reason },
          create: { subcategoryId, highlightTagId: highlightId, reason: rule.reason },
        })
        rowsWritten += 1
      }
    }
  }
  console.log(`✓ Seeded ${rowsWritten} redundant-highlight rows from ${REDUNDANT_HIGHLIGHTS.length} rules`)
}

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
  // newer non-London QA fixtures include the 2 mandatory + N custom set.
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
        code: 'COV-RCV-001',
        isMandatory: false,
        type: 'FREEBIE',
        title: 'Free Filter Coffee with Any Thali',
        description: 'Order any thali plate and get a complimentary South Indian filter coffee.',
        terms: 'In-house only. Cannot be combined with other offers. Once per cycle.',
        estimatedSaving: 2.50,
      },
    ],
    branch: {
      id: 'tax-branch-covelum-001',
      name: 'Covelum — Brightlingsea',
      addressLine1: '27 Waterside',
      city: 'Brightlingsea',
      postcode: 'CO7 0AY',
      latitude: 51.8054,
      longitude: 1.0244,
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
    await prisma.branch.upsert({
      where: { id: spec.branch.id },
      update: {},
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
    // non-London QA fixtures) include 2 mandatory + N custom; codes are
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

async function seedAmenities(): Promise<void> {
  for (const a of AMENITIES) {
    const row = await prisma.amenity.upsert({
      where:  { name: a.name },
      update: {},
      create: { name: a.name, iconUrl: a.iconUrl, isActive: true },
    })
    amenityIdByName.set(a.name, row.id)
  }
  console.log(`Seeded ${AMENITIES.length} amenities`)
}

async function seedCategoryAmenities(): Promise<void> {
  const rows: { categoryId: string; amenityId: string }[] = []
  for (const rule of CATEGORY_AMENITIES) {
    const amenityId = amenityIdByName.get(rule.amenityName)
    if (!amenityId) {
      throw new Error(`seedCategoryAmenities: amenity '${rule.amenityName}' not found`)
    }

    let categoryId: string | undefined
    if (rule.parentCategoryName) {
      const parentId = topLevelIdByName.get(rule.parentCategoryName)
      if (!parentId) throw new Error(`seedCategoryAmenities: parent '${rule.parentCategoryName}' not found`)
      categoryId = subcategoryIdByNameAndParent.get(`${rule.categoryName}::${parentId}`)
    } else {
      categoryId = topLevelIdByName.get(rule.categoryName)
    }
    if (!categoryId) {
      throw new Error(
        `seedCategoryAmenities: category '${rule.categoryName}'` +
        (rule.parentCategoryName ? ` (under '${rule.parentCategoryName}')` : '') +
        ' not found',
      )
    }

    rows.push({ categoryId, amenityId })
  }

  await prisma.categoryAmenity.createMany({ data: rows, skipDuplicates: true })
  console.log(`Seeded ${rows.length} CategoryAmenity rules`)
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
  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: 'price_monthly_dev' },
    update: {},
    create: {
      name: 'Monthly',
      description: 'Unlimited voucher redemptions, billed monthly',
      priceGbp: 6.99,
      billingInterval: 'MONTHLY',
      stripePriceId: 'price_monthly_dev',
      isActive: true,
      sortOrder: 1,
    },
  })

  const annualPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: 'price_annual_dev' },
    update: {},
    create: {
      name: 'Annual',
      description: 'Unlimited voucher redemptions, billed annually (~2 months free)',
      priceGbp: 69.99,
      billingInterval: 'ANNUAL',
      stripePriceId: 'price_annual_dev',
      isActive: true,
      sortOrder: 2,
    },
  })
  console.log('Created subscription plans:', monthlyPlan.name, annualPlan.name)

  // ── Categories + Tags + Joins (taxonomy) ──
  await seedCategories()
  await seedTags()
  await seedSubcategoryTags()
  await seedRedundantHighlights()
  await seedAmenities()
  await seedCategoryAmenities()

  // Resolve top-level IDs needed for downstream RMV/merchant seeding.
  const foodCatId = topLevelIdByName.get('Food & Drink')
  const beautyCatId = topLevelIdByName.get('Beauty & Wellness')
  if (!foodCatId || !beautyCatId) {
    throw new Error('Expected top-level categories Food & Drink and Beauty & Wellness to exist after seedCategories')
  }

  // ── RMV Templates ──
  // Food & Drink — suitable for restaurants, cafes, bars
  const rmvFoodTemplates = [
    {
      voucherType: 'BOGO' as const,
      title: 'Buy One Get One Free',
      description: 'Customer gets a second item free when they purchase one at full price.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '25% Off Your Total Bill',
      description: 'Customer receives 25% off their total food/drink bill.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvFoodTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: foodCatId, title: t.title } },
      update: {},
      create: { ...t, categoryId: foodCatId, isActive: true },
    })
  }

  // Beauty & Wellness — suitable for salons, spas, nail bars
  const rmvBeautyTemplates = [
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '20% Off Your First Visit',
      description: 'New customers receive 20% off any service on their first visit.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'FREEBIE' as const,
      title: 'Free Treatment with Any Booking',
      description: 'Customer receives a complimentary add-on treatment with any full-price booking.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvBeautyTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: beautyCatId, title: t.title } },
      update: {},
      create: { ...t, categoryId: beautyCatId, isActive: true },
    })
  }

  // Generic fallback templates for remaining top-level categories.
  // Note: top-level names changed in this seed (Retail & Shopping → Shopping,
  // Entertainment → Out & About, Professional Services → Home & Local Services).
  const otherCats = await prisma.category.findMany({
    where: {
      name: { in: ['Health & Fitness', 'Shopping', 'Out & About', 'Home & Local Services'] },
      parentId: null,
    },
  })
  for (const cat of otherCats) {
    const genericTemplates = [
      {
        voucherType: 'DISCOUNT_PERCENT' as const,
        title: '20% Off',
        description: 'Customer receives 20% off any product or service.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 5.00,
      },
      {
        voucherType: 'SPEND_AND_SAVE' as const,
        title: 'Spend £30, Save £10',
        description: 'Customer saves £10 when they spend £30 or more.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 10.00,
      },
    ]
    for (const t of genericTemplates) {
      await prisma.rmvTemplate.upsert({
        where: { categoryId_title: { categoryId: cat.id, title: t.title } },
        update: {},
        create: { ...t, categoryId: cat.id, isActive: true },
      })
    }
  }
  console.log('Created RMV templates')

  // ── Interests ──
  for (const name of ['Food & Dining', 'Beauty & Skincare', 'Fitness & Sport', 'Shopping', 'Entertainment & Events', 'Travel & Leisure', 'Health & Wellbeing', 'Professional Development']) {
    await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    })
  }
  console.log('Created interests')

  // ── Dev customer ──
  const customer = await prisma.user.upsert({
    where: { email: 'customer@redeemo.com' },
    update: {},
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
  await prisma.merchantAdmin.upsert({
    where: { email: 'merchant@redeemo.com' },
    update: {},
    create: {
      merchantId: merchant.id,
      email: 'merchant@redeemo.com',
      passwordHash: devHash('Merchant1234!'),
      firstName: 'John',
      lastName: 'Doe',
      jobTitle: 'Owner',
      status: 'ACTIVE',
    },
  })

  // ── Dev branch ──
  const branch = await prisma.branch.upsert({
    where: { id: 'dev-branch-001' },
    update: {},
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
  for (const key of ['terms_and_conditions', 'privacy_policy', 'about_us', 'help_faq']) {
    await prisma.cmsContent.upsert({
      where: { key },
      update: {},
      create: { key, content: `[${key.replace(/_/g, ' ').toUpperCase()} — to be filled by admin]` },
    })
  }
  console.log('Created CMS content placeholders')

  // ── Test merchants exercising taxonomy descriptor + highlight scenarios ──
  await seedTaxonomyTestMerchants()

  // ── Backfill denormalised merchant counts ──
  await recomputeCategoryCounts(prisma)
  await recomputeTagCounts(prisma)
  console.log('✓ Recomputed merchantCountByCity for categories and tags')

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
