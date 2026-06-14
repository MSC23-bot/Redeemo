import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyAdminOtp } from '../../../src/api/auth/admin/service'
import { adminAuthRoutes } from '../../../src/api/auth/admin/routes'
import { routeRateLimit } from '../../../src/api/plugins/rate-limit'
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

// M0 Step D — the OTP-verify route must carry a route-level rate-limit so the
// per-challenge attempt cap (5 in the service) is backed by an edge throttle on
// repeated /otp/verify POSTs (per-IP, like the login tier). We pin the route-config
// shape without spinning a full Fastify app — the limiter behaviour itself is
// owned by @fastify/rate-limit (exercised elsewhere).
type RouteCall = [path: string, optsOrHandler: unknown, handlerOrUndefined?: unknown]

function captureRoutes() {
  const get = vi.fn()
  const post = vi.fn()
  return { get, post, app: { get, post } as any }
}
const findPost = (post: ReturnType<typeof vi.fn>, path: string): RouteCall | undefined =>
  (post.mock.calls as RouteCall[]).find((c) => c[0] === path)

describe('otpVerify rate-limit tier', () => {
  it('exists with a sensible per-IP max + 1-minute window', () => {
    const tier = routeRateLimit('otpVerify')
    expect(tier.max).toBeGreaterThanOrEqual(1)
    expect(tier.timeWindow).toBe('1 minute')
  })

  it('prod ceiling is no looser than the login tier (an OTP guess is a credential attempt)', () => {
    if (process.env.RATE_LIMIT_RELAX === 'true') return
    expect(routeRateLimit('otpVerify').max).toBeLessThanOrEqual(routeRateLimit('login').max)
  })
})

describe('adminAuthRoutes — POST /otp/verify rate-limit config', () => {
  it('attaches a route-level rateLimit config to the OTP-verify endpoint', async () => {
    const { post, app } = captureRoutes()
    await adminAuthRoutes(app)

    const call = findPost(post, '/api/v1/admin/auth/otp/verify')
    expect(call).toBeDefined()
    // 3-arg form `app.post(path, opts, handler)` — a route carrying a `config`
    // object passes it as the 2nd arg. No config = 2-arg form only.
    expect(call!.length).toBe(3)

    const opts = call![1] as { config?: { rateLimit?: unknown } }
    expect(opts.config).toBeDefined()
    expect(opts.config!.rateLimit).toBeDefined()
  })

  it('uses the otpVerify tier values (max + timeWindow inherited from routeRateLimit)', async () => {
    const { post, app } = captureRoutes()
    await adminAuthRoutes(app)

    const call = findPost(post, '/api/v1/admin/auth/otp/verify')!
    const cfg = (call[1] as any).config.rateLimit
    const tier = routeRateLimit('otpVerify')
    expect(cfg.max).toBe(tier.max)
    expect(cfg.timeWindow).toBe(tier.timeWindow)
  })
})
