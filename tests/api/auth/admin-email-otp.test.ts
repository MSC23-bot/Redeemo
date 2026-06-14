import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { loginAdmin, verifyAdminOtp } from '../../../src/api/auth/admin/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// M0 — admin login OTP is now a REAL emailed 6-digit code, verified with a
// challenge-bound HMAC plus a per-challenge attempt limit. Email only (no SMS).
// The `000000` dev bypass stays for development/test only.
//
// The HMAC key is ENCRYPTION_KEY; set a stable one for these tests so we can
// compute the expected codeHmac the same way the service does.
// 64-char hex (mirrors the codebase's ENCRYPTION_KEY shape); set explicitly so we
// can compute the expected codeHmac the same way the service does.
const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const CHALLENGE = 'challenge-token'
const ADMIN = { id: 'admin-1', email: 'admin@redeemo.com', passwordHash: 'hash', isActive: true, role: 'SUPER_ADMIN' }
const KEY = RedisKey.otpChallenge('admin', CHALLENGE)

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

// ── Step B — loginAdmin generates a code, HMAC-stores it, and emails it ────────
describe('loginAdmin — M0 generate + HMAC-store + email send', () => {
  function loginMocks() {
    const redis = {
      get: vi.fn(async (_k: string) => null as string | null),
      set: vi.fn(async (_k: string, _v: string, ..._rest: unknown[]) => 'OK'),
      del: vi.fn(async (_k: string) => 1),
    }
    const prisma = {
      adminUser: { findUnique: vi.fn(async () => ADMIN) },
      communicationLog: { create: vi.fn(async () => ({ id: 'log-1' })) },
      $transaction: vi.fn(async (fn: any) => fn({ communicationLog: { create: vi.fn(async () => ({ id: 'log-1' })) }, notification: { create: vi.fn(async () => ({})) } })),
    }
    return { redis, prisma }
  }

  it('returns OTP_REQUIRED + a sessionChallenge, stores codeHmac + attempts:0, sends one admin_otp email, and never returns the raw code', async () => {
    const m = loginMocks()
    // verifyPassword must pass for a valid login
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    // capture the notify call without committing an outbox row
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const res = await loginAdmin(m.prisma as any, m.redis as any, {
      email: ADMIN.email, password: 'AdminPass1!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(res.status).toBe('OTP_REQUIRED')
    expect(res.sessionChallenge).toBeTruthy()
    // raw code must not leak into the response
    expect(JSON.stringify(res)).not.toMatch(/"code"/)

    // the challenge value stored in Redis carries codeHmac (64-hex) + attempts:0
    const setCall = m.redis.set.mock.calls.find((c: any[]) => c[0] === RedisKey.otpChallenge('admin', res.sessionChallenge))
    expect(setCall).toBeTruthy()
    const stored = JSON.parse(setCall![1])
    expect(stored.codeHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.attempts).toBe(0)
    expect(stored.adminId).toBe(ADMIN.id)
    // EX TTL preserved
    expect(setCall![2]).toBe('EX')

    // exactly one admin_otp email to the ADMIN recipient type, text carries a 6-digit code
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][2]
    expect(arg.recipientType).toBe('ADMIN')
    expect(arg.type).toBe('admin_otp')
    const emailText = arg.email.text ?? ''
    expect(emailText).toMatch(/\b\d{6}\b/)

    // the stored codeHmac must equal the HMAC of the code that was emailed
    const emailedCode = emailText.match(/\b(\d{6})\b/)![1]
    expect(stored.codeHmac).toBe(hmacFor(res.sessionChallenge, emailedCode))
  })

  it('still returns OTP_REQUIRED even if the email send throws (best-effort, never reveals delivery failure)', async () => {
    const m = loginMocks()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    vi.spyOn(notify, 'notify').mockRejectedValue(new Error('resend down'))

    const res = await loginAdmin(m.prisma as any, m.redis as any, {
      email: ADMIN.email, password: 'AdminPass1!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })
    expect(res.status).toBe('OTP_REQUIRED')
    expect(res.sessionChallenge).toBeTruthy()
  })
})

// ── Step C — verifyAdminOtp: HMAC match + per-challenge attempt limit ──────────
describe('verifyAdminOtp — M0 HMAC verification + attempt limit', () => {
  const CORRECT_CODE = '492018'

  // build a redis mock whose challenge value has a known codeHmac + attempts
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
      adminUser: { findUnique: vi.fn(async () => ADMIN) },
      userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const app = { jwt: { admin: { sign: vi.fn(() => 'access.jwt.token') } } }
    return { redis, prisma, app, store }
  }

  const call = (m: ReturnType<typeof verifyMocks>, code: string) =>
    verifyAdminOtp(m.prisma as any, m.redis as any, m.app as any, {
      sessionChallenge: CHALLENGE, code, ipAddress: '1.2.3.4', userAgent: 'test',
    })

  it('throws ACTION_TOKEN_INVALID when the challenge is missing', async () => {
    const m = verifyMocks()
    delete m.store[KEY]
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('ACTION_TOKEN_INVALID')
  })

  it('issues tokens for the correct code and consumes (deletes) the challenge', async () => {
    process.env.NODE_ENV = 'production' // ensure no dev bypass involved
    const m = verifyMocks()
    const res = await call(m, CORRECT_CODE)
    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
    expect(m.app.jwt.admin.sign).toHaveBeenCalledTimes(1)
    // single-use: challenge deleted
    expect(m.redis.del).toHaveBeenCalledWith(KEY)
    expect(m.store[KEY]).toBeUndefined()
  })

  it('on a wrong code: throws OTP_INVALID, re-stores attempts:1 with KEEPTTL, does NOT delete or issue tokens', async () => {
    process.env.NODE_ENV = 'production'
    const m = verifyMocks(0)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
    // challenge re-stored (not deleted) with attempts incremented + KEEPTTL
    const setCall = m.redis.set.mock.calls.find((c: any[]) => c[0] === KEY)
    expect(setCall).toBeTruthy()
    expect(JSON.parse(setCall![1]).attempts).toBe(1)
    expect(setCall![2]).toBe('KEEPTTL')
    expect(m.redis.del).not.toHaveBeenCalled()
    expect(m.store[KEY]).toBeTruthy()
  })

  it('on the 5th wrong attempt: deletes the challenge, so a follow-up call sees no challenge and throws ACTION_TOKEN_INVALID', async () => {
    process.env.NODE_ENV = 'production'
    // start at attempts:4 so this wrong code is the 5th
    const m = verifyMocks(4)
    await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    expect(m.redis.del).toHaveBeenCalledWith(KEY)
    expect(m.store[KEY]).toBeUndefined()
    // a subsequent attempt now finds nothing
    await expect(call(m, CORRECT_CODE)).rejects.toThrow('ACTION_TOKEN_INVALID')
  })

  it('accepts the 000000 dev bypass in NODE_ENV=test and issues tokens', async () => {
    process.env.NODE_ENV = 'test'
    const m = verifyMocks()
    const res = await call(m, '000000')
    expect(res.accessToken).toBe('access.jwt.token')
    expect(m.app.jwt.admin.sign).toHaveBeenCalledTimes(1)
  })

  it('rejects 000000 in NODE_ENV=staging (no backdoor) when it does not match the HMAC', async () => {
    process.env.NODE_ENV = 'staging'
    const m = verifyMocks() // codeHmac is for CORRECT_CODE, not 000000
    await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
  })
})
