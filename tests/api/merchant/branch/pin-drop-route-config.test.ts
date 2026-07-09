import { describe, it, expect, vi } from 'vitest'
import { branchRoutes } from '../../../../src/api/merchant/branch/routes'
import { routeRateLimit } from '../../../../src/api/plugins/rate-limit'

// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum §4.3 / D-L4):
// the per-user branchPinDrop rate-limit on POST .../:id/pin-drop and the shared
// tier on GET .../:id/map-preview. We pin the route-config shape without spinning
// a full Fastify app (the @fastify/rate-limit behaviour itself is owned by that
// plugin). Mirrors the redemptionPolling route-config pin.

type RouteCall = [path: string, optsOrHandler: unknown, handlerOrUndefined?: unknown]

function captureRoutes() {
  const get = vi.fn(); const post = vi.fn(); const patch = vi.fn()
  const del = vi.fn(); const put = vi.fn()
  return { get, post, patch, del, put, app: { get, post, patch, delete: del, put } as any }
}
function findCall(fn: ReturnType<typeof vi.fn>, path: string): RouteCall | undefined {
  return (fn.mock.calls as RouteCall[]).find((c) => c[0] === path)
}

const PIN_DROP_PATH = '/api/v1/merchant/branches/:id/pin-drop'
const MAP_PREVIEW_PATH = '/api/v1/merchant/branches/:id/map-preview'

describe('branchPinDrop rate-limit tier', () => {
  it('exists with a tight per-merchant max + 1-minute window', () => {
    const tier = routeRateLimit('branchPinDrop')
    // Prod = 10/min; dev (RATE_LIMIT_RELAX) = 100/min.
    expect(tier.max).toBeGreaterThanOrEqual(10)
    expect(tier.max).toBeLessThanOrEqual(100)
    expect(tier.timeWindow).toBe('1 minute')
  })

  it('prod ceiling is 10/min (far above legitimate pin-set cadence, bounds postcodes.io spend)', () => {
    if (process.env.RATE_LIMIT_RELAX === 'true') return
    expect(routeRateLimit('branchPinDrop').max).toBe(10)
  })
})

describe('branchRoutes — POST /:id/pin-drop rate-limit config', () => {
  it('attaches a route-level rateLimit config (3-arg form)', async () => {
    const { post, app } = captureRoutes()
    await branchRoutes(app)
    const call = findCall(post, PIN_DROP_PATH)
    expect(call).toBeDefined()
    expect(call!.length).toBe(3)
    const opts = call![1] as { config?: { rateLimit?: unknown } }
    expect(opts.config?.rateLimit).toBeDefined()
  })

  it("uses hook: 'preHandler' so the limiter runs AFTER merchant auth (req.user.sub populated)", async () => {
    const { post, app } = captureRoutes()
    await branchRoutes(app)
    const cfg = (findCall(post, PIN_DROP_PATH)![1] as any).config.rateLimit
    expect(cfg.hook).toBe('preHandler')
  })

  it('uses the branchPinDrop tier values (max + timeWindow from routeRateLimit)', async () => {
    const { post, app } = captureRoutes()
    await branchRoutes(app)
    const cfg = (findCall(post, PIN_DROP_PATH)![1] as any).config.rateLimit
    const tier = routeRateLimit('branchPinDrop')
    expect(cfg.max).toBe(tier.max)
    expect(cfg.timeWindow).toBe(tier.timeWindow)
  })

  it('keys per MERCHANT (req.user.sub), NOT per IP — a shared office does not collectively starve', async () => {
    const { post, app } = captureRoutes()
    await branchRoutes(app)
    const cfg = (findCall(post, PIN_DROP_PATH)![1] as any).config.rateLimit
    expect(typeof cfg.keyGenerator).toBe('function')
    const reqA = { user: { sub: 'merchant-a' }, ip: '203.0.113.9' } as any
    const reqB = { user: { sub: 'merchant-b' }, ip: '203.0.113.9' } as any
    expect(cfg.keyGenerator(reqA)).toBe('merchant-a')
    expect(cfg.keyGenerator(reqB)).toBe('merchant-b')
  })

  it('falls back to req.ip when req.user is missing (defensive)', async () => {
    const { post, app } = captureRoutes()
    await branchRoutes(app)
    const cfg = (findCall(post, PIN_DROP_PATH)![1] as any).config.rateLimit
    expect(cfg.keyGenerator({ ip: '203.0.113.9' } as any)).toBe('203.0.113.9')
  })
})

describe('branchRoutes — GET /:id/map-preview rate-limit config', () => {
  it('shares the per-user branchPinDrop tier + preHandler hook', async () => {
    const { get, app } = captureRoutes()
    await branchRoutes(app)
    const call = findCall(get, MAP_PREVIEW_PATH)
    expect(call).toBeDefined()
    expect(call!.length).toBe(3)
    const cfg = (call![1] as any).config.rateLimit
    expect(cfg.hook).toBe('preHandler')
    expect(cfg.max).toBe(routeRateLimit('branchPinDrop').max)
    expect(typeof cfg.keyGenerator).toBe('function')
  })
})
