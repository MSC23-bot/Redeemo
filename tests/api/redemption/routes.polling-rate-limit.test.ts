import { describe, it, expect, vi } from 'vitest'
import { customerRedemptionRoutes } from '../../../src/api/redemption/routes'
import { routeRateLimit } from '../../../src/api/plugins/rate-limit'

// Per-customer rate limit on GET /api/v1/redemption/me/:code (locked
// 2026-05-09 from deferred-followups §AG1 — post-PR-#49 pre-public-
// launch hardening). The Show-to-Staff polling hook hits this endpoint
// at a 5 s cadence for up to a 15-min budget = ~180 hits/session.
// Legitimate cadence is ~12 req/min; the route's `redemptionPolling`
// tier sets 30/min in prod (100/min in dev) and keys on `req.user.sub`
// so shared-Wi-Fi / NAT environments don't collectively punish multiple
// customers. We pin the route-config shape here without spinning a
// full Fastify app — the rate-limit plugin behaviour itself is owned
// by `@fastify/rate-limit` and is exercised by the auth-suite OTP
// rate-limit integration test (tests/api/auth/customer.test.ts:369).

type RouteCall = [
  path: string,
  optsOrHandler: unknown,
  handlerOrUndefined?: unknown,
]

function captureRoutes() {
  const get  = vi.fn()
  const post = vi.fn()
  return { get, post, app: { get, post } as any }
}

function findGetCallFor(get: ReturnType<typeof vi.fn>, path: string): RouteCall | undefined {
  return (get.mock.calls as RouteCall[]).find((c) => c[0] === path)
}

describe('redemptionPolling rate-limit tier', () => {
  it('exists with sensible per-customer max + 1-minute window', () => {
    const tier = routeRateLimit('redemptionPolling')
    // Prod = 30/min; dev (RATE_LIMIT_RELAX) = 100/min. We don't know
    // which path the test runner is on, but both should be a positive
    // integer and the timeWindow should be the 1-minute string used
    // throughout the rate-limit plugin.
    expect(tier.max).toBeGreaterThanOrEqual(30)
    expect(tier.max).toBeLessThanOrEqual(100)
    expect(tier.timeWindow).toBe('1 minute')
  })

  it('prod ceiling is comfortably above legitimate poll cadence (12 req/min)', () => {
    // Legitimate: 5 s cadence × 60 s = 12 req/min. The chosen prod
    // ceiling MUST be ≥ ~25 to leave headroom for retries / jitter
    // / brief reconnects without false-positiving real users. If a
    // future tweak drops below this, the test fails so the ceiling
    // change is conscious. (Dev mode skips this check by short-
    // circuiting on RELAX env.)
    if (process.env.RATE_LIMIT_RELAX === 'true') return
    const tier = routeRateLimit('redemptionPolling')
    expect(tier.max).toBeGreaterThanOrEqual(25)
  })
})

describe('customerRedemptionRoutes — GET /redemption/me/:code rate-limit config', () => {
  it('attaches a route-level rateLimit config to the polling endpoint', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)

    const call = findGetCallFor(get, '/api/v1/redemption/me/:code')
    expect(call).toBeDefined()
    // The 3-arg form is `app.get(path, opts, handler)` — when a route
    // carries a `config` object, Fastify accepts it as the 2nd arg.
    // No config = 2-arg `app.get(path, handler)` only.
    expect(call!.length).toBe(3)

    const opts = call![1] as { config?: { rateLimit?: unknown } }
    expect(opts).toBeDefined()
    expect(opts.config).toBeDefined()
    expect(opts.config!.rateLimit).toBeDefined()
  })

  it("uses hook: 'preHandler' so the rate-limit runs AFTER customer auth (req.user.sub populated)", async () => {
    // **Load-bearing pin.** `@fastify/rate-limit` defaults to
    // hook: 'onRequest', which runs BEFORE the authenticateCustomer
    // preHandler (installed in src/api/redemption/plugin.ts:8).
    // Without the explicit 'preHandler' override the keyGenerator
    // would always see req.user === undefined and silently fall
    // back to IP keying — defeating the per-customer guarantee on
    // shared-NAT environments. This test fails loudly if a future
    // refactor drops the override.
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)

    const call = findGetCallFor(get, '/api/v1/redemption/me/:code')!
    const cfg  = (call[1] as any).config.rateLimit
    expect(cfg.hook).toBe('preHandler')
  })

  it('uses the redemptionPolling tier values (max + timeWindow inherited from routeRateLimit)', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)

    const call    = findGetCallFor(get, '/api/v1/redemption/me/:code')!
    const cfg     = (call[1] as any).config.rateLimit
    const tier    = routeRateLimit('redemptionPolling')

    expect(cfg.max).toBe(tier.max)
    expect(cfg.timeWindow).toBe(tier.timeWindow)
  })

  it('keys per CUSTOMER (req.user.sub), NOT per IP — shared-Wi-Fi / NAT does not punish multiple customers', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)

    const call         = findGetCallFor(get, '/api/v1/redemption/me/:code')!
    const cfg          = (call[1] as any).config.rateLimit
    expect(typeof cfg.keyGenerator).toBe('function')

    // Two different customers behind the same IP should produce two
    // different keys.
    const reqA = { user: { sub: 'customer-a' }, ip: '203.0.113.99' } as any
    const reqB = { user: { sub: 'customer-b' }, ip: '203.0.113.99' } as any
    expect(cfg.keyGenerator(reqA)).toBe('customer-a')
    expect(cfg.keyGenerator(reqB)).toBe('customer-b')
    expect(cfg.keyGenerator(reqA)).not.toBe(cfg.keyGenerator(reqB))
  })

  it('falls back to req.ip when req.user is missing (defensive — should never happen on this auth-gated route)', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)

    const call = findGetCallFor(get, '/api/v1/redemption/me/:code')!
    const cfg  = (call[1] as any).config.rateLimit
    const reqNoUser = { ip: '203.0.113.99' } as any
    expect(cfg.keyGenerator(reqNoUser)).toBe('203.0.113.99')
  })
})

describe('customerRedemptionRoutes — other redemption routes UNAFFECTED by §AG1', () => {
  // The owner direction was explicit: only the polling endpoint is
  // covered by the new tier. Other redemption routes have different
  // traffic shape (one-shot create, one-shot screenshot-flag, paginated
  // list) and remain on the global IP-based default.
  it('POST /api/v1/redemption/:code/screenshot-flag has NO route-level rateLimit', async () => {
    const { post, app } = captureRoutes()
    await customerRedemptionRoutes(app)
    const call = (post.mock.calls as RouteCall[]).find(
      (c) => c[0] === '/api/v1/redemption/:code/screenshot-flag',
    )
    expect(call).toBeDefined()
    // 2-arg form: app.post(path, handler) — no opts object means no
    // route-level rate-limit config attached. The global default from
    // the rate-limit plugin still applies (IP-keyed).
    expect(call!.length).toBe(2)
  })

  it('POST /api/v1/redemption (create) has NO route-level rateLimit', async () => {
    const { post, app } = captureRoutes()
    await customerRedemptionRoutes(app)
    const call = (post.mock.calls as RouteCall[]).find(
      (c) => c[0] === '/api/v1/redemption',
    )
    expect(call).toBeDefined()
    expect(call!.length).toBe(2)
  })

  it('GET /api/v1/redemption/my (list) has NO route-level rateLimit', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)
    const call = findGetCallFor(get, '/api/v1/redemption/my')
    expect(call).toBeDefined()
    expect(call!.length).toBe(2)
  })

  it('GET /api/v1/redemption/my/:id (single) has NO route-level rateLimit', async () => {
    const { get, app } = captureRoutes()
    await customerRedemptionRoutes(app)
    const call = findGetCallFor(get, '/api/v1/redemption/my/:id')
    expect(call).toBeDefined()
    expect(call!.length).toBe(2)
  })
})
