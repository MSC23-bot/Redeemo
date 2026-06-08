import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

// F2 (SEC): prove the edge rate-limiter is backed by the SHARED Redis client when
// app.redis is decorated, and falls back to the in-memory store when it is not
// (notably NODE_ENV=test, where redisPlugin is skipped — so the suite needs no
// Redis). We mock @fastify/rate-limit so we can capture the exact options the
// plugin passes it without standing up a real Redis-backed limiter.
const { captured } = vi.hoisted(() => ({ captured: [] as any[] }))
vi.mock('@fastify/rate-limit', () => ({
  // A plain async fn is a valid Fastify plugin; it just records the options.
  default: async (_app: any, opts: any) => { captured.push(opts) },
}))

import rateLimitPlugin from '../../../src/api/plugins/rate-limit'

async function registerAndCapture(decorateRedis: unknown | undefined) {
  const app = Fastify()
  if (decorateRedis !== undefined) app.decorate('redis', decorateRedis as any)
  await app.register(rateLimitPlugin)
  await app.ready()
  await app.close()
  return captured[0]
}

beforeEach(() => { captured.length = 0 })

describe('rate-limit store wiring (F2)', () => {
  it('uses the Redis store + skipOnError:true when app.redis is decorated', async () => {
    const fakeRedis = { __id: 'shared-redis' }
    const opts = await registerAndCapture(fakeRedis)

    expect(opts.redis).toBe(fakeRedis)   // the SHARED client, not a new connection
    expect(opts.skipOnError).toBe(true)  // FAIL OPEN — a Redis outage must not 500 the whole API
  })

  it('falls back to in-memory (no redis / no skipOnError) when app.redis is absent', async () => {
    const opts = await registerAndCapture(undefined)

    expect(opts.redis).toBeUndefined()       // in-memory store → test suite needs no Redis
    expect(opts.skipOnError).toBeUndefined()
  })

  it('keeps the global limiter + keyGenerator = req.ip, and does not change thresholds', async () => {
    const opts = await registerAndCapture({ __id: 'shared-redis' })

    expect(opts.global).toBe(true)
    expect(opts.keyGenerator({ ip: '9.9.9.9' })).toBe('9.9.9.9')
    expect(opts.max).toBe(100)            // prod global tier unchanged (RATE_LIMIT_RELAX unset in test)
    expect(opts.timeWindow).toBe('1 minute')
  })
})
