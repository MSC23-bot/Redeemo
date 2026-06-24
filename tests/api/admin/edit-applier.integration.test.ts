import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Mock notify so approve-edit / reject-edit don't enqueue real email jobs.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import { approveEdit, rejectEdit, getEditReviewContext } from '../../../src/api/admin/approvals/editApplier'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'b1-edit-applier'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'b1-edit-applier-test' }
const dummyRedis = {} as any
let ADMIN_ID = ''
const createdMerchantIds: string[] = []
let seq = 0

/** A merchant + ACTIVE OWNER membership so the after-commit owner notify can resolve. */
async function makeMerchant(businessName: string) {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${businessName}`, status: 'ACTIVE', isTestData: true },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}-${Date.now()}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  createdMerchantIds.push(m.id)
  return m.id
}

async function makeBranch(merchantId: string, name: string) {
  const b = await prisma.branch.create({
    data: {
      merchantId,
      name: `${PREFIX} ${name}`,
      isMainBranch: true,
      addressLine1: '1 Old Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      isActive: true,
      locationConfidence: 'POSTCODE_CENTROID',
      localityName: 'City of London',
    },
  })
  return b.id
}

async function makeMerchantEdit(merchantId: string, proposedChanges: Record<string, unknown>) {
  const edit = await prisma.merchantPendingEdit.create({
    data: { merchantId, proposedChanges: proposedChanges as any, status: 'PENDING' },
  })
  const approval = await prisma.adminApproval.create({
    data: { type: 'MERCHANT_IDENTITY_EDIT', status: 'PENDING', referenceId: edit.id, referenceType: 'MerchantPendingEdit' },
  })
  return { editId: edit.id, approvalId: approval.id }
}

/** A live BranchPhoto row (default APPROVED so it models a customer-visible photo). */
async function makeBranchPhoto(
  branchId: string,
  url: string,
  opts: { sortOrder?: number; moderationStatus?: 'PENDING' | 'APPROVED' | 'FLAGGED' } = {},
) {
  const p = await prisma.branchPhoto.create({
    data: {
      branchId,
      url,
      sortOrder: opts.sortOrder ?? 0,
      moderationStatus: opts.moderationStatus ?? 'APPROVED',
    },
  })
  return p.id
}

async function makeBranchEdit(
  branchId: string,
  merchantId: string,
  proposedChanges: Record<string, unknown>,
  includesPhotos = false,
) {
  const edit = await prisma.branchPendingEdit.create({
    data: { branchId, merchantId, proposedChanges: proposedChanges as any, includesPhotos, status: 'PENDING' },
  })
  const approval = await prisma.adminApproval.create({
    data: { type: 'BRANCH_IDENTITY_EDIT', status: 'PENDING', referenceId: edit.id, referenceType: 'branch_pending_edit' },
  })
  return { editId: edit.id, approvalId: approval.id }
}

beforeAll(async () => {
  const a = await prisma.adminUser.create({
    data: { email: `${PREFIX}-admin-${Date.now()}@example.com`, passwordHash: 'x', firstName: 'B1', lastName: 'Applier', role: 'OPERATIONS' },
  })
  ADMIN_ID = a.id
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
})

afterAll(async () => {
  // BULK prefix-scoped cleanup (self-healing: catches this run AND any rows leaked
  // by a prior timed-out run). One deleteMany per table instead of per-merchant, so
  // the whole teardown is a handful of Neon round-trips, not ~100. FK order: audit +
  // approvals + edits + branches before merchants + owners.
  const merchantIds = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((b) => b.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...merchantIds, ...branchIds] } } })
    const editIds = [
      ...(await prisma.merchantPendingEdit.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((e) => e.id),
      ...(await prisma.branchPendingEdit.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((e) => e.id),
    ]
    if (editIds.length) await prisma.adminApproval.deleteMany({ where: { referenceId: { in: editIds } } })
    await prisma.branchPendingEdit.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantPendingEdit.deleteMany({ where: { merchantId: { in: merchantIds } } })
    if (branchIds.length) await prisma.branchPhoto.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('B1: approveEdit (merchant identity, real DB)', () => {
  it('applies businessName to the live merchant, flips both statuses, audits ADMIN before/after', async () => {
    const merchantId = await makeMerchant('Merchant Approve Co')
    const { editId, approvalId } = await makeMerchantEdit(merchantId, { businessName: `${PREFIX} Renamed Co` })

    const res = await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true })

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.businessName).toBe(`${PREFIX} Renamed Co`)

    const edit = await prisma.merchantPendingEdit.findUnique({ where: { id: editId } })
    expect(edit?.status).toBe('APPROVED')
    expect(edit?.reviewedBy).toBe(ADMIN_ID)
    expect(edit?.reviewedAt).toBeTruthy()

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('APPROVED')
    expect(approval?.adminUserId).toBe(ADMIN_ID)
    expect(approval?.claimedById).toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_EDIT_APPROVED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.before).toMatchObject({ businessName: `${PREFIX} Merchant Approve Co` })
    expect(audit?.after).toMatchObject({ businessName: `${PREFIX} Renamed Co` })

    // Best-effort owner notify fired (ACTIVE OWNER exists).
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('allow-list safety: a stray non-SENSITIVE key in proposedChanges is NOT applied', async () => {
    const merchantId = await makeMerchant('Merchant AllowList Co')
    // companyNumber is NOT in the merchant SENSITIVE allow-list.
    const { approvalId } = await makeMerchantEdit(merchantId, {
      businessName: `${PREFIX} AL Renamed`,
      companyNumber: '99999999',
    })

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.businessName).toBe(`${PREFIX} AL Renamed`)
    // The stray key was never written.
    expect(merchant?.companyNumber).toBeNull()

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_EDIT_APPROVED' } })
    expect(audit?.after).not.toHaveProperty('companyNumber')
  })
})

describe('B1: approveEdit (branch identity, real DB)', () => {
  it('applies a branch field + the location snapshot verbatim', async () => {
    const merchantId = await makeMerchant('Branch Approve Co')
    const branchId = await makeBranch(merchantId, 'Approve Branch')
    const { approvalId } = await makeBranchEdit(branchId, merchantId, {
      name: `${PREFIX} New Branch Name`,
      city: 'Manchester',
      // location snapshot resolved at request time, applied verbatim:
      latitude: 53.4808,
      longitude: -2.2426,
      localityName: 'Manchester',
      locationConfidence: 'POSTCODE_CENTROID',
    })

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const branch = await prisma.branch.findUnique({ where: { id: branchId } })
    expect(branch?.name).toBe(`${PREFIX} New Branch Name`)
    expect(branch?.city).toBe('Manchester')
    expect(branch?.localityName).toBe('Manchester')
    expect(Number(branch?.latitude)).toBeCloseTo(53.4808, 3)
    expect(Number(branch?.longitude)).toBeCloseTo(-2.2426, 3)

    const audit = await prisma.auditLog.findFirst({ where: { entityId: branchId, event: 'BRANCH_EDIT_APPROVED' } })
    expect(audit?.actorType).toBe('ADMIN')
  })
})

describe('PR-3: approveEdit applies a branch photo edit (real DB)', () => {
  it('add URLs become APPROVED BranchPhoto rows with appended sortOrder; remove IDs deleted; statuses flipped; ADMIN before/after audit', async () => {
    const merchantId = await makeMerchant('Photo Apply Co')
    const branchId = await makeBranch(merchantId, 'Photo Apply Branch')
    // Two existing live photos. The highest current sortOrder is 1, so an added
    // photo must append at sortOrder 2 (after current max).
    await makeBranchPhoto(branchId, 'https://example.com/keep-0.jpg', { sortOrder: 0 })
    const removeId = await makeBranchPhoto(branchId, 'https://example.com/drop-1.jpg', { sortOrder: 1 })

    const { editId, approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { add: ['https://example.com/added-a.jpg', 'https://example.com/added-b.jpg'], remove: [removeId] },
      true,
    )

    const res = await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)
    expect(res).toEqual({ approved: true })

    const photos = await prisma.branchPhoto.findMany({ where: { branchId }, orderBy: { sortOrder: 'asc' } })
    // kept-0 (unchanged) + 2 added; dropped-1 gone. 3 rows total.
    expect(photos).toHaveLength(3)
    const urls = photos.map((p) => p.url)
    expect(urls).toContain('https://example.com/keep-0.jpg')
    expect(urls).toContain('https://example.com/added-a.jpg')
    expect(urls).toContain('https://example.com/added-b.jpg')
    expect(urls).not.toContain('https://example.com/drop-1.jpg')

    // The removed row is gone.
    expect(await prisma.branchPhoto.findUnique({ where: { id: removeId } })).toBeNull()

    // Every ADDED row is APPROVED (admin approval IS the moderation gate; never PENDING).
    const added = photos.filter((p) => p.url.startsWith('https://example.com/added-'))
    expect(added).toHaveLength(2)
    for (const p of added) expect(p.moderationStatus).toBe('APPROVED')

    // sortOrder appended AFTER the current max (was 1) -> the added rows are 2 and 3.
    const addedSorts = added.map((p) => p.sortOrder).sort((a, b) => a - b)
    expect(addedSorts).toEqual([2, 3])

    // Both lifecycle statuses flipped to APPROVED.
    const edit = await prisma.branchPendingEdit.findUnique({ where: { id: editId } })
    expect(edit?.status).toBe('APPROVED')
    expect(edit?.reviewedBy).toBe(ADMIN_ID)
    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('APPROVED')
    expect(approval?.adminUserId).toBe(ADMIN_ID)
    expect(approval?.claimedById).toBeNull()

    // ADMIN-actor audit captured the photo delta (added URLs + removed IDs).
    const audit = await prisma.auditLog.findFirst({ where: { entityId: branchId, event: 'BRANCH_EDIT_APPROVED' } })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.metadata).toMatchObject({
      photosAdded: ['https://example.com/added-a.jpg', 'https://example.com/added-b.jpg'],
      photosRemoved: [removeId],
    })

    // Best-effort owner notify fired once.
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })

  it('approve does NOT create any PENDING photo row (added rows are APPROVED)', async () => {
    const merchantId = await makeMerchant('Photo No Pending Co')
    const branchId = await makeBranch(merchantId, 'Photo No Pending Branch')
    const { approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { add: ['https://example.com/np-a.jpg'], remove: [] },
      true,
    )

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    const pending = await prisma.branchPhoto.findMany({ where: { branchId, moderationStatus: 'PENDING' } })
    expect(pending).toHaveLength(0)
    const all = await prisma.branchPhoto.findMany({ where: { branchId } })
    expect(all).toHaveLength(1)
    expect(all[0]?.moderationStatus).toBe('APPROVED')
  })

  it('a remove ID NOT on the branch is NOT deleted (no cross-branch delete)', async () => {
    const merchantId = await makeMerchant('Photo XBranch Co')
    const branchA = await makeBranch(merchantId, 'XBranch A')
    const branchB = await makeBranch(merchantId, 'XBranch B')
    // A live photo on branch B that branch A's edit must NEVER be able to delete.
    const foreignPhotoId = await makeBranchPhoto(branchB, 'https://example.com/branchB-photo.jpg', { sortOrder: 0 })

    // Branch A's edit references branch B's photo id in `remove`.
    const { approvalId } = await makeBranchEdit(
      branchA,
      merchantId,
      { add: [], remove: [foreignPhotoId] },
      true,
    )

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    // Branch B's photo survives — the deleteMany was scoped to branch A.
    const survivor = await prisma.branchPhoto.findUnique({ where: { id: foreignPhotoId } })
    expect(survivor).not.toBeNull()
    expect(survivor?.branchId).toBe(branchB)
  })

  it('reject a photo edit -> NO rows written; existing APPROVED rows untouched', async () => {
    const merchantId = await makeMerchant('Photo Reject Untouched Co')
    const branchId = await makeBranch(merchantId, 'Photo Reject Untouched Branch')
    const liveId = await makeBranchPhoto(branchId, 'https://example.com/live-keep.jpg', { sortOrder: 0 })
    const { approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { add: ['https://example.com/should-not-appear.jpg'], remove: [liveId] },
      true,
    )

    await rejectEdit(prisma, dummyRedis, approvalId, ADMIN_ID, 'Photos rejected.', ctx)

    const photos = await prisma.branchPhoto.findMany({ where: { branchId } })
    // Only the original live row remains: no add applied, no remove applied.
    expect(photos).toHaveLength(1)
    expect(photos[0]?.id).toBe(liveId)
    expect(photos[0]?.url).toBe('https://example.com/live-keep.jpg')
    expect(photos[0]?.moderationStatus).toBe('APPROVED')
  })

  it('allow-list discipline: a poisoned/unexpected proposedChanges key is never written', async () => {
    const merchantId = await makeMerchant('Photo Poison Co')
    const branchId = await makeBranch(merchantId, 'Photo Poison Branch')
    const { approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      {
        add: ['https://example.com/poison-ok.jpg'],
        remove: [],
        // Poison: keys that are NOT in ANY branch allow-list and NOT photo keys.
        // The applier must NEVER write them to the live branch — proposedChanges
        // is parsed by explicit allow-list, never blind-spread.
        companyNumber: '99999999',
        status: 'SUSPENDED',
        // A smuggled moderationStatus override on the bag must NOT downgrade the
        // added photo — every added row is forced APPROVED by the applier.
        moderationStatus: 'FLAGGED',
      },
      true,
    )
    const beforeBranch = await prisma.branch.findUnique({ where: { id: branchId } })

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    // The live branch's non-allow-listed columns are untouched by the smuggled keys.
    const branch = await prisma.branch.findUnique({ where: { id: branchId } })
    expect(branch?.isActive).toBe(beforeBranch?.isActive) // `status`/active was never written

    // The added photo is APPROVED (the smuggled `moderationStatus:'FLAGGED'` was ignored).
    const photos = await prisma.branchPhoto.findMany({ where: { branchId } })
    expect(photos).toHaveLength(1)
    expect(photos[0]?.url).toBe('https://example.com/poison-ok.jpg')
    expect(photos[0]?.moderationStatus).toBe('APPROVED')

    // The ADMIN audit `after` carried NO smuggled key (allow-list discipline).
    const audit = await prisma.auditLog.findFirst({ where: { entityId: branchId, event: 'BRANCH_EDIT_APPROVED' } })
    expect(audit?.after).not.toHaveProperty('companyNumber')
    expect(audit?.after).not.toHaveProperty('status')
    expect(audit?.after).not.toHaveProperty('moderationStatus')
  })

  it('mixed identity+photo edit applies BOTH the allow-listed identity field AND the photo delta in one tx', async () => {
    const merchantId = await makeMerchant('Mixed Edit Co')
    const branchId = await makeBranch(merchantId, 'Mixed Edit Branch')
    const removeId = await makeBranchPhoto(branchId, 'https://example.com/mixed-drop.jpg', { sortOrder: 0 })

    // A (synthetic) mixed edit: an allow-listed identity field (city) PLUS photos.
    // In practice the writers create identity-only OR photos-only edits, but the
    // applier must handle a mixed edit safely (§5.6): both deltas apply together.
    const { approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { city: 'Leeds', add: ['https://example.com/mixed-add.jpg'], remove: [removeId] },
      true,
    )

    await approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)

    // Identity field applied.
    const branch = await prisma.branch.findUnique({ where: { id: branchId } })
    expect(branch?.city).toBe('Leeds')

    // Photo delta applied: dropped removed, added present + APPROVED.
    const photos = await prisma.branchPhoto.findMany({ where: { branchId } })
    expect(photos).toHaveLength(1)
    expect(photos[0]?.url).toBe('https://example.com/mixed-add.jpg')
    expect(photos[0]?.moderationStatus).toBe('APPROVED')
    expect(await prisma.branchPhoto.findUnique({ where: { id: removeId } })).toBeNull()

    // Audit `after` carries the identity field AND metadata carries the photo delta.
    const audit = await prisma.auditLog.findFirst({ where: { entityId: branchId, event: 'BRANCH_EDIT_APPROVED' } })
    expect(audit?.after).toMatchObject({ city: 'Leeds' })
    expect(audit?.metadata).toMatchObject({
      photosAdded: ['https://example.com/mixed-add.jpg'],
      photosRemoved: [removeId],
    })
  })
})

describe('B1: rejectEdit on photo edits (real DB)', () => {
  it('rejectEdit works on a photo edit (no mutation needed)', async () => {
    const merchantId = await makeMerchant('Photo Reject Co')
    const branchId = await makeBranch(merchantId, 'Photo Reject Branch')
    const { editId, approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { add: ['https://example.com/x.jpg'], remove: [] },
      true,
    )

    const res = await rejectEdit(prisma, dummyRedis, approvalId, ADMIN_ID, 'Photos are low resolution.', ctx)
    expect(res).toEqual({ rejected: true })

    expect((await prisma.branchPendingEdit.findUnique({ where: { id: editId } }))?.status).toBe('REJECTED')
    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('REJECTED')
    expect(approval?.comment).toBe('Photos are low resolution.')
    const audit = await prisma.auditLog.findFirst({ where: { entityId: branchId, event: 'BRANCH_EDIT_REJECTED' } })
    expect(audit?.reason).toBe('Photos are low resolution.')
  })
})

describe('B1: rejectEdit leaves the live row unchanged (real DB)', () => {
  it('flips both statuses + audits reason; the live merchant is untouched', async () => {
    const merchantId = await makeMerchant('Merchant Reject Co')
    const originalName = `${PREFIX} Merchant Reject Co`
    const { editId, approvalId } = await makeMerchantEdit(merchantId, { businessName: `${PREFIX} Should Not Apply` })

    await rejectEdit(prisma, dummyRedis, approvalId, ADMIN_ID, 'Name does not match documents.', ctx)

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.businessName).toBe(originalName)

    const edit = await prisma.merchantPendingEdit.findUnique({ where: { id: editId } })
    expect(edit?.status).toBe('REJECTED')
    expect(edit?.reviewNote).toBe('Name does not match documents.')
    expect(edit?.reviewedBy).toBe(ADMIN_ID)

    const approval = await prisma.adminApproval.findUnique({ where: { id: approvalId } })
    expect(approval?.status).toBe('REJECTED')
    expect(approval?.comment).toBe('Name does not match documents.')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_EDIT_REJECTED' } })
    expect(audit?.reason).toBe('Name does not match documents.')
    expect(audit?.actorType).toBe('ADMIN')
  })
})

describe('B1: error paths (real DB)', () => {
  it('unknown approval id -> APPROVAL_NOT_FOUND', async () => {
    await expect(approveEdit(prisma, dummyRedis, '00000000-0000-0000-0000-000000000000', ADMIN_ID, ctx))
      .rejects.toThrow('APPROVAL_NOT_FOUND')
  })

  it('non-edit approval type -> APPROVAL_NOT_ACTIONABLE', async () => {
    const merchantId = await makeMerchant('Onboarding Type Co')
    const approval = await prisma.adminApproval.create({
      data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: merchantId, referenceType: 'merchant' },
    })
    await expect(approveEdit(prisma, dummyRedis, approval.id, ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })

  it('already-actioned approval (non-PENDING) -> APPROVAL_NOT_ACTIONABLE', async () => {
    const merchantId = await makeMerchant('Already Actioned Co')
    const { approvalId } = await makeMerchantEdit(merchantId, { businessName: `${PREFIX} X` })
    await prisma.adminApproval.update({ where: { id: approvalId }, data: { status: 'APPROVED' } })
    await expect(approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })

  it('non-PENDING PendingEdit (approval still PENDING) -> PENDING_EDIT_NOT_ACTIONABLE', async () => {
    const merchantId = await makeMerchant('Stale Edit Co')
    const { editId, approvalId } = await makeMerchantEdit(merchantId, { businessName: `${PREFIX} Y` })
    // Drift the PendingEdit to WITHDRAWN while the approval stays PENDING.
    await prisma.merchantPendingEdit.update({ where: { id: editId }, data: { status: 'WITHDRAWN' } })
    await expect(approveEdit(prisma, dummyRedis, approvalId, ADMIN_ID, ctx)).rejects.toThrow('PENDING_EDIT_NOT_ACTIONABLE')
  })
})

describe('B1: getEditReviewContext (real DB)', () => {
  it('returns the merchant field diff (current vs proposed)', async () => {
    const merchantId = await makeMerchant('Review Diff Co')
    const { editId, approvalId } = await makeMerchantEdit(merchantId, { businessName: `${PREFIX} Proposed Name` })

    const review = await getEditReviewContext(prisma, approvalId)
    expect(review.kind).toBe('merchant')
    expect(review.merchantId).toBe(merchantId)
    expect(review.pendingEditId).toBe(editId)
    expect(review.includesPhotos).toBe(false)
    expect(review.fields).toEqual([
      {
        field: 'businessName',
        current: `${PREFIX} Review Diff Co`,
        proposed: `${PREFIX} Proposed Name`,
        isCustomerVisible: true,
      },
    ])
  })

  it('surfaces photoChanges for a photo edit (not silently ignored)', async () => {
    const merchantId = await makeMerchant('Review Photo Co')
    const branchId = await makeBranch(merchantId, 'Review Photo Branch')
    const { approvalId } = await makeBranchEdit(
      branchId,
      merchantId,
      { add: ['https://example.com/a.jpg', 'https://example.com/b.jpg'], remove: ['https://example.com/old.jpg'] },
      true,
    )

    const review = await getEditReviewContext(prisma, approvalId)
    expect(review.kind).toBe('branch')
    expect(review.includesPhotos).toBe(true)
    expect(review.photoChanges).toEqual({
      add: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      remove: ['https://example.com/old.jpg'],
    })
  })
})
