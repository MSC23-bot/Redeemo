import { describe, it, expect, vi, afterEach } from 'vitest'
import type Redis from 'ioredis'
import {
  consumePwdResetAttempt,
  normalizeEmail,
  hashEmail,
} from '../../../src/api/shared/pwdResetLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// SEC-H4 (Gate-PR-8) + §SEC.1 (Phase 0 PR-0.2): password-reset request abuse
// controls, now ONE atomic check-and-count. Pure unit tests against a stateful
// fake Redis whose `eval` is backed by shimEval — the JS mirror pinned ≡ the
// real Lua by tests/api/shared/atomic-limiter.test.ts. Prod caps apply here
// (RATE_LIMIT_RELAX unset → per-email 3/hr + 5/day victim, per-IP 10/day abuser).

const EMAIL = 'user@example.com'
const IP = '1.2.3.4'

/** Stateful fake: counters accumulate across calls; eval delegates to shimEval. */
function fakeRedis(opts: { counts?: Record<string, string>; ttl?: number } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  const redis = {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), {
        ttlOf: () => opts.ttl ?? 1800,
      })),
  }
  return redis as unknown as Redis & { _store: Map<string, string> }
}

const emailHourKey = () => RedisKey.rateLimitPwdReset(hashEmail(EMAIL))
const emailDayKey = () => RedisKey.rateLimitPwdResetDay(hashEmail(EMAIL))
const ipDayKey = () => RedisKey.rateLimitPwdResetIpDay(IP)

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

describe('consumePwdResetAttempt — blocking', () => {
  it('blocks at the per-email hourly cap (3) with retryAfter', async () => {
    const redis = fakeRedis({ counts: { [emailHourKey()]: '3' }, ttl: 1800 })
    await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP }))
      .rejects.toMatchObject({ code: 'PWD_RESET_RATE_LIMITED', details: { retryAfter: 1800 } })
  })

  it('blocks at the per-email daily cap (5)', async () => {
    const redis = fakeRedis({ counts: { [emailDayKey()]: '5' } })
    await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })).rejects.toThrow('PWD_RESET_RATE_LIMITED')
  })

  it('blocks at the per-IP daily cap (10) with retryAfter', async () => {
    const redis = fakeRedis({ counts: { [ipDayKey()]: '10' }, ttl: 4200 })
    await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP }))
      .rejects.toMatchObject({ code: 'PWD_RESET_RATE_LIMITED', details: { retryAfter: 4200 } })
  })

  it('skips the per-IP cap when no IP is provided', async () => {
    // A per-IP count at the cap must NOT block when ctx.ip is absent.
    const redis = fakeRedis({ counts: { [ipDayKey()]: '99' } })
    await expect(consumePwdResetAttempt(redis, { email: EMAIL })).resolves.toBeUndefined()
  })
})

describe('consumePwdResetAttempt — counting (§SEC.1 victim/abuser semantics)', () => {
  it('an allowed request counts on per-email hour+day AND per-IP day; raw email never a key', async () => {
    const redis = fakeRedis()
    await consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })
    expect(redis._store.get(emailHourKey())).toBe('1')
    expect(redis._store.get(emailDayKey())).toBe('1')
    expect(redis._store.get(ipDayKey())).toBe('1')
    for (const key of redis._store.keys()) expect(key).not.toContain('user@example.com')
  })

  it('counts only the per-email keys when no IP is present', async () => {
    const redis = fakeRedis()
    await consumePwdResetAttempt(redis, { email: EMAIL })
    expect(redis._store.get(emailHourKey())).toBe('1')
    expect(redis._store.get(emailDayKey())).toBe('1')
    expect(redis._store.has(ipDayKey())).toBe(false)
  })

  it('VICTIM NOT BURNED: blocked attempts do not grow the per-email counters', async () => {
    const redis = fakeRedis({ counts: { [emailHourKey()]: '3' } })
    for (let i = 0; i < 5; i++) {
      await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })).rejects.toThrow('PWD_RESET_RATE_LIMITED')
    }
    // The victim's hourly counter is untouched — an attacker cannot extend the
    // victim's lockout window by hammering; it lapses on schedule.
    expect(redis._store.get(emailHourKey())).toBe('3')
    expect(redis._store.has(emailDayKey())).toBe(false) // never counted on a blocked attempt
  })

  it('ABUSER COUNTS: email-blocked attempts still count against the requester IP', async () => {
    const redis = fakeRedis({ counts: { [emailHourKey()]: '3' } })
    for (let i = 0; i < 4; i++) {
      await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })).rejects.toThrow('PWD_RESET_RATE_LIMITED')
    }
    expect(redis._store.get(ipDayKey())).toBe('4') // every attempt counted against the abuser
  })

  it('full lifecycle: 3 allowed then blocked, counters exact', async () => {
    const redis = fakeRedis()
    for (let i = 0; i < 3; i++) {
      await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })).resolves.toBeUndefined()
    }
    await expect(consumePwdResetAttempt(redis, { email: EMAIL, ip: IP })).rejects.toThrow('PWD_RESET_RATE_LIMITED')
    expect(redis._store.get(emailHourKey())).toBe('3')
    expect(redis._store.get(emailDayKey())).toBe('3')
    expect(redis._store.get(ipDayKey())).toBe('4') // 3 allowed + 1 blocked attempt
  })
})

describe('RATE_LIMIT_RELAX', () => {
  it('loosens caps in dev but the limiter still functions', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV is "test" (not production) → relax active
    const mod = await import('../../../src/api/shared/pwdResetLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')

    // A per-email count of 3 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = fakeRedis({ counts: { [keys.RedisKey.rateLimitPwdReset(mod.hashEmail(EMAIL))]: '3' } })
    await expect(mod.consumePwdResetAttempt(relaxed, { email: EMAIL, ip: IP })).resolves.toBeUndefined()

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
      const atCap = fakeRedis({ counts: { [keys.RedisKey.rateLimitPwdReset(mod.hashEmail(EMAIL))]: '3' } })
      await expect(mod.consumePwdResetAttempt(atCap, { email: EMAIL, ip: IP }))
        .rejects.toThrow('PWD_RESET_RATE_LIMITED')
    } finally {
      process.env.NODE_ENV = origNodeEnv // restore so other tests/files see the original env
      vi.resetModules()
    }
  })
})
