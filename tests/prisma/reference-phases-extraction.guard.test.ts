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

  it('the reference-only entrypoint prisma/seed-reference.ts is NOT added yet (PR2)', () => {
    expect(existsSync(join(root, 'prisma/seed-reference.ts'))).toBe(false)
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
