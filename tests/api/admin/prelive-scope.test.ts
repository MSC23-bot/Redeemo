import { describe, it, expect, vi } from 'vitest'
import { assertFieldPreLiveScope } from '../../../src/api/admin/prelive-scope'

// Team & Roles S3 (spec §4.2). Unit tests for the FIELD pre-live scope guard with
// a mocked Prisma. The guard clamps ONLY the FIELD role to pre-live merchants
// (REGISTERED / PENDING_APPROVAL); OPERATIONS and SUPER_ADMIN are never restricted.

const MERCHANT_ID = 'merchant-1'

/** Prisma double whose merchant.findUnique returns a merchant of the given status. */
function prismaWithStatus(status: string | null) {
  const findUnique = vi.fn().mockResolvedValue(status === null ? null : { status })
  return { prisma: { merchant: { findUnique } } as any, findUnique }
}

describe('assertFieldPreLiveScope — FIELD clamp to pre-live merchants', () => {
  it('PASSES for a FIELD actor on a REGISTERED merchant (route proceeds)', async () => {
    const { prisma, findUnique } = prismaWithStatus('REGISTERED')
    await expect(assertFieldPreLiveScope(prisma, 'FIELD', MERCHANT_ID)).resolves.toBeUndefined()
    expect(findUnique).toHaveBeenCalledWith({ where: { id: MERCHANT_ID }, select: { status: true } })
  })

  it('PASSES for a FIELD actor on a PENDING_APPROVAL merchant', async () => {
    const { prisma } = prismaWithStatus('PENDING_APPROVAL')
    await expect(assertFieldPreLiveScope(prisma, 'FIELD', MERCHANT_ID)).resolves.toBeUndefined()
  })

  it.each(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'])(
    'REJECTS a FIELD actor on a %s merchant with MERCHANT_NOT_PRE_LIVE_FOR_FIELD (403)',
    async (status) => {
      const { prisma } = prismaWithStatus(status)
      await expect(assertFieldPreLiveScope(prisma, 'FIELD', MERCHANT_ID)).rejects.toThrow(
        'MERCHANT_NOT_PRE_LIVE_FOR_FIELD',
      )
    },
  )

  it('REJECTS a FIELD actor on a missing merchant with MERCHANT_NOT_FOUND (404)', async () => {
    const { prisma } = prismaWithStatus(null)
    await expect(assertFieldPreLiveScope(prisma, 'FIELD', MERCHANT_ID)).rejects.toThrow('MERCHANT_NOT_FOUND')
  })
})

describe('assertFieldPreLiveScope — non-FIELD roles are a NO-OP', () => {
  it.each(['OPERATIONS', 'SUPER_ADMIN'])(
    '%s acting on an ACTIVE merchant PASSES and never reads the merchant (no restriction)',
    async (role) => {
      const { prisma, findUnique } = prismaWithStatus('ACTIVE')
      await expect(assertFieldPreLiveScope(prisma, role, MERCHANT_ID)).resolves.toBeUndefined()
      // Guard short-circuits before any DB read for non-FIELD roles.
      expect(findUnique).not.toHaveBeenCalled()
    },
  )

  it('an undefined role is a NO-OP (no DB read); the capability gate has already denied it', async () => {
    const { prisma, findUnique } = prismaWithStatus('ACTIVE')
    await expect(assertFieldPreLiveScope(prisma, undefined, MERCHANT_ID)).resolves.toBeUndefined()
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe('assertFieldPreLiveScope — branch-scoped resolution (branchId in path)', () => {
  // A branch-scoped route (e.g. PATCH /admin/branches/:branchId) resolves the
  // owning merchantId from the branchId FIRST, then calls the guard with that
  // merchantId. This proves the two-step resolution yields the owning merchant's
  // status correctly: a FIELD rep editing a branch whose merchant is ACTIVE is 403'd.
  it('resolves branchId -> owning merchant, then 403s a FIELD actor on a live merchant', async () => {
    const branchFindFirst = vi.fn().mockResolvedValue({ merchantId: MERCHANT_ID })
    const merchantFindUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE' })
    const prisma = {
      branch: { findFirst: branchFindFirst },
      merchant: { findUnique: merchantFindUnique },
    } as any

    // Step 1: the route resolves the owning merchantId from the branchId.
    const b = await prisma.branch.findFirst({ where: { id: 'branch-9', deletedAt: null }, select: { merchantId: true } })
    // Step 2: the guard clamps the FIELD actor to the owning merchant's status.
    await expect(assertFieldPreLiveScope(prisma, 'FIELD', b.merchantId)).rejects.toThrow(
      'MERCHANT_NOT_PRE_LIVE_FOR_FIELD',
    )
    expect(merchantFindUnique).toHaveBeenCalledWith({ where: { id: MERCHANT_ID }, select: { status: true } })
  })

  it('resolves branchId -> owning merchant, then PASSES a FIELD actor on a REGISTERED merchant', async () => {
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue({ merchantId: MERCHANT_ID }) },
      merchant: { findUnique: vi.fn().mockResolvedValue({ status: 'REGISTERED' }) },
    } as any
    const b = await prisma.branch.findFirst({ where: { id: 'branch-9', deletedAt: null }, select: { merchantId: true } })
    await expect(assertFieldPreLiveScope(prisma, 'FIELD', b.merchantId)).resolves.toBeUndefined()
  })
})
