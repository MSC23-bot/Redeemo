import { describe, it, expect, vi, afterEach } from 'vitest'
import type Redis from 'ioredis'
import {
  consumeSmsSend,
  isAllowedSmsDestination,
  isE164Format,
  hashPhone,
} from '../../../src/api/shared/smsLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// SEC-H3 (Gate-PR-7) + §SEC.1 (Phase 0 PR-0.2): SMS/OTP toll-fraud controls,
// now ONE atomic check-and-count. Pure unit tests against a stateful fake Redis
// whose `eval` is backed by shimEval — the JS mirror pinned ≡ the real Lua by
// tests/api/shared/atomic-limiter.test.ts. No DB, no Twilio. Prod caps apply
// (RATE_LIMIT_RELAX unset).
//
// §SEC.1 classification: per-IP = ABUSER keys (every attempt counts); global +
// per-phone/user/branch = VICTIM/cost keys (counted only on allowed attempts);
// the per-phone resend cooldown is acquired in-script after the volume checks.

const UK = '+447700900000'
const US = '+12025550100'

/** Stateful fake: counters accumulate across calls; eval delegates to shimEval. */
function fakeRedis(opts: { counts?: Record<string, string>; cooldownHeld?: boolean; ttl?: number } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  if (opts.cooldownHeld) store.set(RedisKey.rateLimitOtpCooldown(hashPhone(UK)), '1')
  const redis = {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), {
        ttlOf: () => opts.ttl ?? 30,
      })),
  }
  return redis as unknown as Redis & { _store: Map<string, string> }
}

const otpCtx = (over: Partial<{ phone: string; userId: string; ip: string }> = {}) => ({
  phone: over.phone ?? UK,
  userId: over.userId ?? 'u1',
  ip: over.ip ?? '1.2.3.4',
  scope: 'otp' as const,
})

afterEach(() => {
  delete process.env.SMS_ALLOWED_COUNTRY_CODES
  delete process.env.RATE_LIMIT_RELAX
})

describe('country allowlist', () => {
  it('allows UK (+44) by default, blocks others', () => {
    expect(isAllowedSmsDestination(UK)).toBe(true)
    expect(isAllowedSmsDestination(US)).toBe(false)
    expect(isAllowedSmsDestination('+2348000000000')).toBe(false)
  })
  it('honours SMS_ALLOWED_COUNTRY_CODES override', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+44,+353'
    expect(isAllowedSmsDestination('+353871234567')).toBe(true)
    expect(isAllowedSmsDestination(US)).toBe(false)
  })
  it('a bare "+" or garbage does NOT allow all destinations — falls back to UK', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+'
    expect(isAllowedSmsDestination(US)).toBe(false)
    expect(isAllowedSmsDestination(UK)).toBe(true)
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+44,+' // bare + dropped, +44 kept
    expect(isAllowedSmsDestination(US)).toBe(false)
    expect(isAllowedSmsDestination(UK)).toBe(true)
    process.env.SMS_ALLOWED_COUNTRY_CODES = 'garbage'
    expect(isAllowedSmsDestination(US)).toBe(false)
    expect(isAllowedSmsDestination(UK)).toBe(true)
  })
})

describe('isE164Format', () => {
  it('accepts E.164, rejects national / malformed', () => {
    expect(isE164Format('+447700900000')).toBe(true)
    expect(isE164Format('07700900000')).toBe(false)
    expect(isE164Format('+44abc')).toBe(false)
    expect(isE164Format('+0123456789')).toBe(false) // leading 0 after +
  })
})

describe('hashPhone', () => {
  it('never returns the raw phone, is stable, and differs per number', () => {
    const h = hashPhone(UK)
    expect(h).not.toContain('447700900000')
    expect(h).toMatch(/^[a-f0-9]{32}$/)
    expect(hashPhone(UK)).toBe(h)
    expect(hashPhone('+447700900001')).not.toBe(h)
  })
})

describe('consumeSmsSend — blocking', () => {
  it('blocks a non-allowed country before touching Redis', async () => {
    const redis = fakeRedis()
    await expect(consumeSmsSend(redis, otpCtx({ phone: US }))).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')
    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('rejects a non-E.164 number before any Redis call', async () => {
    const redis = fakeRedis()
    await expect(consumeSmsSend(redis, otpCtx({ phone: '07700900000' }))).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')
    expect(redis.eval).not.toHaveBeenCalled()
  })

  it('hard-blocks at the global daily cap (SMS_GLOBAL_LIMIT) with retryAfter', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitSmsGlobalDay()]: '500' }, ttl: 3600 })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toMatchObject({ code: 'SMS_GLOBAL_LIMIT', details: { retryAfter: 3600 } })
  })

  it('blocks at the per-phone hourly cap (3)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-user hourly cap (5)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpSendUser('u1')]: '5' } })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-IP hourly cap (10)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpIp('1.2.3.4')]: '10' } })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-IP daily cap (20)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpIpDay('1.2.3.4')]: '20' } })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('enforces the resend cooldown (key held) with retryAfter', async () => {
    const redis = fakeRedis({ cooldownHeld: true, ttl: 30 })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toMatchObject({ code: 'OTP_RESEND_COOLDOWN', details: { retryAfter: 30 } })
  })

  it('global cap takes error precedence over a per-phone block (SMS_GLOBAL_LIMIT first)', async () => {
    const redis = fakeRedis({
      counts: {
        [RedisKey.rateLimitSmsGlobalDay()]: '500',
        [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3',
      },
    })
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_GLOBAL_LIMIT')
  })

  it('branchPin scope is gated by the per-branch daily cap (10)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitBranchPinDay('b1')]: '10' } })
    await expect(consumeSmsSend(redis, { phone: UK, scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('branchPin is ALSO gated by the per-phone and per-IP caps (billable SMS path)', async () => {
    const byPhone = fakeRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    await expect(consumeSmsSend(byPhone, { phone: UK, ip: '1.2.3.4', scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
    const byIp = fakeRedis({ counts: { [RedisKey.rateLimitOtpIp('1.2.3.4')]: '10' } })
    await expect(consumeSmsSend(byIp, { phone: UK, ip: '1.2.3.4', scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
  })
})

describe('consumeSmsSend — counting (§SEC.1 victim/abuser semantics)', () => {
  it('an allowed otp send counts global + phone hr/day + user hr/day + IP hr/day and holds the cooldown', async () => {
    const redis = fakeRedis()
    await expect(consumeSmsSend(redis, otpCtx())).resolves.toBeUndefined()
    expect(redis._store.get(RedisKey.rateLimitSmsGlobalDay())).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpSend(hashPhone(UK)))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpSendDay(hashPhone(UK)))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpSendUser('u1'))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpSendUserDay('u1'))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpIp('1.2.3.4'))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpIpDay('1.2.3.4'))).toBe('1')
    expect(redis._store.has(RedisKey.rateLimitOtpCooldown(hashPhone(UK)))).toBe(true)
    // Raw phone never used as a key.
    for (const key of redis._store.keys()) expect(key).not.toContain('447700900000')
  })

  it('VICTIM NOT BURNED: phone-capped attempts do not grow the phone counters or the global cap', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    for (let i = 0; i < 5; i++) {
      await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
    }
    expect(redis._store.get(RedisKey.rateLimitOtpSend(hashPhone(UK)))).toBe('3') // window not extended
    expect(redis._store.has(RedisKey.rateLimitSmsGlobalDay())).toBe(false) // blocked attempts can't drain the cost cap
    expect(redis._store.has(RedisKey.rateLimitOtpCooldown(hashPhone(UK)))).toBe(false) // cooldown never acquired
  })

  it('ABUSER COUNTS: phone-capped attempts still count against the requester IP', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    for (let i = 0; i < 4; i++) {
      await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
    }
    expect(redis._store.get(RedisKey.rateLimitOtpIp('1.2.3.4'))).toBe('4')
    expect(redis._store.get(RedisKey.rateLimitOtpIpDay('1.2.3.4'))).toBe('4')
  })

  it('cooldown-blocked rapid double-tap does NOT burn the per-phone quota (but counts the IP)', async () => {
    const redis = fakeRedis()
    await consumeSmsSend(redis, otpCtx()) // allowed — acquires the cooldown
    await expect(consumeSmsSend(redis, otpCtx())).rejects.toThrow('OTP_RESEND_COOLDOWN')
    expect(redis._store.get(RedisKey.rateLimitOtpSend(hashPhone(UK)))).toBe('1') // still 1 of 3
    expect(redis._store.get(RedisKey.rateLimitSmsGlobalDay())).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitOtpIp('1.2.3.4'))).toBe('2') // both attempts counted
  })
})

describe('RATE_LIMIT_RELAX', () => {
  it('loosens volume caps in dev but NEVER the country allowlist or global cap', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV is "test" (not production) → relax active
    const sms = await import('../../../src/api/shared/smsLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')

    // A per-phone count of 3 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = fakeRedis({ counts: { [keys.RedisKey.rateLimitOtpSend(sms.hashPhone(UK))]: '3' } })
    await expect(sms.consumeSmsSend(relaxed, { phone: UK, userId: 'u1', ip: '1.2.3.4', scope: 'otp' })).resolves.toBeUndefined()

    // Country allowlist is STILL enforced.
    await expect(sms.consumeSmsSend(fakeRedis(), { phone: US, scope: 'otp' })).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')

    // Global cost cap is STILL enforced.
    const atGlobal = fakeRedis({ counts: { [keys.RedisKey.rateLimitSmsGlobalDay()]: '500' } })
    await expect(sms.consumeSmsSend(atGlobal, { phone: UK, scope: 'otp' })).rejects.toThrow('SMS_GLOBAL_LIMIT')

    vi.resetModules()
  })
})
