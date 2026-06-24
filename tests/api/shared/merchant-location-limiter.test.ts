import { describe, it, expect, vi, afterEach } from 'vitest'
import type Redis from 'ioredis'
import {
  consumeMerchantLocationSearch,
  merchantLocationGlobalDailyCap,
} from '../../../src/api/shared/merchantLocationLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// Branches PR-6 (§4e) + blueprint §11.3: the LOCKED pre-live multi-instance-safe
// cap for the merchant Google location flow. Pure unit tests against a stateful
// fake Redis whose `eval` is backed by shimEval — the JS mirror pinned ≡ the real
// Lua by tests/api/shared/atomic-limiter.test.ts. Prod caps apply here
// (RATE_LIMIT_RELAX unset).

const USER = 'ma1'
const MERCHANT = 'm1'
const IP = '9.9.9.9'

function fakeRedis(opts: { counts?: Record<string, string>; ttl?: number } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  const redis = {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), {
        ttlOf: () => opts.ttl ?? 3600,
      })),
  }
  return redis as unknown as Redis & { _store: Map<string, string> }
}

const userDayKey = () => RedisKey.rateLimitMerchantLocSearchUserDay(USER)
const merchantDayKey = () => RedisKey.rateLimitMerchantLocSearchMerchantDay(MERCHANT)
const ipHourKey = () => RedisKey.rateLimitMerchantLocSearchIpHour(IP)
const ipDayKey = () => RedisKey.rateLimitMerchantLocSearchIpDay(IP)
const globalKey = () => RedisKey.rateLimitMerchantLocSearchGlobalDay()

afterEach(() => {
  delete process.env.RATE_LIMIT_RELAX
  delete process.env.MERCHANT_LOCATION_GLOBAL_DAILY_CAP
})

describe('merchantLocationGlobalDailyCap', () => {
  it('defaults to 400 and honours a positive env override', () => {
    expect(merchantLocationGlobalDailyCap()).toBe(400)
    process.env.MERCHANT_LOCATION_GLOBAL_DAILY_CAP = '50'
    expect(merchantLocationGlobalDailyCap()).toBe(50)
    process.env.MERCHANT_LOCATION_GLOBAL_DAILY_CAP = 'nonsense'
    expect(merchantLocationGlobalDailyCap()).toBe(400)
  })
})

describe('consumeMerchantLocationSearch — blocking', () => {
  it('blocks at the per-user daily cap (60) with retryAfter', async () => {
    const redis = fakeRedis({ counts: { [userDayKey()]: '60' }, ttl: 1234 })
    await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
      .rejects.toMatchObject({ code: 'LOCATION_SEARCH_RATE_LIMITED', details: { retryAfter: 1234 } })
  })

  it('blocks at the per-merchant daily cap (120)', async () => {
    const redis = fakeRedis({ counts: { [merchantDayKey()]: '120' } })
    await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
      .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
  })

  it('blocks at the per-IP hourly cap (40)', async () => {
    const redis = fakeRedis({ counts: { [ipHourKey()]: '40' } })
    await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
      .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
  })

  it('blocks at the global daily cost ceiling', async () => {
    const redis = fakeRedis({ counts: { [globalKey()]: '400' } })
    await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
      .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
  })

  it('skips the per-IP caps when no IP is provided', async () => {
    const redis = fakeRedis({ counts: { [ipHourKey()]: '999', [ipDayKey()]: '999' } })
    await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT }))
      .resolves.toBeUndefined()
  })
})

describe('consumeMerchantLocationSearch — counting (§SEC.1 semantics)', () => {
  it('an allowed search counts user + merchant + IP + global keys', async () => {
    const redis = fakeRedis()
    await consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP })
    expect(redis._store.get(userDayKey())).toBe('1')
    expect(redis._store.get(merchantDayKey())).toBe('1')
    expect(redis._store.get(ipHourKey())).toBe('1')
    expect(redis._store.get(ipDayKey())).toBe('1')
    expect(redis._store.get(globalKey())).toBe('1')
  })

  it('VICTIM NOT BURNED: blocked attempts do not grow the per-user / per-merchant counters', async () => {
    const redis = fakeRedis({ counts: { [userDayKey()]: '60' } })
    for (let i = 0; i < 3; i++) {
      await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
        .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
    }
    expect(redis._store.get(userDayKey())).toBe('60') // untouched
    expect(redis._store.has(merchantDayKey())).toBe(false) // never counted on a blocked attempt
  })

  it('ABUSER COUNTS: user-blocked attempts still count against the requester IP', async () => {
    const redis = fakeRedis({ counts: { [userDayKey()]: '60' } })
    for (let i = 0; i < 4; i++) {
      await expect(consumeMerchantLocationSearch(redis, { userId: USER, merchantId: MERCHANT, ip: IP }))
        .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
    }
    expect(redis._store.get(ipHourKey())).toBe('4') // every attempt counted against the abuser
  })
})

describe('RATE_LIMIT_RELAX guardrail', () => {
  it('loosens caps in dev but the limiter still functions', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV "test" (not production) -> relax active
    const mod = await import('../../../src/api/shared/merchantLocationLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')
    // A per-user count of 60 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = fakeRedis({ counts: { [keys.RedisKey.rateLimitMerchantLocSearchUserDay(USER)]: '60' } })
    await expect(mod.consumeMerchantLocationSearch(relaxed, { userId: USER, merchantId: MERCHANT, ip: IP }))
      .resolves.toBeUndefined()
    vi.resetModules()
  })

  it('does NOT loosen the env-driven global cost ceiling even when RATE_LIMIT_RELAX=true', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true'
    try {
      const mod = await import('../../../src/api/shared/merchantLocationLimiter')
      const keys = await import('../../../src/api/shared/redis-keys')
      // The global daily ceiling is NOT relaxed by RATE_LIMIT_RELAX (env-driven, always on).
      const atGlobal = fakeRedis({ counts: { [keys.RedisKey.rateLimitMerchantLocSearchGlobalDay()]: '400' } })
      await expect(mod.consumeMerchantLocationSearch(atGlobal, { userId: USER, merchantId: MERCHANT, ip: IP }))
        .rejects.toThrow('LOCATION_SEARCH_RATE_LIMITED')
    } finally {
      vi.resetModules()
    }
  })
})
