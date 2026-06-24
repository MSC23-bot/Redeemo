// Branches PR-5 (D5) — real-DB coverage for the admin branch-lifecycle APPLIER
// (approve/reject for BRANCH_CREATE + BRANCH_CLOSE). Section 8 (applier) of the
// PR-5 mini-spec. Mirrors the editApplier integration patterns/factories.
//
// Pins: CREATE-approve requires isBranchLocationConfirmed (unconfirmed -> gate
// error; confirmed -> LIVE + isActive=true + APPROVED + ADMIN audit + owner
// notify); double-approve idempotent; CREATE-reject leaves the branch
// PENDING_CREATE + approval CHANGES_REQUESTED + owner notified (branch NOT
// deleted); CLOSE-approve -> deactivated (deletedAt + isActive=false) + CLOSED +
// APPROVED; CLOSE-reject -> reverts LIVE + closeReason cleared; cross-lifecycle
// isolation (acting on one does not touch the other); unknown/other type ->
// APPROVAL_NOT_ACTIONABLE (no regression for existing types).

import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Mock notify so approve/reject don't enqueue real email jobs.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import { approveBranchLifecycle, rejectBranchLifecycle } from '../../../src/api/admin/approvals/branchLifecycleApplier'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'pr5-lifecycle-applier'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'pr5-applier-test' }
const dummyRedis = {} as any
let ADMIN_ID = ''
let seq = 0

/** A merchant + ACTIVE OWNER membership so the after-commit owner notify resolves. */
async function makeMerchant(businessName: string, status: 'ACTIVE' | 'REGISTERED' = 'ACTIVE') {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${businessName}`, status, isTestData: true },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}-${Date.now()}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  return m.id
}

/** A branch with a given lifecycle + main flag + location confidence. */
async function makeBranch(
  merchantId: string,
  name: string,
  opts: {
    lifecycleStatus?: 'PENDING_CREATE' | 'LIVE' | 'PENDING_CLOSE' | 'CLOSED'
    isMainBranch?: boolean
    isActive?: boolean
    locationConfidence?: 'POSTCODE_CENTROID' | 'MANUALLY_CONFIRMED' | 'ADDRESS_GEOCODED' | 'NEEDS_REVIEW'
    closeReason?: string | null
  } = {},
) {
  const b = await prisma.branch.create({
    data: {
      merchantId,
      name: `${PREFIX} ${name}`,
      isMainBranch: opts.isMainBranch ?? false,
      addressLine1: '1 Old Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      isActive: opts.isActive ?? true,
      isTestData: true,
      lifecycleStatus: opts.lifecycleStatus ?? 'LIVE',
      locationConfidence: opts.locationConfidence ?? 'POSTCODE_CENTROID',
      localityName: 'City of London',
      ...(opts.closeReason !== undefined ? { closeReason: opts.closeReason } : {}),
    },
  })
  return b.id
}

async function makeApproval(type: 'BRANCH_CREATE' | 'BRANCH_CLOSE', branchId: string) {
  const a = await prisma.adminApproval.create({
    data: { type, status: 'PENDING', referenceId: branchId, referenceType: 'branch', comment: `${PREFIX} ${type} ${branchId}` },
  })
  return a.id
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `${PREFIX}-admin-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'PR5', lastName: 'Applier', role: 'OPERATIONS' },
  })
  ADMIN_ID = a.id
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

afterAll(async () => {
  // BULK prefix-scoped cleanup (self-healing). FK order: audit + approvals + branch
  // children before branches + merchants + owners.
  const merchantIds = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((b) => b.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...merchantIds, ...branchIds] } } })
    if (branchIds.length) {
      await prisma.adminApproval.deleteMany({ where: { referenceId: { in: branchIds }, referenceType: 'branch' } })
      await prisma.branchUser.deleteMany({ where: { branchId: { in: branchIds } } })
    }
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('PR-5 applier: BRANCH_CREATE approve (real DB)', () => {
  it('requires isBranchLocationConfirmed: an UNCONFIRMED (POSTCODE_CENTROID) branch -> MAIN_BRANCH_LOCATION_UNCONFIRMED; branch stays PENDING_CREATE', async () => {
    const merchantId = await makeMerchant('Create Gate Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const pendingId = await makeBranch(merchantId, 'Pending Unconfirmed', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'POSTCODE_CENTROID',
    })
    const approvalId = await makeApproval('BRANCH_CREATE', pendingId)

    await expect(approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow(
      'MAIN_BRANCH_LOCATION_UNCONFIRMED',
    )

    const branch = await prisma.branch.findUnique({ where: { id: pendingId } })
    expect(branch?.lifecycleStatus).toBe('PENDING_CREATE')
    expect(branch?.isActive).toBe(false)
    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('PENDING')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('a CONFIRMED branch flips LIVE + isActive=true + APPROVED + ADMIN before/after audit + owner notify', async () => {
    const merchantId = await makeMerchant('Create Approve Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const pendingId = await makeBranch(merchantId, 'Pending Confirmed', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const approvalId = await makeApproval('BRANCH_CREATE', pendingId)

    const res = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true, alreadyDone: false })

    const branch = await prisma.branch.findUnique({ where: { id: pendingId } })
    expect(branch?.lifecycleStatus).toBe('LIVE')
    expect(branch?.isActive).toBe(true)

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('APPROVED')
    expect(approval?.adminUserId).toBe(ADMIN_ID)
    expect(approval?.claimedById).toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { entityId: pendingId, event: 'BRANCH_CREATE_APPROVED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.before).toMatchObject({ lifecycleStatus: 'PENDING_CREATE' })
    expect(audit?.after).toMatchObject({ lifecycleStatus: 'LIVE', isActive: true })

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({ type: 'branch_create_approved' })
  })

  it('double-approve is idempotent (second call is a no-op, no re-notify)', async () => {
    const merchantId = await makeMerchant('Create Idempotent Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const pendingId = await makeBranch(merchantId, 'Pending Twice', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const approvalId = await makeApproval('BRANCH_CREATE', pendingId)

    const first = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(first).toEqual({ approved: true, alreadyDone: false })
    const second = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(second).toEqual({ approved: true, alreadyDone: true })

    const branch = await prisma.branch.findUnique({ where: { id: pendingId } })
    expect(branch?.lifecycleStatus).toBe('LIVE')
    // Only the first approve fired a notify.
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})

describe('PR-5 applier: BRANCH_CREATE reject (real DB)', () => {
  it('leaves the branch PENDING_CREATE (NOT deleted) + approval CHANGES_REQUESTED + reason + owner notified', async () => {
    const merchantId = await makeMerchant('Create Reject Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const pendingId = await makeBranch(merchantId, 'Pending Reject', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'POSTCODE_CENTROID',
    })
    const approvalId = await makeApproval('BRANCH_CREATE', pendingId)

    const res = await rejectBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, 'Address does not match documents.', ctx)
    expect(res).toEqual({ rejected: true })

    // Branch is NOT deleted; stays PENDING_CREATE (customer-invisible).
    const branch = await prisma.branch.findUnique({ where: { id: pendingId } })
    expect(branch).not.toBeNull()
    expect(branch?.lifecycleStatus).toBe('PENDING_CREATE')
    expect(branch?.deletedAt).toBeNull()
    expect(branch?.isActive).toBe(false)

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('CHANGES_REQUESTED')
    expect(approval?.comment).toBe('Address does not match documents.')
    expect(approval?.claimedById).toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { entityId: pendingId, event: 'BRANCH_CREATE_CHANGES_REQUESTED' } })
    expect(audit?.reason).toBe('Address does not match documents.')
    expect(audit?.actorType).toBe('ADMIN')

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({ type: 'branch_create_rejected' })
  })
})

describe('PR-5 applier: BRANCH_CLOSE approve (real DB)', () => {
  it('soft-deactivates (deletedAt + isActive=false) + CLOSED + APPROVED + deactivates staff + ADMIN audit + owner notify', async () => {
    const merchantId = await makeMerchant('Close Approve Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const closingId = await makeBranch(merchantId, 'Closing', {
      lifecycleStatus: 'PENDING_CLOSE', isActive: true, closeReason: 'Lease ended',
    })
    // A staff login on the closing branch — close-approve must deactivate it.
    const staff = await prisma.branchUser.create({
      data: { branchId: closingId, email: `${PREFIX}-staff-${Date.now()}-${seq++}@example.com`, passwordHash: 'x', firstName: 'Staff', lastName: 'One', status: 'ACTIVE' },
    })
    const approvalId = await makeApproval('BRANCH_CLOSE', closingId)

    const res = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true, alreadyDone: false })

    const branch = await prisma.branch.findUnique({ where: { id: closingId } })
    expect(branch?.lifecycleStatus).toBe('CLOSED')
    expect(branch?.isActive).toBe(false)
    expect(branch?.deletedAt).not.toBeNull()

    const su = await prisma.branchUser.findUnique({ where: { id: staff.id } })
    expect(su?.status).toBe('INACTIVE')

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('APPROVED')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: closingId, event: 'BRANCH_CLOSE_APPROVED' } })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.after).toMatchObject({ lifecycleStatus: 'CLOSED', isActive: false })

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({ type: 'branch_close_approved' })
  })

  it('double-approve is idempotent (second call no-op)', async () => {
    const merchantId = await makeMerchant('Close Idempotent Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    await makeBranch(merchantId, 'Keep Active', { isActive: true })
    const closingId = await makeBranch(merchantId, 'Closing Twice', {
      lifecycleStatus: 'PENDING_CLOSE', isActive: true, closeReason: 'bye',
    })
    const approvalId = await makeApproval('BRANCH_CLOSE', closingId)

    const first = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(first).toEqual({ approved: true, alreadyDone: false })
    const second = await approveBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(second).toEqual({ approved: true, alreadyDone: true })
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})

describe('PR-5 applier: BRANCH_CLOSE reject (real DB)', () => {
  it('reverts lifecycleStatus -> LIVE + clears closeReason + approval REJECTED + reason + owner notified', async () => {
    const merchantId = await makeMerchant('Close Reject Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const closingId = await makeBranch(merchantId, 'Reject Close', {
      lifecycleStatus: 'PENDING_CLOSE', isActive: true, closeReason: 'maybe',
    })
    const approvalId = await makeApproval('BRANCH_CLOSE', closingId)

    const res = await rejectBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, 'Keep this branch open.', ctx)
    expect(res).toEqual({ rejected: true })

    const branch = await prisma.branch.findUnique({ where: { id: closingId } })
    expect(branch?.lifecycleStatus).toBe('LIVE')
    expect(branch?.closeReason).toBeNull()
    expect(branch?.isActive).toBe(true)
    expect(branch?.deletedAt).toBeNull()

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('REJECTED')
    expect(approval?.comment).toBe('Keep this branch open.')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: closingId, event: 'BRANCH_CLOSE_REJECTED' } })
    expect(audit?.reason).toBe('Keep this branch open.')
    expect(audit?.after).toMatchObject({ lifecycleStatus: 'LIVE', closeReason: null })

    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({ type: 'branch_close_rejected' })
  })
})

describe('PR-5 applier: cross-lifecycle isolation (real DB)', () => {
  it('rejecting a CREATE does NOT touch a separate close-pending branch; rejecting a CLOSE does NOT touch a separate create-pending branch', async () => {
    const merchantId = await makeMerchant('Isolation Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const createPendingId = await makeBranch(merchantId, 'Create Pending', {
      lifecycleStatus: 'PENDING_CREATE', isActive: false, locationConfidence: 'POSTCODE_CENTROID',
    })
    const closePendingId = await makeBranch(merchantId, 'Close Pending', {
      lifecycleStatus: 'PENDING_CLOSE', isActive: true, closeReason: 'lease',
    })
    const createApprovalId = await makeApproval('BRANCH_CREATE', createPendingId)
    const closeApprovalId = await makeApproval('BRANCH_CLOSE', closePendingId)

    // Reject the CREATE — the CLOSE branch must be untouched.
    await rejectBranchLifecycle(prisma, dummyRedis, createApprovalId, ADMIN_ID, 'fix it', ctx)
    let closeBranch = await prisma.branch.findUnique({ where: { id: closePendingId } })
    expect(closeBranch?.lifecycleStatus).toBe('PENDING_CLOSE')
    expect(closeBranch?.closeReason).toBe('lease')
    let closeApproval = await prisma.adminApproval.findUnique({ where: { id: closeApprovalId } })
    expect(closeApproval?.status).toBe('PENDING')

    // Reject the CLOSE — the CREATE branch must be untouched (still PENDING_CREATE).
    await rejectBranchLifecycle(prisma, dummyRedis, closeApprovalId, ADMIN_ID, 'keep open', ctx)
    const createBranch = await prisma.branch.findUnique({ where: { id: createPendingId } })
    expect(createBranch?.lifecycleStatus).toBe('PENDING_CREATE')
    closeBranch = await prisma.branch.findUnique({ where: { id: closePendingId } })
    expect(closeBranch?.lifecycleStatus).toBe('LIVE')
  })
})

describe('PR-5 applier: type/error guards (real DB)', () => {
  it('an unknown approval id -> APPROVAL_NOT_FOUND', async () => {
    await expect(
      approveBranchLifecycle(prisma, dummyRedis, '00000000-0000-0000-0000-000000000000', ADMIN_ID, ctx),
    ).rejects.toThrow('APPROVAL_NOT_FOUND')
  })

  it('a non-branch-lifecycle approval type -> APPROVAL_NOT_ACTIONABLE (no regression for existing types)', async () => {
    const merchantId = await makeMerchant('Onboarding Type Co')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    await expect(approveBranchLifecycle(prisma, dummyRedis, approval.id, ADMIN_ID, ctx)).rejects.toThrow(
      'APPROVAL_NOT_ACTIONABLE',
    )
    await expect(rejectBranchLifecycle(prisma, dummyRedis, approval.id, ADMIN_ID, 'r', ctx)).rejects.toThrow(
      'APPROVAL_NOT_ACTIONABLE',
    )
    // The onboarding merchant was NOT mutated by the applier.
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.status).toBe('ACTIVE')
  })

  it('reject on an already-actioned (non-PENDING) branch-lifecycle approval -> APPROVAL_NOT_ACTIONABLE', async () => {
    const merchantId = await makeMerchant('Already Actioned Co')
    await makeBranch(merchantId, 'Main', { isMainBranch: true })
    const closingId = await makeBranch(merchantId, 'Already', { lifecycleStatus: 'PENDING_CLOSE', closeReason: 'x' })
    const approvalId = await makeApproval('BRANCH_CLOSE', closingId)
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'APPROVED' } })

    await expect(rejectBranchLifecycle(prisma, dummyRedis, approvalId, ADMIN_ID, 'r', ctx)).rejects.toThrow(
      'APPROVAL_NOT_ACTIONABLE',
    )
  })
})
