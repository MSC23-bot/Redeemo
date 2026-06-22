import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import {
  registerMerchant, verifyMerchantEmail, resendMerchantVerification,
} from '../../../src/api/auth/merchant/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// M1 Slice R: self-serve merchant registration + email-verify + resend. Service-
// level (direct import) + a route-level HTTP suite. Store-backed redis mock; notify
// + verifyTurnstile spied; hashPassword mocked so NO real bcrypt/Cloudflare/email
// call happens. Captcha is OFF by default (the verify helper no-ops to true).
const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

function hmacFor(challenge: string, code: string): string {
  return crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(challenge + ':' + code).digest('hex')
}

let savedEncKey: string | undefined
let savedNodeEnv: string | undefined
let savedCaptcha: string | undefined
beforeEach(async () => {
  savedEncKey = process.env.ENCRYPTION_KEY
  savedNodeEnv = process.env.NODE_ENV
  savedCaptcha = process.env.CAPTCHA_ENABLED
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
  delete process.env.CAPTCHA_ENABLED // captcha off, verifyTurnstile() no-ops to true
  // Mock the dominant bcrypt cost so the suite is fast AND so timing-parity can be
  // asserted by call count. vi.spyOn on the module export is seen by the static
  // import inside service.ts (same as the verifyPassword spy used elsewhere).
  const password = await import('../../../src/api/shared/password')
  vi.spyOn(password, 'hashPassword').mockResolvedValue('hashed-pw')
})
afterEach(() => {
  if (savedEncKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = savedEncKey
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = savedNodeEnv
  if (savedCaptcha === undefined) delete process.env.CAPTCHA_ENABLED
  else process.env.CAPTCHA_ENABLED = savedCaptcha
  delete process.env.TURNSTILE_SECRET_KEY
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const VALID_PASSWORD = 'ValidPass1!'
const REG_INPUT = {
  firstName: 'Jane', lastName: 'Roe', email: 'new@merchant.test', password: VALID_PASSWORD,
  businessName: 'Roe Cafe', deviceId: 'd1', deviceType: 'web', turnstileToken: 'tok',
  ipAddress: '1.2.3.4', userAgent: 'test',
}

describe('registerMerchant: self-serve signup', () => {
  function freshMocks() {
    const store: Record<string, string> = {}
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string, ..._r: unknown[]) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
    }
    const txCreates = {
      merchant: { create: vi.fn(async (_args: any) => ({ id: 'm-new' })) },
      merchantAdmin: { create: vi.fn(async (_args: any) => ({ id: 'ma-new' })) },
      merchantMembership: { create: vi.fn(async (_args: any) => ({ id: 'mm-new' })) },
      auditLog: { create: vi.fn(async (_args: any) => ({})) },
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: any) => fn(txCreates)),
    }
    return { redis, prisma, store, txCreates }
  }

  it('FRESH email: creates merchant + admin(emailVerified:false, phone null) + OWNER membership, stores a verify challenge, records terms consent in the audit metadata, sends merchant_email_verify', async () => {
    const m = freshMocks()
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    expect(res.status).toBe('VERIFY_EMAIL_SENT')
    expect(res.sessionChallenge).toBeTruthy()

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(m.txCreates.merchant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REGISTERED' }) }))
    const adminCreate = m.txCreates.merchantAdmin.create.mock.calls[0][0]
    expect(adminCreate.data.emailVerified).toBe(false)
    expect(adminCreate.data.passwordHash).toEqual(expect.any(String))
    expect(adminCreate.data.phone).toBeNull() // mobile omitted -> null
    expect(m.txCreates.merchantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER', allBranches: true, status: 'ACTIVE' }) }),
    )
    // terms consent recorded in the audit metadata (no schema column)
    const auditCall = m.txCreates.auditLog.create.mock.calls[0][0]
    expect(auditCall.data.event).toBe('MERCHANT_SELF_REGISTERED')
    expect(auditCall.data.metadata).toMatchObject({ termsAccepted: true })
    expect(auditCall.data.metadata.termsVersion).toEqual(expect.any(String))

    const key = RedisKey.merchantEmailVerify(res.sessionChallenge)
    const stored = JSON.parse(m.store[key])
    expect(stored.codeHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.attempts).toBe(0)
    expect(stored.adminId).toBe('ma-new')

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.type).toBe('merchant_email_verify')
    expect(arg.recipientType).toBe('MERCHANT_ADMIN')
    expect(arg.userId).toBeNull()
    const emailedCode = (arg.email.text ?? '').match(/\b(\d{6})\b/)![1]
    expect(stored.codeHmac).toBe(hmacFor(res.sessionChallenge, emailedCode))
  })

  it('captures mobile + mobileCountryCode as phone/phoneCountryCode when provided', async () => {
    const m = freshMocks()
    const notify = await import('../../../src/api/shared/notify')
    vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    await registerMerchant(m.prisma as any, m.redis as any, { ...REG_INPUT, mobile: '7700900000', mobileCountryCode: '+44' })

    const adminCreate = m.txCreates.merchantAdmin.create.mock.calls[0][0]
    expect(adminCreate.data.phone).toBe('7700900000')
    expect(adminCreate.data.phoneCountryCode).toBe('+44')
  })

  it('VERIFIED duplicate: creates nothing, hashes the password (timing parity), stores a DECOY challenge, sends merchant_account_exists to the real holder, returns the SAME shape', async () => {
    const m = freshMocks()
    m.prisma.merchantAdmin.findUnique = vi.fn(async () => ({ id: 'existing-1', emailVerified: true })) as any
    const password = await import('../../../src/api/shared/password')
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    expect(res.status).toBe('VERIFY_EMAIL_SENT') // identical to a fresh signup
    expect(m.prisma.$transaction).not.toHaveBeenCalled() // nothing created
    expect(password.hashPassword).toHaveBeenCalledTimes(1) // bcrypt runs on the duplicate path too (no timing oracle)

    // a DECOY challenge IS stored so /register/verify returns OTP_INVALID, not the
    // distinguishable VERIFICATION_TOKEN_INVALID (closes the error-code oracle). Its
    // adminId is the non-resolvable 'decoy' so even the dev/test 000000 bypass cannot
    // use it to auto-login as the existing verified account.
    const key = RedisKey.merchantEmailVerify(res.sessionChallenge)
    expect(m.store[key]).toBeTruthy()
    expect(JSON.parse(m.store[key]).attempts).toBe(0)
    expect(JSON.parse(m.store[key]).adminId).toBe('decoy')

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.type).toBe('merchant_account_exists')
    expect(arg.recipientId).toBe('existing-1')
    expect(arg.to).toBe(REG_INPUT.email)
  })

  it('UNVERIFIED duplicate: RECOVERS by re-issuing a real verify challenge + code to the same admin (no create, no account-exists email)', async () => {
    const m = freshMocks()
    m.prisma.merchantAdmin.findUnique = vi.fn(async () => ({ id: 'existing-unverified', emailVerified: false })) as any
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    expect(res.status).toBe('VERIFY_EMAIL_SENT')
    expect(m.prisma.$transaction).not.toHaveBeenCalled()
    // a REAL verify challenge bound to the existing admin, with an emailed code
    const key = RedisKey.merchantEmailVerify(res.sessionChallenge)
    const stored = JSON.parse(m.store[key])
    expect(stored.adminId).toBe('existing-unverified')
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.type).toBe('merchant_email_verify') // verify code, NOT account-exists
    const emailedCode = (arg.email.text ?? '').match(/\b(\d{6})\b/)![1]
    expect(stored.codeHmac).toBe(hmacFor(res.sessionChallenge, emailedCode))
  })

  it('rejects a failed captcha with CAPTCHA_FAILED before any hash, lookup, create, or email', async () => {
    const m = freshMocks()
    const password = await import('../../../src/api/shared/password')
    const turnstile = await import('../../../src/api/shared/turnstile')
    vi.spyOn(turnstile, 'verifyTurnstile').mockResolvedValue(false)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify')

    await expect(registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)).rejects.toThrow('CAPTCHA_FAILED')
    expect(password.hashPassword).not.toHaveBeenCalled()
    expect(m.prisma.merchantAdmin.findUnique).not.toHaveBeenCalled()
    expect(m.prisma.$transaction).not.toHaveBeenCalled()
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('still returns VERIFY_EMAIL_SENT even if the verify email send throws (best-effort)', async () => {
    const m = freshMocks()
    const notify = await import('../../../src/api/shared/notify')
    vi.spyOn(notify, 'notify').mockRejectedValue(new Error('resend down'))
    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)
    expect(res.status).toBe('VERIFY_EMAIL_SENT')
  })

  it('P2002 race (a concurrent signup won the unique email): returns the generic shape, stores a DECOY challenge, sends NO email, and does not fall through to the real-challenge / verify-email path', async () => {
    const m = freshMocks()
    // findUnique returns null (the existence check raced ahead of the other signup),
    // then the transaction violates the @unique email constraint.
    m.prisma.$transaction = vi.fn(async () => { throw Object.assign(new Error('unique violation'), { code: 'P2002' }) })
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    // identical generic response (no enumeration)
    expect(res.status).toBe('VERIFY_EMAIL_SENT')
    expect(res.sessionChallenge).toBeTruthy()

    // a DECOY challenge is stored (adminId 'decoy', attempts:0) so /register/verify is
    // indistinguishable; the rolled-back transaction leaves no orphan and the catch
    // returns early (it did NOT fall through to store a real codeHmac or send a code).
    const key = RedisKey.merchantEmailVerify(res.sessionChallenge)
    const stored = JSON.parse(m.store[key])
    expect(stored.adminId).toBe('decoy')
    expect(stored.attempts).toBe(0)
    expect(notifySpy).not.toHaveBeenCalled() // no real verify email on the race-loss path
  })
})

describe('verifyMerchantEmail: complete registration (auto-login)', () => {
  const CHALLENGE = 'verify-challenge'
  const CORRECT_CODE = '314159'
  const KEY = RedisKey.merchantEmailVerify(CHALLENGE)

  function verifyMocks(attempts = 0, codeHmac = hmacFor(CHALLENGE, CORRECT_CODE)) {
    const store: Record<string, string> = {
      [KEY]: JSON.stringify({ adminId: 'ma-new', deviceId: 'd1', deviceType: 'web', codeHmac, attempts }),
    }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string, ..._r: unknown[]) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => ({ id: 'ma-new', email: 'new@merchant.test' })), update: vi.fn(async (_args: any) => ({})) },
      // Staff & Access PR-B B8 (cutover): register/verify auto-login resolves via
      // getActiveMembership (findMany, the full ActiveMembership shape).
      merchantMembership: { findMany: vi.fn(async () => [{ id: 'mm-new', merchantId: 'm-new', merchantAdminId: 'ma-new', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'REGISTERED', businessName: 'Roe Cafe' }, branches: [] }]) },
      userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }
    return { redis, prisma, app, store }
  }

  const call = (m: ReturnType<typeof verifyMocks>, code: string) =>
    verifyMerchantEmail(m.prisma as any, m.redis as any, m.app as any, {
      sessionChallenge: CHALLENGE, code, ipAddress: '1.2.3.4', userAgent: 'test',
    })

  it('throws VERIFICATION_TOKEN_INVALID when the challenge is missing', async () => {
    const m = verifyMocks()
    delete m.store[KEY]
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('VERIFICATION_TOKEN_INVALID')
  })

  it('flips emailVerified + otpVerifiedAt, seeds the device, consumes the challenge, and auto-logs-in on the correct code', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks()
    const res = await call(m, CORRECT_CODE)
    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
    const update = m.prisma.merchantAdmin.update.mock.calls[0][0]
    expect(update.data.emailVerified).toBe(true)
    expect(update.data.otpVerifiedAt).toBeInstanceOf(Date)
    // device seeded so the immediate auto-login + future logins skip device-OTP
    const knownSet = m.redis.set.mock.calls.find((c: any[]) => c[0] === 'known-devices:merchant:ma-new')
    expect(knownSet).toBeTruthy()
    expect(JSON.parse(knownSet![1])).toContain('d1')
    expect(m.store[KEY]).toBeUndefined() // single-use
  })

  it('on a wrong code: throws OTP_INVALID, increments attempts with KEEPTTL, does NOT verify or issue tokens', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks(0)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    const setCall = m.redis.set.mock.calls.find((c: any[]) => c[0] === KEY)
    expect(JSON.parse(setCall![1]).attempts).toBe(1)
    expect(setCall![2]).toBe('KEEPTTL')
    expect(m.prisma.merchantAdmin.update).not.toHaveBeenCalled()
    expect(m.app.jwt.merchant.sign).not.toHaveBeenCalled()
  })

  it('on the 5th wrong attempt: deletes the challenge, so a follow-up call throws VERIFICATION_TOKEN_INVALID', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks(4)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    expect(m.store[KEY]).toBeUndefined()
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('VERIFICATION_TOKEN_INVALID')
  })

  it('accepts the 000000 dev bypass in NODE_ENV=test (flips emailVerified + issues tokens)', async () => {
    process.env.NODE_ENV = 'test'
    const m = verifyMocks()
    const res = await call(m, '000000')
    expect(res.accessToken).toBe('access.jwt.token')
    expect(m.prisma.merchantAdmin.update.mock.calls[0][0].data.emailVerified).toBe(true)
  })

  it('rejects 000000 in NODE_ENV=staging (no backdoor): throws OTP_INVALID, does NOT verify or issue tokens', async () => {
    process.env.NODE_ENV = 'staging'
    const m = verifyMocks()
    await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    expect(m.prisma.merchantAdmin.update).not.toHaveBeenCalled()
    expect(m.app.jwt.merchant.sign).not.toHaveBeenCalled()
  })
})

describe('resendMerchantVerification: re-issue code on the same challenge', () => {
  const CHALLENGE = 'verify-challenge'
  const KEY = RedisKey.merchantEmailVerify(CHALLENGE)

  function resendMocks(emailVerified = false, hasChallenge = true) {
    const store: Record<string, string> = {}
    if (hasChallenge) store[KEY] = JSON.stringify({ adminId: 'ma-new', deviceId: 'd1', deviceType: 'web', codeHmac: 'old', attempts: 3 })
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string, ..._r: unknown[]) => { store[k] = v; return 'OK' }),
    }
    const prisma = { merchantAdmin: { findUnique: vi.fn(async () => ({ email: 'new@merchant.test', emailVerified })) } }
    return { redis, prisma, store }
  }

  it('re-issues a fresh code (new HMAC, attempts reset to 0) on the same challenge and sends merchant_email_verify', async () => {
    const m = resendMocks(false, true)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    await resendMerchantVerification(m.prisma as any, m.redis as any, { sessionChallenge: CHALLENGE, ipAddress: '1.2.3.4' })

    const stored = JSON.parse(m.store[KEY])
    expect(stored.attempts).toBe(0)
    expect(stored.codeHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.codeHmac).not.toBe('old')
    expect(notifySpy).toHaveBeenCalledTimes(1)
    expect(notifySpy.mock.calls[0][2].type).toBe('merchant_email_verify')
  })

  it('no-ops (no email) when the account is already verified', async () => {
    const m = resendMocks(true, true)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify')
    await resendMerchantVerification(m.prisma as any, m.redis as any, { sessionChallenge: CHALLENGE })
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('no-ops (no email, no admin lookup) when the challenge is missing', async () => {
    const m = resendMocks(false, false)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify')
    await resendMerchantVerification(m.prisma as any, m.redis as any, { sessionChallenge: CHALLENGE })
    expect(notifySpy).not.toHaveBeenCalled()
    expect(m.prisma.merchantAdmin.findUnique).not.toHaveBeenCalled()
  })
})

// ── Route-level (HTTP) contract: the Zod gates + wiring the frontend depends on ──
describe('POST /api/v1/merchant/auth/register* (route contract)', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: any) => fn({
        merchant: { create: vi.fn().mockResolvedValue({ id: 'm-new' }) },
        merchantAdmin: { create: vi.fn().mockResolvedValue({ id: 'ma-new' }) },
        merchantMembership: { create: vi.fn().mockResolvedValue({ id: 'mm-new' }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      })),
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
  })
  afterEach(async () => { await app.close() })

  const REG_BODY = {
    firstName: 'Jane', lastName: 'Roe', email: 'route-new@merchant.test', password: VALID_PASSWORD,
    businessName: 'Roe Cafe', termsAccepted: true, turnstileToken: 'tok',
    deviceId: '550e8400-e29b-41d4-a716-446655440000', deviceType: 'web',
  }

  it('400 when termsAccepted is missing (platform-terms gate)', async () => {
    const { termsAccepted, ...noTerms } = REG_BODY
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/register', payload: noTerms })
    expect(res.statusCode).toBe(400)
    expect(app.prisma.$transaction).not.toHaveBeenCalled()
  })

  it('400 when termsAccepted is false', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/register', payload: { ...REG_BODY, termsAccepted: false } })
    expect(res.statusCode).toBe(400)
  })

  it('200 VERIFY_EMAIL_SENT for a valid registration', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/register', payload: REG_BODY })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('VERIFY_EMAIL_SENT')
  })

  it('400 on register/verify when the code is not 6 numeric digits', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/auth/register/verify',
      payload: { sessionChallenge: 'abc', code: 'abcdef' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('200 generic message on register/resend (anti-enum no-op for an unknown challenge)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/auth/register/resend',
      payload: { sessionChallenge: 'unknown-challenge' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).message).toMatch(/verif/i)
  })
})
