import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Voucher governed flows (D2/D3) — the INSTANT self-service withdraws:
//   POST /vouchers/:id/withdraw               — pull back a PENDING_APPROVAL
//     custom submission: voucher -> DRAFT + the open VOUCHER AdminApproval ->
//     WITHDRAWN (claim cleared), atomically. No admin involvement.
//   POST /vouchers/pending-edits/:id/withdraw — withdraw an own PENDING
//     VoucherPendingEdit: edit -> WITHDRAWN + its VOUCHER_EDIT approval ->
//     WITHDRAWN, atomically.

const submittedCustom = {
  id: 'v1', merchantId: 'm1', isRmv: false, status: 'PENDING_APPROVAL', approvalStatus: 'PENDING',
}

function makePrisma(overrides: Record<string, any> = {}) {
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE' } }),
      findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE' }, branches: [] }]),
    },
    voucher: {
      findFirst: vi.fn().mockResolvedValue({ ...submittedCustom }),
      update: vi.fn().mockImplementation(async (a: any) => ({ ...submittedCustom, ...a.data })),
    },
    voucherPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    adminApproval: {
      findFirst: vi.fn().mockResolvedValue({ id: 'appr1' }),
      update: vi.fn().mockResolvedValue({ id: 'appr1' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  return prismaMock
}

describe('governed withdraws: submission withdraw + pending-edit withdraw', () => {
  let app: FastifyInstance
  let token: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const withdrawSubmission = (id = 'v1') =>
    app.inject({ method: 'POST', url: `/api/v1/merchant/vouchers/${id}/withdraw`, headers: { authorization: `Bearer ${token}` } })
  const withdrawPendingEdit = (id = 'pe1') =>
    app.inject({ method: 'POST', url: `/api/v1/merchant/vouchers/pending-edits/${id}/withdraw`, headers: { authorization: `Bearer ${token}` } })

  // ── submission withdraw ───────────────────────────────────────────────────

  it('flips voucher -> DRAFT and the open VOUCHER approval -> WITHDRAWN atomically (claim cleared)', async () => {
    const res = await withdrawSubmission()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('DRAFT')

    const vUpd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect(vUpd.where).toEqual({ id: 'v1' })
    expect(vUpd.data.status).toBe('DRAFT')

    // The open approval is resolved by type+referenceId over the OPEN statuses,
    // so a CLAIMED (still PENDING) row is withdrawn too — by design (D2).
    expect(app.prisma.adminApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'VOUCHER', referenceId: 'v1', status: { in: ['PENDING', 'CHANGES_REQUESTED'] },
        }),
      })
    )
    const aUpd = (app.prisma.adminApproval.update as any).mock.calls[0][0]
    expect(aUpd.where).toEqual({ id: 'appr1' })
    expect(aUpd.data.status).toBe('WITHDRAWN')
    expect(aUpd.data.claimedById).toBeNull()
    expect(aUpd.data.claimedAt).toBeNull()

    const audit = (app.prisma.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_SUBMISSION_WITHDRAWN')
    expect(audit.actorType).toBe('MERCHANT_ADMIN')

    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('only a PENDING_APPROVAL voucher is withdrawable (DRAFT -> 409, nothing written)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...submittedCustom, status: 'DRAFT' })
    const res = await withdrawSubmission()
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_WITHDRAW_NOT_PENDING')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
  })

  it('a flagship submission is NEVER withdrawable (onboarding-mandatory)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...submittedCustom, id: 'rmv1', isRmv: true })
    const res = await withdrawSubmission('rmv1')
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_EDIT_NOT_ALLOWED')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('an approved-waiting voucher (approvalStatus APPROVED, Model 1) was already reviewed -> 409', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...submittedCustom, approvalStatus: 'APPROVED' })
    const res = await withdrawSubmission()
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_WITHDRAW_NOT_PENDING')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('no open VOUCHER approval row -> 409, and the voucher is not flipped', async () => {
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue(null)
    const res = await withdrawSubmission()
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_WITHDRAW_NOT_PENDING')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
  })

  it('is tenant-scoped (other merchant\'s voucher -> 404)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(null)
    const res = await withdrawSubmission()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_FOUND')
    expect(app.prisma.voucher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1', merchantId: 'm1' } })
    )
  })

  // ── pending-edit withdraw ─────────────────────────────────────────────────

  it('flips a PENDING edit -> WITHDRAWN and its VOUCHER_EDIT approval -> WITHDRAWN atomically', async () => {
    app.prisma.voucherPendingEdit.findFirst = vi.fn().mockResolvedValue({
      id: 'pe1', merchantId: 'm1', voucherId: 'v1', kind: 'CHANGE', status: 'PENDING',
    })
    const res = await withdrawPendingEdit()
    expect(res.statusCode).toBe(200)

    const eUpd = (app.prisma.voucherPendingEdit.update as any).mock.calls[0][0]
    expect(eUpd.where).toEqual({ id: 'pe1' })
    expect(eUpd.data.status).toBe('WITHDRAWN')

    expect(app.prisma.adminApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'VOUCHER_EDIT', referenceId: 'pe1', status: 'PENDING' }),
      })
    )
    const aUpd = (app.prisma.adminApproval.update as any).mock.calls[0][0]
    expect(aUpd.data.status).toBe('WITHDRAWN')
    expect(aUpd.data.claimedById).toBeNull()

    const audit = (app.prisma.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_EDIT_REQUEST_WITHDRAWN')

    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1)
    // The voucher itself is never touched by a pending-edit withdraw.
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('a non-PENDING edit is not withdrawable (404, mirrors the profile sibling)', async () => {
    app.prisma.voucherPendingEdit.findFirst = vi.fn().mockResolvedValue({
      id: 'pe1', merchantId: 'm1', voucherId: 'v1', kind: 'CHANGE', status: 'APPROVED',
    })
    const res = await withdrawPendingEdit()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_NOT_FOUND')
    expect(app.prisma.voucherPendingEdit.update).not.toHaveBeenCalled()
  })

  it('pending-edit withdraw is tenant-scoped (cross-tenant/missing -> 404)', async () => {
    app.prisma.voucherPendingEdit.findFirst = vi.fn().mockResolvedValue(null)
    const res = await withdrawPendingEdit()
    expect(res.statusCode).toBe(404)
    expect(app.prisma.voucherPendingEdit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pe1', merchantId: 'm1' } })
    )
  })
})
