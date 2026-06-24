// Branches PR-5 (D5) — real-DB coverage for the branch CREATE + CLOSE lifecycle.
//
// Exercises the services against Neon to pin the count-based create discriminator,
// the PENDING_CREATE staging (status + isActive=false + BRANCH_CREATE approval +
// auto-main safety), cancel-pending-create, the close-REQUEST guards
// (BRANCH_IS_MAIN / BRANCH_LAST_ACTIVE) + PENDING_CLOSE staging, withdraw-close,
// the OWNER-only authz matrix, and the actioner claim/release dispatch
// (entityType:'branch', no merchant onboardingStep side-effect). The applier
// (approve/reject) is the NEXT dispatch and is NOT exercised here.

import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { AppError } from '../../../src/api/shared/errors'
import {
  createBranch,
  createBranchCore,
  cancelPendingCreate,
  requestBranchClose,
  withdrawBranchClose,
} from '../../../src/api/merchant/branch/service'
import { claimApproval, releaseApproval } from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

const PREFIX = 'TEST §PR5-LIFECYCLE-'

// postcodes.io stub so createBranch's resolve-on-write never hits the network.
const HD1 = {
  status: 200,
  result: {
    postcode: 'HD1 2PY', country: 'England', region: 'Yorkshire and the Humber',
    admin_district: 'Kirklees', admin_county: 'West Yorkshire',
    parish: 'Kirklees, unparished area', admin_ward: 'Newsome',
    parliamentary_constituency: 'Huddersfield', post_town: 'Huddersfield',
    latitude: 53.6463, longitude: -1.7809,
  },
}
function stubPostcode() {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => HD1,
  } as Response)
}

let merchantId: string   // ACTIVE merchant
let ownerAdminId: string
let bmAdminId: string     // BRANCH_MANAGER
let staffAdminId: string  // STAFF
let mainBranchId: string

async function makeMerchant(name: string, status: 'ACTIVE' | 'REGISTERED' | 'SUSPENDED') {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX}${name}`, status, isTestData: true },
  })
  return m.id
}
async function makeAdmin(label: string) {
  const a = await prisma.merchantAdmin.create({
    data: { email: `pr5-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, passwordHash: 'p', firstName: 'T', lastName: 'PR5' },
  })
  return a.id
}
async function makeMembership(mId: string, aId: string, role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF', allBranches = true, allowedBranchIds: string[] = []) {
  await prisma.merchantMembership.create({
    data: { merchantId: mId, merchantAdminId: aId, role, allBranches, status: 'ACTIVE' },
  })
  // BRANCH_MANAGER / STAFF need explicit branch assignments when not allBranches.
  if (!allBranches && allowedBranchIds.length > 0) {
    const mm = await prisma.merchantMembership.findFirst({ where: { merchantId: mId, merchantAdminId: aId } })
    if (mm) {
      await prisma.merchantMembershipBranch.createMany({
        data: allowedBranchIds.map((branchId) => ({ membershipId: mm.id, branchId })),
      })
    }
  }
}
function branchData(mId: string, name: string, isMain: boolean, extra: Record<string, unknown> = {}) {
  return {
    merchantId: mId, name, isMainBranch: isMain, isActive: true, isTestData: true,
    addressLine1: '1 Test St', city: 'Testville', postcode: 'TS1 1AA',
    ...extra,
  }
}

async function sweep() {
  // Order matters: children before parents.
  await prisma.adminApproval.deleteMany({ where: { referenceType: 'branch', comment: { contains: PREFIX } } }).catch(() => {})
  // Approvals reference branch ids, not the prefix in comment for create — clean by branch instead below.
  const branches = await prisma.branch.findMany({ where: { merchant: { businessName: { startsWith: PREFIX } } }, select: { id: true } })
  const branchIds = branches.map((b) => b.id)
  if (branchIds.length > 0) {
    await prisma.adminApproval.deleteMany({ where: { referenceId: { in: branchIds }, referenceType: 'branch' } }).catch(() => {})
    await prisma.branchUser.deleteMany({ where: { branchId: { in: branchIds } } }).catch(() => {})
    await prisma.merchantMembershipBranch.deleteMany({ where: { branchId: { in: branchIds } } }).catch(() => {})
  }
  await prisma.auditLog.deleteMany({ where: { entityId: { in: branchIds } } }).catch(() => {})
  await prisma.branch.deleteMany({ where: { merchant: { businessName: { startsWith: PREFIX } } } }).catch(() => {})
  await prisma.merchantMembership.deleteMany({ where: { merchant: { businessName: { startsWith: PREFIX } } } }).catch(() => {})
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: 'pr5-' } } }).catch(() => {})
  await prisma.merchant.deleteMany({ where: { businessName: { startsWith: PREFIX } } }).catch(() => {})
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await sweep()
})
afterAll(async () => {
  await sweep()
  await prisma.$disconnect()
})
afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(async () => {
  await sweep()
  merchantId = await makeMerchant('main', 'ACTIVE')
  ownerAdminId = await makeAdmin('owner')
  await makeMembership(merchantId, ownerAdminId, 'OWNER', true)
  mainBranchId = (await prisma.branch.create({ data: branchData(merchantId, 'Main', true) })).id
})

describe('Branches PR-5 — CREATE lifecycle (real DB)', () => {
  it('CREATE of the FIRST branch (count === 0) is INSTANT LIVE + auto-main', async () => {
    // Fresh merchant with NO branches yet.
    const freshMerchant = await makeMerchant('first', 'REGISTERED')
    const freshOwner = await makeAdmin('first-owner')
    await makeMembership(freshMerchant, freshOwner, 'OWNER', true)
    stubPostcode()

    const branch = await createBranch(prisma, freshOwner, {
      name: 'First Branch', addressLine1: '1 A St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)

    expect(branch.lifecycleStatus).toBe('LIVE')
    expect(branch.isActive).toBe(true)
    expect(branch.isMainBranch).toBe(true)
    const approvals = await prisma.adminApproval.count({ where: { referenceId: branch.id, type: 'BRANCH_CREATE' } })
    expect(approvals).toBe(0)
  })

  it('CREATE of a SUBSEQUENT branch (count >= 1) on a LIVE merchant stages PENDING_CREATE + BRANCH_CREATE approval, isActive=false, NOT auto-main', async () => {
    stubPostcode()
    const branch = await createBranch(prisma, ownerAdminId, {
      name: 'Second Branch', addressLine1: '2 B St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)

    expect(branch.lifecycleStatus).toBe('PENDING_CREATE')
    expect(branch.isActive).toBe(false)
    expect(branch.isMainBranch).toBe(false)
    const approval = await prisma.adminApproval.findFirst({ where: { referenceId: branch.id, type: 'BRANCH_CREATE' } })
    expect(approval).not.toBeNull()
    expect(approval?.referenceType).toBe('branch')
    expect(approval?.status).toBe('PENDING')
    // The main branch is unchanged.
    const main = await prisma.branch.findUnique({ where: { id: mainBranchId } })
    expect(main?.isMainBranch).toBe(true)
  })

  it('CREATE of a SECOND branch PRE-LIVE during onboarding (Codex case) stages PENDING_CREATE (NOT instant)', async () => {
    // Pre-live merchant (REGISTERED) that already has its first/main onboarding branch.
    const preMerchant = await makeMerchant('prelive', 'REGISTERED')
    const preOwner = await makeAdmin('prelive-owner')
    await makeMembership(preMerchant, preOwner, 'OWNER', true)
    await prisma.branch.create({ data: branchData(preMerchant, 'Onboarding Main', true) })
    stubPostcode()

    const second = await createBranch(prisma, preOwner, {
      name: 'Pre-live Second', addressLine1: '3 C St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)

    expect(second.lifecycleStatus).toBe('PENDING_CREATE')
    expect(second.isActive).toBe(false)
    expect(second.isMainBranch).toBe(false)
    const approval = await prisma.adminApproval.findFirst({ where: { referenceId: second.id, type: 'BRANCH_CREATE' } })
    expect(approval).not.toBeNull()
  })

  it('admin create-draft-on-behalf (stageForApproval default false) is INSTANT LIVE — no pending, no approval', async () => {
    // A second branch created via createBranchCore directly with the ADMIN actor and
    // the default stageForApproval (false), mirroring the admin create-draft route.
    stubPostcode()
    const branch = await createBranchCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: 'admin-x', reason: 'ops fix' } },
      { name: 'Admin Draft', addressLine1: '4 D St', city: 'Huddersfield', postcode: 'HD1 2PY' },
      ctx,
      // stageForApproval omitted -> false
    )
    expect(branch.lifecycleStatus).toBe('LIVE')
    expect(branch.isActive).toBe(true)
    const approvals = await prisma.adminApproval.count({ where: { referenceId: branch.id, type: 'BRANCH_CREATE' } })
    expect(approvals).toBe(0)
  })

  it('auto-main invariant: a PENDING_CREATE branch does NOT count toward existingCount, so the next instant create cannot be promoted by it', async () => {
    stubPostcode()
    // Stage a pending second branch.
    const pending = await createBranch(prisma, ownerAdminId, {
      name: 'Pending', addressLine1: '5 E St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)
    expect(pending.lifecycleStatus).toBe('PENDING_CREATE')
    // The main branch is still the only LIVE non-pending non-deleted branch and stays main.
    const liveCount = await prisma.branch.count({
      where: { merchantId, deletedAt: null, lifecycleStatus: { not: 'PENDING_CREATE' } },
    })
    expect(liveCount).toBe(1)
    const main = await prisma.branch.findUnique({ where: { id: mainBranchId } })
    expect(main?.isMainBranch).toBe(true)
  })

  it('cancelPendingCreate removes the branch row + its BRANCH_CREATE approval', async () => {
    stubPostcode()
    const pending = await createBranch(prisma, ownerAdminId, {
      name: 'ToCancel', addressLine1: '6 F St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)
    const res = await cancelPendingCreate(prisma, ownerAdminId, pending.id, ctx)
    expect(res.ok).toBe(true)
    const gone = await prisma.branch.findUnique({ where: { id: pending.id } })
    expect(gone).toBeNull()
    const approvals = await prisma.adminApproval.count({ where: { referenceId: pending.id, type: 'BRANCH_CREATE' } })
    expect(approvals).toBe(0)
  })

  it('cancelPendingCreate on a LIVE branch -> BRANCH_NOT_PENDING_CREATE', async () => {
    await expect(cancelPendingCreate(prisma, ownerAdminId, mainBranchId, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_NOT_PENDING_CREATE' }),
    )
  })
})

describe('Branches PR-5 — CLOSE lifecycle (real DB)', () => {
  it('CLOSE-request on a non-main branch of an ACTIVE merchant stays LIVE + isActive + sets PENDING_CLOSE + BRANCH_CLOSE approval', async () => {
    const second = await prisma.branch.create({ data: branchData(merchantId, 'Second Live', false) })
    const updated = await requestBranchClose(prisma, ownerAdminId, second.id, 'Lease ended', ctx)

    expect(updated.lifecycleStatus).toBe('PENDING_CLOSE')
    expect(updated.isActive).toBe(true)          // STAYS live until approval
    expect(updated.closeReason).toBe('Lease ended')
    expect(updated.deletedAt).toBeNull()
    const approval = await prisma.adminApproval.findFirst({ where: { referenceId: second.id, type: 'BRANCH_CLOSE' } })
    expect(approval).not.toBeNull()
    expect(approval?.status).toBe('PENDING')
    expect(approval?.referenceType).toBe('branch')
  })

  it('CLOSE-request on the MAIN branch -> BRANCH_IS_MAIN, no approval created', async () => {
    await expect(requestBranchClose(prisma, ownerAdminId, mainBranchId, 'nope', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_IS_MAIN' }),
    )
    const approvals = await prisma.adminApproval.count({ where: { referenceId: mainBranchId, type: 'BRANCH_CLOSE' } })
    expect(approvals).toBe(0)
    const main = await prisma.branch.findUnique({ where: { id: mainBranchId } })
    expect(main?.lifecycleStatus).toBe('LIVE')
  })

  it('CLOSE-request on the LAST ACTIVE branch of a live merchant -> BRANCH_LAST_ACTIVE', async () => {
    // Demote main, then there is only one active branch which is now non-main -> last-active guard fires.
    // Build a merchant whose ONLY active branch is a non-main one.
    const lastMerchant = await makeMerchant('lastactive', 'ACTIVE')
    const lastOwner = await makeAdmin('lastactive-owner')
    await makeMembership(lastMerchant, lastOwner, 'OWNER', true)
    // A main branch that is INACTIVE + a single ACTIVE non-main branch.
    await prisma.branch.create({ data: branchData(lastMerchant, 'Main Inactive', true, { isActive: false }) })
    const onlyActive = await prisma.branch.create({ data: branchData(lastMerchant, 'Only Active', false) })

    await expect(requestBranchClose(prisma, lastOwner, onlyActive.id, 'bye', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_LAST_ACTIVE' }),
    )
  })

  it('CLOSE-request twice -> BRANCH_CLOSE_REQUEST_EXISTS on the second', async () => {
    const second = await prisma.branch.create({ data: branchData(merchantId, 'Twice', false) })
    await requestBranchClose(prisma, ownerAdminId, second.id, 'first', ctx)
    await expect(requestBranchClose(prisma, ownerAdminId, second.id, 'second', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_CLOSE_REQUEST_EXISTS' }),
    )
  })

  it('withdrawBranchClose reverts to LIVE + clears closeReason + removes the approval', async () => {
    const second = await prisma.branch.create({ data: branchData(merchantId, 'Withdraw', false) })
    await requestBranchClose(prisma, ownerAdminId, second.id, 'maybe', ctx)
    const updated = await withdrawBranchClose(prisma, ownerAdminId, second.id, ctx)

    expect(updated.lifecycleStatus).toBe('LIVE')
    expect(updated.closeReason).toBeNull()
    expect(updated.isActive).toBe(true)
    const approvals = await prisma.adminApproval.count({ where: { referenceId: second.id, type: 'BRANCH_CLOSE' } })
    expect(approvals).toBe(0)
  })

  it('withdrawBranchClose on a LIVE (non-pending-close) branch -> BRANCH_CLOSE_REQUEST_NOT_FOUND', async () => {
    const second = await prisma.branch.create({ data: branchData(merchantId, 'NoClose', false) })
    await expect(withdrawBranchClose(prisma, ownerAdminId, second.id, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'BRANCH_CLOSE_REQUEST_NOT_FOUND' }),
    )
  })
})

describe('Branches PR-5 — authz (OWNER-only) (real DB)', () => {
  it('a BRANCH_MANAGER cannot create / close / cancel / withdraw (INVALID_CREDENTIALS via resolveAdminMerchant)', async () => {
    const bm = await makeAdmin('bm')
    await makeMembership(merchantId, bm, 'BRANCH_MANAGER', true)
    stubPostcode()
    const second = await prisma.branch.create({ data: branchData(merchantId, 'BM Target', false) })

    // resolveAdminMerchant resolves only the OWNER membership -> a BM gets INVALID_CREDENTIALS.
    await expect(createBranch(prisma, bm, { name: 'X', addressLine1: '1', city: 'Y', postcode: 'HD1 2PY' }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
    await expect(requestBranchClose(prisma, bm, second.id, 'r', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
    await expect(cancelPendingCreate(prisma, bm, second.id, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
    await expect(withdrawBranchClose(prisma, bm, second.id, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
  })

  it('a STAFF member cannot create / close (INVALID_CREDENTIALS)', async () => {
    const staff = await makeAdmin('staff')
    await makeMembership(merchantId, staff, 'STAFF', true)
    const second = await prisma.branch.create({ data: branchData(merchantId, 'Staff Target', false) })
    stubPostcode()
    await expect(createBranch(prisma, staff, { name: 'X', addressLine1: '1', city: 'Y', postcode: 'HD1 2PY' }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
    await expect(requestBranchClose(prisma, staff, second.id, 'r', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    )
  })

  it('a SUSPENDED merchant owner is denied (MERCHANT_SUSPENDED)', async () => {
    const susMerchant = await makeMerchant('suspended', 'SUSPENDED')
    const susOwner = await makeAdmin('suspended-owner')
    await makeMembership(susMerchant, susOwner, 'OWNER', true)
    const b = await prisma.branch.create({ data: branchData(susMerchant, 'Sus Main', true) })
    const b2 = await prisma.branch.create({ data: branchData(susMerchant, 'Sus Second', false) })
    stubPostcode()

    await expect(createBranch(prisma, susOwner, { name: 'X', addressLine1: '1', city: 'Y', postcode: 'HD1 2PY' }, ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'MERCHANT_SUSPENDED' }),
    )
    await expect(requestBranchClose(prisma, susOwner, b2.id, 'r', ctx)).rejects.toThrow(
      expect.objectContaining({ code: 'MERCHANT_SUSPENDED' }),
    )
    expect(b.id).toBeTruthy()
  })
})

describe('Branches PR-5 — actioner claim/release dispatch (real DB)', () => {
  it('claimApproval on a BRANCH_CREATE approval audits entityType:branch, entityId=branchId, with NO merchant onboardingStep change', async () => {
    stubPostcode()
    const pending = await createBranch(prisma, ownerAdminId, {
      name: 'Claimable', addressLine1: '9 J St', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, ctx)
    const approval = await prisma.adminApproval.findFirstOrThrow({ where: { referenceId: pending.id, type: 'BRANCH_CREATE' } })

    const merchantBefore = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { onboardingStep: true } })
    await claimApproval(prisma, approval.id, 'admin-claimer', ctx)
    const merchantAfter = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { onboardingStep: true } })
    expect(merchantAfter?.onboardingStep).toBe(merchantBefore?.onboardingStep) // unchanged

    const audit = await prisma.auditLog.findFirst({
      where: { event: 'MERCHANT_APPROVAL_CLAIMED', entityId: pending.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit?.entityType).toBe('branch')
    expect(audit?.entityId).toBe(pending.id)
  })

  it('releaseApproval on a BRANCH_CLOSE approval audits entityType:branch, entityId=branchId, NO onboardingStep change', async () => {
    const second = await prisma.branch.create({ data: branchData(merchantId, 'CloseClaim', false) })
    await requestBranchClose(prisma, ownerAdminId, second.id, 'r', ctx)
    const approval = await prisma.adminApproval.findFirstOrThrow({ where: { referenceId: second.id, type: 'BRANCH_CLOSE' } })

    // Claim first (releaseApproval requires a claimed approval), then release.
    await claimApproval(prisma, approval.id, 'admin-claimer', ctx)
    const merchantBefore = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { onboardingStep: true } })
    await releaseApproval(prisma, approval.id, 'admin-claimer', 'OPS_ADMIN', ctx)
    const merchantAfter = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { onboardingStep: true } })
    expect(merchantAfter?.onboardingStep).toBe(merchantBefore?.onboardingStep)

    const audit = await prisma.auditLog.findFirst({
      where: { event: 'MERCHANT_APPROVAL_RELEASED', entityId: second.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit).not.toBeNull()
    expect(audit?.entityType).toBe('branch')
    expect(audit?.entityId).toBe(second.id)
  })
})
