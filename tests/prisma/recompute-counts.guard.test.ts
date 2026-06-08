import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Static guards for the standalone recompute runner: it must be production-safe,
// gate-protected, and have NO path to the full seed or any demo/fixture data.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
const RUNNER = 'prisma/recompute-counts.ts'

describe('recompute-counts.ts — static guards', () => {
  it('exists', () => {
    expect(existsSync(join(root, RUNNER)), `${RUNNER} must exist`).toBe(true)
  })

  it('is gate-protected and uses the narrow write guard', () => {
    const src = read(RUNNER)
    expect(src, 'must require ALLOW_RECOMPUTE_COUNTS opt-in').toContain('requireRecomputeOptIn')
    expect(src, 'must require RECOMPUTE_CONFIRM').toContain('requireRecomputeConfirm')
    expect(src, 'must validate DATABASE_URL').toContain('requireDatabaseUrl')
    expect(src, 'must apply the Category/Tag-only write guard').toContain('recomputeWriteGuard')
  })

  it('calls BOTH recompute helpers with excludeTestData: true (production-safe path)', () => {
    const src = read(RUNNER)
    expect(src).toMatch(/recomputeCategoryCounts\(prisma,\s*\{\s*excludeTestData:\s*true\s*\}\)/)
    expect(src).toMatch(/recomputeTagCounts\(prisma,\s*\{\s*excludeTestData:\s*true\s*\}\)/)
  })

  it('does NOT import the full seed or reach any demo/fixture phase', () => {
    const src = read(RUNNER)
    expect(src, 'must not import prisma/seed.ts').not.toMatch(/from ['"]\.\/seed['"]/)
    for (const phase of [
      'seedTaxonomyTestMerchants', 'seedDemoMerchantEnrichment', 'seedHomeFeedFixtures',
      'seedCategories', 'seedSubscriptionPlans', 'seedRmvTemplates', 'seedMarkets',
    ])
      expect(src, `${phase} must not be reachable from the recompute runner`).not.toContain(phase)
  })

  it('writes NO demo / marketplace / customer model (only the recompute helpers run)', () => {
    const src = read(RUNNER)
    // No direct writes to any data model in the runner itself.
    expect(src).not.toMatch(/\.(merchant|branch|voucher|user|review|voucherRedemption|subscription)\.(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/)
  })
})
