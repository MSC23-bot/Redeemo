import { describe, it, expect } from 'vitest'
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
})
