import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REFERENCE_WRITE_ALLOWLIST,
  isReferenceWriteOperation,
  assertReferenceWriteAllowed,
} from '../../prisma/seed-data/referenceWriteGuard'

// PR2b: the production-safe reference seed (prisma/seed-reference.ts) runs under a
// default-deny Prisma write guard. These unit tests pin the guard's core logic
// (no DB): only reference/config models may be written; every other model — and
// any unknown/future model or operation — is blocked; reads always pass.

const ALLOWED = [
  'Category', 'Tag', 'SubcategoryTag', 'Amenity', 'CategoryAmenity', 'Locality',
  'RedundantHighlight', 'LocalityCatchmentEdge', 'Market', 'SubscriptionPlan',
  'RmvTemplate', 'Interest', 'CmsContent',
]
const FORBIDDEN = [
  'Merchant', 'Branch', 'Voucher', 'User', 'Review', 'VoucherRedemption',
  'Subscription', 'MerchantAdmin', 'BranchUser', 'FeaturedMerchant', 'Campaign',
  'AdminUser', 'MerchantCategory', 'MerchantTag', 'MerchantHighlight',
  'BranchAmenity', 'BranchPhoto', 'BranchOpeningHours',
]
const WRITE_OPS = ['create', 'createMany', 'upsert', 'update', 'updateMany', 'delete', 'deleteMany']
const READ_OPS = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']

describe('referenceWriteGuard (PR2b) — default-deny write guard', () => {
  it('allow-list contains EXACTLY the 13 reference/config models', () => {
    expect([...REFERENCE_WRITE_ALLOWLIST].sort()).toEqual([...ALLOWED].sort())
  })

  it('allows WRITES to every reference/config model', () => {
    for (const model of ALLOWED)
      for (const op of WRITE_OPS)
        expect(() => assertReferenceWriteAllowed(model, op), `${op} ${model}`).not.toThrow()
  })

  it('BLOCKS writes to every demo / marketplace / customer / activity model', () => {
    for (const model of FORBIDDEN)
      for (const op of WRITE_OPS)
        expect(() => assertReferenceWriteAllowed(model, op), `${op} ${model}`).toThrow(/reference-seed-guard/)
  })

  it('BLOCKS an unknown/future model and an undefined model by default (default-deny)', () => {
    expect(() => assertReferenceWriteAllowed('SomeFutureModel', 'create')).toThrow(/reference-seed-guard/)
    expect(() => assertReferenceWriteAllowed(undefined, 'create')).toThrow(/reference-seed-guard/)
  })

  it('classifies operations: writes are checked, known reads pass, unknown ops treated as writes', () => {
    for (const op of WRITE_OPS) expect(isReferenceWriteOperation(op), op).toBe(true)
    for (const op of READ_OPS) expect(isReferenceWriteOperation(op), op).toBe(false)
    expect(isReferenceWriteOperation('someBrandNewOperation')).toBe(true) // default-deny
  })

  // Regression guard for the load-bearing property: the allow-list must cover
  // EVERY model the reference seed actually writes. If a reference phase adds a
  // new model write (or a schema rename changes the accessor) without updating
  // the allow-list, the default-deny guard would silently block the reference
  // seed's own write — this test fails first.
  //
  // NOTE: this is an intentionally SIMPLE source scan. It may false-positive on a
  // commented-out `prisma.x.create(...)` or miss an unusual multi-line write.
  // That trade-off is acceptable: it fails LOUDLY (an easy-to-diagnose test break)
  // rather than silently weakening the guard, and the runtime integration test
  // backs it up by exercising real blocked + allowed writes.
  it('allow-list covers every Prisma model WRITE in the reference seed path', () => {
    const REFERENCE_MODULES = [
      'prisma/seed-data/referencePhases.ts',
      'prisma/seed-data/catchment-heuristic.ts',
      'prisma/seed-data/catchmentOverrides.ts',
      'prisma/seed-data/markets.ts',
    ]
    const WRITE = 'create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany'
    const written = new Set<string>()
    for (const rel of REFERENCE_MODULES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      const re = new RegExp(`(?:prisma|tx)\\.([a-zA-Z]+)\\.(?:${WRITE})\\b`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        const accessor = m[1]
        // Prisma model accessor is the PascalCase model name with a lower-cased
        // first letter; reverse it to recover the name the guard hook reports.
        written.add(accessor[0].toUpperCase() + accessor.slice(1))
      }
    }
    const missing = [...written].filter((model) => !REFERENCE_WRITE_ALLOWLIST.has(model))
    expect(missing, `models written by the reference seed but MISSING from the guard allow-list: ${missing.join(', ')}`).toEqual([])
    // Sanity: the regex actually found writes (guards against a silently-broken match).
    expect(written.size, 'expected to detect the reference-path model writes').toBeGreaterThanOrEqual(13)
  })
})
