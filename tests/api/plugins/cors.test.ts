import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import corsPlugin from '../../../src/api/plugins/cors'

// Pins the DEFAULT CORS allowlist (CORS_ORIGIN unset) so all three local web surfaces
// reach the API out of the box: customer-web (3001), admin-web (3002), merchant-web
// (3003). Regression guard for the merchant-web (3003) integration gap: merchant-web
// makes direct browser-to-backend calls (GET /merchant/profile + public forgot/reset/
// claim/resend), so a missing 3003 origin breaks the portal in a real browser even
// though unit/build/CI stay green.

async function corsApp(): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(corsPlugin)
  app.get('/ping', async () => ({ ok: true }))
  await app.ready()
  return app
}

function preflight(app: FastifyInstance, origin: string) {
  return app.inject({
    method: 'OPTIONS',
    url: '/ping',
    headers: { origin, 'access-control-request-method': 'GET' },
  })
}

describe('CORS default allowlist (no CORS_ORIGIN set)', () => {
  // The plugin reads CORS_ORIGIN at registration time, so clear it BEFORE corsApp().
  const saved = process.env.CORS_ORIGIN
  beforeEach(() => {
    delete process.env.CORS_ORIGIN
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = saved
  })

  it.each([
    ['http://localhost:3001', 'customer-web'],
    ['http://localhost:3002', 'admin-web'],
    ['http://localhost:3003', 'merchant-web'],
  ])('allows %s (%s): echoes the origin + credentials', async (origin) => {
    const app = await corsApp()
    const res = await preflight(app, origin)
    expect(res.headers['access-control-allow-origin']).toBe(origin)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    await app.close()
  })

  it('does NOT allow an unlisted origin (no Access-Control-Allow-Origin echoed)', async () => {
    const app = await corsApp()
    const res = await preflight(app, 'http://evil.example.com')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    await app.close()
  })
})

describe('CORS with an explicit CORS_ORIGIN (production-style override)', () => {
  const saved = process.env.CORS_ORIGIN
  afterEach(() => {
    if (saved === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = saved
  })

  it('honours the comma-separated allowlist and rejects origins outside it', async () => {
    process.env.CORS_ORIGIN = 'https://redeemo.co.uk,https://merchant.redeemo.co.uk'
    const app = await corsApp()
    const ok = await preflight(app, 'https://merchant.redeemo.co.uk')
    expect(ok.headers['access-control-allow-origin']).toBe('https://merchant.redeemo.co.uk')
    const blocked = await preflight(app, 'http://localhost:3003')
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
    await app.close()
  })
})
