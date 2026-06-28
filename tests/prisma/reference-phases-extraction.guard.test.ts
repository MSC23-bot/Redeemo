import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// PR1 (production-safe reference seed, step 1): the reference-data phases are
// extracted from prisma/seed.ts into a reusable, side-effect-free module so a
// future prisma/seed-reference.ts (PR2) can call them. These static guards pin:
//   - the module is REFERENCE-ONLY (it never WRITES a demo/marketplace model);
//   - the demo/supply phases still live + run only in the full seed;
//   - the PR2 reference-only ENTRYPOINT is not added yet.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const REF = 'prisma/seed-data/referencePhases.ts'
const SEED = 'prisma/seed.ts'

const REFERENCE_PHASES = [
  // PR1 — taxonomy / locality phases
  'seedCategories', 'seedTags', 'seedSubcategoryTags', 'seedRedundantHighlights',
  'seedAmenities', 'seedCategoryAmenities', 'seedLocalities',
  // PR2a — extracted inline reference/config blocks
  'seedSubscriptionPlans', 'seedRmvTemplates', 'seedInterests', 'seedCmsContent',
] as const

// Marketplace / activity models that must NEVER be written by the reference module.
const DEMO_MODELS =
  'merchant|branch|voucher|user|review|voucherRedemption|subscription|merchantAdmin|' +
  'branchUser|featuredMerchant|campaign|adminUser|merchantCategory|merchantTag|' +
  'merchantHighlight|branchAmenity|branchPhoto|branchOpeningHours'
const WRITE = 'create|createMany|upsert|update|updateMany|delete|deleteMany'

describe('PR1 reference-phase extraction — guards', () => {
  it('referencePhases.ts exports all reference phases/blocks + the 5 shared maps', () => {
    const src = read(REF)
    for (const fn of REFERENCE_PHASES)
      expect(src, `referencePhases must export ${fn}`).toMatch(new RegExp(`export async function ${fn}\\(`))
    for (const m of ['topLevelIdByName', 'subcategoryIdByNameAndParent', 'subcategoryIdsByName', 'tagIdByLabelAndType', 'amenityIdByName'])
      expect(src, `referencePhases must export ${m}`).toMatch(new RegExp(`export const ${m}\\b`))
  })

  it('referencePhases.ts WRITES no demo/marketplace model (reference-only)', () => {
    const src = read(REF)
    const hits = src.match(new RegExp(`prisma\\.(${DEMO_MODELS})\\.(${WRITE})\\b`, 'g')) ?? []
    expect(hits, `referencePhases must not WRITE a demo/marketplace model. Found: ${hits.join(', ')}`).toEqual([])
  })

  it('referencePhases.ts has no top-level side effects (no adapter / dotenv / key check / seed)', () => {
    const src = read(REF)
    expect(src).not.toMatch(/new PrismaClient/)
    expect(src).not.toContain("import 'dotenv/config'")
    expect(src).not.toContain('requireSeedEncryptionKey')
  })

  it('the reference-only entrypoint prisma/seed-reference.ts exists and is production-safe (PR2b)', () => {
    const path = 'prisma/seed-reference.ts'
    expect(existsSync(join(root, path)), `${path} must exist (PR2b)`).toBe(true)
    const src = read(path)
    // Safety gates: opt-in + target confirmation + default-deny write guard.
    expect(src, 'must require ALLOW_REFERENCE_SEED opt-in').toContain('requireReferenceSeedOptIn')
    expect(src, 'must require REFERENCE_SEED_CONFIRM').toContain('requireReferenceSeedConfirm')
    expect(src, 'must apply the default-deny write guard').toContain('referenceWriteGuard')
    // Stripe ids come from env validation, never hardcoded dev placeholders.
    expect(src, 'must resolve Stripe ids from env').toContain('resolveReferenceStripePriceIds')
    expect(src, 'must NOT hardcode the dev Stripe price ids').not.toContain('price_monthly_dev')
    expect(src, 'must NOT hardcode the dev Stripe price ids').not.toContain('price_annual_dev')
    // Must NOT import the full seed or reach any demo phase.
    expect(src, 'must not import prisma/seed.ts').not.toMatch(/from ['"]\.\/seed['"]/)
    for (const demo of ['seedTaxonomyTestMerchants', 'seedDemoMerchantEnrichment', 'seedHomeFeedFixtures'])
      expect(src, `${demo} must not be reachable from the reference seed`).not.toContain(demo)
    // Must NOT run the recompute runner — that is the separate Task #2.
    expect(src, 'recompute runner is Task #2, not in the reference seed').not.toContain('recomputeCategoryCounts')
  })

  it('the reference seed writes ONLY reference/config models (guard allow-list excludes demo)', () => {
    const src = read('prisma/seed-data/referenceWriteGuard.ts')
    // The allow-list must contain the reference/config models the seed writes…
    for (const m of ['Category', 'Locality', 'LocalityCatchmentEdge', 'Market', 'SubscriptionPlan', 'RmvTemplate', 'Interest', 'CmsContent'])
      expect(src, `allow-list must include ${m}`).toContain(`'${m}'`)
    // …and must NOT allow-list any demo/marketplace model.
    for (const m of ['Merchant', 'Branch', 'Voucher', 'Review', 'VoucherRedemption'])
      expect(src, `allow-list must NOT include ${m}`).not.toContain(`'${m}'`)
  })

  it('demo/supply phases still run only from the full seed, not the reference module', () => {
    const seed = read(SEED)
    const ref = read(REF)
    for (const demo of ['seedTaxonomyTestMerchants', 'seedDemoMerchantEnrichment', 'seedHomeFeedFixtures']) {
      expect(seed, `${demo} must remain defined/called in seed.ts`).toContain(demo)
      expect(ref, `${demo} must NOT be in the reference module`).not.toContain(demo)
    }
  })

  it('the full seed delegates to the extracted phases (imports + calls them with prisma)', () => {
    const seed = read(SEED)
    expect(seed).toContain("from './seed-data/referencePhases'")
    for (const fn of REFERENCE_PHASES)
      // `(prisma)` for most; `(prisma, foodCatId, beautyCatId)` for seedRmvTemplates.
      expect(seed, `seed.ts must call ${fn}(prisma…)`).toMatch(new RegExp(`await ${fn}\\(prisma[,)]`))
  })
})
