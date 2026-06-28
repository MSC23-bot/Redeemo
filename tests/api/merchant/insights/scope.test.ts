import { describe, it, expect, vi } from 'vitest'
import { insightsScope, assertInsightsAccess, assertMerchantActive } from '../../../../src/api/merchant/insights/scope'
import { scopeLabel } from '../../../../src/api/merchant/insights/service'
import { AppError } from '../../../../src/api/shared/errors'
import type { MerchantContext } from '../../../../src/api/merchant/shared'
import { MerchantStatus } from '../../../../generated/prisma/enums'

// Foundation-stage unit tests (Insights PR-A Task A2; spec 7.2/7.3). Pure helpers
// plus a mocked-Prisma lifecycle gate. No real DB, no routes, no SQL. The six-
// status server tests over a real DB live in A7.

function ctx(overrides: Partial<MerchantContext> = {}): MerchantContext {
  return {
    adminId: 'admin-1',
    merchantId: 'merchant-1',
    role: 'BRANCH_MANAGER',
    allBranches: false,
    allowedBranchIds: [],
    canManageVouchers: false,
    ...overrides,
  }
}

describe('insightsScope', () => {
  it('owner all-branches -> null (all of the merchant branches)', () => {
    expect(insightsScope(ctx({ role: 'OWNER', allBranches: true }))).toBeNull()
  })

  it('BM all-branches=true -> null (legitimate all-branches manager)', () => {
    expect(insightsScope(ctx({ allBranches: true }))).toBeNull()
  })

  it('BM allBranches=false with [b1] -> [b1]', () => {
    expect(insightsScope(ctx({ allBranches: false, allowedBranchIds: ['b1'] }))).toEqual(['b1'])
  })

  it('BM allBranches=false empty -> [] (fail closed, never widened)', () => {
    expect(insightsScope(ctx({ allBranches: false, allowedBranchIds: [] }))).toEqual([])
  })
})

describe('assertInsightsAccess', () => {
  it('STAFF is denied with INSUFFICIENT_PERMISSIONS (server-side, nav is not the boundary)', () => {
    expect(() => assertInsightsAccess(ctx({ role: 'STAFF' }))).toThrow('INSUFFICIENT_PERMISSIONS')
  })

  it('STAFF denial is a typed AppError with code INSUFFICIENT_PERMISSIONS', () => {
    try {
      assertInsightsAccess(ctx({ role: 'STAFF' }))
      throw new Error('expected assertInsightsAccess to throw for STAFF')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('INSUFFICIENT_PERMISSIONS')
    }
  })

  it('OWNER passes (does not throw)', () => {
    expect(() => assertInsightsAccess(ctx({ role: 'OWNER' }))).not.toThrow()
  })

  it('BRANCH_MANAGER passes (does not throw)', () => {
    expect(() => assertInsightsAccess(ctx({ role: 'BRANCH_MANAGER' }))).not.toThrow()
  })
})

describe('scopeLabel (role-aware, Finding #3)', () => {
  // The owner-only "All branches" label must NEVER be shown to a BRANCH_MANAGER,
  // even an all-branches one (its data scope is identical to an owner's, but the
  // label keys on ROLE, not scope shape - spec 2.4 + lines 276/285). The label
  // decision matrix:
  it('OWNER all-branches -> "All branches"', () => {
    expect(scopeLabel(ctx({ role: 'OWNER', allBranches: true, allowedBranchIds: [] }))).toBe('All branches')
  })

  it('all-branches BRANCH_MANAGER -> "All my branches" (manager label, NOT the owner "All branches")', () => {
    expect(scopeLabel(ctx({ role: 'BRANCH_MANAGER', allBranches: true, allowedBranchIds: [] }))).toBe(
      'All my branches',
    )
  })

  it('one-branch scoped BM (single allowed branch, no explicit branchId) -> "Viewing: selected branch"', () => {
    expect(scopeLabel(ctx({ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1'] }))).toBe(
      'Viewing: selected branch',
    )
  })

  it('multi-branch scoped BM -> "All my branches"', () => {
    expect(
      scopeLabel(ctx({ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1', 'b2'] })),
    ).toBe('All my branches')
  })

  it('selected authorized branch (explicit branchId) -> "Viewing: selected branch"', () => {
    // An OWNER (or BM) viewing a single selected branch via the branchId filter.
    expect(scopeLabel(ctx({ role: 'OWNER', allBranches: true, allowedBranchIds: [] }), 'b1')).toBe(
      'Viewing: selected branch',
    )
    expect(
      scopeLabel(ctx({ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1', 'b2'] }), 'b1'),
    ).toBe('Viewing: selected branch')
  })
})

describe('assertMerchantActive', () => {
  function mockPrisma(status: string | null) {
    const findUnique = vi.fn().mockResolvedValue(status === null ? null : { status })
    return { prisma: { merchant: { findUnique } }, findUnique }
  }

  it('ACTIVE resolves (does not throw) and selects merchant.status by id', async () => {
    const { prisma, findUnique } = mockPrisma(MerchantStatus.ACTIVE)
    await expect(assertMerchantActive(prisma as any, 'merchant-1')).resolves.toBeUndefined()
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'merchant-1' },
      select: { status: true },
    })
  })

  const nonActiveStatuses: string[] = [
    MerchantStatus.REGISTERED,
    MerchantStatus.PENDING_APPROVAL,
    MerchantStatus.INACTIVE,
    MerchantStatus.SUSPENDED,
    MerchantStatus.DELETED,
  ]

  for (const status of nonActiveStatuses) {
    it(`${status} throws MERCHANT_NOT_ACTIVE (typed)`, async () => {
      const { prisma } = mockPrisma(status)
      await expect(assertMerchantActive(prisma as any, 'merchant-1')).rejects.toBeInstanceOf(AppError)
      try {
        await assertMerchantActive(prisma as any, 'merchant-1')
        throw new Error(`expected assertMerchantActive to throw for ${status}`)
      } catch (err) {
        expect(err).toBeInstanceOf(AppError)
        expect((err as AppError).code).toBe('MERCHANT_NOT_ACTIVE')
        expect((err as AppError).statusCode).toBe(403)
      }
    })
  }

  it('missing merchant (null row) throws MERCHANT_NOT_ACTIVE (typed)', async () => {
    const { prisma } = mockPrisma(null)
    try {
      await assertMerchantActive(prisma as any, 'merchant-1')
      throw new Error('expected assertMerchantActive to throw for a missing merchant')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('MERCHANT_NOT_ACTIVE')
      expect((err as AppError).statusCode).toBe(403)
    }
  })
})
