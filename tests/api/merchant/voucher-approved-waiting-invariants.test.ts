import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Day-2 Vouchers A9 - §11 honesty-note regression guards.
//
// (1) The NEW "approved-waiting" state is the combination
//     status:PENDING_APPROVAL + approvalStatus:APPROVED. No existing query
//     assumes PENDING_APPROVAL implies approvalStatus:PENDING. This pins that an
//     approved-waiting voucher is correctly IMMUTABLE to the merchant: PATCH /
//     submit / delete all gate on status:DRAFT, so they reject regardless of
//     approvalStatus (VOUCHER_NOT_EDITABLE / NOT_SUBMITTABLE / NOT_DELETABLE).
//     Customer queries gate on status:ACTIVE (cross-checked below), so an
//     approved-waiting voucher is also correctly invisible to customers.
//
// (2) The admin actionable queue keys "needs review" off AdminApproval.status
//     (PENDING / CLAIMED), NOT the voucher status. approveVoucher flips the
//     AdminApproval to APPROVED, so listApprovals({status:'PENDING'}) never
//     re-surfaces an approved-waiting voucher's approval. Pinned by asserting the
//     status-filtered where clause excludes APPROVED rows (a unit-level cross-check
//     of the listApprovals where construction).

// An approved-waiting custom voucher: APPROVED but not yet activated.
const approvedWaiting = {
  id: 'v-aw',
  merchantId: 'm1',
  code: 'RCV-AW000001',
  isRmv: false,
  type: 'DISCOUNT_FIXED',
  title: 'Approved waiting deal',
  description: null,
  terms: null,
  imageUrl: null,
  estimatedSaving: 8.0,
  expiryDate: null,
  status: 'PENDING_APPROVAL',
  approvalStatus: 'APPROVED', // <- the NEW combination with status:PENDING_APPROVAL
  isMandatory: false,
  rmvTemplateId: null,
  merchantFields: {},
  publishedAt: new Date(),
  approvalComment: null,
  approvedAt: new Date(),
  approvedBy: 'admin-1',
  availabilityWindows: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('A9 (§11 honesty note 1): approved-waiting voucher is immutable to the merchant', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      voucher: {
        // Every gated path loads the voucher then checks status:DRAFT; the
        // approved-waiting fixture (status:PENDING_APPROVAL) must trip the gate.
        findFirst: vi.fn().mockResolvedValue({ ...approvedWaiting }),
        update: vi.fn(),
        delete: vi.fn(),
      },
      adminApproval: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })
  afterEach(async () => { await app.close() })

  it('PATCH -> 409 VOUCHER_NOT_EDITABLE (gate is status:DRAFT, not approvalStatus)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/vouchers/v-aw',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Try to edit' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_EDITABLE')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('POST submit -> 409 VOUCHER_NOT_SUBMITTABLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/vouchers/v-aw/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_SUBMITTABLE')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('DELETE -> 409 VOUCHER_NOT_DELETABLE', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/merchant/vouchers/v-aw',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_DELETABLE')
    expect(app.prisma.voucher.delete).not.toHaveBeenCalled()
  })
})

describe('A9 (§11 honesty note 1, cross-check): customer queries gate on status:ACTIVE', () => {
  it('an approved-waiting voucher (status:PENDING_APPROVAL) does not satisfy the customer-visibility filter', () => {
    // The customer-visibility filter is status:ACTIVE + approvalStatus:APPROVED
    // (src/api/customer/discovery/service.ts). An approved-waiting voucher has
    // approvalStatus:APPROVED but status:PENDING_APPROVAL, so it fails status:ACTIVE
    // and is correctly invisible. Encoded as a predicate cross-check (the discovery
    // service is out of PR-A scope; this documents + pins the invariant locally).
    const customerVisible = (v: { status: string; approvalStatus: string }) =>
      v.status === 'ACTIVE' && v.approvalStatus === 'APPROVED'
    expect(customerVisible(approvedWaiting)).toBe(false)
    // The same voucher once activated (status:ACTIVE) becomes visible.
    expect(customerVisible({ ...approvedWaiting, status: 'ACTIVE' })).toBe(true)
  })
})

describe('A9 (§11 honesty note 2): the actionable queue keys off AdminApproval.status', () => {
  let app: FastifyInstance
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  let findManyWhere: any
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      adminApproval: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockImplementation((args: any) => {
          findManyWhere = args?.where
          return Promise.resolve([])
        }),
      },
      voucher: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn() },
      merchant: { findMany: vi.fn().mockResolvedValue([]) },
      adminUser: { findMany: vi.fn().mockResolvedValue([]) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('listApprovals({status:PENDING}) filters on AdminApproval.status=PENDING, so an APPROVED voucher approval is never returned', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals?status=PENDING&type=VOUCHER',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    // The where clause keys off AdminApproval.status (PENDING) - NOT voucher status.
    // An approveVoucher decision sets the AdminApproval to APPROVED, so it cannot
    // match status:PENDING and never re-surfaces as actionable.
    expect(findManyWhere?.status).toBe('PENDING')
    expect(findManyWhere?.type).toBe('VOUCHER')
  })
})
