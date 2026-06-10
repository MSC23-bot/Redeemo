import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { TestContext } from 'vitest'
import Redis from 'ioredis'
import { consume, shimEval, type LimitSpec } from '../../../src/api/shared/atomicLimiter'

// §SEC.1 (Phase 0 PR-0.2): the atomic limiter's THREE load-bearing properties,
// proven against REAL Redis (a fake cannot prove server-side atomicity):
//   1. NO OVERSHOOT  — N concurrent consume() against one key (limit L) ⇒ exactly L allowed.
//   2. VICTIM NOT BURNED — once a victim key is at cap, blocked attempts do NOT increment it.
//   3. ABUSER COUNTS — every attempt (allowed or blocked) increments the abuser keys.
// Plus: cooldown-in-script precedence, retryAfter, blockedKey reporting, fixed-window
// TTL, and a DIFFERENTIAL suite proving shimEval (the pure-JS mirror behind the
// stateful fake-Redis used by service-level unit tests) behaves EXACTLY like the
// real Lua — so those fakes can never drift from production semantics.
//
// Real Redis on an isolated db (15; the dev app uses db 0). NOTE: queue.test.ts
// uses db 14 — these two real-Redis test files MUST stay on SEPARATE dbs because
// both call flushdb() and vitest runs files in parallel (a shared db flakes).
// Availability is
// probed in beforeAll (no top-level await under module:CommonJS); when no Redis
// is reachable every test dynamically skips (honest skip — never a false green),
// mirroring app.ts's NODE_ENV-gated redis wiring. Once backend CI runs vitest it
// must provide a Redis service, or these skip.

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

let redis: Redis | null = null
let available = false

beforeAll(async () => {
  const client = new Redis(REDIS_URL, { db: 15, lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1 })
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

let seq = 0
function k(name: string): string {
  return `test:al:${seq}:${name}`
}

const spec = (key: string, limit: number, windowSec = 3600): LimitSpec => ({ key, limit, windowSec })

describe('atomicLimiter.consume — real Redis (db 15)', () => {
  beforeEach(async () => {
    seq++
    if (available && redis) await redis.flushdb()
  })

  it('PROPERTY 1 — no overshoot: 50 concurrent attempts at limit 5 ⇒ exactly 5 allowed', async (ctx) => {
    requireRedis(ctx)
    const victim = k('victim')
    const results = await Promise.all(
      Array.from({ length: 50 }, () => consume(redis!, { victimKeys: [spec(victim, 5)] })),
    )
    const allowed = results.filter((r) => r.ok).length
    expect(allowed).toBe(5)
    expect(await redis!.get(victim)).toBe('5') // counter is exactly the allowed count
  })

  it('PROPERTY 2 — victim not burned: blocked attempts do not increment the victim counter', async (ctx) => {
    requireRedis(ctx)
    const victim = k('victim')
    const input = { victimKeys: [spec(victim, 2)] }
    expect((await consume(redis!, input)).ok).toBe(true)
    expect((await consume(redis!, input)).ok).toBe(true)
    for (let i = 0; i < 10; i++) {
      const r = await consume(redis!, input)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.scope).toBe('victim')
    }
    expect(await redis!.get(victim)).toBe('2') // still exactly at cap — window not extended, quota not burned
  })

  it('PROPERTY 3 — abuser counts: every attempt increments the abuser key, even when victim-blocked', async (ctx) => {
    requireRedis(ctx)
    const abuser = k('abuser')
    const victim = k('victim')
    const input = { abuserKeys: [spec(abuser, 100)], victimKeys: [spec(victim, 1)] }
    const results = []
    for (let i = 0; i < 5; i++) results.push(await consume(redis!, input))
    expect(results.filter((r) => r.ok).length).toBe(1)
    expect(await redis!.get(abuser)).toBe('5') // all 5 attempts counted
    expect(await redis!.get(victim)).toBe('1') // only the allowed one counted
  })

  it('abuser cap blocks with scope=abuser and keeps counting (self-harm only)', async (ctx) => {
    requireRedis(ctx)
    const abuser = k('abuser')
    const input = { abuserKeys: [spec(abuser, 3)] }
    const results = []
    for (let i = 0; i < 5; i++) results.push(await consume(redis!, input))
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false])
    const blocked = results[3]
    if (!blocked.ok) {
      expect(blocked.scope).toBe('abuser')
      expect(blocked.blockedKey).toBe(abuser)
      expect(blocked.retryAfter).toBeGreaterThan(0)
    }
    expect(await redis!.get(abuser)).toBe('5')
  })

  it('cooldown: acquired on pass; blocks the rapid second attempt WITHOUT burning the victim', async (ctx) => {
    requireRedis(ctx)
    const abuser = k('abuser')
    const victim = k('victim')
    const cd = k('cooldown')
    const input = {
      abuserKeys: [spec(abuser, 100)],
      victimKeys: [spec(victim, 10)],
      cooldown: { key: cd, ttlSec: 60 },
    }
    expect((await consume(redis!, input)).ok).toBe(true)
    const second = await consume(redis!, input)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.scope).toBe('cooldown')
      expect(second.blockedKey).toBe(cd)
      expect(second.retryAfter).toBeGreaterThan(0)
      expect(second.retryAfter).toBeLessThanOrEqual(60)
    }
    expect(await redis!.get(victim)).toBe('1') // cooldown block did NOT count against the victim
    expect(await redis!.get(abuser)).toBe('2') // ...but DID count the attempt against the abuser
  })

  it('volume errors take precedence over the cooldown (cooldown not consumed on a victim block)', async (ctx) => {
    requireRedis(ctx)
    const victim = k('victim')
    const cd = k('cooldown')
    await redis!.set(victim, '5', 'EX', 3600) // already at cap
    const r = await consume(redis!, {
      victimKeys: [spec(victim, 5)],
      cooldown: { key: cd, ttlSec: 60 },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.scope).toBe('victim')
    expect(await redis!.get(cd)).toBeNull() // cooldown was never acquired
  })

  it('GATE precedence: a capped gate wins the error over a simultaneously-capped abuser, and is NOT burned by the blocked attempt', async (ctx) => {
    requireRedis(ctx)
    const gate = k('global')
    const abuser = k('ip')
    await redis!.set(gate, '500', 'EX', 3600) // platform breaker exhausted
    await redis!.set(abuser, '10', 'EX', 3600) // this IP also at cap
    const r = await consume(redis!, {
      gateKeys: [spec(gate, 500)],
      abuserKeys: [spec(abuser, 10)],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.scope).toBe('gate') // gate precedence — not 'abuser'
      expect(r.blockedKey).toBe(gate)
    }
    expect(await redis!.get(gate)).toBe('500') // gate NOT incremented on a block (anti-DoS)
    expect(await redis!.get(abuser)).toBe('10') // abuser NOT incremented either — gate returns before the abuser phase
  })

  it('GATE counted on allowed; an abuser block does NOT count the gate (anti-DoS on the cost cap)', async (ctx) => {
    requireRedis(ctx)
    const gate = k('global')
    const abuser = k('ip')
    // First send allowed → gate counts to 1.
    expect((await consume(redis!, { gateKeys: [spec(gate, 500)], abuserKeys: [spec(abuser, 1)] })).ok).toBe(true)
    // Second send: abuser now over its cap → blocked at the abuser phase, AFTER the gate check
    // but BEFORE the gate increment, so the gate stays at 1 (a blocked attempt can't drain it).
    const r = await consume(redis!, { gateKeys: [spec(gate, 500)], abuserKeys: [spec(abuser, 1)] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.scope).toBe('abuser')
    expect(await redis!.get(gate)).toBe('1') // gate counted only the allowed send
    expect(await redis!.get(abuser)).toBe('2') // abuser counted both attempts
  })

  it('victim check order = declaration order (first blocking victim key reported)', async (ctx) => {
    requireRedis(ctx)
    const first = k('global')
    const second = k('phone')
    await redis!.set(first, '500', 'EX', 3600)
    await redis!.set(second, '999', 'EX', 3600)
    const r = await consume(redis!, {
      victimKeys: [spec(first, 500), spec(second, 3)],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.blockedKey).toBe(first) // e.g. SMS_GLOBAL_LIMIT precedence over SMS_RATE_LIMITED
  })

  it('fixed window: TTL set on first increment for victim + abuser keys', async (ctx) => {
    requireRedis(ctx)
    const abuser = k('abuser')
    const victim = k('victim')
    await consume(redis!, { abuserKeys: [spec(abuser, 10, 1234)], victimKeys: [spec(victim, 10, 5678)] })
    const at = await redis!.ttl(abuser)
    const vt = await redis!.ttl(victim)
    expect(at).toBeGreaterThan(1200)
    expect(at).toBeLessThanOrEqual(1234)
    expect(vt).toBeGreaterThan(5600)
    expect(vt).toBeLessThanOrEqual(5678)
  })

  it('retryAfter falls back to the blocked key windowSec when the key has no TTL', async (ctx) => {
    requireRedis(ctx)
    const victim = k('victim')
    await redis!.set(victim, '3') // at cap, NO TTL (TTL → -1)
    const r = await consume(redis!, { victimKeys: [spec(victim, 3, 1800)] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryAfter).toBe(1800)
  })

  it('no keys at all ⇒ allowed (degenerate input is a no-op pass)', async (ctx) => {
    requireRedis(ctx)
    expect((await consume(redis!, {})).ok).toBe(true)
  })
})

// ── Differential suite: the shim must behave EXACTLY like the Lua. ────────────
// The shim backs the stateful fake-Redis in service-level tests (e.g.
// tests/api/auth/pwd-reset-limit.test.ts). We run the REAL consume() over a
// shim-backed fake here, so packing + unpacking + semantics are ALL pinned
// against real Redis — fakes can never drift from production behaviour.

describe('shimEval ≡ Lua (differential, via real consume())', () => {
  beforeEach(async () => {
    seq++
    if (available && redis) await redis.flushdb()
  })

  /** A fake ioredis exposing only `eval`, backed by shimEval over a Map. */
  function shimRedis(store: Map<string, string>) {
    return {
      eval: async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
        shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys)),
    } as unknown as Redis
  }

  // Drive the same scenario through consume()-on-real-Redis and
  // consume()-on-shim-fake; compare outcome sequences AND final counter states.
  async function differential(
    label: string,
    input: Parameters<typeof consume>[1],
    attempts: number,
    preset?: Record<string, string>,
  ) {
    // Real side.
    for (const [key, val] of Object.entries(preset ?? {})) await redis!.set(key, val, 'EX', 3600)
    const realResults = []
    for (let i = 0; i < attempts; i++) realResults.push(await consume(redis!, input))

    // Shim side over a fresh Map, through the SAME consume() code path.
    const store = new Map<string, string>(Object.entries(preset ?? {}))
    const fake = shimRedis(store)
    const shimResults = []
    for (let i = 0; i < attempts; i++) shimResults.push(await consume(fake, input))

    expect(shimResults.map((r) => ({ ok: r.ok, scope: r.ok ? null : r.scope, blockedKey: r.ok ? null : r.blockedKey })))
      .toEqual(realResults.map((r) => ({ ok: r.ok, scope: r.ok ? null : r.scope, blockedKey: r.ok ? null : r.blockedKey })))

    // Final counter parity for every limit key.
    for (const s of [...(input.abuserKeys ?? []), ...(input.victimKeys ?? [])]) {
      expect(store.get(s.key) ?? null, `${label}: counter parity for ${s.key}`).toBe(await redis!.get(s.key))
    }
    if (input.cooldown) {
      expect(store.has(input.cooldown.key), `${label}: cooldown parity`).toBe(
        (await redis!.exists(input.cooldown.key)) === 1,
      )
    }
  }

  it('fresh pass-through', async (ctx) => {
    requireRedis(ctx)
    await differential('fresh', { abuserKeys: [spec(k('a'), 10)], victimKeys: [spec(k('v'), 10)] }, 3)
  })

  it('victim cap sequence', async (ctx) => {
    requireRedis(ctx)
    await differential('victim-cap', { abuserKeys: [spec(k('a'), 100)], victimKeys: [spec(k('v'), 2)] }, 6)
  })

  it('abuser cap sequence', async (ctx) => {
    requireRedis(ctx)
    await differential('abuser-cap', { abuserKeys: [spec(k('a'), 3)] }, 6)
  })

  it('cooldown sequence', async (ctx) => {
    requireRedis(ctx)
    await differential('cooldown', { victimKeys: [spec(k('v'), 10)], cooldown: { key: k('cd'), ttlSec: 60 } }, 3)
  })

  it('gate + abuser + victim + cooldown sequence (all four classes)', async (ctx) => {
    requireRedis(ctx)
    await differential(
      'all-classes',
      {
        gateKeys: [spec(k('g'), 4)],
        abuserKeys: [spec(k('a'), 100)],
        victimKeys: [spec(k('v'), 2)],
        cooldown: { key: k('cd'), ttlSec: 60 },
      },
      6,
    )
  })

  it('gate cap sequence (gate precedence + count-on-allowed)', async (ctx) => {
    requireRedis(ctx)
    await differential('gate-cap', { gateKeys: [spec(k('g'), 2)], abuserKeys: [spec(k('a'), 100)] }, 5)
  })

  it('pre-seeded at-cap victim', async (ctx) => {
    requireRedis(ctx)
    const key = k('v')
    await differential('preseeded', { victimKeys: [spec(key, 3)] }, 2, { [key]: '3' })
  })
})
