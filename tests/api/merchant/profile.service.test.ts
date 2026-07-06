import { describe, it, expect, vi } from 'vitest'
import { getMerchantProfile } from '../../../src/api/merchant/profile/service'

/**
 * Business Profile M1: `getMerchantProfile` gains two ADDITIVE read-only blocks
 * - `ownerContact` (the merchant's OWNER's personal details) and `agreement`
 * (the signed MerchantContract, or null). Both resolve by the merchant's
 * resolved `merchantId`, NOT the viewer's own membership, so a privileged
 * non-owner (BRANCH_MANAGER) viewer still sees the owner's contact - matching
 * the "Business contact" card, which always shows the account owner regardless
 * of who is logged in.
 *
 * Codex PII/role-boundary fix: this block is role-gated to an explicit
 * ALLOWLIST - OWNER | BRANCH_MANAGER only. STAFF (and any future/unknown role)
 * FAIL CLOSED to `ownerContact: null, agreement: null`, and - critically - the
 * two underlying queries are SKIPPED entirely for a non-privileged viewer (no
 * fetch, zero leak), not fetched-and-discarded. These pins exercise the
 * service directly (no HTTP layer) so the role gate, the owner-not-viewer
 * resolution, and the no-cross-merchant-leak guarantee are all proven against
 * the exact `where` clause (or lack of any call at all) passed to Prisma.
 */

type MakePrismaOptions = {
  merchantId?: string
  adminId?: string
  viewerRole?: string
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
  // Default to a PRIVILEGED role (BRANCH_MANAGER) so tests that don't care
  // about the role gate exercise the ownerContact/agreement resolution path by
  // default; the role-gate-specific tests below pass an explicit non-privileged
  // role and assert the queries are never even called.
  const viewerRole = opts.viewerRole ?? 'BRANCH_MANAGER'

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
      // viewer's own membership. Only reached when the viewer role is
      // privileged (OWNER | BRANCH_MANAGER).
      findFirst: opts.membershipFindFirst ?? defaultFindFirst,
    },
    merchant: {
      findUnique:
        opts.merchantFindUnique ??
        vi.fn().mockResolvedValue({
          id: merchantId,
          businessName: 'Acme',
          status: 'ACTIVE',
          onboardingStep: 'LIVE',
          tradingName: 'Acme Trading',
          description: 'A great place',
          logoUrl: 'https://x/logo.png',
          bannerUrl: 'https://x/banner.png',
          primaryCategoryId: 'cat-1',
          pendingEdits: [],
          // BP-ADJ1: REGISTERED/COMPLIANCE fields: populated on the raw row so
          // the role-gate tests below can prove they are genuinely nulled for a
          // non-privileged viewer (not merely absent from the mock).
          companyNumber: '12345678',
          vatNumber: 'GB123456789',
          websiteUrl: 'https://acme.example',
          contractStatus: 'SIGNED',
          contractStartDate: new Date('2026-01-01'),
          contractEndDate: new Date('2027-01-01'),
          verificationStatus: 'VERIFIED',
        }),
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

describe('getMerchantProfile - Business Profile M1 (ownerContact + agreement, role-gated)', () => {
  it('returns the OWNER contact for a BRANCH_MANAGER viewer (privileged, not the owner)', async () => {
    const prisma = makePrisma({ viewerRole: 'BRANCH_MANAGER', adminId: 'bm-1', merchantId: 'm1' })
    const profile = await getMerchantProfile(prisma, 'bm-1')

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

  it('also returns the OWNER contact for an OWNER viewer', async () => {
    const prisma = makePrisma({ viewerRole: 'OWNER', adminId: 'owner-1', merchantId: 'm1' })
    const profile = await getMerchantProfile(prisma, 'owner-1')
    expect(profile.ownerContact?.email).toBe('owner1@merchant-a.test')
  })

  it('does NOT leak merchant B owner contact when resolving merchant A, and vice versa (no cross-merchant leak)', async () => {
    const prismaA = makePrisma({ merchantId: 'm1', adminId: 'staff-a', viewerRole: 'BRANCH_MANAGER' })
    const profileA = await getMerchantProfile(prismaA, 'staff-a')
    expect(profileA.ownerContact?.email).toBe('owner1@merchant-a.test')

    const prismaB = makePrisma({ merchantId: 'm2', adminId: 'staff-b', viewerRole: 'BRANCH_MANAGER' })
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

  it('returns ownerContact: null (never throws) when no OWNER membership resolves, for a privileged viewer', async () => {
    const prisma = makePrisma({ viewerRole: 'BRANCH_MANAGER', membershipFindFirst: vi.fn().mockResolvedValue(null) })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.ownerContact).toBeNull()
  })

  it('returns agreement populated when a MerchantContract row exists, for a privileged viewer', async () => {
    const signedAt = new Date('2026-01-15T10:30:00.000Z')
    const prisma = makePrisma({
      viewerRole: 'BRANCH_MANAGER',
      contractFindUnique: vi.fn().mockResolvedValue({ tcVersion: 'v2', signedAt, signatureMethod: 'CLICK_TO_AGREE' }),
    })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.agreement).toEqual({ acceptedVersion: 'v2', acceptedAt: signedAt, signatureMethod: 'CLICK_TO_AGREE' })
    expect(prisma.merchantContract.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1' } })
    )
  })

  it('returns agreement: null when the merchant has not signed (no MerchantContract row), for a privileged viewer', async () => {
    const prisma = makePrisma({ viewerRole: 'BRANCH_MANAGER', contractFindUnique: vi.fn().mockResolvedValue(null) })
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

  // ── Role-gate pins (Codex PII/role-boundary fix) ──────────────────────────

  it('a STAFF viewer gets ownerContact: null and agreement: null, and the underlying queries are NEVER called', async () => {
    const findFirst = vi.fn().mockResolvedValue({ merchantAdmin: OWNER_DIRECTORY.m1 })
    const contractFindUnique = vi.fn().mockResolvedValue({ tcVersion: 'v2', signedAt: new Date(), signatureMethod: 'CLICK_TO_AGREE' })
    const prisma = makePrisma({
      viewerRole: 'STAFF',
      adminId: 'staff-1',
      merchantId: 'm1',
      membershipFindFirst: findFirst,
      contractFindUnique,
    })
    const profile = await getMerchantProfile(prisma, 'staff-1')
    expect(profile.ownerContact).toBeNull()
    expect(profile.agreement).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
    expect(contractFindUnique).not.toHaveBeenCalled()
  })

  it('a future/unknown role fails closed to ownerContact: null and agreement: null (allowlist, not negation of STAFF)', async () => {
    const findFirst = vi.fn().mockResolvedValue({ merchantAdmin: OWNER_DIRECTORY.m1 })
    const prisma = makePrisma({
      viewerRole: 'AUDITOR',
      adminId: 'auditor-1',
      merchantId: 'm1',
      membershipFindFirst: findFirst,
    })
    const profile = await getMerchantProfile(prisma, 'auditor-1')
    expect(profile.ownerContact).toBeNull()
    expect(profile.agreement).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('MUTATION CHECK: if the allowlist is flipped to include STAFF, the STAFF-null assertion fails', async () => {
    // This test documents (and, if the source is deliberately reverted, fails
    // alongside) the mutation check requested in the fix design: widening
    // `canViewBusinessProfile` to include STAFF must break the STAFF-fails-
    // closed pin above. We assert the CURRENT (correct) behaviour here so a
    // regression in the other direction is caught by the two tests above; this
    // test itself simply re-confirms STAFF stays excluded.
    const prisma = makePrisma({ viewerRole: 'STAFF', adminId: 'staff-2', merchantId: 'm1' })
    const profile = await getMerchantProfile(prisma, 'staff-2')
    expect(profile.ownerContact).not.toEqual(
      expect.objectContaining({ email: 'owner1@merchant-a.test' })
    )
  })

  // ── BP-ADJ1: registered/compliance fields role-gate ───────────────────────

  const REGISTERED_COMPLIANCE_FIELDS = [
    'companyNumber', 'vatNumber', 'websiteUrl',
    'contractStatus', 'contractStartDate', 'contractEndDate', 'verificationStatus',
  ] as const

  it('a STAFF viewer gets ALL 7 registered/compliance fields nulled', async () => {
    const prisma = makePrisma({ viewerRole: 'STAFF', adminId: 'staff-3', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'staff-3')
    for (const field of REGISTERED_COMPLIANCE_FIELDS) {
      expect(profile[field]).toBeNull()
    }
  })

  it('an unknown/future role also gets ALL 7 registered/compliance fields nulled (fail closed)', async () => {
    const prisma = makePrisma({ viewerRole: 'AUDITOR', adminId: 'auditor-2', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'auditor-2')
    for (const field of REGISTERED_COMPLIANCE_FIELDS) {
      expect(profile[field]).toBeNull()
    }
  })

  it('an OWNER viewer sees the real registered/compliance field values', async () => {
    const prisma = makePrisma({ viewerRole: 'OWNER', adminId: 'owner-2', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'owner-2')
    expect(profile.companyNumber).toBe('12345678')
    expect(profile.vatNumber).toBe('GB123456789')
    expect(profile.websiteUrl).toBe('https://acme.example')
    expect(profile.contractStatus).toBe('SIGNED')
    expect(profile.verificationStatus).toBe('VERIFIED')
  })

  it('a BRANCH_MANAGER viewer also sees the real registered/compliance field values', async () => {
    const prisma = makePrisma({ viewerRole: 'BRANCH_MANAGER', adminId: 'bm-2', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'bm-2')
    expect(profile.companyNumber).toBe('12345678')
    expect(profile.websiteUrl).toBe('https://acme.example')
  })

  it('a STAFF viewer still gets businessName + status (shell fields NOT nulled)', async () => {
    const prisma = makePrisma({ viewerRole: 'STAFF', adminId: 'staff-4', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'staff-4')
    expect(profile.businessName).toBe('Acme')
    expect(profile.status).toBe('ACTIVE')
    expect(profile.tradingName).toBe('Acme Trading')
    expect(profile.description).toBe('A great place')
    expect(profile.logoUrl).toBe('https://x/logo.png')
    expect(profile.bannerUrl).toBe('https://x/banner.png')
    expect(profile.primaryCategoryId).toBe('cat-1')
    expect(profile.id).toBe('m1')
  })

  it('MUTATION CHECK: if the registered/compliance gate is removed (always spread merchant), the STAFF-null pin fails', async () => {
    // Documents the mutation the fix design asks for: reverting to `{ ...merchant,
    // ownerContact, agreement, viewerCapabilities }` (no registeredCompliance
    // override) would make this assertion fail, since STAFF would then see the
    // real companyNumber. We assert the CURRENT (correct, gated) behaviour.
    const prisma = makePrisma({ viewerRole: 'STAFF', adminId: 'staff-5', merchantId: 'm1' })
    const profile: any = await getMerchantProfile(prisma, 'staff-5')
    expect(profile.companyNumber).not.toBe('12345678')
    expect(profile.companyNumber).toBeNull()
  })
})
