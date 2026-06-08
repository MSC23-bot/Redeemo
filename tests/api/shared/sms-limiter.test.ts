import { describe, it, expect, vi, afterEach } from 'vitest'
import type Redis from 'ioredis'
import {
  assertSmsSendAllowed,
  recordSmsSend,
  isAllowedSmsDestination,
  isE164Format,
  hashPhone,
} from '../../../src/api/shared/smsLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// SEC-H3 (Gate-PR-7): SMS/OTP toll-fraud controls. Pure unit tests against a
// mock Redis — no DB, no Twilio. Prod caps apply here (RATE_LIMIT_RELAX unset).

const UK = '+447700900000'
const US = '+12025550100'

function mockRedis(opts: { counts?: Record<string, string>; cooldownHeld?: boolean; ttl?: number } = {}): Redis {
  const counts = opts.counts ?? {}
  return {
    get: vi.fn(async (key: string) => counts[key] ?? null),
    // SET … NX returns null when the key already exists (cooldown held), else 'OK'.
    set: vi.fn(async () => (opts.cooldownHeld ? null : 'OK')),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => opts.ttl ?? 30),
  } as unknown as Redis
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

describe('assertSmsSendAllowed', () => {
  it('blocks a non-allowed country before touching Redis', async () => {
    const redis = mockRedis()
    await expect(assertSmsSendAllowed(redis, otpCtx({ phone: US }))).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')
    expect(redis.get).not.toHaveBeenCalled()
  })

  it('hard-blocks at the global daily cap (SMS_GLOBAL_LIMIT) with retryAfter', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitSmsGlobalDay()]: '500' }, ttl: 3600 })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toMatchObject({ code: 'SMS_GLOBAL_LIMIT', details: { retryAfter: 3600 } })
  })

  it('blocks at the per-phone hourly cap (3)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-user hourly cap (5)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitOtpSendUser('u1')]: '5' } })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-IP hourly cap (10)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitOtpIp('1.2.3.4')]: '10' } })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('blocks at the per-IP daily cap (20)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitOtpIpDay('1.2.3.4')]: '20' } })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('enforces the resend cooldown (SET NX held) with retryAfter', async () => {
    const redis = mockRedis({ cooldownHeld: true, ttl: 30 })
    await expect(assertSmsSendAllowed(redis, otpCtx())).rejects.toMatchObject({ code: 'OTP_RESEND_COOLDOWN', details: { retryAfter: 30 } })
  })

  it('allows a legitimate first send (fresh number, IP, all counters empty) and acquires the cooldown', async () => {
    const redis = mockRedis() // all get → null, set NX → 'OK'
    await expect(assertSmsSendAllowed(redis, otpCtx())).resolves.toBeUndefined()
    // cooldown SET NX was attempted on the hashed-phone key.
    expect(redis.set).toHaveBeenCalledWith(RedisKey.rateLimitOtpCooldown(hashPhone(UK)), '1', 'EX', expect.any(Number), 'NX')
  })

  it('branchPin scope is gated by the per-branch daily cap (10)', async () => {
    const redis = mockRedis({ counts: { [RedisKey.rateLimitBranchPinDay('b1')]: '10' } })
    await expect(assertSmsSendAllowed(redis, { phone: UK, scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('branchPin is ALSO gated by the per-phone and per-IP caps (billable SMS path)', async () => {
    const byPhone = mockRedis({ counts: { [RedisKey.rateLimitOtpSend(hashPhone(UK))]: '3' } })
    await expect(assertSmsSendAllowed(byPhone, { phone: UK, ip: '1.2.3.4', scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
    const byIp = mockRedis({ counts: { [RedisKey.rateLimitOtpIp('1.2.3.4')]: '10' } })
    await expect(assertSmsSendAllowed(byIp, { phone: UK, ip: '1.2.3.4', scope: 'branchPin', branchId: 'b1' })).rejects.toThrow('SMS_RATE_LIMITED')
  })

  it('rejects a non-E.164 number before any Redis call', async () => {
    const redis = mockRedis()
    await expect(assertSmsSendAllowed(redis, otpCtx({ phone: '07700900000' }))).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')
    expect(redis.get).not.toHaveBeenCalled()
  })
})

describe('recordSmsSend', () => {
  it('increments the global cap + per-phone/user/IP counters for an otp send', async () => {
    const redis = mockRedis()
    await recordSmsSend(redis, otpCtx())
    // global + phoneHour + phoneDay + userHour + userDay + ipHour + ipDay = 7 incrs
    expect((redis.incr as any).mock.calls.length).toBe(7)
    expect(redis.incr).toHaveBeenCalledWith(RedisKey.rateLimitSmsGlobalDay())
    expect(redis.incr).toHaveBeenCalledWith(RedisKey.rateLimitOtpSend(hashPhone(UK)))
    // raw phone never used as a key
    for (const [key] of (redis.incr as any).mock.calls) expect(key).not.toContain('447700900000')
  })

  it('sets a TTL only on the first increment (fixed window)', async () => {
    const redis = mockRedis()
    await recordSmsSend(redis, { phone: UK, scope: 'branchPin', branchId: 'b1' })
    // branchPin (no IP): global + phoneHour + phoneDay + branchPinDay = 4 incrs → 4 expires
    expect((redis.expire as any).mock.calls.length).toBe(4)
  })
})

describe('RATE_LIMIT_RELAX', () => {
  it('loosens volume caps in dev but NEVER the country allowlist or global cap', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV is "test" (not production) → relax active
    const sms = await import('../../../src/api/shared/smsLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')

    // A per-phone count of 3 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = mockRedis({ counts: { [keys.RedisKey.rateLimitOtpSend(sms.hashPhone(UK))]: '3' } })
    await expect(sms.assertSmsSendAllowed(relaxed, { phone: UK, userId: 'u1', ip: '1.2.3.4', scope: 'otp' })).resolves.toBeUndefined()

    // Country allowlist is STILL enforced.
    await expect(sms.assertSmsSendAllowed(mockRedis(), { phone: US, scope: 'otp' })).rejects.toThrow('SMS_DESTINATION_NOT_ALLOWED')

    // Global cost cap is STILL enforced.
    const atGlobal = mockRedis({ counts: { [keys.RedisKey.rateLimitSmsGlobalDay()]: '500' } })
    await expect(sms.assertSmsSendAllowed(atGlobal, { phone: UK, scope: 'otp' })).rejects.toThrow('SMS_GLOBAL_LIMIT')

    vi.resetModules()
  })
})
