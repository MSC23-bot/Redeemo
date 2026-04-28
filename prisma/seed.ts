import { PrismaClient, TagType, TagCreatedBy } from '../generated/prisma/client'
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
            minSubcategoryCountForChips: 3,
            isActive: true,
          },
        })
      : await prisma.category.create({
          data: {
            name: cat.name,
            parentId: null,
            sortOrder: cat.sortOrder,
            pinColour: cat.pinColour,
            pinIcon: cat.pinIcon,
            descriptorState: null,
            minSubcategoryCountForChips: 3,
            isActive: true,
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
        minSubcategoryCountForChips: 3,
        isActive: true,
      },
      create: {
        name: sub.name,
        parentId,
        sortOrder: sub.sortOrder,
        descriptorState: sub.descriptorState,
        descriptorSuffix: sub.descriptorSuffix ?? null,
        minSubcategoryCountForChips: 3,
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

  // ── Amenities ──
  for (const name of ['Free WiFi', 'Parking', 'Accessible', 'Outdoor Seating', 'Takeaway', 'Delivery', 'Card Payment', 'Cash Only']) {
    await prisma.amenity.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    })
  }
  console.log('Created amenities')

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
