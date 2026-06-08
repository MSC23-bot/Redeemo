import { describe, it, expect, vi, afterEach } from 'vitest'
import type Redis from 'ioredis'
import {
  assertPwdResetAllowed,
  recordPwdResetRequest,
  normalizeEmail,
  hashEmail,
} from '../../../src/api/shared/pwdResetLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// SEC-H4 (Gate-PR-8): password-reset request abuse controls. Pure unit tests
// against a mock Redis — no DB. Prod caps apply here (RATE_LIMIT_RELAX unset).

const EMAIL = 'user@example.com'
const IP = '1.2.3.4'

function mockRedis(opts: { counts?: Record<string, string>; ttl?: number } = {}): Redis {
  const counts = opts.counts ?? {}
  return {
    get: vi.fn(async (key: string) => counts[key] ?? null),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => opts.ttl ?? 1800),
  } as unknown as Redis
}

afterEach(() => {
  delete process.env.RATE_LIMIT_RELAX
})

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
  })
})

describe('hashEmail', () => {
  it('never returns the raw email, is stable, differs per email, normalizes first', () => {
    const h = hashEmail(EMAIL)
    expect(h).not.toContain('user@example.com')
    expect(h).toMatch(/^[a-f0-9]{32}$/)
    expect(hashEmail(EMAIL)).toBe(h)
    expect(hashEmail('other@example.com')).not.toBe(h)
    // Case + surrounding whitespace must hash to the SAME key (can't bypass the per-email cap).
    expect(hashEmail('  USER@Example.com ')).toBe(h)
  })
})

describe('assertPwdResetAllowed', () => {
  it('blocks at the per-email hourly cap (3) with retryAfter', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitPwdReset(hashEmail(EMAIL))]: '3' }, ttl: 1800 })
    await expect(assertPwdResetAllowed(redis, { email: EMAIL, ip: IP }))
      .rejects.toMatchObject({ code: 'PWD_RESET_RATE_LIMITED', details: { retryAfter: 1800 } })
  })

  it('blocks at the per-email daily cap (5)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitPwdResetDay(hashEmail(EMAIL))]: '5' } })
    await expect(assertPwdResetAllowed(redis, { email: EMAIL, ip: IP })).rejects.toThrow('PWD_RESET_RATE_LIMITED')
  })

  it('blocks at the per-IP daily cap (10) with retryAfter', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitPwdResetIpDay(IP)]: '10' }, ttl: 4200 })
    await expect(assertPwdResetAllowed(redis, { email: EMAIL, ip: IP }))
      .rejects.toMatchObject({ code: 'PWD_RESET_RATE_LIMITED', details: { retryAfter: 4200 } })
  })

  it('allows a legitimate first request (all counters empty)', async () => {
    const redis = mockRedis()
    await expect(assertPwdResetAllowed(redis, { email: EMAIL, ip: IP })).resolves.toBeUndefined()
  })

  it('skips the per-IP cap when no IP is provided', async () => {
    // A per-IP count at the cap must NOT block when ctx.ip is absent.
    const redis = mockRedis({ counts: { [RedisKey.rateLimitPwdResetIpDay(IP)]: '99' } })
    await expect(assertPwdResetAllowed(redis, { email: EMAIL })).resolves.toBeUndefined()
  })
})

describe('recordPwdResetRequest', () => {
  it('increments per-email hour+day and per-IP day, raw email never used as a key', async () => {
    const redis = mockRedis()
    await recordPwdResetRequest(redis, { email: EMAIL, ip: IP })
    expect((redis.incr as any).mock.calls.length).toBe(3)
    expect(redis.incr).toHaveBeenCalledWith(RedisKey.rateLimitPwdReset(hashEmail(EMAIL)))
    expect(redis.incr).toHaveBeenCalledWith(RedisKey.rateLimitPwdResetDay(hashEmail(EMAIL)))
    expect(redis.incr).toHaveBeenCalledWith(RedisKey.rateLimitPwdResetIpDay(IP))
    for (const [key] of (redis.incr as any).mock.calls) expect(key).not.toContain('user@example.com')
  })

  it('counts only the per-email keys when no IP is present (2 incrs)', async () => {
    const redis = mockRedis()
    await recordPwdResetRequest(redis, { email: EMAIL })
    expect((redis.incr as any).mock.calls.length).toBe(2)
  })

  it('sets a TTL only on a counter\'s FIRST increment (fixed window)', async () => {
    // email-hour key already exists this window (incr → 2); email-day key is fresh (incr → 1).
    const incrReturns: Record<string, number> = {
      [RedisKey.rateLimitPwdReset(hashEmail(EMAIL))]: 2,
      [RedisKey.rateLimitPwdResetDay(hashEmail(EMAIL))]: 1,
    }
    const expired: string[] = []
    const redis = {
      incr: vi.fn(async (k: string) => incrReturns[k]),
      expire: vi.fn(async (k: string) => { expired.push(k); return 1 }),
      get: vi.fn(),
      ttl: vi.fn(),
    } as unknown as Redis
    await recordPwdResetRequest(redis, { email: EMAIL }) // no IP → only the two per-email keys
    expect(expired).toEqual([RedisKey.rateLimitPwdResetDay(hashEmail(EMAIL))]) // only the fresh counter got a TTL
  })
})

describe('RATE_LIMIT_RELAX', () => {
  it('loosens caps in dev but the limiter still functions', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV is "test" (not production) → relax active
    const mod = await import('../../../src/api/shared/pwdResetLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')

    // A per-email count of 3 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = mockRedis({ counts: { [keys.RedisKey.rateLimitPwdReset(mod.hashEmail(EMAIL))]: '3' } })
    await expect(mod.assertPwdResetAllowed(relaxed, { email: EMAIL, ip: IP })).resolves.toBeUndefined()

    vi.resetModules()
  })

  it('does NOT loosen caps in production even when RATE_LIMIT_RELAX=true (guardrail)', async () => {
    vi.resetModules()
    const origNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.RATE_LIMIT_RELAX = 'true' // must be IGNORED when NODE_ENV==='production'
    try {
      const mod = await import('../../../src/api/shared/pwdResetLimiter')
      const keys = await import('../../../src/api/shared/redis-keys')

      // A per-email count of 3 (the prod cap) STILL throws — relax is disabled in prod,
      // so RATE_LIMIT_RELAX can never weaken the limiter on a production deployment.
      const atCap = mockRedis({ counts: { [keys.RedisKey.rateLimitPwdReset(mod.hashEmail(EMAIL))]: '3' } })
      await expect(mod.assertPwdResetAllowed(atCap, { email: EMAIL, ip: IP }))
        .rejects.toThrow('PWD_RESET_RATE_LIMITED')
    } finally {
      process.env.NODE_ENV = origNodeEnv // restore so other tests/files see the original env
      vi.resetModules()
    }
  })
})
