import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B3: POST /admin/merchants/:id/submit — admin submit-for-approval on
// the merchant's behalf. The gate (authenticateAdmin then
// requireAdminCapability('merchant:submit')) fires in preHandlers before the
// service, and the shared submitForApprovalCore runs the SAME path as the
// merchant route (no weaker path). A tiny prisma mock suffices: $transaction runs
// the callback with the same mock; notify (owner-notice + ops email) is module-
// mocked so the assertions don't touch Redis / the email outbox.
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/notify')>()
  return { ...actual, notify: notifyMock }
})

describe('B3: POST /admin/merchants/:id/submit (admin submit-on-behalf)', () => {
  let app: FastifyInstance
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const url = '/api/v1/admin/merchants/m1/submit'

  // A merchant that is ready to submit: REGISTERED, contract SIGNED, and (with
  // the branch/voucher counts below) 1 branch + 2 RMVs → all gates pass.
  const readyMerchant = {
    id: 'm1', status: 'REGISTERED', onboardingStep: 'REGISTERED',
    contractStatus: 'SIGNED', businessName: 'Acme',
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: {
        findUnique: vi.fn().mockResolvedValue(readyMerchant),
        update: vi.fn().mockResolvedValue({
          id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED',
          verificationStatus: 'PENDING', businessName: 'Acme',
        }),
      },
      branch: { count: vi.fn().mockResolvedValue(1) },
      voucher: { count: vi.fn().mockResolvedValue(2) },
      adminApproval: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      // Owner-notice resolves the ACTIVE OWNER membership for the merchant.
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ merchantAdmin: { id: 'owner-ma', email: 'owner@x.com' } }) },
      // emitMerchantSubmittedAlert fan-out set (empty → no bell rows here);
      // findUnique resolves the resubmit-alert reviewer (active) when that path runs.
      adminUser: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: 'rev1', email: 'rev1@x.com', isActive: true }) },
      notification: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
    notifyMock.mockReset()
    notifyMock.mockResolvedValue({ queued: true, communicationLogId: 'c1', enqueued: true })
    delete process.env.ADMIN_OPS_ALERT_EMAIL
  })
  afterEach(async () => { await app.close(); delete process.env.ADMIN_OPS_ALERT_EMAIL })

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { reason: 'ready to go' } })
    expect(res.statusCode).toBe(401)
  })

  it('403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:submit)', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` }, payload: { reason: 'x' } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('400 when reason is missing (STRICT body)', async () => {
    const res = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('200 first-submit for OPERATIONS: state transition, approval created, ADMIN-attributed audit, owner notice', async () => {
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'Owner asked us to submit on their behalf' },
    })
    expect(res.statusCode).toBe(200)
    // Slim response: lifecycle fields only.
    expect(JSON.parse(res.body)).toEqual({
      id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING',
    })
    // Same state transition as the merchant path.
    expect((app as any).prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' }) }),
    )
    expect((app as any).prisma.adminApproval.create).toHaveBeenCalled()
    // D2: in-tx, actor-attributed audit — ADMIN actor + the reason on the admin path.
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        event: 'MERCHANT_SUBMITTED_FOR_APPROVAL', actorType: 'ADMIN', actorId: 'admin-1',
        reason: 'Owner asked us to submit on their behalf',
      }) }),
    )
    // D3: best-effort owner notice — MERCHANT_ADMIN recipient, MERCHANT_VERIFICATION_UPDATE in-app.
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const notifyArg = notifyMock.mock.calls[0][2]
    expect(notifyArg).toMatchObject({
      to: 'owner@x.com', recipientType: 'MERCHANT_ADMIN', recipientId: 'owner-ma',
      inApp: expect.objectContaining({ notificationType: 'MERCHANT_VERIFICATION_UPDATE' }),
    })
  })

  it('409 ONBOARDING_GATES_INCOMPLETE when a gate is unmet (reuses the live checklist)', async () => {
    ;(app as any).prisma.voucher.count.mockResolvedValue(0) // < 2 RMVs
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'try anyway' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ONBOARDING_GATES_INCOMPLETE')
    expect((app as any).prisma.merchant.update).not.toHaveBeenCalled()
  })

  it('409 ALREADY_SUBMITTED for a SUSPENDED merchant (resolver allows it; status gate refuses)', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue({ ...readyMerchant, status: 'SUSPENDED', onboardingStep: 'SUSPENDED' })
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'fix it' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_SUBMITTED')
  })

  it('200 resubmit (PENDING_APPROVAL + NEEDS_CHANGES): reopens the same approval, MERCHANT_RESUBMITTED audit', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue({ ...readyMerchant, status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })
    ;(app as any).prisma.adminApproval.findFirst.mockResolvedValue({ id: 'ap1', adminUserId: 'rev1' })
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'resubmitting after fixes' },
    })
    expect(res.statusCode).toBe(200)
    expect((app as any).prisma.adminApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ap1' }, data: expect.objectContaining({ status: 'PENDING', claimedById: null }) }),
    )
    expect((app as any).prisma.adminApproval.create).not.toHaveBeenCalled()
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MERCHANT_RESUBMITTED', actorType: 'ADMIN' }) }),
    )
    // Non-self resubmit (reviewer rev1 != acting admin-1): the resubmit alert
    // fires and resolves the requesting reviewer (contrast the self-silence pin below).
    expect((app as any).prisma.adminUser.findUnique).toHaveBeenCalled()
  })

  it('M3 self-action-silence: admin resubmit where the acting admin IS the requesting reviewer skips the resubmit alert (owner notice still fires)', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue({ ...readyMerchant, status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })
    // The reopened approval's requesting reviewer IS the acting admin (admin-1).
    ;(app as any).prisma.adminApproval.findFirst.mockResolvedValue({ id: 'ap1', adminUserId: 'admin-1' })
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'resubmitting my own change' },
    })
    expect(res.statusCode).toBe(200)
    expect((app as any).prisma.adminApproval.update).toHaveBeenCalled() // reopened, not duplicated
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MERCHANT_RESUBMITTED', actorType: 'ADMIN' }) }),
    )
    // Self-silence: the resubmit alert is skipped, so the reviewer lookup never runs.
    expect((app as any).prisma.adminUser.findUnique).not.toHaveBeenCalled()
    // Independent of the skip — the merchant OWNER is still notified exactly once.
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][2]).toMatchObject({
      recipientType: 'MERCHANT_ADMIN',
      inApp: expect.objectContaining({ notificationType: 'MERCHANT_VERIFICATION_UPDATE' }),
    })
  })

  it('D3 owner-notice defensive branch: no ACTIVE OWNER -> notice skipped, submit still succeeds', async () => {
    ;(app as any).prisma.merchantMembership.findFirst.mockResolvedValue(null) // no ACTIVE OWNER to notify
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'submit anyway' },
    })
    // The (best-effort) owner notice must never fail the already-committed submit.
    expect(res.statusCode).toBe(200)
    expect((app as any).prisma.merchant.update).toHaveBeenCalled()
    // The owner lookup ran and returned null → notify is NOT called (notice skipped).
    expect((app as any).prisma.merchantMembership.findFirst).toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('404 MERCHANT_NOT_FOUND when the merchant is absent', async () => {
    ;(app as any).prisma.merchant.findUnique.mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
      payload: { reason: 'x' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_FOUND')
  })

  it('200 for SUPER_ADMIN (superuser holds merchant:submit)', async () => {
    const res = await app.inject({
      method: 'POST', url,
      headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
      payload: { reason: 'go' },
    })
    expect(res.statusCode).toBe(200)
  })
})
