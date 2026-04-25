import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Redis from 'ioredis'
import {
  checkOtpRateLimit, recordOtpSend,
  checkOtpUserRateLimit, recordOtpUserSend,
} from '../../../src/api/shared/otp'

function makeRedis(getResult: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(getResult),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  } as unknown as Redis
}

describe('OTP rate limiting', () => {
  it('allows send when under limit', async () => {
    const redis = makeRedis('2') // 2 sends so far
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(true)
  })

  it('blocks send when at limit (3)', async () => {
    const redis = makeRedis('3')
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(false)
  })

  it('allows send when no prior sends (null)', async () => {
    const redis = makeRedis(null)
    const allowed = await checkOtpRateLimit(redis, '+447700900000')
    expect(allowed).toBe(true)
  })

  it('records an OTP send with TTL', async () => {
    const redis = makeRedis()
    await recordOtpSend(redis, '+447700900000')
    expect(redis.incr).toHaveBeenCalled()
    expect(redis.expire).toHaveBeenCalled()
  })

  it('per-user: allows send when under limit (5)', async () => {
    const redis = makeRedis('4')
    expect(await checkOtpUserRateLimit(redis, 'u1')).toBe(true)
  })

  it('per-user: blocks send when at limit (5)', async () => {
    const redis = makeRedis('5')
    expect(await checkOtpUserRateLimit(redis, 'u1')).toBe(false)
  })

  it('per-user: allows send when no prior sends (null)', async () => {
    const redis = makeRedis(null)
    expect(await checkOtpUserRateLimit(redis, 'u1')).toBe(true)
  })

  it('per-user: records a send with TTL', async () => {
    const redis = makeRedis()
    await recordOtpUserSend(redis, 'u1')
    expect(redis.incr).toHaveBeenCalled()
    expect(redis.expire).toHaveBeenCalled()
  })
})
