import { describe, it, expect } from 'vitest'
import {
  RECOMPUTE_WRITE_ALLOWLIST,
  isRecomputeWriteOperation,
  assertRecomputeWriteAllowed,
} from '../../prisma/seed-data/recomputeWriteGuard'

// The recompute runner only rewrites denormalized count maps, so its default-deny
// guard allow-lists ONLY Category + Tag — tighter than the reference seed. These
// unit tests pin that logic (no DB).

const ALLOWED = ['Category', 'Tag']
// Demo/marketplace/customer models AND reference/config models (which the
// recompute runner does NOT write) must all be blocked.
const FORBIDDEN = [
  'Merchant', 'Branch', 'Voucher', 'User', 'Review', 'VoucherRedemption',
  'Subscription', 'MerchantAdmin', 'BranchUser', 'FeaturedMerchant', 'Campaign', 'AdminUser',
  'MerchantCategory', 'MerchantTag', 'MerchantHighlight',
  // reference/config models — allowed for the reference seed, NOT for this runner:
  'SubscriptionPlan', 'RmvTemplate', 'Interest', 'CmsContent', 'Locality', 'Amenity', 'LocalityCatchmentEdge', 'Market',
]
const WRITE_OPS = ['create', 'createMany', 'upsert', 'update', 'updateMany', 'delete', 'deleteMany']
const READ_OPS = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']

describe('recomputeWriteGuard — default-deny, Category/Tag only', () => {
  it('allow-list is EXACTLY {Category, Tag}', () => {
    expect([...RECOMPUTE_WRITE_ALLOWLIST].sort()).toEqual(['Category', 'Tag'])
  })

  it('allows WRITES to Category and Tag', () => {
    for (const model of ALLOWED)
      for (const op of WRITE_OPS)
        expect(() => assertRecomputeWriteAllowed(model, op), `${op} ${model}`).not.toThrow()
  })

  it('BLOCKS writes to every other model — demo AND reference/config', () => {
    for (const model of FORBIDDEN)
      for (const op of WRITE_OPS)
        expect(() => assertRecomputeWriteAllowed(model, op), `${op} ${model}`).toThrow(/recompute-guard/)
  })

  it('BLOCKS an unknown/future model and undefined by default', () => {
    expect(() => assertRecomputeWriteAllowed('SomeFutureModel', 'create')).toThrow(/recompute-guard/)
    expect(() => assertRecomputeWriteAllowed(undefined, 'create')).toThrow(/recompute-guard/)
  })

  it('classifies operations: writes checked, known reads pass, unknown ops treated as writes', () => {
    for (const op of WRITE_OPS) expect(isRecomputeWriteOperation(op), op).toBe(true)
    for (const op of READ_OPS) expect(isRecomputeWriteOperation(op), op).toBe(false)
    expect(isRecomputeWriteOperation('someBrandNewOperation')).toBe(true)
  })
})
