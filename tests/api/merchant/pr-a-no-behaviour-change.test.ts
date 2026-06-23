import { describe, it, expect, vi } from 'vitest'
import { resolveAdminMerchant } from '../../../src/api/merchant/shared'

// Staff & Access PR-A regression pin (Task A5).
//
// PR-A adds `resolveMerchantContext` (any active member) ALONGSIDE the unchanged
// owner-only `resolveAdminMerchant`. This pins that PR-A did NOT widen the
// owner-only resolver: `resolveAdminMerchant` still goes through
// `getOwnerMembership` (a findFirst keyed `role:'OWNER', status:'ACTIVE'`), so a
// non-OWNER membership does not resolve at all (the owner-only query returns
// null -> INVALID_CREDENTIALS), and an OWNER still resolves {adminId, merchantId}.
// The safe-default-deny property (a route stays owner-only just by calling this)
// depends on exactly this behaviour.

describe('PR-A no-behaviour-change: resolveAdminMerchant stays owner-only', () => {
  it('still throws INVALID_CREDENTIALS for a non-OWNER membership (owner-only query returns null)', async () => {
    // resolveAdminMerchant -> getOwnerMembership -> findFirst({ role:'OWNER', status:'ACTIVE' }).
    // A person who only holds a BRANCH_MANAGER/STAFF membership does not match that
    // filter, so the owner-only findFirst returns null and the resolver denies.
    const findFirst = vi.fn().mockResolvedValue(null)
    const prisma = { merchantMembership: { findFirst } } as any

    await expect(resolveAdminMerchant(prisma, 'non-owner-admin')).rejects.toThrow('INVALID_CREDENTIALS')
    // Proves it queries the OWNER-only filter (not any-active-member).
    expect(findFirst).toHaveBeenCalledWith({
      where: { merchantAdminId: 'non-owner-admin', role: 'OWNER', status: 'ACTIVE' },
      select: { id: true, merchantId: true, merchantAdminId: true, merchant: { select: { status: true, businessName: true } } },
    })
  })

  it('still resolves {adminId, merchantId} for an OWNER membership', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'mm1',
      merchantId: 'm1',
      merchantAdminId: 'owner-admin',
      merchant: { status: 'ACTIVE', businessName: 'X' },
    })
    const prisma = { merchantMembership: { findFirst } } as any

    const r = await resolveAdminMerchant(prisma, 'owner-admin')
    expect(r).toEqual({ adminId: 'owner-admin', merchantId: 'm1' })
  })
})
