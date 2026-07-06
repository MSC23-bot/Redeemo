import { describe, it, expect, vi } from 'vitest'
import { getMerchantProfile } from '../../../src/api/merchant/profile/service'

/**
 * Business Profile M1: `getMerchantProfile` gains two ADDITIVE read-only blocks
 * - `ownerContact` (the merchant's OWNER's personal details) and `agreement`
 * (the signed MerchantContract, or null). Both resolve by the merchant's
 * resolved `merchantId`, NOT the viewer's own membership, so a non-owner
 * (BRANCH_MANAGER / STAFF) viewer still sees the owner's contact - matching the
 * "Business contact" card, which always shows the account owner regardless of
 * who is logged in. These pins exercise the service directly (no HTTP layer) so
 * the owner-not-viewer resolution + no-cross-merchant-leak guarantee are proven
 * against the exact `where` clause passed to Prisma.
 */

type MakePrismaOptions = {
  merchantId?: string
  adminId?: string
  viewerRole?: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  membershipFindMany?: any
  membershipFindFirst?: any
  merchantFindUnique?: any
  adminFindUnique?: any
  contractFindUnique?: any
}

// A small owner directory keyed by merchantId, used by the default findFirst
// implementation below to prove the query is genuinely parameterised by
// merchantId (not accidentally returning a fixed/shared row).
const OWNER_DIRECTORY: Record<string, any> = {
  m1: { firstName: 'Priya', lastName: 'Shah', email: 'owner1@merchant-a.test', phone: '7000000001', phoneCountryCode: '+44', jobTitle: 'Founder' },
  m2: { firstName: 'Tomasz', lastName: 'Nowak', email: 'owner2@merchant-b.test', phone: '7000000002', phoneCountryCode: '+44', jobTitle: 'Director' },
}

function makePrisma(opts: MakePrismaOptions = {}) {
  const merchantId = opts.merchantId ?? 'm1'
  const adminId = opts.adminId ?? 'viewer-1'
  const viewerRole = opts.viewerRole ?? 'STAFF'

  const defaultFindFirst = vi.fn().mockImplementation(async ({ where }: any) => {
    const admin = OWNER_DIRECTORY[where.merchantId]
    return admin ? { merchantAdmin: admin } : null
  })

  const prisma: any = {
    merchantMembership: {
      // resolveMerchantContext -> getActiveMembership: the VIEWER's own
      // membership (may be a non-owner role).
      findMany:
        opts.membershipFindMany ??
        vi.fn().mockResolvedValue([
          {
            id: 'mm-viewer',
            merchantId,
            merchantAdminId: adminId,
            role: viewerRole,
            allBranches: viewerRole !== 'STAFF',
            canManageVouchers: false,
            merchant: { status: 'ACTIVE', businessName: 'Acme' },
            branches: [],
          },
        ]),
      // NEW (M1): the OWNER lookup, scoped by merchantId - must NOT read the
      // viewer's own membership.
      findFirst: opts.membershipFindFirst ?? defaultFindFirst,
    },
    merchant: {
      findUnique:
        opts.merchantFindUnique ??
        vi.fn().mockResolvedValue({ id: merchantId, businessName: 'Acme', pendingEdits: [] }),
    },
    merchantAdmin: {
      findUnique: opts.adminFindUnique ?? vi.fn().mockResolvedValue({ firstName: 'Viewer', lastName: 'Person' }),
    },
    merchantContract: {
      findUnique: opts.contractFindUnique ?? vi.fn().mockResolvedValue(null),
    },
  }
  return prisma
}

describe('getMerchantProfile - Business Profile M1 (ownerContact + agreement)', () => {
  it('returns the OWNER contact even when the viewer is a non-owner (BRANCH_MANAGER/STAFF)', async () => {
    const prisma = makePrisma({ viewerRole: 'STAFF', adminId: 'staff-1', merchantId: 'm1' })
    const profile = await getMerchantProfile(prisma, 'staff-1')

    expect(profile.ownerContact).toEqual({
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'owner1@merchant-a.test',
      phone: '7000000001',
      phoneCountryCode: '+44',
      jobTitle: 'Founder',
    })
    // Prove the resolution is BY merchantId, not by the viewer's adminId/membership.
    expect(prisma.merchantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1', role: 'OWNER', status: 'ACTIVE' } })
    )
  })

  it('also returns the OWNER contact for a BRANCH_MANAGER viewer (not just STAFF)', async () => {
    const prisma = makePrisma({ viewerRole: 'BRANCH_MANAGER', adminId: 'bm-1', merchantId: 'm1' })
    const profile = await getMerchantProfile(prisma, 'bm-1')
    expect(profile.ownerContact?.email).toBe('owner1@merchant-a.test')
  })

  it('does NOT leak merchant B owner contact when resolving merchant A, and vice versa (no cross-merchant leak)', async () => {
    const prismaA = makePrisma({ merchantId: 'm1', adminId: 'staff-a' })
    const profileA = await getMerchantProfile(prismaA, 'staff-a')
    expect(profileA.ownerContact?.email).toBe('owner1@merchant-a.test')

    const prismaB = makePrisma({ merchantId: 'm2', adminId: 'staff-b' })
    const profileB = await getMerchantProfile(prismaB, 'staff-b')
    expect(profileB.ownerContact?.email).toBe('owner2@merchant-b.test')

    // The two merchants' owners must never cross.
    expect(profileA.ownerContact?.email).not.toBe(profileB.ownerContact?.email)
    expect(prismaA.merchantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ merchantId: 'm1' }) })
    )
    expect(prismaB.merchantMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ merchantId: 'm2' }) })
    )
  })

  it('returns ownerContact: null (never throws) when no OWNER membership resolves', async () => {
    const prisma = makePrisma({ membershipFindFirst: vi.fn().mockResolvedValue(null) })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.ownerContact).toBeNull()
  })

  it('returns agreement populated when a MerchantContract row exists', async () => {
    const signedAt = new Date('2026-01-15T10:30:00.000Z')
    const prisma = makePrisma({
      contractFindUnique: vi.fn().mockResolvedValue({ tcVersion: 'v2', signedAt, signatureMethod: 'CLICK_TO_AGREE' }),
    })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.agreement).toEqual({ acceptedVersion: 'v2', acceptedAt: signedAt, signatureMethod: 'CLICK_TO_AGREE' })
    expect(prisma.merchantContract.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1' } })
    )
  })

  it('returns agreement: null when the merchant has not signed (no MerchantContract row)', async () => {
    const prisma = makePrisma({ contractFindUnique: vi.fn().mockResolvedValue(null) })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.agreement).toBeNull()
  })

  it('leaves every existing field untouched (pendingEdits, viewerCapabilities still present)', async () => {
    const prisma = makePrisma({ viewerRole: 'OWNER', adminId: 'owner-1', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'owner-1')
    expect(profile.id).toBe('m1')
    expect(profile.businessName).toBe('Acme')
    expect(profile.pendingEdits).toEqual([])
    expect(profile.viewerCapabilities).toEqual(
      expect.objectContaining({ role: 'OWNER', canViewInsights: true })
    )
  })
})
