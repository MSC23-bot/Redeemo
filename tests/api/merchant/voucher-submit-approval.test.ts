import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Day-2 Vouchers A4: submitVoucher (custom RCV) creates or reopens the VOUCHER
// AdminApproval lane in the SAME transaction as the status flip.
//   - first submit: status DRAFT -> PENDING_APPROVAL AND a new
//     AdminApproval{ type:'VOUCHER', referenceId:voucherId, referenceType:'voucher',
//     status:'PENDING' } is created.
//   - resubmit after changes: the SAME approval row (found by type+referenceId) is
//     REOPENED to PENDING (claim cleared), never duplicated. Mirrors the onboarding
//     submitForApprovalCore reopen pattern.
// No notification on submit (no submit bell — spec §0 Notifications).

describe('A4 — submitVoucher creates/reopens the VOUCHER AdminApproval', () => {
  let app: FastifyInstance
  let merchantToken: string

  const draft = {
    id: 'v1', merchantId: 'm1', code: 'RCV-ABC12345', isRmv: false,
    type: 'BOGO', title: 'BOGO night', estimatedSaving: 5, status: 'DRAFT',
    approvalStatus: 'PENDING', merchantFields: {}, availabilityWindows: [],
    publishedAt: null,
  }

  function makePrisma(overrides: Record<string, any> = {}) {
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }) },
      voucher: {
        findFirst: vi.fn().mockResolvedValue({ ...draft }),
        update: vi.fn().mockImplementation(async (a: any) => ({ ...draft, ...a.data })),
      },
      adminApproval: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'appr1' }),
        update: vi.fn().mockResolvedValue({ id: 'appr1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      ...overrides,
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    return prismaMock
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })

  afterEach(async () => { await app.close() })

  const submit = () => app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: { authorization: `Bearer ${merchantToken}` } })

  it('first submit flips status to PENDING_APPROVAL and CREATES a VOUCHER approval', async () => {
    const res = await submit()
    expect(res.statusCode).toBe(200)
    // status flip
    const upd = (app.prisma.voucher.update as any).mock.calls[0][0]
    expect(upd.data.status).toBe('PENDING_APPROVAL')
    // approval CREATED with the canonical shape
    expect(app.prisma.adminApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: 'VOUCHER', referenceId: 'v1' } })
    )
    const created = (app.prisma.adminApproval.create as any).mock.calls[0][0].data
    expect(created).toMatchObject({ type: 'VOUCHER', referenceId: 'v1', referenceType: 'voucher', status: 'PENDING' })
    // no reopen-update when no existing row
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
  })

  it('resubmit REOPENS the existing VOUCHER approval (no duplicate) and clears the claim', async () => {
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({ id: 'appr-existing', status: 'CHANGES_REQUESTED' })
    const res = await submit()
    expect(res.statusCode).toBe(200)
    // reopened, not created
    expect(app.prisma.adminApproval.create).not.toHaveBeenCalled()
    const reopen = (app.prisma.adminApproval.update as any).mock.calls[0][0]
    expect(reopen.where).toEqual({ id: 'appr-existing' })
    expect(reopen.data.status).toBe('PENDING')
    expect(reopen.data.claimedById).toBeNull()
    expect(reopen.data.claimedAt).toBeNull()
  })

  it('submit + approval happen inside a single $transaction', async () => {
    await submit()
    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('a non-DRAFT voucher is not submittable (no approval written)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...draft, status: 'PENDING_APPROVAL' })
    const res = await submit()
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_SUBMITTABLE')
    expect(app.prisma.adminApproval.create).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
  })
})
