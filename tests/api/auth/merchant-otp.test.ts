import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { loginMerchant, verifyMerchantOtp } from '../../../src/api/auth/merchant/service'
import { merchantOtpEmail } from '../../../src/api/shared/emailTemplates'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// M1 Slice 0 — merchant login OTP is now a REAL emailed 6-digit code, verified
// with a challenge-bound HMAC plus a per-challenge attempt limit. Email only (no
// SMS/Twilio). The `000000` dev bypass stays for development/test only. Mirrors
// tests/api/auth/admin-email-otp.test.ts.
//
// The HMAC key is ENCRYPTION_KEY; set a stable one so we can recompute the
// expected codeHmac the same way the service does.
const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const CHALLENGE = 'merchant-challenge-token'
const ADMIN = { id: 'ma-1', email: 'merchant@example.com', passwordHash: 'hash', otpVerifiedAt: null, status: 'ACTIVE' }
const MEMBERSHIP = { id: 'mm-1', merchantId: 'm1', merchantAdminId: 'ma-1', merchant: { status: 'ACTIVE', businessName: 'Test Co' } }
const KEY = RedisKey.otpChallenge('merchant', CHALLENGE)

function hmacFor(challenge: string, code: string): string {
  return crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(challenge + ':' + code).digest('hex')
}

let savedEncKey: string | undefined
let savedNodeEnv: string | undefined
beforeEach(() => {
  savedEncKey = process.env.ENCRYPTION_KEY
  savedNodeEnv = process.env.NODE_ENV
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
})
afterEach(() => {
  if (savedEncKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = savedEncKey
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = savedNodeEnv
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// ── merchantOtpEmail template ──────────────────────────────────────────────────
describe('merchantOtpEmail', () => {
  it('renders the 6-digit code in subject-less body and has no link to follow', () => {
    const out = merchantOtpEmail('482913')
    expect(out.subject).toMatch(/sign-in code/i)
    expect(out.text).toContain('482913')
    expect(out.html).toContain('482913')
    // an OTP email must never contain a clickable link (entered manually)
    expect(out.text).not.toMatch(/https?:\/\//)
    expect(out.html).not.toMatch(/https?:\/\//)
  })
})

// ── loginMerchant generates a code, HMAC-stores it, and emails it ──────────────
describe('loginMerchant — M1 generate + HMAC-store + email send', () => {
  function loginMocks() {
    const redis = {
      get: vi.fn(async (_k: string) => null as string | null),
      set: vi.fn(async (_k: string, _v: string, ..._rest: unknown[]) => 'OK'),
      del: vi.fn(async (_k: string) => 1),
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => ADMIN) },
      merchantMembership: { findFirst: vi.fn(async () => MEMBERSHIP) },
    }
    const app = {}
    return { redis, prisma, app }
  }

  it('returns OTP_REQUIRED + a sessionChallenge, stores codeHmac + attempts:0, sends one merchant_otp email, and never returns the raw code', async () => {
    const m = loginMocks()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await loginMerchant(m.prisma as any, m.redis as any, m.app as any, {
      email: ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(res.status).toBe('OTP_REQUIRED')
    expect(res.sessionChallenge).toBeTruthy()
    expect(JSON.stringify(res)).not.toMatch(/"code"/)

    const setCall = m.redis.set.mock.calls.find((c: any[]) => c[0] === RedisKey.otpChallenge('merchant', res.sessionChallenge!))
    expect(setCall).toBeTruthy()
    const stored = JSON.parse(setCall![1])
    expect(stored.codeHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.attempts).toBe(0)
    expect(stored.adminId).toBe(ADMIN.id)
    expect(setCall![2]).toBe('EX')

    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.recipientType).toBe('MERCHANT_ADMIN')
    expect(arg.type).toBe('merchant_otp')
    expect(arg.userId).toBeNull()
    const emailText = arg.email.text ?? ''
    expect(emailText).toMatch(/\b\d{6}\b/)

    const emailedCode = emailText.match(/\b(\d{6})\b/)![1]
    expect(stored.codeHmac).toBe(hmacFor(res.sessionChallenge!, emailedCode))
  })

  it('still returns OTP_REQUIRED even if the email send throws (best-effort, never reveals delivery failure)', async () => {
    const m = loginMocks()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    vi.spyOn(notify, 'notify').mockRejectedValue(new Error('resend down'))

    const res = await loginMerchant(m.prisma as any, m.redis as any, m.app as any, {
      email: ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })
    expect(res.status).toBe('OTP_REQUIRED')
    expect(res.sessionChallenge).toBeTruthy()
  })
})

// ── verifyMerchantOtp: HMAC match + per-challenge attempt limit ────────────────
describe('verifyMerchantOtp — M1 HMAC verification + attempt limit', () => {
  const CORRECT_CODE = '492018'

  function verifyMocks(attempts = 0, codeHmac = hmacFor(CHALLENGE, CORRECT_CODE)) {
    const store: Record<string, string> = {
      [KEY]: JSON.stringify({ adminId: ADMIN.id, deviceId: 'd1', deviceType: 'web', codeHmac, attempts }),
    }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string, ..._rest: unknown[]) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => ({ id: ADMIN.id, email: ADMIN.email })), update: vi.fn(async () => ({})) },
      merchantMembership: { findFirst: vi.fn(async () => MEMBERSHIP) },
      userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }
    return { redis, prisma, app, store }
  }

  const call = (m: ReturnType<typeof verifyMocks>, code: string) =>
    verifyMerchantOtp(m.prisma as any, m.redis as any, m.app as any, {
      sessionChallenge: CHALLENGE, code, ipAddress: '1.2.3.4', userAgent: 'test',
    })

  it('throws ACTION_TOKEN_INVALID when the challenge is missing', async () => {
    const m = verifyMocks()
    delete m.store[KEY]
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('ACTION_TOKEN_INVALID')
  })

  it('issues tokens for the correct code and consumes (deletes) the challenge', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks()
    const res = await call(m, CORRECT_CODE)
    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
    expect(m.app.jwt.merchant.sign).toHaveBeenCalledTimes(1)
    expect(m.store[KEY]).toBeUndefined()
  })

  it('on a wrong code: throws OTP_INVALID, re-stores attempts:1 with KEEPTTL, does NOT delete or issue tokens', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks(0)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    expect(m.app.jwt.merchant.sign).not.toHaveBeenCalled()
    const setCall = m.redis.set.mock.calls.find((c: any[]) => c[0] === KEY)
    expect(setCall).toBeTruthy()
    expect(JSON.parse(setCall![1]).attempts).toBe(1)
    expect(setCall![2]).toBe('KEEPTTL')
    expect(m.store[KEY]).toBeTruthy()
  })

  it('on the 5th wrong attempt: deletes the challenge, so a follow-up call throws ACTION_TOKEN_INVALID', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks(4)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    expect(m.store[KEY]).toBeUndefined()
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('ACTION_TOKEN_INVALID')
  })

  it('accepts the 000000 dev bypass in NODE_ENV=test and issues tokens', async () => {
    process.env.NODE_ENV = 'test'
    const m = verifyMocks()
    const res = await call(m, '000000')
    expect(res.accessToken).toBe('access.jwt.token')
    expect(m.app.jwt.merchant.sign).toHaveBeenCalledTimes(1)
  })

  it('rejects 000000 in NODE_ENV=staging (no backdoor) when it does not match the HMAC', async () => {
    process.env.NODE_ENV = 'staging'
    const m = verifyMocks()
    await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    expect(m.app.jwt.merchant.sign).not.toHaveBeenCalled()
  })
})
