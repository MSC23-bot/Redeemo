import 'dotenv/config'
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import { createMerchantDraft } from '../../../src/api/admin/merchants/service'
import { writeAuditLogTx } from '../../../src/api/shared/audit'
import { buildApp } from '../../../src/api/app'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const ADMIN_ID = 'test-admin-m2'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'm2-test' }
const createdMerchantIds: string[] = []

async function cleanupMerchant(merchantId: string) {
  await prisma.auditLog.deleteMany({ where: { entityId: merchantId } })
  const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
}

afterAll(async () => {
  for (const id of createdMerchantIds) await cleanupMerchant(id)
  await prisma.$disconnect()
})

describe('M2 — createMerchantDraft (service, real DB)', () => {
  it('atomically creates Merchant (REGISTERED) + owner MerchantAdmin (no password) + OWNER membership; response leaks no secret', async () => {
    const email = `m2-draft-${Date.now()}@example.com`
    const result = await createMerchantDraft(
      prisma,
      ADMIN_ID,
      { businessName: 'M2 Draft Co', ownerEmail: email, ownerFirstName: 'Olivia', ownerLastName: 'Owner' },
      ctx
    )
    createdMerchantIds.push(result.merchantId)

    expect(result).toEqual({
      merchantId: expect.any(String),
      ownerAdminId: expect.any(String),
      ownerEmail: email,
      passwordSetupRequired: true,
    })
    // Exact shape is pinned above; this guards specifically against a leaked
    // secret value (the `passwordSetupRequired` flag is an intentional boolean).
    expect(JSON.stringify(result)).not.toMatch(/passwordhash|token|secret/i)

    const merchant = await prisma.merchant.findUnique({ where: { id: result.merchantId } })
    expect(merchant?.status).toBe('REGISTERED')
    expect(merchant?.verificationStatus).toBe('NOT_SUBMITTED')

    const admin = await prisma.merchantAdmin.findUnique({ where: { id: result.ownerAdminId } })
    expect(admin?.passwordHash).toBeNull()
    expect(admin?.mustChangePassword).toBe(true)
    // M6b (D-1): the admin→merchant link is the OWNER membership (asserted below),
    // not a MerchantAdmin.merchantId column (dropped).

    const membership = await prisma.merchantMembership.findFirst({
      where: { merchantAdminId: result.ownerAdminId, role: 'OWNER', status: 'ACTIVE' },
    })
    expect(membership?.merchantId).toBe(result.merchantId)
    expect(membership?.allBranches).toBe(true)
  })

  it('writes a MERCHANT_DRAFT_CREATED audit row with the admin as actor', async () => {
    const email = `m2-audit-${Date.now()}@example.com`
    const result = await createMerchantDraft(
      prisma,
      ADMIN_ID,
      { businessName: 'M2 Audit Co', ownerEmail: email, ownerFirstName: 'A', ownerLastName: 'B' },
      ctx
    )
    createdMerchantIds.push(result.merchantId)

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.merchantId, event: 'MERCHANT_DRAFT_CREATED' },
    })
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.entityType).toBe('merchant')
  })

  it('rejects a duplicate owner email with EMAIL_ALREADY_EXISTS and creates nothing', async () => {
    const email = `m2-dup-${Date.now()}@example.com`
    const first = await createMerchantDraft(
      prisma,
      ADMIN_ID,
      { businessName: 'First Co', ownerEmail: email, ownerFirstName: 'A', ownerLastName: 'B' },
      ctx
    )
    createdMerchantIds.push(first.merchantId)

    const uniqueName = `M2 Dup Second ${Date.now()}`
    await expect(
      createMerchantDraft(
        prisma,
        ADMIN_ID,
        { businessName: uniqueName, ownerEmail: email, ownerFirstName: 'C', ownerLastName: 'D' },
        ctx
      )
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS')
    // The failed attempt created no merchant (rolled back / never started).
    const orphan = await prisma.merchant.findFirst({ where: { businessName: uniqueName } })
    expect(orphan).toBeNull()
  })
})

describe('M2 — writeAuditLogTx rolls back with its transaction (real DB)', () => {
  it('does not persist the audit row when the surrounding transaction throws', async () => {
    const marker = `rollback-marker-${Date.now()}`
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAuditLogTx(tx, {
          entityId: marker,
          entityType: 'merchant',
          event: 'MERCHANT_DRAFT_CREATED',
          actorId: ADMIN_ID,
          actorType: 'ADMIN',
          ipAddress: '127.0.0.1',
          userAgent: 't',
        })
        throw new Error('boom — force rollback')
      })
    ).rejects.toThrow('boom')

    const persisted = await prisma.auditLog.findFirst({ where: { entityId: marker } })
    expect(persisted).toBeNull()
  })
})

describe('M2 — POST /api/v1/admin/merchants (auth + capability gate)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {} as any) // gate/validation paths never reach prisma
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/merchants', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without the capability (SUPPORT)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { businessName: 'X', ownerEmail: 'x@y.com', ownerFirstName: 'A', ownerLastName: 'B' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('400 for a capable role (SUPER_ADMIN) with an invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/merchants',
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { businessName: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})
