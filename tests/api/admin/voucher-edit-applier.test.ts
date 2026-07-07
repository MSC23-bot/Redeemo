import { describe, it, expect, vi } from 'vitest'
import { approveEdit, rejectEdit, getEditReviewContext } from '../../../src/api/admin/approvals/editApplier'
import { claimApproval } from '../../../src/api/admin/approvals/service'

// Voucher governed flows — the admin APPLIER half (editApplier.ts extended with
// kind 'voucher', dispatched on approval.type === 'VOUCHER_EDIT' then branched
// on VoucherPendingEdit.kind):
//   CHANGE — applies ONLY the allow-listed promotable fields onto a LIVE
//     flagship (stray keys can NEVER be written — pinned below).
//   END    — flips a LIVE CUSTOM voucher ACTIVE -> INACTIVE; a flagship target
//     is REJECTED (D4 pin) BEFORE any mutation.
//   reject — never touches the voucher.
//   WITHDRAWN approvals are never actionable.

const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' }
const redis = {} as any

const liveFlagship = {
  id: 'rmv1', merchantId: 'm1', code: 'RMV-AAAA1111', isRmv: true, status: 'ACTIVE',
  title: 'Old title', description: 'Old description', terms: 'Old terms',
  imageUrl: null, estimatedSaving: 5,
}
const liveCustom = {
  id: 'v1', merchantId: 'm1', code: 'RCV-BBBB2222', isRmv: false, status: 'ACTIVE',
  title: 'Custom', description: null, terms: null, imageUrl: null, estimatedSaving: 4,
}

function makeMocks({
  approval = { id: 'appr1', type: 'VOUCHER_EDIT', status: 'PENDING', referenceId: 'pe1' },
  edit = {
    id: 'pe1', voucherId: 'rmv1', merchantId: 'm1', kind: 'CHANGE', status: 'PENDING',
    reason: 'Seasonal refresh', proposedChanges: { title: 'New title', estimatedSaving: 7.5 },
  },
  voucher = { ...liveFlagship },
}: Record<string, any> = {}) {
  const tx = {
    adminApproval: {
      findUnique: vi.fn().mockResolvedValue(approval),
      update: vi.fn().mockResolvedValue(undefined),
    },
    voucherPendingEdit: {
      findUnique: vi.fn().mockResolvedValue(edit),
      update: vi.fn().mockResolvedValue(undefined),
    },
    voucher: {
      findUnique: vi.fn().mockResolvedValue(voucher),
      update: vi.fn().mockResolvedValue(undefined),
    },
    merchantPendingEdit: { findUnique: vi.fn() },
    branchPendingEdit: { findUnique: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
  }
  const prisma: any = {
    $transaction: vi.fn().mockImplementation(async (fn: any) => fn(tx)),
    // No ACTIVE OWNER membership -> the post-commit notify is skipped.
    merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    adminApproval: { findUnique: vi.fn().mockResolvedValue(approval) },
    voucherPendingEdit: { findUnique: vi.fn().mockResolvedValue(edit) },
    voucher: { findUnique: vi.fn().mockResolvedValue(voucher) },
  }
  return { prisma, tx }
}

describe('voucher-edit applier: approve CHANGE', () => {
  it('applies ONLY the allow-listed keys — a stray key (status/isRmv/merchantId/approvalStatus/code) is NEVER written', async () => {
    const { prisma, tx } = makeMocks({
      edit: {
        id: 'pe1', voucherId: 'rmv1', merchantId: 'm1', kind: 'CHANGE', status: 'PENDING',
        reason: 'r',
        // A poisoned staging row smuggling non-promotable keys.
        proposedChanges: {
          title: 'New title', estimatedSaving: 7.125,
          status: 'INACTIVE', isRmv: false, merchantId: 'evil', approvalStatus: 'APPROVED', code: 'HACK',
        },
      },
    })
    const res = await approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)
    expect(res).toEqual({ approved: true })

    expect(tx.voucher.update).toHaveBeenCalledTimes(1)
    const upd = (tx.voucher.update as any).mock.calls[0][0]
    expect(upd.where).toEqual({ id: 'rmv1' })
    // Rounded to scale 2 (7.125 -> 7.13); ONLY the two allow-listed keys.
    expect(upd.data).toEqual({ title: 'New title', estimatedSaving: 7.13 })
    expect('status' in upd.data).toBe(false)
    expect('isRmv' in upd.data).toBe(false)
    expect('merchantId' in upd.data).toBe(false)
    expect('approvalStatus' in upd.data).toBe(false)
    expect('code' in upd.data).toBe(false)

    // Both statuses flipped + ADMIN audit with before/after, all inside ONE tx.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect((tx.voucherPendingEdit.update as any).mock.calls[0][0].data.status).toBe('APPROVED')
    expect((tx.adminApproval.update as any).mock.calls[0][0].data).toMatchObject({
      status: 'APPROVED', adminUserId: 'admin-1', claimedById: null, claimedAt: null,
    })
    const audit = (tx.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_EDIT_APPROVED')
    expect(audit.actorType).toBe('ADMIN')
    expect(audit.before).toEqual({ title: 'Old title', estimatedSaving: 5 })
    expect(audit.after).toEqual({ title: 'New title', estimatedSaving: 7.13 })
  })

  it('re-verifies a LIVE flagship: CHANGE on a CUSTOM voucher is rejected, nothing mutated', async () => {
    const { prisma, tx } = makeMocks({ voucher: { ...liveCustom } })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('VOUCHER_EDIT_NOT_ALLOWED')
    expect(tx.voucher.update).not.toHaveBeenCalled()
    expect(tx.voucherPendingEdit.update).not.toHaveBeenCalled()
  })

  it('re-verifies the voucher is still ACTIVE at apply time', async () => {
    const { prisma, tx } = makeMocks({ voucher: { ...liveFlagship, status: 'INACTIVE' } })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('VOUCHER_EDIT_NOT_ALLOWED')
    expect(tx.voucher.update).not.toHaveBeenCalled()
  })

  it('a poisoned estimatedSaving throws the clean SAVING_INVALID and mutates nothing', async () => {
    const { prisma, tx } = makeMocks({
      edit: {
        id: 'pe1', voucherId: 'rmv1', merchantId: 'm1', kind: 'CHANGE', status: 'PENDING',
        reason: 'r', proposedChanges: { estimatedSaving: 1e12 },
      },
    })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('SAVING_INVALID')
    expect(tx.voucher.update).not.toHaveBeenCalled()
    expect(tx.voucherPendingEdit.update).not.toHaveBeenCalled()
  })
})

describe('voucher-edit applier: approve END', () => {
  const endEdit = {
    id: 'pe1', voucherId: 'v1', merchantId: 'm1', kind: 'END', status: 'PENDING',
    reason: 'Offer finished', proposedChanges: null,
  }

  it('flips a LIVE CUSTOM voucher ACTIVE -> INACTIVE (and only status)', async () => {
    const { prisma, tx } = makeMocks({ edit: endEdit, voucher: { ...liveCustom } })
    const res = await approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)
    expect(res).toEqual({ approved: true })
    const upd = (tx.voucher.update as any).mock.calls[0][0]
    expect(upd.where).toEqual({ id: 'v1' })
    expect(upd.data).toEqual({ status: 'INACTIVE' })
    const audit = (tx.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_EDIT_APPROVED')
    expect(audit.before).toEqual({ status: 'ACTIVE' })
    expect(audit.after).toEqual({ status: 'INACTIVE' })
    expect(audit.metadata).toMatchObject({ voucherId: 'v1', kind: 'END' })
  })

  it('D4 PIN: an END that resolves to a FLAGSHIP voucher is REJECTED before any mutation', async () => {
    const { prisma, tx } = makeMocks({
      edit: { ...endEdit, voucherId: 'rmv1' },
      voucher: { ...liveFlagship }, // isRmv: true
    })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('VOUCHER_EDIT_NOT_ALLOWED')
    expect(tx.voucher.update).not.toHaveBeenCalled()
    expect(tx.voucherPendingEdit.update).not.toHaveBeenCalled()
    expect(tx.adminApproval.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('an END on a no-longer-ACTIVE voucher is rejected', async () => {
    const { prisma, tx } = makeMocks({ edit: endEdit, voucher: { ...liveCustom, status: 'EXPIRED' } })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('VOUCHER_EDIT_NOT_ALLOWED')
    expect(tx.voucher.update).not.toHaveBeenCalled()
  })
})

describe('voucher-edit applier: reject + terminal guards', () => {
  it('reject flips both statuses with the reason and NEVER touches the voucher', async () => {
    const { prisma, tx } = makeMocks()
    const res = await rejectEdit(prisma, redis, 'appr1', 'admin-1', 'not appropriate', ctx)
    expect(res).toEqual({ rejected: true })
    expect(tx.voucher.update).not.toHaveBeenCalled()
    expect((tx.voucherPendingEdit.update as any).mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED', reviewNote: 'not appropriate', reviewedBy: 'admin-1',
    })
    expect((tx.adminApproval.update as any).mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED', comment: 'not appropriate', claimedById: null,
    })
    const audit = (tx.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_EDIT_REJECTED')
    expect(audit.reason).toBe('not appropriate')
  })

  it('a WITHDRAWN approval is NOT actionable (approve)', async () => {
    const { prisma, tx } = makeMocks({
      approval: { id: 'appr1', type: 'VOUCHER_EDIT', status: 'WITHDRAWN', referenceId: 'pe1' },
    })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
    expect(tx.voucher.update).not.toHaveBeenCalled()
  })

  it('a WITHDRAWN approval is NOT actionable (reject)', async () => {
    const { prisma } = makeMocks({
      approval: { id: 'appr1', type: 'VOUCHER_EDIT', status: 'WITHDRAWN', referenceId: 'pe1' },
    })
    await expect(rejectEdit(prisma, redis, 'appr1', 'admin-1', 'r', ctx)).rejects.toThrow('APPROVAL_NOT_ACTIONABLE')
  })

  it('a no-longer-PENDING staging row (WITHDRAWN) is not actionable', async () => {
    const { prisma, tx } = makeMocks({
      edit: { id: 'pe1', voucherId: 'rmv1', merchantId: 'm1', kind: 'CHANGE', status: 'WITHDRAWN', reason: 'r', proposedChanges: {} },
    })
    await expect(approveEdit(prisma, redis, 'appr1', 'admin-1', ctx)).rejects.toThrow('PENDING_EDIT_NOT_ACTIONABLE')
    expect(tx.voucher.update).not.toHaveBeenCalled()
  })
})

describe('voucher-edit applier: review context + claim-audit resolution', () => {
  it('CHANGE review context: current-vs-proposed diff + kind + reason + voucher identity', async () => {
    const { prisma } = makeMocks()
    const context = await getEditReviewContext(prisma, 'appr1')
    expect(context.kind).toBe('voucher')
    expect(context.voucherEditKind).toBe('CHANGE')
    expect(context.reason).toBe('Seasonal refresh')
    expect(context.merchantId).toBe('m1')
    expect(context.voucherId).toBe('rmv1')
    expect(context.pendingEditId).toBe('pe1')
    expect(context.includesPhotos).toBe(false)
    expect(context.fields).toEqual([
      { field: 'title', current: 'Old title', proposed: 'New title', isCustomerVisible: true },
      { field: 'estimatedSaving', current: 5, proposed: 7.5, isCustomerVisible: true },
    ])
    expect(context.voucher).toMatchObject({ id: 'rmv1', code: 'RMV-AAAA1111', title: 'Old title', isRmv: true, status: 'ACTIVE' })
  })

  it('END review context: no field diff (the status flip is carried by voucherEditKind)', async () => {
    const { prisma } = makeMocks({
      edit: { id: 'pe1', voucherId: 'v1', merchantId: 'm1', kind: 'END', status: 'PENDING', reason: 'Offer finished', proposedChanges: null },
      voucher: { ...liveCustom },
    })
    const context = await getEditReviewContext(prisma, 'appr1')
    expect(context.kind).toBe('voucher')
    expect(context.voucherEditKind).toBe('END')
    expect(context.fields).toEqual([])
    expect(context.voucher).toMatchObject({ id: 'v1', isRmv: false })
  })

  it('claiming a VOUCHER_EDIT approval audits the REAL voucher (entityType voucher, voucher id)', async () => {
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr1', type: 'VOUCHER_EDIT', referenceId: 'pe1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      voucherPendingEdit: { findUnique: vi.fn().mockResolvedValue({ voucherId: 'rmv1' }) },
      merchantPendingEdit: { findUnique: vi.fn() },
      branchPendingEdit: { findUnique: vi.fn() },
      voucher: { findUnique: vi.fn() },
      merchant: { update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue(undefined) },
    }
    const prisma: any = { $transaction: vi.fn().mockImplementation(async (fn: any) => fn(tx)) }
    const res = await claimApproval(prisma, 'appr1', 'admin-1', ctx)
    expect(res).toEqual({ claimed: true })
    const audit = (tx.auditLog.create as any).mock.calls[0][0].data
    expect(audit.entityId).toBe('rmv1')
    expect(audit.entityType).toBe('voucher')
    // The PendingEdit indirection is resolved via the staging row, never audited raw.
    expect(tx.voucherPendingEdit.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pe1' } })
    )
  })

  it('a WITHDRAWN approval is not claimable (the conditional claim matches PENDING only)', async () => {
    const tx = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr1', type: 'VOUCHER_EDIT', referenceId: 'pe1' }),
        // The claim is a conditional updateMany on { claimedById: null, status: 'PENDING' };
        // a WITHDRAWN row matches 0 rows.
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      voucherPendingEdit: { findUnique: vi.fn() },
      auditLog: { create: vi.fn() },
    }
    const prisma: any = { $transaction: vi.fn().mockImplementation(async (fn: any) => fn(tx)) }
    await expect(claimApproval(prisma, 'appr1', 'admin-1', ctx)).rejects.toThrow('APPROVAL_ALREADY_CLAIMED')
    const updWhere = (tx.adminApproval.updateMany as any).mock.calls[0][0].where
    expect(updWhere.status).toBe('PENDING')
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
