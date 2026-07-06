/**
 * Merchant logout durability — service-level security + interleaving tests
 * (backend design 2026-07-06, docs/superpowers/specs/2026-07-06-merchant-
 * logout-durability-backend-design.md §3.3/§3.4/§3.5/§5).
 *
 * Exercises `logoutMerchant` + `refreshMerchantToken` directly against REAL
 * Redis (so the atomic Lua rotate + the unconditional revoke DEL genuinely
 * race the way they would in production — a mocked Redis cannot prove
 * atomicity) and a real Fastify app for `app.jwt.merchant.sign/verify` (so
 * the signed-JWT proof path is exercised against the real signer/verifier,
 * not a hand-rolled stub). Isolated db 12 — atomic-limiter.test.ts uses 15,
 * queue.test.ts uses 14, merchant-atomic-rotate.test.ts uses 13; each real-
 * Redis suite needs its own db so parallel files can't flush each other's
 * state mid-test. Availability is probed in beforeAll; every test skips
 * honestly when Redis is unreachable.
 *
 * prisma is a lightweight vi.fn() mock — these tests are about the Redis/JWT
 * proof logic, not Prisma persistence. `merchantMembership.findMany` resolves
 * `[]` (no active membership) so `getActiveMembership` returns null and the
 * SUSPENDED gate in `refreshMerchantToken` never fires — refresh tests here
 * are purely about the Redis rotate/revoke interplay.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'
import { logoutMerchant, refreshMerchantToken } from '../../../src/api/auth/merchant/service'
import { storeRefreshToken } from '../../../src/api/shared/session'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { AppError } from '../../../src/api/shared/errors'
import { hashRefreshToken } from '../../../src/api/shared/tokens'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let redis: Redis | null = null
let available = false

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 12, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
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

function makePrisma() {
  return {
    merchantMembership: { findMany: vi.fn().mockResolvedValue([]) },
    userSession: { updateMany: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any
}

let seq = 0
function ids() {
  seq++
  return { entityId: `ma${seq}`, sessionId: `s${seq}` }
}

async function seedSession(entityId: string, sessionId: string, refreshToken: string) {
  await storeRefreshToken(redis!, {
    role: 'merchant', entityId, sessionId,
    tokenHash: hashRefreshToken(refreshToken),
    deviceId: 'd1', deviceType: 'web',
  })
}

describe('merchant logout durability — security + interleaving (real Redis db 12)', () => {
  let app: FastifyInstance
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
    app = await buildApp()
    prisma = makePrisma()
    app.decorate('prisma', prisma)
    if (available && redis) app.decorate('redis', redis as any)
  })

  afterEach(async () => { await app.close() })

  function signAccess(entityId: string, sessionId: string, opts: { expiresIn?: string | number } = {}): string {
    const jwtAny = app.jwt as any
    return jwtAny.merchant.sign(
      { sub: entityId, role: 'merchant', deviceId: 'd1', sessionId },
      { expiresIn: opts.expiresIn ?? '15m' },
    )
  }

  // ── (1) tampered-cookie-id ─────────────────────────────────────────────

  it('tampered-cookie-id: SIGNED claims are authoritative — a body naming a different merchant is ignored', async (ctx) => {
    requireRedis(ctx)
    const a = ids()
    const victim = ids()
    await seedSession(a.entityId, a.sessionId, 'A_REFRESH')
    await seedSession(victim.entityId, victim.sessionId, 'VICTIM_REFRESH')

    const tokenForA = signAccess(a.entityId, a.sessionId)

    // The (forged/tampered) body claims victim's ids — must be ignored.
    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: tokenForA,
      refreshToken: 'attacker-supplied-nonsense',
      sessionId: victim.sessionId,
      entityId: victim.entityId,
      ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(result.revoke).toBe('confirmed')
    expect(await redis!.get(RedisKey.refreshToken('merchant', a.entityId, a.sessionId))).toBeNull()
    // Victim untouched.
    expect(await redis!.get(RedisKey.refreshToken('merchant', victim.entityId, victim.sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data.entityId).toBe(a.entityId)
  })

  // ── (2) unauthenticated ────────────────────────────────────────────────

  it('unauthenticated: neither a valid-signature JWT nor a valid refresh secret -> no revoke (no-op)', async (ctx) => {
    requireRedis(ctx)
    const victim = ids()
    await seedSession(victim.entityId, victim.sessionId, 'REAL_REFRESH')

    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: 'not-even-a-jwt',
      refreshToken: 'guessed-wrong-secret',
      sessionId: victim.sessionId,
      entityId: victim.entityId,
      ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(result.revoke).toBe('stale')
    expect(await redis!.get(RedisKey.refreshToken('merchant', victim.entityId, victim.sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // ── (3) cross-merchant DoS ───────────────────────────────────────────────

  it('cross-merchant DoS: a flood of forged-signature / bogus-token logouts is a pure no-op every time', async (ctx) => {
    requireRedis(ctx)
    const victim = ids()
    await seedSession(victim.entityId, victim.sessionId, 'REAL_REFRESH')

    for (let i = 0; i < 20; i++) {
      const result = await logoutMerchant(prisma, redis!, app, {
        accessToken: `forged.token.${i}`,
        refreshToken: `guess-${i}`,
        sessionId: victim.sessionId,
        entityId: victim.entityId,
        ipAddress: '9.9.9.9', userAgent: 'attacker',
      })
      expect(result.revoke).toBe('stale')
    }
    expect(await redis!.get(RedisKey.refreshToken('merchant', victim.entityId, victim.sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // ── (4) CONCURRENT REFRESH CANNOT RESTORE — the headline ────────────────

  it('CONCURRENT REFRESH CANNOT RESTORE: refresh rotates FIRST, then a signed logout DELs the rotated token — session dead', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'ORIGINAL_REFRESH')

    // 1. A refresh lands first and rotates the key to a new token.
    const refreshed = await refreshMerchantToken(prisma, redis!, app, {
      refreshToken: 'ORIGINAL_REFRESH', sessionId, entityId, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(refreshed.refreshToken).not.toBe('ORIGINAL_REFRESH')
    // Key now holds the ROTATED token, not the original.
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).not.toBeNull()

    // 2. THEN a signed logout runs, using an access token for the SAME session.
    const accessToken = signAccess(entityId, sessionId)
    const logoutResult = await logoutMerchant(prisma, redis!, app, {
      accessToken, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(logoutResult.revoke).toBe('confirmed')

    // 3. The rotated token is GONE — the concurrent refresh could NOT restore
    //    the session. Assert the key is absent AND a subsequent refresh with
    //    the rotated token is refused.
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()

    await expect(
      refreshMerchantToken(prisma, redis!, app, {
        refreshToken: refreshed.refreshToken, sessionId, entityId, ipAddress: '1.1.1.1', userAgent: 'test',
      }),
    ).rejects.toThrow(AppError)
  })

  it('CONCURRENT REFRESH CANNOT RESTORE — reverse order: logout first, then a straddling refresh with the pre-rotation token is refused', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'ORIGINAL_REFRESH')

    const accessToken = signAccess(entityId, sessionId)
    const logoutResult = await logoutMerchant(prisma, redis!, app, {
      accessToken, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(logoutResult.revoke).toBe('confirmed')

    // The straddling refresh (issued before logout, arriving after) presents
    // the now-revoked original token — refused, not resurrected.
    await expect(
      refreshMerchantToken(prisma, redis!, app, {
        refreshToken: 'ORIGINAL_REFRESH', sessionId, entityId, ipAddress: '1.1.1.1', userAgent: 'test',
      }),
    ).rejects.toThrow(AppError)
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()
  })

  // ── (5) old-request-new-session ─────────────────────────────────────────

  it('old-request-new-session: a signed logout carrying an OLD sessionId targets only the OLD key, new session untouched', async (ctx) => {
    requireRedis(ctx)
    const entityId = ids().entityId
    const oldSessionId = 's-old'
    const newSessionId = 's-new'
    await seedSession(entityId, oldSessionId, 'OLD_REFRESH')
    await seedSession(entityId, newSessionId, 'NEW_REFRESH')

    const oldAccessToken = signAccess(entityId, oldSessionId)
    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: oldAccessToken, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('confirmed')

    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, oldSessionId))).toBeNull()
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, newSessionId))).not.toBeNull()
  })

  // ── (6) expired-token-policy ─────────────────────────────────────────────

  it('expired-token policy: an EXPIRED-but-validly-signed access token still authorizes the DEL', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')

    const expiredToken = signAccess(entityId, sessionId, { expiresIn: '1ms' })
    await new Promise((resolve) => setTimeout(resolve, 50)) // let it actually expire

    // Sanity: a plain verify (no ignoreExpiration) DOES reject this as expired.
    expect(() => (app.jwt as any).merchant.verify(expiredToken)).toThrow()

    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: expiredToken, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('confirmed')
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()
  })

  // ── (7) side-effect gating ───────────────────────────────────────────────

  it('side-effect gating: a forged/unsigned/old body does NOT del(authMerchant) or write an AUTH_LOGOUT audit row', async (ctx) => {
    requireRedis(ctx)
    const victim = ids()
    await seedSession(victim.entityId, victim.sessionId, 'REAL_REFRESH')
    await redis!.set(RedisKey.authMerchant(victim.entityId), JSON.stringify({ merchantId: 'm1' }), 'EX', 3600)

    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: 'garbage-not-a-jwt',
      refreshToken: 'wrong-secret',
      sessionId: victim.sessionId,
      entityId: victim.entityId,
      ipAddress: '1.1.1.1', userAgent: 'test',
    })

    expect(result.revoke).toBe('stale')
    expect(await redis!.get(RedisKey.authMerchant(victim.entityId))).not.toBeNull() // untouched
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('side-effect gating (positive control): a PROVEN signed logout DOES del(authMerchant) + write AUTH_LOGOUT', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')
    await redis!.set(RedisKey.authMerchant(entityId), JSON.stringify({ merchantId: 'm1' }), 'EX', 3600)

    const accessToken = signAccess(entityId, sessionId)
    await logoutMerchant(prisma, redis!, app, { accessToken, ipAddress: '1.1.1.1', userAgent: 'test' })

    expect(await redis!.get(RedisKey.authMerchant(entityId))).toBeNull()
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ event: 'AUTH_LOGOUT', entityId })
  })

  // ── (7b) CodeRabbit #390 Finding 3: degraded path survives a failing cache DEL ──

  it('best-effort authMerchant DEL: a Redis rejection on the cache eviction does NOT abort the degraded path (audit + outcome still returned)', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')
    await redis!.set(RedisKey.authMerchant(entityId), JSON.stringify({ merchantId: 'm1' }), 'EX', 3600)

    // Wrap the real client so ONLY the authMerchant cache DEL rejects; the
    // authoritative session-key DEL (a different key) still succeeds. This is
    // the exact failure mode that produces a 'unavailable'/'pending' outcome
    // (Redis flaky) — the secondary best-effort DEL must not throw past the
    // audit writes + return.
    const authKey = RedisKey.authMerchant(entityId)
    const wrapped = new Proxy(redis!, {
      get(target, prop, receiver) {
        if (prop === 'del') {
          return (...args: unknown[]) => {
            if (args.length === 1 && args[0] === authKey) {
              return Promise.reject(new Error('simulated Redis DEL failure'))
            }
            return (target as any).del(...args)
          }
        }
        const v = Reflect.get(target, prop, receiver)
        return typeof v === 'function' ? v.bind(target) : v
      },
    }) as unknown as Redis

    const accessToken = signAccess(entityId, sessionId)
    // Before the fix this rejected; now it resolves cleanly.
    const result = await logoutMerchant(prisma, wrapped, app, { accessToken, ipAddress: '1.1.1.1', userAgent: 'test' })

    // Authoritative revoke still happened (session key gone), the outcome is
    // returned honestly, and the AUTH_LOGOUT audit row was still written even
    // though the cache eviction failed.
    expect(result.revoke).toBe('confirmed')
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ event: 'AUTH_LOGOUT', entityId })
  })

  // ── (8) fallback ─────────────────────────────────────────────────────────

  it('fallback: no access token + a VALID current refresh secret -> DEL on match', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'THE_REAL_REFRESH')

    const result = await logoutMerchant(prisma, redis!, app, {
      refreshToken: 'THE_REAL_REFRESH', sessionId, entityId, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('confirmed')
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('fallback: no access token + a stale/mismatched secret -> "stale", no DEL (disclosed residual)', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'THE_REAL_REFRESH')

    const result = await logoutMerchant(prisma, redis!, app, {
      refreshToken: 'a-stale-token', sessionId, entityId, ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('stale')
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // ── (9) uniform response ────────────────────────────────────────────────

  it('uniform response: a signed logout on an already-absent key and on a present key both return "confirmed" (no existence oracle)', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')

    const accessToken = signAccess(entityId, sessionId)
    const first = await logoutMerchant(prisma, redis!, app, { accessToken, ipAddress: '1.1.1.1', userAgent: 'test' })
    expect(first.revoke).toBe('confirmed')
    // Key is already gone now — a second logout with the SAME (still validly
    // signed, ignoreExpiration doesn't matter here) token must be indistinguishable.
    const second = await logoutMerchant(prisma, redis!, app, { accessToken, ipAddress: '1.1.1.1', userAgent: 'test' })
    expect(second.revoke).toBe('confirmed')
  })

  // ── role cross-guard ─────────────────────────────────────────────────────

  it('a validly-signed token with role !== "merchant" is NOT treated as signed proof (falls through to fallback)', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')
    const jwtAny = app.jwt as any
    const wrongRoleToken = jwtAny.merchant.sign({ sub: entityId, role: 'admin', deviceId: 'd1', sessionId }, { expiresIn: '15m' })

    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: wrongRoleToken,
      // no fallback material provided
      ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('confirmed') // no-op path (neither proof succeeded)
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })

  it('a validly-signed token missing sessionId is NOT treated as signed proof (never DELs a guessed/derived key)', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    await seedSession(entityId, sessionId, 'REFRESH')
    const jwtAny = app.jwt as any
    const missingSessionToken = jwtAny.merchant.sign({ sub: entityId, role: 'merchant', deviceId: 'd1' }, { expiresIn: '15m' })

    const result = await logoutMerchant(prisma, redis!, app, {
      accessToken: missingSessionToken,
      ipAddress: '1.1.1.1', userAgent: 'test',
    })
    expect(result.revoke).toBe('confirmed')
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).not.toBeNull()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })
})
