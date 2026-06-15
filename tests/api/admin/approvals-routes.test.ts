import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// M3 — auth + capability gate on the /admin/approvals routes (not business
// logic). The gate fires in preHandlers (authenticateAdmin → requireAdminCapability)
// before any service/prisma call, so a bare prisma mock suffices.
describe('M3 — /admin/approvals route auth + capability gate', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {} as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('401 when unauthenticated (GET list)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/approvals' })
    expect(res.statusCode).toBe(401)
  })

  it('401 when unauthenticated (POST claim)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/claim' })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for a role without approval:read (SUPPORT, GET list)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('403 for a role without approval:action (SUPPORT, POST request-changes)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/request-changes',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
      payload: { reason: 'x' },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  // M5 — approve route shares the approval:action gate.
  it('401 when unauthenticated (POST approve)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/approvals/some-id/approve' })
    expect(res.statusCode).toBe(401)
  })

  it('403 for a role without approval:action (SUPPORT, POST approve)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/approvals/some-id/approve',
      headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` },
    })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })
})

// PR4: GET list query schema accepts ?referenceId and the response surfaces the
// batch-resolved claimedBy { id, name } shape. Runs the route end-to-end with a
// prisma mock (OPERATIONS holds approval:read) so both the new query param and
// the new output field are pinned at the route boundary.
describe('PR4: /admin/approvals?referenceId + claimedBy output', () => {
  let app: FastifyInstance
  let findManyArgs: any
  const signOps = () =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-1', role: 'admin', adminRole: 'OPERATIONS', sessionId: 's1' },
      { expiresIn: '1h' },
    )

  beforeEach(async () => {
    app = await buildApp()
    findManyArgs = undefined
    const approvalRow = {
      id: 'appr-1',
      type: 'MERCHANT_ONBOARDING',
      referenceId: 'merchant-42',
      referenceType: 'merchant',
      status: 'PENDING',
      adminUserId: null,
      comment: null,
      submittedAt: new Date('2026-06-14T10:00:00.000Z'),
      actionedAt: null,
      claimedById: 'admin-claimer',
      claimedAt: new Date('2026-06-14T11:00:00.000Z'),
    }
    app.decorate('prisma', {
      adminApproval: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockImplementation((args: any) => {
          findManyArgs = args
          return Promise.resolve([approvalRow])
        }),
      },
      merchant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'merchant-42',
            businessName: 'Acme Coffee',
            status: 'PENDING_APPROVAL',
            onboardingStep: 'SUBMITTED',
            verificationStatus: 'PENDING',
            contractStatus: 'SIGNED',
          },
        ]),
      },
      adminUser: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'admin-claimer', firstName: 'Jordan', lastName: 'Lee' },
        ]),
      },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('accepts ?referenceId, threads it into the prisma where, and returns claimedBy { id, name }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals?referenceId=merchant-42&type=MERCHANT_ONBOARDING&pageSize=1',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    // The query param survived Zod parsing and reached the prisma where clause.
    expect(findManyArgs?.where?.referenceId).toBe('merchant-42')

    const body = JSON.parse(res.body)
    expect(body.approvals).toHaveLength(1)
    expect(body.approvals[0].claimedBy).toEqual({ id: 'admin-claimer', name: 'Jordan Lee' })
  })

  it('returns claimedBy: null when the row is unclaimed', async () => {
    // Re-point findMany at an unclaimed row for this case.
    ;(app.prisma.adminApproval.findMany as any).mockResolvedValueOnce([
      {
        id: 'appr-2',
        type: 'MERCHANT_ONBOARDING',
        referenceId: 'merchant-42',
        referenceType: 'merchant',
        status: 'PENDING',
        adminUserId: null,
        comment: null,
        submittedAt: new Date('2026-06-14T10:00:00.000Z'),
        actionedAt: null,
        claimedById: null,
        claimedAt: null,
      },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/approvals?referenceId=merchant-42',
      headers: { authorization: `Bearer ${signOps()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.approvals[0].claimedBy).toBeNull()
  })
})
