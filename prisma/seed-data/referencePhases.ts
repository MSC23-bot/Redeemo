// ─────────────────────────────────────────────────────────────────────────────
// Shared reference-data seed phases
//
// Extracted verbatim from prisma/seed.ts (PR1, behaviour-preserving). These are
// the idempotent reference-taxonomy phases — categories, tags, subcategory-tag
// joins, redundant-highlight rules, amenities, category-amenity rules, and
// localities. They are kept separate so a future `prisma/seed-reference.ts` can
// run only the reference phases without the demo/fixture data in seed.ts.
//
// Each function takes the PrismaClient as its first argument (the original
// bodies referenced a module-level `prisma` in seed.ts). The module-level maps
// below are populated by these phases and read by later phases (both here and
// by the demo phases that remain in seed.ts) — they are exported so seed.ts can
// continue to consume the resolved IDs.
//
// This module has NO top-level side effects (no adapter creation, no dotenv, no
// encryption-key requirement).
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient, TagType, TagCreatedBy } from '../../generated/prisma/client'
import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from './categories'
import { ALL_TAGS, CUISINE_TAGS } from './tags'
import {
  SPECIALTY_PARENT,
  FOOD_DRINK_SUBCATS_FOR_CUISINE,
  PRIMARY_CUISINE_SUBCATEGORIES,
} from './subcategoryTags'
import { REDUNDANT_HIGHLIGHTS } from './redundantHighlights'
import { AMENITIES } from './amenities'
import { CATEGORY_AMENITIES } from './categoryAmenities'
import { ONSPD_LOCALITIES } from './onspd-localities'

// ── Maps populated by the taxonomy phases below; consumed by later phases ──
type SubcatKey = `${string}::${string}`  // `${name}::${parentId}`
export const topLevelIdByName = new Map<string, string>()
export const subcategoryIdByNameAndParent = new Map<SubcatKey, string>()
export const subcategoryIdsByName = new Map<string, string[]>()  // handles cross-listings (e.g. Aesthetics Clinic)
export const tagIdByLabelAndType = new Map<string, string>()     // `${label}:${type}` → id
export const amenityIdByName = new Map<string, string>()

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

export async function seedCategories(prisma: PrismaClient): Promise<void> {
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

export async function seedTags(prisma: PrismaClient): Promise<void> {
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

export async function seedSubcategoryTags(prisma: PrismaClient): Promise<void> {
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

export async function seedRedundantHighlights(prisma: PrismaClient): Promise<void> {
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

export async function seedAmenities(prisma: PrismaClient): Promise<void> {
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

export async function seedCategoryAmenities(prisma: PrismaClient): Promise<void> {
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

export async function seedLocalities(prisma: PrismaClient): Promise<void> {
  let inserted = 0
  let skipped = 0
  for (const loc of ONSPD_LOCALITIES) {
    const result = await prisma.locality.upsert({
      where: { slug: loc.slug },
      create: {
        name: loc.name,
        slug: loc.slug,
        postTown: loc.postTown,
        ladDistrict: loc.ladDistrict,
        adminCounty: loc.adminCounty,
        region: loc.region,
        country: loc.country,
        centerLat: loc.centerLat,
        centerLng: loc.centerLng,
        populationTier: loc.populationTier,
      },
      update: {
        // Update everything except marketId/needsReview (those are managed by other scripts)
        name: loc.name,
        postTown: loc.postTown,
        ladDistrict: loc.ladDistrict,
        adminCounty: loc.adminCounty,
        region: loc.region,
        country: loc.country,
        centerLat: loc.centerLat,
        centerLng: loc.centerLng,
        populationTier: loc.populationTier,
      },
    })
    if (result.createdAt.getTime() === result.updatedAt.getTime()) inserted++
    else skipped++
  }
  console.log(`Seeded localities: ${inserted} new, ${skipped} existing`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference / config seed phases (PR2a — extracted verbatim from seed.ts main()).
//
// These are the remaining inline reference/config blocks: subscription plans,
// RMV templates, interests, and CMS-content placeholders. They are pure config
// data (string/number literals) plus idempotent upserts; no demo/fixture state.
// The dev Stripe price IDs and CMS placeholder strings are intentionally
// UNCHANGED here — a future `prisma/seed-reference.ts` (PR2b) handles swapping
// in env-driven Stripe IDs and real CMS content.
// ─────────────────────────────────────────────────────────────────────────────

// The Stripe price ids are passed in by the caller: the full dev seed passes the
// dev placeholders ('price_monthly_dev' / 'price_annual_dev'); the production-safe
// reference seed passes REAL, env-validated Stripe price ids. The upsert key is
// stripePriceId, so dev and prod databases hold their own plan rows without
// conflict (different databases, different ids).
export async function seedSubscriptionPlans(
  prisma: PrismaClient,
  priceIds: { monthlyPriceId: string; annualPriceId: string },
): Promise<void> {
  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: priceIds.monthlyPriceId },
    update: {},
    create: {
      name: 'Monthly',
      description: 'Unlimited voucher redemptions, billed monthly',
      priceGbp: 6.99,
      billingInterval: 'MONTHLY',
      stripePriceId: priceIds.monthlyPriceId,
      isActive: true,
      sortOrder: 1,
    },
  })

  const annualPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: priceIds.annualPriceId },
    update: {},
    create: {
      name: 'Annual',
      description: 'Unlimited voucher redemptions, billed annually (~2 months free)',
      priceGbp: 69.99,
      billingInterval: 'ANNUAL',
      stripePriceId: priceIds.annualPriceId,
      isActive: true,
      sortOrder: 2,
    },
  })
  console.log('Created subscription plans:', monthlyPlan.name, annualPlan.name)
}

export async function seedRmvTemplates(
  prisma: PrismaClient,
  foodCatId: string,
  beautyCatId: string,
): Promise<void> {
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
}

export async function seedInterests(prisma: PrismaClient): Promise<void> {
  for (const name of ['Food & Dining', 'Beauty & Skincare', 'Fitness & Sport', 'Shopping', 'Entertainment & Events', 'Travel & Leisure', 'Health & Wellbeing', 'Professional Development']) {
    await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    })
  }
  console.log('Created interests')
}

export async function seedCmsContent(prisma: PrismaClient): Promise<void> {
  for (const key of ['terms_and_conditions', 'privacy_policy', 'about_us', 'help_faq']) {
    await prisma.cmsContent.upsert({
      where: { key },
      update: {},
      create: { key, content: `[${key.replace(/_/g, ' ').toUpperCase()} — to be filled by admin]` },
    })
  }
  console.log('Created CMS content placeholders')
}
