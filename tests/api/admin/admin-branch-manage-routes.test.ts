import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.4-core: auth + capability + strict-body gate on the admin branch
// create + soft-delete routes. The gate (authenticateAdmin then
// requireAdminCapability('merchant:manage-branches')) fires in preHandlers and the
// strict Zod body parses BEFORE the service, so a prisma mock suffices for the
// 401/403/400/404/409 cases. The create 200 + redemptionPin redaction is proven
// at the integration level (createBranchCore resolves the postcode via the live
// gazetteer, which a pure mock cannot exercise); the delete 200 + audit is pinned
// here (pure prisma).
describe('B2.4-core: admin branch create + soft-delete routes (auth + capability + strict body)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const createUrl = '/api/v1/admin/merchants/m1/branches'
  const deleteUrl = '/api/v1/admin/branches/b1/delete'

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      // resolveTargetMerchantForAdmin -> merchant.findUnique({id,status}); the core
      // also reads merchant.status for the BRANCH_LAST_ACTIVE guard.
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      branch: {
        // Default delete: a non-main branch, not the last active.
        findFirst: vi.fn().mockResolvedValue({ id: 'b1', merchantId: 'm1', isMainBranch: false }),
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn().mockResolvedValue({ id: 'b1' }),
        create: vi.fn().mockResolvedValue({ id: 'b1' }),
      },
      branchUser: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  // ── Create ──────────────────────────────────────────────────────────────────

  const createBody = { name: 'New Branch', addressLine1: '1 St', city: 'London', postcode: 'EC1A 1BB', reason: 'merchant asked' }

  describe('POST /admin/merchants/:id/branches', () => {
    it('401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'POST', url: createUrl, payload: createBody })
      expect(res.statusCode).toBe(401)
    })

    it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS (lacks merchant:manage-branches)', async () => {
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: createBody })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('403 for SUPPORT', async () => {
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: createBody })
      expect(res.statusCode).toBe(403)
    })

    it('400 when reason is missing', async () => {
      const { reason, ...noReason } = createBody
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: noReason })
      expect(res.statusCode).toBe(400)
    })

    it('400 when name is missing', async () => {
      const { name, ...noName } = createBody
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: noName })
      expect(res.statusCode).toBe(400)
    })

    it('400 when postcode is missing', async () => {
      const { postcode, ...noPostcode } = createBody
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: noPostcode })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (latitude, strict body)', async () => {
      const res = await app.inject({ method: 'POST', url: createUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { ...createBody, latitude: 51.5 } })
      expect(res.statusCode).toBe(400)
    })
  })

  // ── Soft-delete ─────────────────────────────────────────────────────────────

  describe('POST /admin/branches/:branchId/delete', () => {
    it('401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'POST', url: deleteUrl, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(401)
    })

    it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS', async () => {
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(403)
    })

    it('403 for SUPPORT', async () => {
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(403)
    })

    it('400 when reason is missing', async () => {
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: {} })
      expect(res.statusCode).toBe(400)
    })

    it('404 BRANCH_NOT_FOUND when the branch is absent', async () => {
      ;(app as any).prisma.branch.findFirst.mockResolvedValueOnce(null)
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.body).error.code).toBe('BRANCH_NOT_FOUND')
    })

    it('409 BRANCH_IS_MAIN when deleting the main branch', async () => {
      // route findFirst (select merchantId) then core findFirst (full, isMainBranch:true)
      ;(app as any).prisma.branch.findFirst
        .mockResolvedValueOnce({ id: 'b1', merchantId: 'm1' })
        .mockResolvedValueOnce({ id: 'b1', merchantId: 'm1', isMainBranch: true })
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error.code).toBe('BRANCH_IS_MAIN')
    })

    it('409 BRANCH_LAST_ACTIVE when it is the merchant last active branch', async () => {
      ;(app as any).prisma.branch.count.mockResolvedValueOnce(1) // only one active branch
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'closed' } })
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body).error.code).toBe('BRANCH_LAST_ACTIVE')
    })

    it('200 SUPER_ADMIN deletes + audits BRANCH_DELETED (entityType branch, actor ADMIN, reason)', async () => {
      const res = await app.inject({ method: 'POST', url: deleteUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'permanently closed' } })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body)).toEqual({ ok: true })
      // cascade + soft-delete
      expect(app.prisma.branchUser.updateMany).toHaveBeenCalledWith({ where: { branchId: 'b1' }, data: { status: 'INACTIVE' } })
      expect(app.prisma.branch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }))
      // actor-attributed audit on the branch entity
      expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'BRANCH_DELETED', entityType: 'branch', entityId: 'b1', actorType: 'ADMIN', reason: 'permanently closed' }),
        }),
      )
    })
  })
})
