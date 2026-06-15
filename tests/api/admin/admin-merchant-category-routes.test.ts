import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.3-core: auth + capability + strict-body gate on the admin category
// route. The capability gate (authenticateAdmin then
// requireAdminCapability('merchant:edit-category')) fires in preHandlers BEFORE
// the service, and the strict Zod body parses before the service too, so a prisma
// mock suffices. The positive cases drive setMerchantCategoryCore through a mock
// prisma whose $transaction runs the callback with the same mock as `tx`.
describe('B2.3-core: PATCH /admin/merchants/:id/category (auth + capability + strict body + actor audit)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1/category'

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      merchant: {
        // Default: first-time set (no existing category).
        findUnique: vi.fn().mockResolvedValue({ primaryCategoryId: null }),
        update: vi.fn().mockResolvedValue({ id: 'm1' }),
      },
      rmvTemplate: {
        findMany: vi.fn().mockResolvedValue([
          { id: 't1', voucherType: 'DISCOUNT_FIXED', title: 'A', description: 'd', minimumSaving: 5 },
          { id: 't2', voucherType: 'DISCOUNT_FIXED', title: 'B', description: 'd', minimumSaving: 5 },
        ]),
      },
      voucher: {
        findMany: vi.fn().mockResolvedValue([]), // no submitted/active RMV -> not blocked
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'v1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'PATCH', url, payload: { primaryCategoryId: 'cat-1', reason: 'fix' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS (lacks merchant:edit-category)', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { primaryCategoryId: 'cat-1', reason: 'fix' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { primaryCategoryId: 'cat-1', reason: 'fix' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('400 when reason is missing (strict body)', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { primaryCategoryId: 'cat-1' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 when primaryCategoryId is missing', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { reason: 'fix' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 when a non-allow-listed key is sent (websiteUrl, strict body)', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { primaryCategoryId: 'cat-1', websiteUrl: 'https://x.com', reason: 'fix' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('200 SUPER_ADMIN first-set provisions + audits RMV_PROVISIONED & MERCHANT_PROFILE_UPDATED (actor ADMIN)', async () => {
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { primaryCategoryId: 'cat-new', reason: 'onboarding correction' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ provisioned: true })
    // 2 RMVs provisioned.
    expect((app.prisma.voucher.create as any).mock.calls.length).toBe(2)
    // Both audit events are actor-attributed ADMIN + reason.
    const events = (app.prisma.auditLog.create as any).mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('RMV_PROVISIONED')
    expect(events).toContain('MERCHANT_PROFILE_UPDATED')
    for (const c of (app.prisma.auditLog.create as any).mock.calls) {
      expect(c[0].data.actorType).toBe('ADMIN')
      expect(c[0].data.reason).toBe('onboarding correction')
    }
  })

  it('200 SUPER_ADMIN change with confirm:false returns requiresConfirmation (no write)', async () => {
    ;(app.prisma.merchant.findUnique as any).mockResolvedValue({ primaryCategoryId: 'cat-old' })
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { primaryCategoryId: 'cat-new', reason: 'wrong category' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).requiresConfirmation).toBe(true)
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('200 SUPER_ADMIN change with confirm:true applies + audits CATEGORY_CHANGED (actor ADMIN)', async () => {
    ;(app.prisma.merchant.findUnique as any).mockResolvedValue({ primaryCategoryId: 'cat-old' })
    const res = await app.inject({
      method: 'PATCH', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { primaryCategoryId: 'cat-new', reason: 'wrong category', confirm: true },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ changed: true })
    // DRAFT RMVs soft-deleted + 2 new provisioned.
    expect(app.prisma.voucher.updateMany).toHaveBeenCalled()
    expect((app.prisma.voucher.create as any).mock.calls.length).toBe(2)
    const audit = (app.prisma.auditLog.create as any).mock.calls.find((c: any) => c[0].data.event === 'CATEGORY_CHANGED')
    expect(audit).toBeTruthy()
    expect(audit[0].data.actorType).toBe('ADMIN')
    expect(audit[0].data.reason).toBe('wrong category')
    expect(audit[0].data.before).toMatchObject({ primaryCategoryId: 'cat-old' })
    expect(audit[0].data.after).toMatchObject({ primaryCategoryId: 'cat-new' })
  })
})
