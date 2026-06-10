import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type Redis from 'ioredis'
import { buildApp } from '../../../src/api/app'
import { forgotPasswordCustomer } from '../../../src/api/auth/customer/service'
import { forgotPasswordMerchant } from '../../../src/api/auth/merchant/service'
import { forgotPasswordAdmin } from '../../../src/api/auth/admin/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { hashEmail } from '../../../src/api/shared/pwdResetLimiter'
import { shimEval } from '../../../src/api/shared/atomicLimiter'

// SEC-H4 (Gate-PR-8): the password-reset limiter wired into all three
// reset-request services + routes. The limiter's own logic is unit-tested in
// tests/api/shared/pwd-reset-limiter.test.ts; here we prove the wiring:
//   - same response shape for existing vs non-existing emails (no enumeration)
//   - repeated requests hit the limiter, identically regardless of existence
//   - reset-token creation still works under the cap
// Prod caps apply (RATE_LIMIT_RELAX unset → per-email 3/hr, 5/day; per-IP 10/day).

const EXISTING = 'real@example.com'
const MISSING = 'ghost@example.com'
const IP = '9.9.9.9'

/** Stateful in-memory Redis so fixed-window counters accumulate across calls.
 *  `eval` is backed by shimEval — the §SEC.1 atomic-limiter JS mirror, pinned
 *  ≡ the real Lua by tests/api/shared/atomic-limiter.test.ts. */
function fakeRedis() {
  const store = new Map<string, string>()
  const redis = {
    _store: store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, String(v)); return 'OK' }),
    incr: vi.fn(async (k: string) => {
      const n = (parseInt(store.get(k) ?? '0', 10) || 0) + 1
      store.set(k, String(n))
      return n
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 1800),
    del: vi.fn(async (k: string) => { store.delete(k); return 1 }),
    keys: vi.fn(async () => []),
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), { ttlOf: () => 1800 })),
  }
  return redis as unknown as Redis & { _store: Map<string, string> }
}

// One row per role: the service fn, the Prisma model it queries, and the role
// string used in the reset-token Redis key + the HTTP route URL.
const ROLES = [
  { name: 'customer', fn: forgotPasswordCustomer, model: 'user',          role: 'customer', url: '/api/v1/customer/auth/forgot-password' },
  { name: 'merchant', fn: forgotPasswordMerchant, model: 'merchantAdmin', role: 'merchant', url: '/api/v1/merchant/auth/forgot-password' },
  { name: 'admin',    fn: forgotPasswordAdmin,    model: 'adminUser',     role: 'admin',    url: '/api/v1/admin/auth/forgot-password' },
] as const

function mockPrisma(model: string, knownEmail: string | null) {
  return {
    [model]: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        knownEmail !== null && where.email === knownEmail ? { id: `${model}-id-1` } : null,
      ),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any
}

function tokenKeys(store: Map<string, string>, role: string) {
  return [...store.keys()].filter((k) => k.startsWith(`pwd-reset:${role}:`))
}

// ── Service-level: full control, no HTTP edge tier in the way. ───────────────
describe.each(ROLES)('forgotPassword$name — SEC-H4 limiter (service)', ({ fn, model, role }) => {
  it('first request succeeds with the SAME shape for existing and non-existing emails', async () => {
    const a = fakeRedis()
    await expect(fn(mockPrisma(model, EXISTING) as any, a as any, EXISTING, IP)).resolves.toBeUndefined()
    expect(tokenKeys(a._store, role).length).toBe(1) // existing → reset token created

    const b = fakeRedis()
    await expect(fn(mockPrisma(model, EXISTING) as any, b as any, MISSING, IP)).resolves.toBeUndefined()
    expect(tokenKeys(b._store, role).length).toBe(0) // non-existing → no token, but same void return
  })

  it('reset-token creation still works when under the cap', async () => {
    const redis = fakeRedis()
    await fn(mockPrisma(model, EXISTING) as any, redis as any, EXISTING, IP)
    const key = tokenKeys(redis._store, role)[0]
    expect(key).toBeTruthy()
    expect(redis._store.get(key)).toBe(`${model}-id-1`) // token maps to the resolved account id
  })

  it('records a NON-existing email toward the per-email cap (counts before the lookup)', async () => {
    const redis = fakeRedis()
    await fn(mockPrisma(model, EXISTING) as any, redis as any, MISSING, IP)
    expect(redis._store.get(RedisKey.rateLimitPwdReset(hashEmail(MISSING)))).toBe('1')
  })

  it('repeated requests hit the limiter — 4th throws after the 3/hr per-email cap (existing)', async () => {
    const redis = fakeRedis()
    const prisma = mockPrisma(model, EXISTING)
    await fn(prisma as any, redis as any, EXISTING, IP)
    await fn(prisma as any, redis as any, EXISTING, IP)
    await fn(prisma as any, redis as any, EXISTING, IP)
    await expect(fn(prisma as any, redis as any, EXISTING, IP)).rejects.toMatchObject({ code: 'PWD_RESET_RATE_LIMITED' })
  })

  it('limiter behaviour is IDENTICAL at every request count regardless of existence (no enumeration)', async () => {
    const run = async (knownEmail: string | null, email: string) => {
      const redis = fakeRedis()
      const prisma = mockPrisma(model, knownEmail)
      const outcomes: string[] = []
      for (let i = 0; i < 4; i++) {
        try { await fn(prisma as any, redis as any, email, IP); outcomes.push('ok') }
        catch (e: any) { outcomes.push(e.code) }
      }
      return outcomes
    }
    const existing = await run(EXISTING, EXISTING)
    const missing = await run(null, MISSING)
    expect(existing).toEqual(['ok', 'ok', 'ok', 'PWD_RESET_RATE_LIMITED'])
    expect(missing).toEqual(existing) // identical at every index → existence never leaks
  })
})

// ── Route-level: end-to-end through buildApp (proves req.ip wiring + envelope). ─
describe.each(ROLES)('POST $url — SEC-H4 limiter (route)', ({ model, role, url }) => {
  let app: FastifyInstance
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(async () => {
    app = await buildApp()
    redis = fakeRedis()
    app.decorate('prisma', mockPrisma(model, EXISTING))
    app.decorate('redis', redis as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const post = (email: string) => app.inject({ method: 'POST', url, payload: { email } })
  const GENERIC = 'If that email is registered, a reset link has been sent.'

  it('returns 200 with the SAME generic message for existing and non-existing emails', async () => {
    const existing = await post(EXISTING)
    const missing = await post(MISSING)
    expect(existing.statusCode).toBe(200)
    expect(missing.statusCode).toBe(200)
    expect(JSON.parse(existing.body)).toEqual({ message: GENERIC })
    expect(JSON.parse(missing.body)).toEqual({ message: GENERIC }) // byte-identical → no enumeration
    expect(tokenKeys(redis._store, role).length).toBe(1) // only the existing email minted a token
  })

  it('returns 429 PWD_RESET_RATE_LIMITED (with retryAfter) once the per-email cap is met — same for existing + non-existing', async () => {
    // Pre-seed both emails' hourly counter AT the cap so the FIRST request trips
    // MY limiter (the in-memory @fastify/rate-limit per-IP tier sees only 1-2
    // requests, well under 3/hr, so it never shadows this).
    redis._store.set(RedisKey.rateLimitPwdReset(hashEmail(EXISTING)), '3')
    redis._store.set(RedisKey.rateLimitPwdReset(hashEmail(MISSING)), '3')

    const existing = await post(EXISTING)
    const missing = await post(MISSING)

    expect(existing.statusCode).toBe(429)
    expect(missing.statusCode).toBe(429)
    const eb = JSON.parse(existing.body)
    const mb = JSON.parse(missing.body)
    expect(eb.error.code).toBe('PWD_RESET_RATE_LIMITED')
    expect(mb.error.code).toBe('PWD_RESET_RATE_LIMITED')
    expect(eb.error.retryAfter).toBe(1800)
    expect(eb).toEqual(mb) // identical envelope → the limiter never reveals existence
  })
})
