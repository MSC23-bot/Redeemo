import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Day-2 Vouchers A3: the custom create/update store an optional merchantFields bag
// (for askHelp + later adminProposed). Security invariant (spec §6.1): the merchant
// can never set status/approvalStatus/approvedBy/isRmv/merchantId from the body;
// the server sets status:DRAFT, approvalStatus:PENDING, isRmv:false on create.
// On update, merchantFields MERGES (preserve askHelp / adminProposed), never replaces.

describe('A3 — custom voucher merchantFields storage + body allow-listing', () => {
  let app: FastifyInstance
  let merchantToken: string

  const draft = {
    id: 'v1', merchantId: 'm1', code: 'RCV-ABC12345', isRmv: false,
    type: 'BOGO', title: '10% off', description: null, terms: null, imageUrl: null,
    estimatedSaving: 5, expiryDate: null, status: 'DRAFT', approvalStatus: 'PENDING',
    isMandatory: false, rmvTemplateId: null, merchantFields: { askHelp: false, builderType: 'bogo' },
    publishedAt: null, approvalComment: null, approvedAt: null, approvedBy: null,
    cooldownSeconds: null, availabilityWindows: [], createdAt: new Date(), updatedAt: new Date(),
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', merchant: { status: 'ACTIVE', businessName: 'Acme' } }) },
      voucher: {
        findFirst: vi.fn().mockResolvedValue({ ...draft }),
        create: vi.fn().mockImplementation(async (a: any) => ({ ...draft, ...a.data })),
        update: vi.fn().mockImplementation(async (a: any) => ({ ...draft, ...a.data })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })

  afterEach(async () => { await app.close() })

  const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers', headers: { authorization: `Bearer ${merchantToken}` }, payload })
  const patch = (payload: unknown) => app.inject({ method: 'PATCH', url: '/api/v1/merchant/vouchers/v1', headers: { authorization: `Bearer ${merchantToken}` }, payload })
  const createArg = () => (app.prisma.voucher.create as any).mock.calls[0][0]
  const updateArg = () => (app.prisma.voucher.update as any).mock.calls[0][0]

  it('create stores merchantFields { askHelp, builderType } in the Voucher.merchantFields column', async () => {
    const res = await post({ type: 'BOGO', title: 'BOGO night', estimatedSaving: 5, merchantFields: { askHelp: true, builderType: 'bogo' } })
    expect(res.statusCode).toBe(201)
    expect(createArg().data.merchantFields).toEqual({ askHelp: true, builderType: 'bogo' })
  })

  it('create ALWAYS sets status:DRAFT, approvalStatus:PENDING, isRmv:false and ignores client-supplied status/approvalStatus/isRmv/merchantId/approvedBy', async () => {
    await post({
      type: 'BOGO', title: 'Sneaky', estimatedSaving: 5,
      // hostile fields — must be dropped by Zod + never reach create data
      status: 'ACTIVE', approvalStatus: 'APPROVED', isRmv: true, merchantId: 'other', approvedBy: 'self',
    })
    const data = createArg().data
    expect(data.status).toBe('DRAFT')
    expect(data.approvalStatus).toBe('PENDING')
    expect(data.isRmv).toBe(false)
    expect(data.merchantId).toBe('m1')
    expect(data.approvedBy).toBeUndefined()
  })

  it('update MERGES merchantFields (preserves existing keys, e.g. adminProposed) rather than replacing the bag', async () => {
    // existing bag carries adminProposed (concierge) + askHelp
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({
      ...draft, merchantFields: { askHelp: true, adminProposed: { title: 'Better' }, builderType: 'bogo' },
    })
    await patch({ merchantFields: { askHelp: false } })
    const merged = updateArg().data.merchantFields
    expect(merged).toEqual({ askHelp: false, adminProposed: { title: 'Better' }, builderType: 'bogo' })
  })

  it('update NEVER writes status/approvalStatus/isRmv/merchantId/approvedBy from the body', async () => {
    await patch({ title: 'New title', status: 'ACTIVE', approvalStatus: 'APPROVED', isRmv: true, merchantId: 'x', approvedBy: 'self' })
    const data = updateArg().data
    expect(data.status).toBeUndefined()
    expect(data.approvalStatus).toBeUndefined()
    expect(data.isRmv).toBeUndefined()
    expect(data.merchantId).toBeUndefined()
    expect(data.approvedBy).toBeUndefined()
    expect(data.title).toBe('New title')
  })
})
