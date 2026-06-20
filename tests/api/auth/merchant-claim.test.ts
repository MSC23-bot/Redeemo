import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { claimMerchantAccount } from '../../../src/api/auth/merchant/service'
import { hashPassword } from '../../../src/api/shared/password'

// Draft-owner claim — set-password via the emailed single-use token. Mock-based.
// Covers the claim state transition, the /claim route, and that login after claim
// succeeds ONLY through the recognised-device path (unknown-device OTP unchanged).

const VALID = 'ValidPass1!'
const TOKEN = 'claim-token-abc'

describe('claimMerchantAccount (service)', () => {
  const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

  const prismaMock = () => ({
    merchantAdmin: { update: vi.fn().mockResolvedValue({}) },
    auditLog:      { create: vi.fn().mockResolvedValue({}) },
  })

  it('sets passwordHash, clears mustChangePassword, sets otpVerifiedAt + emailVerified, and deletes the token (single-use)', async () => {
    const prisma = prismaMock()
    const redis  = { get: vi.fn().mockResolvedValue('ma-1'), del: vi.fn().mockResolvedValue(1) }

    await claimMerchantAccount(prisma as any, redis as any, { token: TOKEN, newPassword: VALID, ...ctx })

    expect(redis.get).toHaveBeenCalledWith('merchant-claim:claim-token-abc')
    const update = prisma.merchantAdmin.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'ma-1' })
    expect(update.data.passwordHash).toEqual(expect.any(String))
    expect(update.data.mustChangePassword).toBe(false)
    expect(update.data.otpVerifiedAt).toBeInstanceOf(Date)
    // M1 Slice R: the emailed claim link proves email control, so claim verifies email.
    expect(update.data.emailVerified).toBe(true)
    expect(redis.del).toHaveBeenCalledWith('merchant-claim:claim-token-abc') // single-use
    expect(prisma.auditLog.create).toHaveBeenCalled()
  })

  it('rejects a weak password with PASSWORD_POLICY_VIOLATION before touching the token', async () => {
    const prisma = prismaMock()
    const redis  = { get: vi.fn(), del: vi.fn() }
    await expect(
      claimMerchantAccount(prisma as any, redis as any, { token: TOKEN, newPassword: 'weak', ...ctx })
    ).rejects.toThrow('PASSWORD_POLICY_VIOLATION')
    expect(redis.get).not.toHaveBeenCalled()
    expect(prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('rejects an expired/reused token (Redis miss) with CLAIM_TOKEN_EXPIRED', async () => {
    const prisma = prismaMock()
    const redis  = { get: vi.fn().mockResolvedValue(null), del: vi.fn() }
    await expect(
      claimMerchantAccount(prisma as any, redis as any, { token: TOKEN, newPassword: VALID, ...ctx })
    ).rejects.toThrow('CLAIM_TOKEN_EXPIRED')
    expect(prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/merchant/auth/claim', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { update: vi.fn().mockResolvedValue({}) },
      auditLog:      { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue('ma-1'), del: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  it('200 sets the password for a valid token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/auth/claim',
      payload: { token: TOKEN, newPassword: VALID },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantAdmin.update).toHaveBeenCalled()
  })

  it('400 CLAIM_TOKEN_EXPIRED for a missing/expired token', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/auth/claim',
      payload: { token: 'gone', newPassword: VALID },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('CLAIM_TOKEN_EXPIRED')
  })
})

describe('login after claim — recognised-device path only (unknown-device OTP unchanged)', () => {
  let app: FastifyInstance
  let hash: string

  beforeEach(async () => {
    hash = await hashPassword(VALID)
    app = await buildApp()
    // A claimed owner: passwordHash set, otpVerifiedAt set (claim cleared the
    // first-ever-login OTP), ACTIVE, with an ACTIVE merchant.
    app.decorate('prisma', {
      merchantAdmin:      { findUnique: vi.fn().mockResolvedValue({ id: 'ma-1', passwordHash: hash, otpVerifiedAt: new Date(), status: 'ACTIVE', emailVerified: true }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma-1', merchant: { status: 'ACTIVE', businessName: 'Claim Co' } }) },
      userSession:        { create: vi.fn().mockResolvedValue({}) },
      auditLog:           { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const login = (deviceId: string) => app.inject({
    method: 'POST', url: '/api/v1/merchant/auth/login',
    payload: { email: 'owner@example.com', password: VALID, deviceId, deviceType: 'web' },
  })

  const KNOWN_DEVICE = '550e8400-e29b-41d4-a716-446655440000'
  const NEW_DEVICE   = '660e8400-e29b-41d4-a716-446655440001'

  it('completes WITHOUT OTP from a recognised device', async () => {
    app.redis.get = vi.fn().mockImplementation((k: string) =>
      k.startsWith('known-devices') ? Promise.resolve(JSON.stringify([KNOWN_DEVICE])) : Promise.resolve(null))

    const res = await login(KNOWN_DEVICE)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toEqual(expect.any(String))
    expect(body.status).toBeUndefined() // NOT OTP_REQUIRED
  })

  it('still returns OTP_REQUIRED from an unknown device (claim does NOT weaken device OTP)', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null) // no known devices

    const res = await login(NEW_DEVICE)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('OTP_REQUIRED')
  })
})
