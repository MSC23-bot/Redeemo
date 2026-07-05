import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B2.1: auth + capability + strict-body gate on the admin
// direct-edit-on-behalf routes. The capability gate (authenticateAdmin then
// requireAdminCapability('merchant:edit')) fires in preHandlers BEFORE the
// service runs, and the strict Zod body parses before the service too, so a tiny
// prisma mock suffices for the 401/403/400 cases. The positive cases
// (OPERATIONS / SUPER_ADMIN pass the gate) drive the shared core through a mock
// prisma whose $transaction runs the callback with the same mock as `tx`.
describe('B2.1: admin merchant/branch direct-edit routes (auth + capability + strict body)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' },
      { expiresIn: '1h' },
    )

  const merchantUrl = '/api/v1/admin/merchants/m1/profile'
  const branchUrl = '/api/v1/admin/branches/b1'

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      // $transaction runs the callback with the same mock so tx.merchant.update /
      // tx.branch.update / tx.auditLog.create resolve.
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
      merchant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'm1', status: 'ACTIVE', websiteUrl: 'https://old.example.com', vatNumber: null, companyNumber: null }),
        update: vi.fn().mockResolvedValue({ id: 'm1', websiteUrl: 'https://new.example.com' }),
      },
      branch: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'b1', merchantId: 'm1', phone: '+44111', email: null, websiteUrl: null, isActive: true,
          openingHours: [], amenities: [], photos: [], pendingEdits: [],
        }),
        update: vi.fn().mockResolvedValue({ id: 'b1', phone: '+44222', isActive: false }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  describe('PATCH /admin/merchants/:id/profile', () => {
    it('401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'PATCH', url: merchantUrl, payload: { websiteUrl: 'https://x.com', reason: 'fix' } })
      expect(res.statusCode).toBe(401)
    })

    it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:edit)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
        payload: { websiteUrl: 'https://x.com', reason: 'fix' },
      })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('400 when reason is missing (strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { websiteUrl: 'https://x.com' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (companyNumber, strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { websiteUrl: 'https://x.com', companyNumber: '12345678', reason: 'fix' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (businessName, strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { businessName: 'New Name', reason: 'fix' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (vatNumber, strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { vatNumber: 'GB123', reason: 'fix' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('200 for OPERATIONS with websiteUrl + reason', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { websiteUrl: 'https://new.example.com', reason: 'merchant phoned support' },
      })
      expect(res.statusCode).toBe(200)
      expect(app.prisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ websiteUrl: 'https://new.example.com' }) }),
      )
      expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'MERCHANT_PROFILE_UPDATED', actorType: 'ADMIN', reason: 'merchant phoned support' }),
        }),
      )
    })

    it('200 for SUPER_ADMIN (superuser holds merchant:edit)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: merchantUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { websiteUrl: 'https://new.example.com', reason: 'fix' },
      })
      expect(res.statusCode).toBe(200)
    })
  })

  describe('PATCH /admin/branches/:branchId', () => {
    it('401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'PATCH', url: branchUrl, payload: { phone: '+44222', reason: 'fix' } })
      expect(res.statusCode).toBe(401)
    })

    it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:edit)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
        payload: { phone: '+44222', reason: 'fix' },
      })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('400 when reason is missing (strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { phone: '+44222' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (name, strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { name: 'New Branch Name', reason: 'fix' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('200 for OPERATIONS with phone + isActive + reason', async () => {
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { phone: '+44222', isActive: false, reason: 'branch closed temporarily' },
      })
      expect(res.statusCode).toBe(200)
      expect(app.prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: '+44222', isActive: false }) }),
      )
      expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'BRANCH_UPDATED', entityType: 'branch', entityId: 'b1', actorType: 'ADMIN', reason: 'branch closed temporarily',
          }),
        }),
      )
    })

    // Wire hygiene (2026-07-05): this route sends the shared updateBranchDirectCore
    // result straight to the client; BEFORE the sanitizer it leaked the raw
    // AES-encrypted redemptionPin ciphertext on the wire. Pin the closed leak: the
    // response carries the derived redemptionPinSet boolean, never the ciphertext.
    it('200 response is pin-sanitized: redemptionPinSet boolean, no ciphertext on the wire', async () => {
      ;(app.prisma.branch.update as any).mockResolvedValueOnce({
        id: 'b1', phone: '+44333', isActive: true, redemptionPin: 'enc:ADMINCIPHER456',
      })
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { phone: '+44333', reason: 'phone fix' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.redemptionPinSet).toBe(true)
      expect(body).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain('enc:ADMINCIPHER456')
    })

    it('200 for SUPER_ADMIN (superuser holds merchant:edit)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: branchUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { phone: '+44222', reason: 'fix' },
      })
      expect(res.statusCode).toBe(200)
    })
  })

  // Option B B2.2: the identity route is gated on the SUPER_ADMIN-only
  // merchant:edit-identity capability (so OPERATIONS is denied), requires
  // confirm:true + a reason, has a STRICT vat/company body, and tags the audit
  // row with the distinct MERCHANT_IDENTITY_UPDATED event.
  describe('PATCH /admin/merchants/:id/identity', () => {
    const identityUrl = '/api/v1/admin/merchants/m1/identity'

    it('401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'PATCH', url: identityUrl, payload: { vatNumber: 'GB1', reason: 'fix', confirm: true } })
      expect(res.statusCode).toBe(401)
    })

    it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS (lacks merchant:edit-identity)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
        payload: { vatNumber: 'GB1', reason: 'fix', confirm: true },
      })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('403 ADMIN_CAPABILITY_DENIED for SUPPORT', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
        payload: { vatNumber: 'GB1', reason: 'fix', confirm: true },
      })
      expect(res.statusCode).toBe(403)
    })

    it('400 when confirm is missing (strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { vatNumber: 'GB1', reason: 'fix' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when confirm is false', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { vatNumber: 'GB1', reason: 'fix', confirm: false },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when reason is missing', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { vatNumber: 'GB1', confirm: true },
      })
      expect(res.statusCode).toBe(400)
    })

    it('400 when a non-allow-listed key is sent (websiteUrl, strict body)', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { websiteUrl: 'https://x.com', reason: 'fix', confirm: true },
      })
      expect(res.statusCode).toBe(400)
    })

    it('200 for SUPER_ADMIN with vat/company + reason + confirm, audits MERCHANT_IDENTITY_UPDATED', async () => {
      const res = await app.inject({
        method: 'PATCH', url: identityUrl,
        headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
        payload: { vatNumber: 'GB999', companyNumber: '12345678', reason: 'companies house correction', confirm: true },
      })
      expect(res.statusCode).toBe(200)
      expect(app.prisma.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vatNumber: 'GB999', companyNumber: '12345678' }) }),
      )
      expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ event: 'MERCHANT_IDENTITY_UPDATED', actorType: 'ADMIN', reason: 'companies house correction' }),
        }),
      )
    })
  })
})
