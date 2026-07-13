import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import {
  consumeEmailOtpResend,
  recordEmailOtpFailedRound,
  clearEmailOtpFailedRound,
} from '../../../src/api/shared/emailLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// §SEC.1 GAP-5 (plan 2026-07-10 §1.4): the cross-challenge email-OTP resend
// cooldown + failed-round escalation. Two layers:
//   Part A: the emailLimiter helpers against REAL Redis (own db 10; other suites
//     claim 11/12/13/14/15, and every flushdb() suite MUST have its own db under
//     vitest's parallel files). Pins allow -> block -> escalation -> clear with the
//     real SET-NX + TTL semantics a fake cannot prove; skips honestly if no Redis.
//   Part B: the WIRING on the two OTP send paths (loginAdmin + loginMerchant): a
//     shim-backed fake whose cooldown key persists across two calls proves the
//     SECOND rapid login is refused with OTP_RESEND_COOLDOWN (no real Redis needed).

const RECIP = { recipientType: 'ADMIN', recipientId: 'admin-cooldown-1' } as const

// ── Part A: real Redis (db 10) ────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
let redis: Redis | null = null
let available = false

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 10, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
  try {
    await client.connect()
    await client.ping()
    redis = client
    available = true
  } catch {
    client.disconnect()
    redis = null
    available = false
  }
})

afterAll(async () => {
  if (redis) {
    try { await redis.flushdb() } finally { redis.disconnect() }
  }
})

function requireRedis(ctx: TestContext): void {
  if (!available) ctx.skip()
}

describe('consumeEmailOtpResend: real Redis (db 10)', () => {
  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
  })

  it('ALLOW then BLOCK: the first request acquires the cooldown; an immediate second is refused with retryAfter', async (ctx) => {
    requireRedis(ctx)
    const first = await consumeEmailOtpResend(redis!, RECIP)
    expect(first.ok).toBe(true)
    const second = await consumeEmailOtpResend(redis!, RECIP)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.retryAfter).toBeGreaterThan(0)
    // The cooldown key exists with a base (non-escalated) TTL (<= 45s).
    const ttl = await redis!.ttl(RedisKey.rateLimitEmailOtpCooldown(RECIP.recipientType, RECIP.recipientId))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(45)
  })

  it('recordEmailOtpFailedRound increments the failed-round counter for the recipient', async (ctx) => {
    requireRedis(ctx)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await recordEmailOtpFailedRound(redis!, RECIP)
    expect(await redis!.get(RedisKey.rateLimitEmailOtpFailedRound(RECIP.recipientType, RECIP.recipientId))).toBe('2')
  })

  it('ESCALATION: after 3 consecutive failed rounds the next cooldown uses the long TTL (> the 45s base)', async (ctx) => {
    requireRedis(ctx)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await recordEmailOtpFailedRound(redis!, RECIP)
    const res = await consumeEmailOtpResend(redis!, RECIP)
    expect(res.ok).toBe(true)
    const ttl = await redis!.ttl(RedisKey.rateLimitEmailOtpCooldown(RECIP.recipientType, RECIP.recipientId))
    // escalated cooldown is 15 minutes (900s), comfortably above the 45s base.
    expect(ttl).toBeGreaterThan(60)
  })

  it('clearEmailOtpFailedRound resets the counter so escalation lifts', async (ctx) => {
    requireRedis(ctx)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await recordEmailOtpFailedRound(redis!, RECIP)
    await clearEmailOtpFailedRound(redis!, RECIP)
    expect(await redis!.get(RedisKey.rateLimitEmailOtpFailedRound(RECIP.recipientType, RECIP.recipientId))).toBeNull()
    // A fresh cooldown after the clear is back to the base TTL.
    const res = await consumeEmailOtpResend(redis!, RECIP)
    expect(res.ok).toBe(true)
    const ttl = await redis!.ttl(RedisKey.rateLimitEmailOtpCooldown(RECIP.recipientType, RECIP.recipientId))
    expect(ttl).toBeLessThanOrEqual(45)
  })

  it('distinct recipients have independent cooldowns (one blocked does not block another)', async (ctx) => {
    requireRedis(ctx)
    expect((await consumeEmailOtpResend(redis!, RECIP)).ok).toBe(true)
    expect((await consumeEmailOtpResend(redis!, RECIP)).ok).toBe(false)
    // A different identity is unaffected.
    expect((await consumeEmailOtpResend(redis!, { recipientType: 'MERCHANT_ADMIN', recipientId: 'ma-other' })).ok).toBe(true)
  })
})

// ── Part B: wiring pins on the two OTP send paths ──────────────────────────────

// A Map-backed fake whose cooldown key (written by consume()'s SET-NX inside eval)
// persists across calls, so the SECOND login sees the held cooldown. One store
// serves get/set/del/incr and eval (shimEval), so all keys share state.
function shimFakeRedis() {
  const store = new Map<string, string>()
  return {
    _store: store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null
      store.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    incr: vi.fn(async (k: string) => {
      const n = (parseInt(store.get(k) ?? '0', 10) || 0) + 1
      store.set(k, String(n))
      return n
    }),
    expire: vi.fn(async () => 1),
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), { ttlOf: () => 45 })),
  } as unknown as Redis
}

describe('GAP-5 wiring: loginAdmin refuses a rapid resend with OTP_RESEND_COOLDOWN', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('first login sends the OTP; an immediate second login throws OTP_RESEND_COOLDOWN', async () => {
    const { loginAdmin } = await import('../../../src/api/auth/admin/service')
    const ADMIN = { id: 'admin-wire-1', email: 'admin@redeemo.com', passwordHash: 'hash', isActive: true, role: 'SUPER_ADMIN' }
    const prisma = {
      adminUser: { findUnique: vi.fn(async () => ADMIN) },
      $transaction: vi.fn(async (fn: any) => fn({ communicationLog: { create: vi.fn(async () => ({ id: 'log-1' })) }, notification: { create: vi.fn(async () => ({})) } })),
    }
    const redisFake = shimFakeRedis()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const args = { email: ADMIN.email, password: 'AdminPass1!', deviceId: 'd1', deviceType: 'web', ipAddress: '1.2.3.4', userAgent: 'test' }
    const first = await loginAdmin(prisma as any, redisFake as any, args)
    expect(first.status).toBe('OTP_REQUIRED')
    await expect(loginAdmin(prisma as any, redisFake as any, args)).rejects.toThrow('OTP_RESEND_COOLDOWN')
    // Only the FIRST request emailed a code (the second was refused before notify).
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })
})

describe('GAP-5 wiring: loginMerchant refuses a rapid resend with OTP_RESEND_COOLDOWN', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('first login sends the OTP; an immediate second login throws OTP_RESEND_COOLDOWN', async () => {
    const { loginMerchant } = await import('../../../src/api/auth/merchant/service')
    const ADMIN = { id: 'ma-wire-1', email: 'merchant@example.com', passwordHash: 'hash', otpVerifiedAt: null, status: 'ACTIVE', emailVerified: true }
    const MEMBERSHIP = {
      id: 'mm-1', merchantId: 'm1', merchantAdminId: 'ma-wire-1', role: 'OWNER',
      allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Test Co' }, branches: [],
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => ADMIN) },
      merchantMembership: { findMany: vi.fn(async () => [MEMBERSHIP]) },
    }
    const redisFake = shimFakeRedis()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    const notifySpy = vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true })

    const args = { email: ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web', ipAddress: '1.2.3.4', userAgent: 'test' }
    const first = await loginMerchant(prisma as any, redisFake as any, {} as any, args)
    expect(first.status).toBe('OTP_REQUIRED')
    await expect(loginMerchant(prisma as any, redisFake as any, {} as any, args)).rejects.toThrow('OTP_RESEND_COOLDOWN')
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })
})
