import { describe, it, expect, vi } from 'vitest'
import {
  resolveMerchantContext,
  assertOwner,
  assertCanManageVouchers,
  assertBranchAllowed,
  type MerchantContext,
} from '../../../src/api/merchant/shared'

// Mirror Task A3's prisma mock: resolveMerchantContext -> getActiveMembership ->
// prisma.merchantMembership.findMany. One membership row drives the resolved ctx.
const prismaWith = (rows: any[]) =>
  ({ merchantMembership: { findMany: vi.fn().mockResolvedValue(rows) } }) as any

const membershipRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'mm1',
  merchantId: 'm1',
  merchantAdminId: 'a1',
  role: 'BRANCH_MANAGER',
  allBranches: false,
  canManageVouchers: false,
  merchant: { status: 'ACTIVE', businessName: 'X' },
  branches: [{ branchId: 'b1' }],
  ...over,
})

const ctx = (over: Partial<MerchantContext> = {}): MerchantContext => ({
  adminId: 'a1',
  merchantId: 'm1',
  role: 'STAFF',
  allBranches: false,
  allowedBranchIds: [],
  canManageVouchers: false,
  ...over,
})

describe('resolveMerchantContext', () => {
  // (a)
  it('returns {adminId, merchantId, role, allBranches, allowedBranchIds, canManageVouchers} for an active member', async () => {
    const r = await resolveMerchantContext(
      prismaWith([membershipRow({ role: 'BRANCH_MANAGER', allBranches: false, canManageVouchers: true, branches: [{ branchId: 'b1' }, { branchId: 'b2' }] })]),
      'a1'
    )
    expect(r).toEqual({
      adminId: 'a1',
      merchantId: 'm1',
      role: 'BRANCH_MANAGER',
      allBranches: false,
      allowedBranchIds: ['b1', 'b2'],
      canManageVouchers: true,
    })
  })

  it('derives canManageVouchers=true for an OWNER even when the membership flag is false', async () => {
    const r = await resolveMerchantContext(
      prismaWith([membershipRow({ role: 'OWNER', allBranches: true, canManageVouchers: false, branches: [] })]),
      'a1'
    )
    expect(r.role).toBe('OWNER')
    expect(r.canManageVouchers).toBe(true)
    expect(r.allBranches).toBe(true)
  })

  // (b)
  it('throws INVALID_CREDENTIALS when there is no membership', async () => {
    await expect(resolveMerchantContext(prismaWith([]), 'a1')).rejects.toThrow('INVALID_CREDENTIALS')
  })

  // (c)
  it('throws MERCHANT_SUSPENDED when the merchant is suspended', async () => {
    await expect(
      resolveMerchantContext(prismaWith([membershipRow({ merchant: { status: 'SUSPENDED', businessName: 'X' } })]), 'a1')
    ).rejects.toThrow('MERCHANT_SUSPENDED')
  })
})

// (d)
describe('assertCanManageVouchers', () => {
  it('allows an OWNER', () => {
    expect(() => assertCanManageVouchers(ctx({ role: 'OWNER', canManageVouchers: true }))).not.toThrow()
  })
  it('allows a member with canManageVouchers:true', () => {
    expect(() => assertCanManageVouchers(ctx({ role: 'BRANCH_MANAGER', canManageVouchers: true }))).not.toThrow()
  })
  it('throws INSUFFICIENT_PERMISSIONS for a plain BRANCH_MANAGER', () => {
    expect(() => assertCanManageVouchers(ctx({ role: 'BRANCH_MANAGER', canManageVouchers: false }))).toThrow('INSUFFICIENT_PERMISSIONS')
  })
  it('throws INSUFFICIENT_PERMISSIONS for STAFF', () => {
    expect(() => assertCanManageVouchers(ctx({ role: 'STAFF', canManageVouchers: false }))).toThrow('INSUFFICIENT_PERMISSIONS')
  })
})

// (e)
describe('assertBranchAllowed', () => {
  it('allows when allBranches', () => {
    expect(() => assertBranchAllowed(ctx({ allBranches: true, allowedBranchIds: [] }), 'bX')).not.toThrow()
  })
  it('allows when the branch is in allowedBranchIds', () => {
    expect(() => assertBranchAllowed(ctx({ allBranches: false, allowedBranchIds: ['b1', 'b2'] }), 'b2')).not.toThrow()
  })
  it('throws INSUFFICIENT_PERMISSIONS otherwise', () => {
    expect(() => assertBranchAllowed(ctx({ allBranches: false, allowedBranchIds: ['b1'] }), 'b9')).toThrow('INSUFFICIENT_PERMISSIONS')
  })
})

// (f)
describe('assertOwner', () => {
  it('allows an OWNER', () => {
    expect(() => assertOwner(ctx({ role: 'OWNER' }))).not.toThrow()
  })
  it('throws INSUFFICIENT_PERMISSIONS for a non-owner', () => {
    expect(() => assertOwner(ctx({ role: 'BRANCH_MANAGER' }))).toThrow('INSUFFICIENT_PERMISSIONS')
    expect(() => assertOwner(ctx({ role: 'STAFF' }))).toThrow('INSUFFICIENT_PERMISSIONS')
  })
})
