import { describe, it, expect, vi } from 'vitest'
import { resolveAdminMerchant } from '../../../src/api/merchant/shared'

// Staff & Access PR-A regression pin (Task A5).
//
// PR-A adds `resolveMerchantContext` (any active member) ALONGSIDE the unchanged
// owner-only `resolveAdminMerchant`. This pins that PR-A did NOT widen the
// owner-only resolver: `resolveAdminMerchant` still goes through
// `getOwnerMembership` (a findFirst keyed `role:'OWNER', status:'ACTIVE'`), so a
// non-OWNER membership does not resolve at all (the owner-only query returns
// null), and an OWNER still resolves {adminId, merchantId}. The safe-default-deny
// property (a route stays owner-only just by calling this) depends on exactly
// this behaviour.
//
// WF8 (2026-07) update: a non-OWNER caller who holds NO membership at all still
// gets INVALID_CREDENTIALS (401 — genuinely not authenticated as anyone real for
// this merchant). But a non-OWNER caller who DOES hold an active BRANCH_MANAGER/
// STAFF membership now gets INSUFFICIENT_PERMISSIONS (403), not INVALID_CREDENTIALS
// — see src/api/merchant/shared.ts resolveAdminMerchant for the full rationale
// (401 makes merchant-web's client tear the session down and sign the user out,
// which is wrong for a validly-authenticated non-owner). Both pins below still
// prove the resolver NEVER resolves a merchantId for a non-owner.

describe('PR-A no-behaviour-change: resolveAdminMerchant stays owner-only', () => {
  it('throws INSUFFICIENT_PERMISSIONS for an active non-OWNER membership (owner-only query returns null, active membership exists)', async () => {
    // resolveAdminMerchant -> getOwnerMembership -> findFirst({ role:'OWNER', status:'ACTIVE' }).
    // A person who only holds a BRANCH_MANAGER/STAFF membership does not match that
    // filter, so the owner-only findFirst returns null. resolveAdminMerchant then
    // falls back to getActiveMembership (findMany) to distinguish "wrong role" from
    // "no one" — this caller HAS an active membership, so it is a 403, not a 401.
    const findFirst = vi.fn().mockResolvedValue(null)
    const findMany = vi.fn().mockResolvedValue([
      { id: 'mm1', merchantId: 'm1', merchantAdminId: 'non-owner-admin', role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: false, branches: [] },
    ])
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'non-owner-admin')).rejects.toThrow('INSUFFICIENT_PERMISSIONS')
    // Proves it queries the OWNER-only filter first (not any-active-member).
    expect(findFirst).toHaveBeenCalledWith({
      where: { merchantAdminId: 'non-owner-admin', role: 'OWNER', status: 'ACTIVE' },
      select: { id: true, merchantId: true, merchantAdminId: true, merchant: { select: { status: true, businessName: true } } },
    })
  })

  it('still throws INVALID_CREDENTIALS when the caller has NO membership at all (owner-only query AND active-membership query both empty)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'ghost-admin')).rejects.toThrow('INVALID_CREDENTIALS')
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
