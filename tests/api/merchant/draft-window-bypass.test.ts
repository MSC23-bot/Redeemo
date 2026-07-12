// tests/api/merchant/draft-window-bypass.test.ts
//
// M2 Backend slice B1 (D1): the lifecycle-conditioned "draft-window" sensitive-
// field bypass. While the merchant application is a DRAFT (status REGISTERED) or
// an admin has asked for changes during onboarding (onboardingStep NEEDS_CHANGES),
// profile + branch sensitive identity fields write DIRECTLY (no admin edit-request
// round-trip). Once live (ACTIVE / etc.), the governed edit-request lane resumes.
//
// Unit-style mocked tests against the service functions directly (mirrors
// branch/resolve-on-write.test.ts). They assert:
//   - draft-window profile sensitive write applies directly + audits + creates NO
//     MerchantPendingEdit
//   - the NEEDS_CHANGES window behaves the same as REGISTERED
//   - a live (ACTIVE) merchant still routes profile sensitive fields to the
//     edit-request lane (the SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST throw)
//   - the DIRECT_SIMPLE profile fields (websiteUrl) work in BOTH windows
//   - draft-window branch sensitive write applies directly + audits + creates NO
//     BranchPendingEdit, AND re-resolves location when postcode changes (writes
//     the RESOLVED lat/lng/locality, not the raw postcode)
//   - a live (ACTIVE) merchant still routes branch sensitive fields to
//     BranchPendingEdit (the edit-request lane)
//   - the DIRECT branch fields (phone) work in BOTH windows
//   - isDraftWindow boundary cases

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'
import { isDraftWindow } from '../../../src/api/merchant/shared'

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { updateMerchantProfile } from '../../../src/api/merchant/profile/service'
import { updateBranch, createBranchPhotoEditRequest } from '../../../src/api/merchant/branch/service'

const ADMIN_ID = 'admin-1'
const MERCHANT_ID = 'merchant-1'
const BRANCH_ID = 'branch-1'
const CTX = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

const CO7_RESPONSE = {
  status: 200,
  result: {
    postcode: 'CO7 0UB',
    country: 'England',
    region: 'East of England',
    admin_district: 'Tendring',
    admin_county: 'Essex',
    parish: 'Brightlingsea',
    admin_ward: 'Brightlingsea',
    parliamentary_constituency: 'Clacton',
    post_town: null,
    latitude: 51.81,
    longitude: 1.02,
  },
}

function buildPrismaMock(opts: { status: string; onboardingStep: string }) {
  const mock: any = {
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID,
        // joined merchant.status (M6a / SEC-M2); ACTIVE/REGISTERED both pass the
        // SUSPENDED gate. The B1 predicate reads status + onboardingStep via a
        // dedicated merchant.findUnique (below), NOT this joined value.
        merchant: { status: opts.status, businessName: 'Test Co' },
      }),
      // Staff & Access PR-2: updateBranch now resolves via resolveMerchantContext
      // -> getActiveMembership -> findMany. These draft-window tests act as the
      // OWNER (allBranches), which clears assertBranchAllowed + assertOwner.
      findMany: vi.fn().mockResolvedValue([{
        id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID, role: 'OWNER',
        allBranches: true, canManageVouchers: false,
        merchant: { status: opts.status, businessName: 'Test Co' }, branches: [],
      }]),
    },
    merchant: {
      // Predicate read (status + onboardingStep) + the direct-core before-snapshot.
      findUnique: vi.fn().mockResolvedValue({
        id: MERCHANT_ID,
        status: opts.status,
        onboardingStep: opts.onboardingStep,
        businessName: 'Old Co',
        tradingName: null,
        logoUrl: null,
        bannerUrl: null,
        description: null,
        websiteUrl: 'https://old.com',
        vatNumber: null,
        companyNumber: null,
        primaryCategoryId: 'cat-1',
        contractStatus: 'NOT_SIGNED',
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: MERCHANT_ID, ...data,
      })),
    },
    merchantPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'pending-edit-1', ...data,
      })),
    },
    branch: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue({
        id: BRANCH_ID, merchantId: MERCHANT_ID, deletedAt: null,
        name: 'Old Branch', about: 'Old about',
        addressLine1: '1 Old St', addressLine2: null, city: 'Oldtown',
        postcode: 'EC1A 1BB', latitude: 51.5, longitude: -0.1,
        localityId: 'loc-old', localityName: 'Oldtown',
        phone: '+44111', email: null, websiteUrl: null, isActive: true,
        logoUrl: null, bannerUrl: null,
        openingHours: [], amenities: [], photos: [], pendingEdits: [],
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: BRANCH_ID, ...data,
        openingHours: [], amenities: [], photos: [], pendingEdits: [],
      })),
    },
    branchPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'branch-pending-edit-1', ...data,
      })),
    },
    adminApproval: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // Owner decision 7-photos: the branch-photo draft-window bypass reads/writes
    // BranchPhoto directly (findMany for the remove-ownership check, aggregate for
    // the next sortOrder, create/deleteMany for the direct apply). The governed
    // lane (live merchant) never touches these; only branchPendingEdit/adminApproval.
    branchPhoto: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'branch-photo-1', ...data,
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    locality: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'locality-resolved-1', ...data,
      })),
    },
  }
  mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))
  return mock as any
}

describe('isDraftWindow predicate', () => {
  it('is true for status REGISTERED (setting up)', () => {
    expect(isDraftWindow({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })).toBe(true)
  })
  it('is true for onboardingStep NEEDS_CHANGES (changes-needed window)', () => {
    expect(isDraftWindow({ status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })).toBe(true)
  })
  it('is false for SUBMITTED (view-only)', () => {
    expect(isDraftWindow({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })).toBe(false)
  })
  it('is false for UNDER_REVIEW (view-only)', () => {
    expect(isDraftWindow({ status: 'PENDING_APPROVAL', onboardingStep: 'UNDER_REVIEW' })).toBe(false)
  })
  it('is false for a live merchant (ACTIVE / LIVE)', () => {
    expect(isDraftWindow({ status: 'ACTIVE', onboardingStep: 'LIVE' })).toBe(false)
  })
})

describe('B1 profile draft-window sensitive-field bypass', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('REGISTERED: writes sensitive fields directly, audits, creates NO MerchantPendingEdit', async () => {
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })

    await updateMerchantProfile(prisma, ADMIN_ID, {
      businessName: 'New Co Ltd',
      tradingName: 'New Co',
      description: 'We sell things.',
      logoUrl: 'https://example.test/logo.png',
      bannerUrl: 'https://example.test/banner.png',
    }, CTX)

    expect(prisma.merchant.update).toHaveBeenCalledOnce()
    const written = prisma.merchant.update.mock.calls[0][0].data
    expect(written).toMatchObject({
      businessName: 'New Co Ltd',
      tradingName: 'New Co',
      description: 'We sell things.',
      logoUrl: 'https://example.test/logo.png',
      bannerUrl: 'https://example.test/banner.png',
    })
    // The edit-request lane must NOT be touched.
    expect(prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
    expect(prisma.adminApproval.create).not.toHaveBeenCalled()
    // Actor-attributed audit.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'MERCHANT_PROFILE_UPDATED',
          actorType: 'MERCHANT_ADMIN',
          actorId: ADMIN_ID,
        }),
      })
    )
  })

  it('NEEDS_CHANGES: writes sensitive fields directly, creates NO MerchantPendingEdit', async () => {
    const prisma = buildPrismaMock({ status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })

    await updateMerchantProfile(prisma, ADMIN_ID, { businessName: 'Fixed Name Ltd' }, CTX)

    expect(prisma.merchant.update).toHaveBeenCalledOnce()
    expect(prisma.merchant.update.mock.calls[0][0].data).toMatchObject({ businessName: 'Fixed Name Ltd' })
    expect(prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('live (ACTIVE): sensitive fields still throw SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST', async () => {
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })

    await expect(
      updateMerchantProfile(prisma, ADMIN_ID, { businessName: 'Not Allowed Directly' }, CTX)
    ).rejects.toMatchObject({ code: 'SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST' })

    expect(prisma.merchant.update).not.toHaveBeenCalled()
  })

  it('SUBMITTED (view-only): sensitive fields still throw (not in the draft window)', async () => {
    const prisma = buildPrismaMock({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })

    await expect(
      updateMerchantProfile(prisma, ADMIN_ID, { businessName: 'Should Be Blocked' }, CTX)
    ).rejects.toMatchObject({ code: 'SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST' })
    expect(prisma.merchant.update).not.toHaveBeenCalled()
  })

  it('DIRECT_SIMPLE field (websiteUrl) writes directly in the draft window', async () => {
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })
    await updateMerchantProfile(prisma, ADMIN_ID, { websiteUrl: 'https://new.com' }, CTX)
    expect(prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ websiteUrl: 'https://new.com' }) })
    )
    expect(prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })

  it('DIRECT_SIMPLE field (websiteUrl) writes directly when live too', async () => {
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })
    await updateMerchantProfile(prisma, ADMIN_ID, { websiteUrl: 'https://new.com' }, CTX)
    expect(prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ websiteUrl: 'https://new.com' }) })
    )
    expect(prisma.merchantPendingEdit.create).not.toHaveBeenCalled()
  })
})

describe('B1 branch draft-window sensitive-field bypass', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('REGISTERED: writes sensitive branch fields directly, audits, creates NO BranchPendingEdit', async () => {
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })

    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, {
      name: 'New Branch Name',
      about: 'A lovely place.',
      addressLine1: '2 New St',
      city: 'Newtown',
    }, CTX)

    expect(prisma.branch.update).toHaveBeenCalledOnce()
    const written = prisma.branch.update.mock.calls[0][0].data
    expect(written).toMatchObject({
      name: 'New Branch Name',
      about: 'A lovely place.',
      addressLine1: '2 New St',
      city: 'Newtown',
    })
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
    expect(prisma.adminApproval.create).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: 'BRANCH_UPDATED',
          entityType: 'branch',
          entityId: BRANCH_ID,
          actorType: 'MERCHANT_ADMIN',
          actorId: ADMIN_ID,
        }),
      })
    )
  })

  it('REGISTERED: a postcode change re-resolves location (writes RESOLVED lat/lng/locality, not raw)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => CO7_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })

    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, {
      postcode: 'CO7 0UB',
      latitude: 99.9, longitude: 99.9, // caller-supplied; must be overwritten by the resolver
    }, CTX)

    expect(prisma.branch.update).toHaveBeenCalledOnce()
    const written = prisma.branch.update.mock.calls[0][0].data
    expect(written.postcode).toBe('CO7 0UB')
    // Resolved from the postcode centroid, NOT the raw caller-supplied 99.9.
    expect(written.latitude).toBe(51.81)
    expect(written.longitude).toBe(1.02)
    expect(written.localityId).toBe('locality-resolved-1')
    expect(written.adminCounty).toBe('Essex')
    expect(written.region).toBe('East of England')
    expect(written.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(written.locationResolvedAt).toBeInstanceOf(Date)
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('live (ACTIVE): sensitive branch fields still route to BranchPendingEdit (edit-request lane)', async () => {
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })

    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, { name: 'Live Rename Attempt' }, CTX)

    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    expect(prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges).toMatchObject({
      name: 'Live Rename Attempt',
    })
    expect(prisma.adminApproval.create).toHaveBeenCalledOnce()
    // The direct branch.update must NOT have written the sensitive field.
    expect(prisma.branch.update).not.toHaveBeenCalled()
  })

  it('DIRECT field (phone) writes directly in the draft window', async () => {
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })
    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, { phone: '+44222' }, CTX)
    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+44222' }) })
    )
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('DIRECT field (phone) writes directly when live too', async () => {
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })
    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, { phone: '+44222' }, CTX)
    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+44222' }) })
    )
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
  })

  it('live (ACTIVE): a sensitive postcode edit eagerly resolves into proposedChanges (edit-request lane)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => CO7_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })

    await updateBranch(prisma, ADMIN_ID, BRANCH_ID, { postcode: 'CO7 0UB' }, CTX)

    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.postcode).toBe('CO7 0UB')
    expect(proposed.latitude).toBe(51.81)
    expect(prisma.branch.update).not.toHaveBeenCalled()
  })
})

// Owner decision 7-photos (walkthrough finding, 2026-07-11): logo/banner already
// bypass the governed edit-request lane in the draft window (M2 D1, above); branch
// PHOTOS did not, so a first, not-yet-live branch's onboarding photos sat invisible
// until an admin acted. This gives photos the SAME isDraftWindow bypass. Mirrors the
// "B1 branch draft-window sensitive-field bypass" describe block's structure/idioms.
describe('7-photos: draft-window branch PHOTO bypass', () => {
  const savedPublicBase = process.env.R2_PUBLIC_BASE_URL
  const PHOTO_URL = 'https://cdn.example/photo/merchant-1/newphoto.png'

  beforeEach(() => {
    vi.restoreAllMocks()
    // parsePublicUrl's owned-upload check requires R2_PUBLIC_BASE_URL + a URL that
    // inverts to { kind:'photo', ownerId: MERCHANT_ID }.
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example'
  })

  afterEach(() => {
    if (savedPublicBase === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = savedPublicBase
  })

  it.each([
    ['REGISTERED (onboarding setup)', { status: 'REGISTERED', onboardingStep: 'REGISTERED' }],
    ['NEEDS_CHANGES (admin asked for changes)', { status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' }],
  ])(
    '%s: photo add applies DIRECTLY as an APPROVED BranchPhoto, no BranchPendingEdit/AdminApproval',
    async (_label, lifecycle) => {
      const prisma = buildPrismaMock(lifecycle as { status: string; onboardingStep: string })

      const result = await createBranchPhotoEditRequest(prisma, ADMIN_ID, BRANCH_ID, { add: [PHOTO_URL] }, CTX)

      // Mirrors editApplier's branchPhoto.create shape EXACTLY: branchId, url,
      // moderationStatus APPROVED, sortOrder.
      expect(prisma.branchPhoto.create).toHaveBeenCalledOnce()
      expect(prisma.branchPhoto.create).toHaveBeenCalledWith({
        data: { branchId: BRANCH_ID, url: PHOTO_URL, moderationStatus: 'APPROVED', sortOrder: 0 },
      })
      // The governed lane is NOT touched.
      expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
      expect(prisma.adminApproval.create).not.toHaveBeenCalled()
      // The response is discriminable from the governed lane's PENDING BranchPendingEdit.
      expect(result).toMatchObject({ status: 'APPLIED', branchId: BRANCH_ID, photosAdded: [PHOTO_URL] })
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'BRANCH_PHOTOS_DRAFT_APPLIED',
            entityType: 'merchant',
            entityId: MERCHANT_ID,
          }),
        }),
      )
    },
  )

  it('REGISTERED: photo remove ALSO applies directly (branchPhoto.deleteMany, no pending edit)', async () => {
    const prisma = buildPrismaMock({ status: 'REGISTERED', onboardingStep: 'REGISTERED' })
    prisma.branchPhoto.findMany = vi.fn().mockResolvedValue([{ id: 'p-owned' }])

    const result = await createBranchPhotoEditRequest(prisma, ADMIN_ID, BRANCH_ID, { remove: ['p-owned'] }, CTX)

    expect(prisma.branchPhoto.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-owned'] }, branchId: BRANCH_ID },
    })
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'APPLIED', photosRemoved: ['p-owned'] })
  })

  it('live (ACTIVE): photo add STILL uses the governed lane (BranchPendingEdit + AdminApproval PENDING, no immediate BranchPhoto): UNCHANGED', async () => {
    const prisma = buildPrismaMock({ status: 'ACTIVE', onboardingStep: 'LIVE' })

    const result = await createBranchPhotoEditRequest(prisma, ADMIN_ID, BRANCH_ID, { add: [PHOTO_URL] }, CTX)

    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    expect(prisma.branchPendingEdit.create.mock.calls[0][0].data).toMatchObject({
      branchId: BRANCH_ID,
      includesPhotos: true,
      status: 'PENDING',
      proposedChanges: { add: [PHOTO_URL] },
    })
    expect(prisma.adminApproval.create).toHaveBeenCalledOnce()
    expect(prisma.branchPhoto.create).not.toHaveBeenCalled()
    expect((result as { status?: string }).status).toBe('PENDING')
  })

  it('live (ACTIVE): SUBMITTED / UNDER_REVIEW view-only window still routes through the governed lane too', async () => {
    const prisma = buildPrismaMock({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })

    await createBranchPhotoEditRequest(prisma, ADMIN_ID, BRANCH_ID, { add: [PHOTO_URL] }, CTX)

    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    expect(prisma.branchPhoto.create).not.toHaveBeenCalled()
  })
})
