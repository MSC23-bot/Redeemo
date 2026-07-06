/**
 * Merchant-only atomic compare-and-rotate + revoke primitives (backend
 * logout-durability design 2026-07-06, §3.1/§3.2/§3.3/§3.4).
 *
 * The rotate Lua's atomicity can only be proven against REAL Redis (a fake
 * has no Lua engine) — mirrors the pattern in
 * tests/api/shared/atomic-limiter.test.ts. Real Redis on an isolated db (13;
 * atomic-limiter.test.ts uses 15, queue.test.ts uses 14 — these real-Redis
 * suites must stay on SEPARATE dbs so a shared flushdb() across parallel
 * files can't flake). Availability is probed in beforeAll; when no Redis is
 * reachable every test dynamically skips (honest skip, never a false green).
 *
 * The revoke helpers (revokeMerchantSessionUnconditional /
 * revokeMerchantSessionByPossession) don't need Lua — those are exercised
 * against a lightweight fake so the retry/tombstone/unavailable branches can
 * be forced deterministically (a real Redis client can't easily be told to
 * fail on demand).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import {
  rotateMerchantRefreshTokenAtomic,
  revokeMerchantSessionUnconditional,
  revokeMerchantSessionByPossession,
} from '../../../src/api/auth/merchant/atomicRotate'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { hashRefreshToken } from '../../../src/api/shared/tokens'
import { REFRESH_TOKEN_TTL_SECONDS } from '../../../src/api/shared/session'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let redis: Redis | null = null
let available = false

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 13, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
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

let seq = 0
function ids() {
  seq++
  return { entityId: `ma${seq}`, sessionId: `s${seq}` }
}

function seedValue(deviceId: string, deviceType: string, tokenHash: string, deviceName?: string) {
  return JSON.stringify({ tokenHash, deviceId, deviceType, deviceName, createdAt: new Date().toISOString() })
}

describe('rotateMerchantRefreshTokenAtomic — real Redis (db 13)', () => {
  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
  })

  it('MISSING KEY: refuses without mutation', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const result = await rotateMerchantRefreshTokenAtomic(redis!, {
      entityId, sessionId,
      expectedHash: hashRefreshToken('anything'),
      replacementValue: seedValue('d', 'web', hashRefreshToken('new')),
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'missing' })
    expect(await redis!.get(RedisKey.refreshToken('merchant', entityId, sessionId))).toBeNull()
  })

  it('HASH MISMATCH: refuses without mutation, stored value byte-unchanged', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const key = RedisKey.refreshToken('merchant', entityId, sessionId)
    const storedValue = seedValue('d1', 'web', hashRefreshToken('current-token'))
    await redis!.set(key, storedValue, 'EX', REFRESH_TOKEN_TTL_SECONDS)

    const result = await rotateMerchantRefreshTokenAtomic(redis!, {
      entityId, sessionId,
      expectedHash: hashRefreshToken('WRONG-token'),
      replacementValue: seedValue('d1', 'web', hashRefreshToken('new')),
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'mismatch' })
    expect(await redis!.get(key)).toBe(storedValue)
  })

  it('CORRUPT VALUE: non-JSON stored value refuses without mutation', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const key = RedisKey.refreshToken('merchant', entityId, sessionId)
    await redis!.set(key, 'not-json-at-all', 'EX', REFRESH_TOKEN_TTL_SECONDS)

    const result = await rotateMerchantRefreshTokenAtomic(redis!, {
      entityId, sessionId,
      expectedHash: hashRefreshToken('whatever'),
      replacementValue: seedValue('d1', 'web', hashRefreshToken('new')),
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'corrupt' })
    expect(await redis!.get(key)).toBe('not-json-at-all')
  })

  it('SUCCESSFUL ROTATION: matches -> ok, key now holds the exact replacementValue, TTL set, metadata preserved', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const key = RedisKey.refreshToken('merchant', entityId, sessionId)
    const currentHash = hashRefreshToken('current-token')
    await redis!.set(key, seedValue('device-abc', 'ios', currentHash, 'Sam’s iPhone'), 'EX', REFRESH_TOKEN_TTL_SECONDS)

    const replacementValue = seedValue('device-abc', 'ios', hashRefreshToken('new-token'), 'Sam’s iPhone')
    const result = await rotateMerchantRefreshTokenAtomic(redis!, {
      entityId, sessionId,
      expectedHash: currentHash,
      replacementValue,
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    })
    expect(result).toEqual({ ok: true })

    const stored = await redis!.get(key)
    expect(stored).toBe(replacementValue)
    const parsed = JSON.parse(stored!)
    expect(parsed.tokenHash).toBe(hashRefreshToken('new-token'))
    expect(parsed.deviceId).toBe('device-abc')
    expect(parsed.deviceType).toBe('ios')
    expect(parsed.deviceName).toBe('Sam’s iPhone')

    const ttl = await redis!.ttl(key)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(REFRESH_TOKEN_TTL_SECONDS)
    expect(ttl).toBeGreaterThan(REFRESH_TOKEN_TTL_SECONDS - 60) // within tolerance
  })

  it('TOMBSTONE REFUSAL (§3.2 step 0): a pending-revocation tombstone refuses AND deletes the token key', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const tokenKey = RedisKey.refreshToken('merchant', entityId, sessionId)
    const tombstoneKey = RedisKey.sessionRevoked('merchant', entityId, sessionId)
    const currentHash = hashRefreshToken('current-token')
    await redis!.set(tokenKey, seedValue('d', 'web', currentHash), 'EX', REFRESH_TOKEN_TTL_SECONDS)
    await redis!.set(tombstoneKey, '1', 'EX', REFRESH_TOKEN_TTL_SECONDS)

    const result = await rotateMerchantRefreshTokenAtomic(redis!, {
      entityId, sessionId,
      expectedHash: currentHash,
      replacementValue: seedValue('d', 'web', hashRefreshToken('new')),
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    })
    expect(result).toEqual({ ok: false, reason: 'revoked' })
    // Both the token key AND the tombstone are deleted (self-cleaning — bounds
    // tombstone growth to one enforcement per failed logout).
    expect(await redis!.get(tokenKey)).toBeNull()
    expect(await redis!.get(tombstoneKey)).toBeNull()
  })

  it('cross-instance simulation: two independent Redis clients hitting the SAME key both see the atomic rotation', async (ctx) => {
    requireRedis(ctx)
    const { entityId, sessionId } = ids()
    const key = RedisKey.refreshToken('merchant', entityId, sessionId)
    const currentHash = hashRefreshToken('current-token')
    await redis!.set(key, seedValue('d', 'web', currentHash), 'EX', REFRESH_TOKEN_TTL_SECONDS)

    const secondClient = new Redis(REDIS_URL, { db: 13, lazyConnect: true })
    await secondClient.connect()
    try {
      // "instance A" rotates via `redis`, "instance B" (secondClient) then tries
      // the SAME rotate with the now-stale expectedHash — refused, no shared
      // in-process state required (the shared Redis store IS the coordination).
      const first = await rotateMerchantRefreshTokenAtomic(redis!, {
        entityId, sessionId, expectedHash: currentHash,
        replacementValue: seedValue('d', 'web', hashRefreshToken('rotated-by-A')),
        ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      })
      expect(first).toEqual({ ok: true })

      const second = await rotateMerchantRefreshTokenAtomic(secondClient, {
        entityId, sessionId, expectedHash: currentHash, // stale — A already rotated
        replacementValue: seedValue('d', 'web', hashRefreshToken('rotated-by-B')),
        ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
      })
      expect(second).toEqual({ ok: false, reason: 'mismatch' })
    } finally {
      secondClient.disconnect()
    }
  })
})

describe('revokeMerchantSessionUnconditional', () => {
  it('confirmed: a single successful DEL returns "confirmed" immediately (no retry)', async () => {
    const del = vi.fn().mockResolvedValue(1)
    const set = vi.fn().mockResolvedValue('OK')
    const fakeRedis = { del, set } as any
    const outcome = await revokeMerchantSessionUnconditional(fakeRedis, { entityId: 'ma1', sessionId: 's1' })
    expect(outcome).toBe('confirmed')
    expect(del).toHaveBeenCalledTimes(1)
    expect(set).not.toHaveBeenCalled()
  })

  it('confirmed: DELing an already-absent key still returns "confirmed" (uniform — no session-existence oracle)', async () => {
    const del = vi.fn().mockResolvedValue(0) // 0 keys removed — key was already gone
    const fakeRedis = { del, set: vi.fn() } as any
    const outcome = await revokeMerchantSessionUnconditional(fakeRedis, { entityId: 'ma1', sessionId: 's1' })
    expect(outcome).toBe('confirmed')
  })

  it('pending: DEL fails on every bounded retry attempt, then the tombstone write succeeds', async () => {
    const del = vi.fn().mockRejectedValue(new Error('transient blip'))
    const set = vi.fn().mockResolvedValue('OK')
    const fakeRedis = { del, set } as any
    const outcome = await revokeMerchantSessionUnconditional(fakeRedis, { entityId: 'ma1', sessionId: 's1' })
    expect(outcome).toBe('pending')
    expect(del.mock.calls.length).toBeGreaterThanOrEqual(2) // bounded in-request retry
    expect(set).toHaveBeenCalledWith(
      RedisKey.sessionRevoked('merchant', 'ma1', 's1'), '1', 'EX', REFRESH_TOKEN_TTL_SECONDS,
    )
  })

  it('unavailable: both the DEL retries AND the tombstone write fail (Redis fully unreachable)', async () => {
    const del = vi.fn().mockRejectedValue(new Error('down'))
    const set = vi.fn().mockRejectedValue(new Error('down'))
    const fakeRedis = { del, set } as any
    const outcome = await revokeMerchantSessionUnconditional(fakeRedis, { entityId: 'ma1', sessionId: 's1' })
    expect(outcome).toBe('unavailable')
  })
})

describe('revokeMerchantSessionByPossession', () => {
  it('confirmed: a matching presented refresh token DELs the key', async () => {
    const tokenHash = hashRefreshToken('the-real-token')
    const get = vi.fn().mockResolvedValue(JSON.stringify({ tokenHash }))
    const del = vi.fn().mockResolvedValue(1)
    const fakeRedis = { get, del } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'the-real-token',
    })
    expect(outcome).toBe('confirmed')
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('absent: an already-absent key returns "absent" (NOT "confirmed") and attempts no mutation — absence is not proof of possession (#390.1)', async () => {
    const get = vi.fn().mockResolvedValue(null)
    const del = vi.fn()
    const fakeRedis = { get, del } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'whatever',
    })
    // 'absent' is deliberately distinct from 'confirmed' so the caller
    // (logoutMerchant) can gate side-effects on GENUINE proof only. The caller
    // then collapses 'absent'/'stale'/'confirmed' into ONE uniform external
    // response (no session-existence oracle, #390.3) — see the service-level
    // no-cache-eviction / no-false-audit / no-oracle pins in
    // tests/api/auth/merchant-logout-durability.test.ts.
    expect(outcome).toBe('absent')
    expect(del).not.toHaveBeenCalled()
  })

  it('stale: a mismatched/stale presented token does NOT DEL (disclosed residual — no mutation on mismatch)', async () => {
    const tokenHash = hashRefreshToken('the-real-token')
    const get = vi.fn().mockResolvedValue(JSON.stringify({ tokenHash }))
    const del = vi.fn()
    const fakeRedis = { get, del } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'stale-old-token',
    })
    expect(outcome).toBe('stale')
    expect(del).not.toHaveBeenCalled()
  })

  it('stale: a corrupt stored value refuses without mutation', async () => {
    const get = vi.fn().mockResolvedValue('not-json')
    const del = vi.fn()
    const fakeRedis = { get, del } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'anything',
    })
    expect(outcome).toBe('stale')
    expect(del).not.toHaveBeenCalled()
  })

  it('unavailable: a GET failure is reported honestly, not silently treated as a match or a miss', async () => {
    const get = vi.fn().mockRejectedValue(new Error('down'))
    const fakeRedis = { get, del: vi.fn() } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'x',
    })
    expect(outcome).toBe('unavailable')
  })

  // CodeRabbit #390 Finding 2 / Opus F2: a poisoned/non-hex tokenHash of
  // MATCHING STRING LENGTH decodes to a different BYTE length and would make
  // timingSafeEqual throw. The comparison must fail CLOSED ('stale', no DEL),
  // never escape as an unhandled rejection.
  it('stale: a poisoned non-hex stored hash of matching string length fails closed (no throw, no DEL)', async () => {
    const poisonedHash = 'z'.repeat(hashRefreshToken('the-real-token').length) // 64 non-hex chars
    const get = vi.fn().mockResolvedValue(JSON.stringify({ tokenHash: poisonedHash }))
    const del = vi.fn()
    const fakeRedis = { get, del } as any
    const outcome = await revokeMerchantSessionByPossession(fakeRedis, {
      entityId: 'ma1', sessionId: 's1', presentedRefreshToken: 'the-real-token',
    })
    expect(outcome).toBe('stale')
    expect(del).not.toHaveBeenCalled()
  })
})
