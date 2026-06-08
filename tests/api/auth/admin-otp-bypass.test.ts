import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyAdminOtp } from '../../../src/api/auth/admin/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// SEC F1: the admin OTP `000000` dev bypass must FAIL CLOSED outside dev/test.
// `verifyAdminOtp` reads process.env.NODE_ENV at call time, so each case flips it
// and restores it in `finally`. Scope: ADMIN only — the merchant / customer /
// branch OTP paths are not touched by this PR (merchant uses the real verifyOtp;
// only admin/service.ts:64 ever referenced the `000000` constant).

const CHALLENGE = 'challenge-token'
const ADMIN = { id: 'admin-1', email: 'admin@redeemo.com', role: 'SUPER_ADMIN' }

function mocks() {
  const redis = {
    get: vi.fn(async (k: string) =>
      k === RedisKey.otpChallenge('admin', CHALLENGE)
        ? JSON.stringify({ adminId: ADMIN.id, deviceId: 'd1', deviceType: 'web' })
        : null,
    ),
    del: vi.fn(async () => 1),
    set: vi.fn(async () => 'OK'),
  }
  const prisma = {
    adminUser:   { findUnique: vi.fn(async () => ADMIN) },
    userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    auditLog:    { create: vi.fn(async () => ({})) },
  }
  const app = { jwt: { admin: { sign: vi.fn(() => 'access.jwt.token') } } }
  return { redis, prisma, app }
}

const call = (m: ReturnType<typeof mocks>, code: string) =>
  verifyAdminOtp(m.prisma as any, m.redis as any, m.app as any, {
    sessionChallenge: CHALLENGE, code, ipAddress: '1.2.3.4', userAgent: 'test',
  })

function withNodeEnv(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const orig = process.env.NODE_ENV
  if (value === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = value
  return fn().finally(() => {
    if (orig === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = orig
  })
}

afterEach(() => { vi.clearAllMocks() })

describe('verifyAdminOtp — SEC F1 OTP bypass hardening', () => {
  // ── dev/test accept the documented bypass code ──────────────────────────────
  it('accepts 000000 in test env and issues an admin token', async () => {
    const m = mocks()
    await withNodeEnv('test', async () => {
      const res = await call(m, '000000')
      expect(res.accessToken).toBe('access.jwt.token')
      expect((res as any).refreshToken).toBeTruthy()
      expect((res as any).admin).toMatchObject({ id: ADMIN.id })
    })
    expect(m.app.jwt.admin.sign).toHaveBeenCalledTimes(1)
  })

  it('accepts 000000 in development env', async () => {
    const m = mocks()
    await withNodeEnv('development', async () => {
      await expect(call(m, '000000')).resolves.toMatchObject({ accessToken: 'access.jwt.token' })
    })
  })

  // ── production rejects the backdoor code AND any other code, no token/session ─
  it('rejects 000000 in production (backdoor closed) and issues no token or session', async () => {
    const m = mocks()
    await withNodeEnv('production', async () => {
      await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    })
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
    expect(m.prisma.userSession.create).not.toHaveBeenCalled()
  })

  it('rejects any other code in production', async () => {
    const m = mocks()
    await withNodeEnv('production', async () => {
      await expect(call(m, '123456')).rejects.toThrow('OTP_INVALID')
    })
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
  })

  // ── allowlist (NOT `!== production`): unknown / staging / unset fail CLOSED ───
  it('rejects 000000 when NODE_ENV is "staging"', async () => {
    const m = mocks()
    await withNodeEnv('staging', async () => {
      await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    })
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
  })

  it('rejects 000000 when NODE_ENV is unset', async () => {
    const m = mocks()
    await withNodeEnv(undefined, async () => {
      await expect(call(m, '000000')).rejects.toThrow('OTP_INVALID')
    })
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
  })

  // ── dev tightening: development accepts ONLY the documented code ─────────────
  it('rejects a wrong code in development (only 000000 is accepted)', async () => {
    const m = mocks()
    await withNodeEnv('development', async () => {
      await expect(call(m, '111111')).rejects.toThrow('OTP_INVALID')
    })
    expect(m.app.jwt.admin.sign).not.toHaveBeenCalled()
    expect(m.prisma.userSession.create).not.toHaveBeenCalled()
  })
})
