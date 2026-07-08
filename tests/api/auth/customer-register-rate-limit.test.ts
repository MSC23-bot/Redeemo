import { describe, it, expect, vi } from 'vitest'
import { customerAuthRoutes } from '../../../src/api/auth/customer/routes'
import { routeRateLimit } from '../../../src/api/plugins/rate-limit'

// Customer register rate-limit tier — security-audit item 2026-07-06
// (§customer-register) closed on 2026-07-09 alongside the global-backstop
// raise (100→300/min). Without a route tier, registration was bounded only
// by the global per-IP backstop, i.e. ~global-max account creations per
// minute per IP (each an INSERT + token issue + queued verification email
// once EMAIL_ENABLED). This pins the route-config shape the same way
// tests/api/redemption/routes.polling-rate-limit.test.ts pins the polling
// tier — no full Fastify app; @fastify/rate-limit's own behaviour is
// exercised by the auth-suite OTP rate-limit integration test.

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

function findPostCallFor(post: ReturnType<typeof vi.fn>, path: string): RouteCall | undefined {
  return (post.mock.calls as RouteCall[]).find((c) => c[0] === path)
}

describe('customerAuthRoutes — POST /register rate-limit config', () => {
  it('attaches the register tier as route-level rateLimit config', async () => {
    const { post, app } = captureRoutes()
    await customerAuthRoutes(app)

    const call = findPostCallFor(post, '/api/v1/customer/auth/register')
    expect(call).toBeDefined()
    // 3-arg form is `app.post(path, opts, handler)` — the opts object
    // carries the config. 2-arg form would mean the tier was dropped.
    expect(call!.length).toBe(3)

    const opts = call![1] as { config?: { rateLimit?: unknown } }
    expect(opts.config?.rateLimit).toBeDefined()
    expect(opts.config!.rateLimit).toEqual(routeRateLimit('register'))
  })

  it('register tier stays strict: at most 5/hour in prod', () => {
    // Registration is expensive + spam-prone; the audit fix is only
    // meaningful if the tier stays strict. Dev mode (RATE_LIMIT_RELAX)
    // is exempt — QA needs to create test accounts freely.
    if (process.env.RATE_LIMIT_RELAX === 'true') return
    const tier = routeRateLimit('register')
    expect(tier.max).toBeLessThanOrEqual(5)
    expect(tier.timeWindow).toBe('1 hour')
  })
})
