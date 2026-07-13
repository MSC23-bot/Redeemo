import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import { consumeEmailSend, emailGlobalDailyCap, type EmailSendContext } from '../../../src/api/shared/emailLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { hashEmail } from '../../../src/api/shared/pwdResetLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// §SEC.1 closure (plan 2026-07-10, GAP-1..GAP-4): the email send limiter.
// Mirrors sms-limiter.test.ts (stateful shim-fake for tier logic; prod caps,
// RATE_LIMIT_RELAX unset) PLUS atomic-limiter.test.ts (real Redis for the
// concurrency + gate-not-consumed pins that a fake cannot prove).
//
// Real Redis on an isolated db (11; the dev app uses db 0). NOTE: other
// real-Redis test files claim dbs 12 (merchant-logout-durability), 13
// (merchant-atomic-rotate), 14 (queue), 15 (atomic-limiter): every flushdb()
// suite MUST have its OWN db because vitest runs files in parallel (a shared db
// flakes). Availability is probed in beforeAll; when no Redis is reachable the
// real-Redis tests dynamically skip (honest skip: never a false green).
//
// §SEC.1 classification: global = GATE (checked first, counted only on allowed:
// anti-DoS on the cost cap); per-IP hour/day = ABUSER (every attempt counts);
// per-(type,addr) + aggregate addr hour/day + per-account day = VICTIM (counted
// only on allowed).

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const ADDR = 'maya@example.com'
const EH = hashEmail(ADDR)

const baseCtx = (over: Partial<EmailSendContext> = {}): EmailSendContext => ({
  emailHash: EH,
  type: 'password_reset',
  recipientType: 'USER',
  recipientId: 'user-1',
  ip: '1.2.3.4',
  ...over,
})

// ── Part 1: tier logic over the stateful shim-fake (≡ Lua, pinned by the
// atomic-limiter differential suite). Prod caps apply (RATE_LIMIT_RELAX unset).

/** Stateful fake: counters accumulate across calls; eval delegates to shimEval. */
function fakeRedis(opts: { counts?: Record<string, string>; ttl?: number } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  const redis = {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), {
        ttlOf: () => opts.ttl ?? 30,
      })),
  }
  return redis as unknown as Redis & { _store: Map<string, string> }
}

afterEach(() => {
  delete process.env.EMAIL_GLOBAL_DAILY_CAP
  delete process.env.RATE_LIMIT_RELAX
})

describe('emailGlobalDailyCap: env posture (mirrors SMS_GLOBAL_DAILY_CAP)', () => {
  it('defaults to 2000 when the env var is absent (safe default: no deploy breaks)', () => {
    delete process.env.EMAIL_GLOBAL_DAILY_CAP
    expect(emailGlobalDailyCap()).toBe(2000)
  })
  it('honours a valid override', () => {
    process.env.EMAIL_GLOBAL_DAILY_CAP = '5000'
    expect(emailGlobalDailyCap()).toBe(5000)
  })
  it('falls back to the default on garbage / zero / negative values', () => {
    process.env.EMAIL_GLOBAL_DAILY_CAP = 'not-a-number'
    expect(emailGlobalDailyCap()).toBe(2000)
    process.env.EMAIL_GLOBAL_DAILY_CAP = '0'
    expect(emailGlobalDailyCap()).toBe(2000)
    process.env.EMAIL_GLOBAL_DAILY_CAP = '-5'
    expect(emailGlobalDailyCap()).toBe(2000)
  })
})

describe('consumeEmailSend: per-tier blocking (prod caps)', () => {
  it('GAP-1: hard-blocks at the global daily gate with scope=gate', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailGlobalDay()]: '2000' }, ttl: 3600 })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.scope).toBe('gate')
      expect(r.blockedKey).toBe(RedisKey.rateLimitEmailGlobalDay())
      expect(r.retryAfter).toBe(3600)
    }
  })

  it('per-(type,address) 5/hr blocks (the pre-existing control, preserved)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailSend('password_reset', EH)]: '5' } })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.scope).toBe('victim')
      expect(r.blockedKey).toBe(RedisKey.rateLimitEmailSend('password_reset', EH))
    }
  })

  it('GAP-2: aggregate per-address HOURLY cap (10) blocks across types', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAddrHour(EH)]: '10' } })
    const r = await consumeEmailSend(redis, baseCtx({ type: 'admin_otp' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.blockedKey).toBe(RedisKey.rateLimitEmailAddrHour(EH))
  })

  it('GAP-2: aggregate per-address DAILY cap (20) blocks across types', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAddrDay(EH)]: '20' } })
    const r = await consumeEmailSend(redis, baseCtx({ type: 'merchant_claim' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.blockedKey).toBe(RedisKey.rateLimitEmailAddrDay(EH))
  })

  it('GAP-3: per-account daily cap (20) blocks on the recipient identity', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAcctDay('USER', 'user-1')]: '20' } })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.blockedKey).toBe(RedisKey.rateLimitEmailAcctDay('USER', 'user-1'))
  })

  it('GAP-4: per-IP HOURLY cap (50) blocks with scope=abuser', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailIpHour('1.2.3.4')]: '50' } })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.scope).toBe('abuser')
      expect(r.blockedKey).toBe(RedisKey.rateLimitEmailIpHour('1.2.3.4'))
    }
  })

  it('per-IP DAILY cap (200) blocks (the pre-existing control, preserved)', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailIpDay('1.2.3.4')]: '200' } })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.scope).toBe('abuser')
      expect(r.blockedKey).toBe(RedisKey.rateLimitEmailIpDay('1.2.3.4'))
    }
  })

  it('GAP-2 intent: type-cycling cannot exceed the aggregate hourly address cap', async () => {
    // 10 allowed sends of 10 DIFFERENT types to one inbox exhaust addrHour (10),
    // even though each per-type key is far below its own 5/hr cap.
    const redis = fakeRedis()
    for (let i = 0; i < 10; i++) {
      const r = await consumeEmailSend(redis, baseCtx({ type: `type_${i}` }))
      expect(r.ok).toBe(true)
    }
    const blocked = await consumeEmailSend(redis, baseCtx({ type: 'type_fresh' }))
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.blockedKey).toBe(RedisKey.rateLimitEmailAddrHour(EH))
  })

  it('no IP in ctx: the IP tiers are skipped, everything else still applies', async () => {
    const redis = fakeRedis()
    const r = await consumeEmailSend(redis, baseCtx({ ip: null }))
    expect(r.ok).toBe(true)
    expect(redis._store.has(RedisKey.rateLimitEmailIpHour('1.2.3.4'))).toBe(false)
    expect(redis._store.has(RedisKey.rateLimitEmailIpDay('1.2.3.4'))).toBe(false)
    expect(redis._store.get(RedisKey.rateLimitEmailGlobalDay())).toBe('1')
  })
})

describe('consumeEmailSend: precedence (gate > abuser > victim)', () => {
  it('gate block wins over a simultaneously-capped victim key', async () => {
    const redis = fakeRedis({
      counts: {
        [RedisKey.rateLimitEmailGlobalDay()]: '2000',
        [RedisKey.rateLimitEmailSend('password_reset', EH)]: '5',
      },
    })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.scope).toBe('gate')
  })

  it('abuser block wins over a simultaneously-capped victim key', async () => {
    const redis = fakeRedis({
      counts: {
        [RedisKey.rateLimitEmailIpHour('1.2.3.4')]: '50',
        [RedisKey.rateLimitEmailSend('password_reset', EH)]: '5',
      },
    })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.scope).toBe('abuser')
  })

  it('victim declaration order: per-type reported before aggregate-address', async () => {
    const redis = fakeRedis({
      counts: {
        [RedisKey.rateLimitEmailSend('password_reset', EH)]: '5',
        [RedisKey.rateLimitEmailAddrHour(EH)]: '10',
      },
    })
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.blockedKey).toBe(RedisKey.rateLimitEmailSend('password_reset', EH))
  })
})

describe('consumeEmailSend: counting (§SEC.1 victim/abuser semantics)', () => {
  it('an allowed send counts the gate, both IP tiers, and all four victim keys', async () => {
    const redis = fakeRedis()
    const r = await consumeEmailSend(redis, baseCtx())
    expect(r.ok).toBe(true)
    expect(redis._store.get(RedisKey.rateLimitEmailGlobalDay())).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailIpHour('1.2.3.4'))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailIpDay('1.2.3.4'))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailSend('password_reset', EH))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailAddrHour(EH))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailAddrDay(EH))).toBe('1')
    expect(redis._store.get(RedisKey.rateLimitEmailAcctDay('USER', 'user-1'))).toBe('1')
    // Raw address never used as a key (only the hash).
    for (const key of redis._store.keys()) expect(key).not.toContain(ADDR)
  })

  it('VICTIM NOT BURNED: address-capped attempts do not grow the victim counters or the global gate', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAddrHour(EH)]: '10' } })
    for (let i = 0; i < 5; i++) {
      const r = await consumeEmailSend(redis, baseCtx())
      expect(r.ok).toBe(false)
    }
    expect(redis._store.get(RedisKey.rateLimitEmailAddrHour(EH))).toBe('10') // window not extended
    expect(redis._store.has(RedisKey.rateLimitEmailGlobalDay())).toBe(false) // blocked attempts cannot drain the cost cap
    expect(redis._store.has(RedisKey.rateLimitEmailAcctDay('USER', 'user-1'))).toBe(false)
  })

  it('ABUSER COUNTS: victim-capped attempts still count against the requester IP', async () => {
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAddrHour(EH)]: '10' } })
    for (let i = 0; i < 4; i++) {
      const r = await consumeEmailSend(redis, baseCtx())
      expect(r.ok).toBe(false)
    }
    expect(redis._store.get(RedisKey.rateLimitEmailIpHour('1.2.3.4'))).toBe('4')
    expect(redis._store.get(RedisKey.rateLimitEmailIpDay('1.2.3.4'))).toBe('4')
  })
})

describe('RATE_LIMIT_RELAX', () => {
  it('loosens the volume caps in dev but NEVER the global gate', async () => {
    vi.resetModules()
    process.env.RATE_LIMIT_RELAX = 'true' // NODE_ENV is "test" (not production) → relax active
    const el = await import('../../../src/api/shared/emailLimiter')
    const keys = await import('../../../src/api/shared/redis-keys')

    // An aggregate-address count of 10 (the prod cap) no longer blocks under relaxed caps.
    const relaxed = fakeRedis({ counts: { [keys.RedisKey.rateLimitEmailAddrHour(EH)]: '10' } })
    expect((await el.consumeEmailSend(relaxed, baseCtx())).ok).toBe(true)

    // A per-type count of 5 (the prod cap) no longer blocks either.
    const relaxedType = fakeRedis({ counts: { [keys.RedisKey.rateLimitEmailSend('password_reset', EH)]: '5' } })
    expect((await el.consumeEmailSend(relaxedType, baseCtx())).ok).toBe(true)

    // The global cost gate is STILL enforced.
    const atGlobal = fakeRedis({ counts: { [keys.RedisKey.rateLimitEmailGlobalDay()]: '2000' } })
    const r = await el.consumeEmailSend(atGlobal, baseCtx())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.scope).toBe('gate')

    vi.resetModules()
  })
})

// ── Part 2: real-Redis pins (db 11): atomicity + gate anti-DoS, which a fake
// cannot prove. Mirrors atomic-limiter.test.ts conventions (probe, honest skip,
// flushdb per test on the suite's OWN db).

let redis: Redis | null = null
let available = false

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 11, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
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

/** Dynamically skip the current test when Redis is unreachable. */
function requireRedis(ctx: TestContext): void {
  if (!available) ctx.skip()
}

describe('consumeEmailSend: real Redis (db 11)', () => {
  beforeEach(async () => {
    if (available && redis) await redis.flushdb()
  })

  it('CONCURRENCY PIN: N concurrent sends at an account cap of K allow exactly K', async (ctx) => {
    requireRedis(ctx)
    // The per-account daily cap (20) is the tightest tier hit here: 50 concurrent
    // sends from distinct IPs/types to one account must allow EXACTLY 20 (no
    // overshoot: the whole check-and-count is one Lua script).
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        consumeEmailSend(redis!, baseCtx({ type: `type_${i}`, emailHash: hashEmail(`addr${i}@example.com`), ip: `10.0.0.${i}` })),
      ),
    )
    const allowed = results.filter((r) => r.ok).length
    expect(allowed).toBe(20)
    expect(await redis!.get(RedisKey.rateLimitEmailAcctDay('USER', 'user-1'))).toBe('20')
    // The global gate counted ONLY the allowed sends.
    expect(await redis!.get(RedisKey.rateLimitEmailGlobalDay())).toBe('20')
  })

  it('ANTI-DoS PIN: blocked attempts do NOT consume the global gate', async (ctx) => {
    requireRedis(ctx)
    // One allowed send, then cap the address tier and hammer: the gate must stay at 1.
    expect((await consumeEmailSend(redis!, baseCtx())).ok).toBe(true)
    await redis!.set(RedisKey.rateLimitEmailAddrHour(EH), '10', 'EX', 3600)
    for (let i = 0; i < 10; i++) {
      expect((await consumeEmailSend(redis!, baseCtx({ type: `t${i}` }))).ok).toBe(false)
    }
    expect(await redis!.get(RedisKey.rateLimitEmailGlobalDay())).toBe('1')
  })

  it('GATE PIN: at the global cap every send blocks with scope=gate and the gate is not incremented', async (ctx) => {
    requireRedis(ctx)
    process.env.EMAIL_GLOBAL_DAILY_CAP = '3'
    try {
      for (let i = 0; i < 3; i++) {
        expect((await consumeEmailSend(redis!, baseCtx({ type: `t${i}` }))).ok).toBe(true)
      }
      const r = await consumeEmailSend(redis!, baseCtx({ type: 't99' }))
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.scope).toBe('gate')
        expect(r.blockedKey).toBe(RedisKey.rateLimitEmailGlobalDay())
      }
      expect(await redis!.get(RedisKey.rateLimitEmailGlobalDay())).toBe('3')
    } finally {
      delete process.env.EMAIL_GLOBAL_DAILY_CAP
    }
  })
})
