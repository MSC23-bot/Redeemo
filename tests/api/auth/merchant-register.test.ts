import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  registerMerchant, verifyMerchantEmail, resendMerchantVerification,
} from '../../../src/api/auth/merchant/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// M1 Slice R — self-serve merchant registration + email-verify + resend. Service-
// level (direct import), store-backed redis mock, notify + verifyTurnstile spied so
// NO real email / Cloudflare call happens. Captcha is OFF by default (the verify
// helper no-ops), so registration succeeds without a TURNSTILE_SECRET_KEY.
const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

function hmacFor(challenge: string, code: string): string {
  return crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(challenge + ':' + code).digest('hex')
}

let savedEncKey: string | undefined
let savedNodeEnv: string | undefined
let savedCaptcha: string | undefined
beforeEach(() => {
  savedEncKey = process.env.ENCRYPTION_KEY
  savedNodeEnv = process.env.NODE_ENV
  savedCaptcha = process.env.CAPTCHA_ENABLED
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
  delete process.env.CAPTCHA_ENABLED // captcha off → verifyTurnstile() no-ops to true
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

describe('registerMerchant — self-serve signup', () => {
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
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: any) => fn(txCreates)),
    }
    return { redis, prisma, store, txCreates }
  }

  it('creates merchant + admin(emailVerified:false) + OWNER membership, stores a verify challenge (codeHmac+attempts:0), sends merchant_email_verify, returns VERIFY_EMAIL_SENT', async () => {
    const m = freshMocks()
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    expect(res.status).toBe('VERIFY_EMAIL_SENT')
    expect(res.sessionChallenge).toBeTruthy()

    // one atomic transaction; admin starts unverified; OWNER membership created
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(m.txCreates.merchant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REGISTERED' }) }))
    const adminCreate = m.txCreates.merchantAdmin.create.mock.calls[0][0]
    expect(adminCreate.data.emailVerified).toBe(false)
    expect(adminCreate.data.passwordHash).toEqual(expect.any(String))
    expect(m.txCreates.merchantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER', allBranches: true, status: 'ACTIVE' }) }),
    )

    // verify challenge stored with codeHmac + attempts:0
    const key = RedisKey.merchantEmailVerify(res.sessionChallenge)
    const stored = JSON.parse(m.store[key])
    expect(stored.codeHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.attempts).toBe(0)
    expect(stored.adminId).toBe('ma-new')

    // exactly one merchant_email_verify email; stored HMAC matches the emailed code
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.type).toBe('merchant_email_verify')
    expect(arg.recipientType).toBe('MERCHANT_ADMIN')
    expect(arg.userId).toBeNull()
    const emailedCode = (arg.email.text ?? '').match(/\b(\d{6})\b/)![1]
    expect(stored.codeHmac).toBe(hmacFor(res.sessionChallenge, emailedCode))
  })

  it('NON-ENUMERATION: a duplicate email creates nothing, sends merchant_account_exists, returns the SAME shape', async () => {
    const m = freshMocks()
    m.prisma.merchantAdmin.findUnique = vi.fn(async () => ({ id: 'existing-1' })) as any
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)

    expect(res.status).toBe('VERIFY_EMAIL_SENT') // identical to a fresh signup
    expect(m.prisma.$transaction).not.toHaveBeenCalled() // nothing created
    expect(notifySpy).toHaveBeenCalledTimes(1)
    expect(notifySpy.mock.calls[0][2].type).toBe('merchant_account_exists')
    expect(m.redis.set).not.toHaveBeenCalled() // no real verify challenge stored (decoy)
  })

  it('rejects a failed captcha with CAPTCHA_FAILED before any create or email', async () => {
    const m = freshMocks()
    const turnstile = await import('../../../src/api/shared/turnstile')
    vi.spyOn(turnstile, 'verifyTurnstile').mockResolvedValue(false)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify')

    await expect(registerMerchant(m.prisma as any, m.redis as any, REG_INPUT)).rejects.toThrow('CAPTCHA_FAILED')
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
})

describe('verifyMerchantEmail — complete registration (auto-login)', () => {
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
      merchantMembership: { findFirst: vi.fn(async () => ({ id: 'mm-new', merchantId: 'm-new', merchantAdminId: 'ma-new', merchant: { status: 'REGISTERED', businessName: 'Roe Cafe' } })) },
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

  it('flips emailVerified true, consumes the challenge, and auto-logs-in (issues tokens) on the correct code', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks()
    const res = await call(m, CORRECT_CODE)
    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
    const update = m.prisma.merchantAdmin.update.mock.calls[0][0]
    expect(update.data.emailVerified).toBe(true)
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
})

describe('resendMerchantVerification — re-issue code on the same challenge', () => {
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
