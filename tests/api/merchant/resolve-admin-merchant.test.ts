import { describe, it, expect, vi } from 'vitest'
import { resolveAdminMerchant } from '../../../src/api/merchant/shared'

// WF8 (2026-07): a valid non-owner merchant token (BRANCH_MANAGER / STAFF) calling
// an owner-only endpoint (e.g. GET /merchant/onboarding/status, /checklist) was
// getting HTTP 401 INVALID_CREDENTIALS from resolveAdminMerchant, because it threw
// that code whenever getOwnerMembership() returned null - including for a REAL
// non-owner membership, not just a genuinely-unknown caller. merchant-web's apiFetch
// 401 interceptor (apps/merchant-web/lib/api/client.ts) correctly treats ANY 401 as
// session-loss and tears the whole portal down to /sign-in - so BM/STAFF users were
// thrown out of the Home page, which fetches both onboarding reads unconditionally.
//
// The fix: resolveAdminMerchant now calls getActiveMembership (any role) BEFORE
// concluding INVALID_CREDENTIALS. An active non-owner membership -> the caller IS
// authenticated, just not authorised for this owner-only action -> 403
// INSUFFICIENT_PERMISSIONS. Only a caller with NO active membership at all keeps
// the 401. This file pins the five resolveAdminMerchant outcomes directly (unit,
// mocked prisma); route-level coverage for the two WF8 endpoints lives in
// tests/api/merchant/onboarding-status.test.ts and tests/api/merchant/onboarding.test.ts.

function membershipRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'mm1',
    merchantId: 'm1',
    merchantAdminId: 'admin-1',
    role: 'OWNER',
    allBranches: true,
    canManageVouchers: true,
    branches: [],
    merchant: { status: 'ACTIVE', businessName: 'Acme' },
    ...overrides,
  }
}

describe('resolveAdminMerchant (WF8 401-vs-403 fix)', () => {
  it('1. an OWNER membership resolves {adminId, merchantId}', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'admin-1', merchant: { status: 'ACTIVE', businessName: 'Acme' },
    })
    const findMany = vi.fn()
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    const r = await resolveAdminMerchant(prisma, 'admin-1')

    expect(r).toEqual({ adminId: 'admin-1', merchantId: 'm1' })
    // The owner-only findFirst resolved - getActiveMembership must never be reached.
    expect(findMany).not.toHaveBeenCalled()
  })

  it('2. an ACTIVE BRANCH_MANAGER membership only -> throws INSUFFICIENT_PERMISSIONS (403)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null) // getOwnerMembership: not an OWNER
    const findMany = vi.fn().mockResolvedValue([
      membershipRow({ role: 'BRANCH_MANAGER', canManageVouchers: false }),
    ])
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'admin-1')).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSIONS',
      statusCode: 403,
    })
  })

  it('3. an ACTIVE STAFF membership only -> throws INSUFFICIENT_PERMISSIONS (403)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const findMany = vi.fn().mockResolvedValue([
      membershipRow({ role: 'STAFF', allBranches: false, canManageVouchers: false }),
    ])
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'admin-1')).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSIONS',
      statusCode: 403,
    })
  })

  it('4. no membership at all -> throws INVALID_CREDENTIALS (401)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'ghost')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    })
  })

  it('5. a suspended merchant -> throws MERCHANT_SUSPENDED (403), even for the OWNER (SEC-M2 preserved)', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'admin-1', merchant: { status: 'SUSPENDED', businessName: 'Acme' },
    })
    const findMany = vi.fn()
    const prisma = { merchantMembership: { findFirst, findMany } } as any

    await expect(resolveAdminMerchant(prisma, 'admin-1')).rejects.toMatchObject({
      code: 'MERCHANT_SUSPENDED',
      statusCode: 403,
    })
    // The SUSPENDED check runs on the resolved OWNER membership - the non-owner
    // active-membership fallback must never be consulted once an OWNER resolves.
    expect(findMany).not.toHaveBeenCalled()
  })
})
