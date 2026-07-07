import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Voucher governed flows (2026-07-07) — the merchant WRITER lanes:
//   POST /vouchers/rmv/:id/request-change  (flagship CHANGE; LIVE flagship only)
//   POST /vouchers/:id/request-end         (custom END; D4 flagship rejected)
// Both create a VoucherPendingEdit + AdminApproval{VOUCHER_EDIT} + audit
// ATOMICALLY; the voucher itself is never mutated (stays ACTIVE while reviewed).

const activeFlagship = {
  id: 'rmv1', merchantId: 'm1', code: 'RMV-AAAA1111', isRmv: true, isMandatory: true,
  type: 'BOGO', title: 'Flagship BOGO', estimatedSaving: 5, status: 'ACTIVE',
  approvalStatus: 'APPROVED', merchantFields: {},
  rmvTemplate: {
    id: 't1', allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'],
  },
}

const activeCustom = {
  id: 'v1', merchantId: 'm1', code: 'RCV-BBBB2222', isRmv: false,
  type: 'BOGO', title: 'Custom BOGO', estimatedSaving: 5, status: 'ACTIVE',
  approvalStatus: 'APPROVED',
}

function makePrisma(overrides: Record<string, any> = {}) {
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE' } }),
      findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE' }, branches: [] }]),
    },
    voucher: {
      findFirst: vi.fn().mockResolvedValue({ ...activeFlagship }),
      update: vi.fn(),
    },
    voucherPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null), // no open request by default
      create: vi.fn().mockImplementation(async (a: any) => ({
        id: 'pe1', kind: a.data.kind, status: 'PENDING', reason: a.data.reason,
        createdAt: new Date(), proposedChanges: a.data.proposedChanges ?? null,
      })),
      update: vi.fn(),
    },
    adminApproval: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'appr1' }),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  return prismaMock
}

describe('governed writer: flagship request-change + custom request-end', () => {
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

  const requestChange = (body: Record<string, unknown>, id = 'rmv1') =>
    app.inject({ method: 'POST', url: `/api/v1/merchant/vouchers/rmv/${id}/request-change`, headers: { authorization: `Bearer ${token}` }, payload: body })
  const requestEnd = (body: Record<string, unknown>, id = 'v1') =>
    app.inject({ method: 'POST', url: `/api/v1/merchant/vouchers/${id}/request-end`, headers: { authorization: `Bearer ${token}` }, payload: body })

  // ── request-change (flagship CHANGE) ──────────────────────────────────────

  it('creates a CHANGE pending edit + VOUCHER_EDIT approval + audit atomically; voucher untouched', async () => {
    const res = await requestChange({ reason: 'Seasonal refresh', title: 'New title', estimatedSaving: 6.5 })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body).toMatchObject({ id: 'pe1', kind: 'CHANGE', status: 'PENDING', reason: 'Seasonal refresh' })

    const created = (app.prisma.voucherPendingEdit.create as any).mock.calls[0][0].data
    expect(created).toMatchObject({
      voucherId: 'rmv1', merchantId: 'm1', kind: 'CHANGE', status: 'PENDING', reason: 'Seasonal refresh',
    })
    expect(created.proposedChanges).toEqual({ title: 'New title', estimatedSaving: 6.5 })

    const approval = (app.prisma.adminApproval.create as any).mock.calls[0][0].data
    expect(approval).toMatchObject({
      type: 'VOUCHER_EDIT', status: 'PENDING', referenceId: 'pe1', referenceType: 'voucher_pending_edit',
    })

    const audit = (app.prisma.auditLog.create as any).mock.calls[0][0].data
    expect(audit.event).toBe('VOUCHER_EDIT_REQUEST_CREATED')
    expect(audit.actorType).toBe('MERCHANT_ADMIN')

    // Everything committed in ONE transaction; the live voucher is NEVER mutated.
    expect(app.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('is tenant-scoped and flagship-only: the lookup requires merchantId + isRmv:true (custom/cross-tenant -> 404)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(null)
    const res = await requestChange({ reason: 'r', title: 'x' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('RMV_NOT_FOUND')
    expect(app.prisma.voucher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rmv1', merchantId: 'm1', isRmv: true } })
    )
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
  })

  it('rejects a non-ACTIVE flagship (draft keeps the direct edit path)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...activeFlagship, status: 'DRAFT' })
    const res = await requestChange({ reason: 'r', title: 'x' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_EDIT_NOT_ALLOWED')
  })

  it('reason is MANDATORY (400 without it)', async () => {
    const res = await requestChange({ title: 'New title' })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
  })

  it('enforces one PENDING edit per voucher (409 PENDING_EDIT_EXISTS)', async () => {
    app.prisma.voucherPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe-open' })
    const res = await requestChange({ reason: 'r', title: 'x' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
  })

  it('rejects a proposed field outside the template allowedFields intersection', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      ...activeFlagship, rmvTemplate: { id: 't1', allowedFields: ['description'] },
    })
    const res = await requestChange({ reason: 'r', title: 'x' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
  })

  it('strips a stray body key (status) at the boundary — it never reaches proposedChanges', async () => {
    const res = await requestChange({ reason: 'r', title: 'x', status: 'INACTIVE', isRmv: false, merchantId: 'evil' })
    expect(res.statusCode).toBe(201)
    const created = (app.prisma.voucherPendingEdit.create as any).mock.calls[0][0].data
    expect(created.proposedChanges).toEqual({ title: 'x' })
    expect(created.proposedChanges.status).toBeUndefined()
  })

  it('rejects an overflowing estimatedSaving with the clean SAVING_INVALID (never Prisma)', async () => {
    const res = await requestChange({ reason: 'r', estimatedSaving: 1e9 })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
  })

  it('rejects an empty title (400)', async () => {
    const res = await requestChange({ reason: 'r', title: '' })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
  })

  it('rejects an empty proposal (reason only, nothing to change)', async () => {
    const res = await requestChange({ reason: 'r' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_EDIT_INVALID_FIELD')
  })

  // ── request-end (custom END, D4) ──────────────────────────────────────────

  it('creates an END pending edit + VOUCHER_EDIT approval; voucher stays ACTIVE', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...activeCustom })
    const res = await requestEnd({ reason: 'Offer finished' })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toMatchObject({ id: 'pe1', kind: 'END', status: 'PENDING' })

    const created = (app.prisma.voucherPendingEdit.create as any).mock.calls[0][0].data
    expect(created).toMatchObject({ voucherId: 'v1', merchantId: 'm1', kind: 'END', reason: 'Offer finished' })
    expect(created.proposedChanges).toBeUndefined() // END proposes no field values

    const approval = (app.prisma.adminApproval.create as any).mock.calls[0][0].data
    expect(approval).toMatchObject({ type: 'VOUCHER_EDIT', referenceId: 'pe1', referenceType: 'voucher_pending_edit' })

    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('D4 PIN: request-end on a flagship (isRmv:true) is REJECTED', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ id: 'rmv1', merchantId: 'm1', isRmv: true, status: 'ACTIVE' })
    const res = await requestEnd({ reason: 'r' }, 'rmv1')
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_EDIT_NOT_ALLOWED')
    expect(app.prisma.voucherPendingEdit.create).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.create).not.toHaveBeenCalled()
  })

  it('request-end requires an ACTIVE voucher', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...activeCustom, status: 'DRAFT' })
    const res = await requestEnd({ reason: 'r' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_EDIT_NOT_ALLOWED')
  })

  it('request-end reason is MANDATORY', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...activeCustom })
    const res = await requestEnd({})
    expect(res.statusCode).toBe(400)
  })

  it('request-end enforces the one-PENDING guard (any kind)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...activeCustom })
    app.prisma.voucherPendingEdit.findFirst = vi.fn().mockResolvedValue({ id: 'pe-open' })
    const res = await requestEnd({ reason: 'r' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('request-end is tenant-scoped (other merchant\'s voucher -> 404)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(null)
    const res = await requestEnd({ reason: 'r' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_FOUND')
    expect(app.prisma.voucher.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1', merchantId: 'm1' } })
    )
  })
})
