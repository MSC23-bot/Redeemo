import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { resolveTrustProxy } from '../../../src/api/shared/trustProxy'

// SEC-H2 (Gate-PR-3): trustProxy + IP-aware rate limiting.

describe('resolveTrustProxy — TRUST_PROXY env mapping', () => {
  const saved = process.env.TRUST_PROXY
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = saved
  })

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', 1],
    ['2', 2],
    ['10.0.0.0/8', '10.0.0.0/8'],
    ['10.0.0.1,127.0.0.1', '10.0.0.1,127.0.0.1'],
  ])('TRUST_PROXY=%s → %s', (env, expected) => {
    if (env === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = env as string
    expect(resolveTrustProxy()).toEqual(expected)
  })

  it.each(['yes', 'on', 'tru', 'garbage', '1.2.3', '10.0.0.0/8,nope'])(
    'rejects an invalid value %s with a CLEAR boot error (fails closed, not silently)',
    (env) => {
      process.env.TRUST_PROXY = env
      expect(() => resolveTrustProxy()).toThrow(/Invalid TRUST_PROXY/)
    },
  )
})

async function whoamiApp(trustProxy: boolean | number | string) {
  const app = Fastify({ trustProxy })
  app.get('/whoami', async (req) => ({ ip: req.ip }))
  await app.ready()
  return app
}

describe('trustProxy → req.ip resolution', () => {
  it('with trustProxy=1, req.ip is the forwarded client IP, and distinct clients stay distinct', async () => {
    const app = await whoamiApp(1)
    const a = await app.inject({ method: 'GET', url: '/whoami', headers: { 'x-forwarded-for': '1.2.3.4' } })
    const b = await app.inject({ method: 'GET', url: '/whoami', headers: { 'x-forwarded-for': '5.6.7.8' } })
    expect(a.json().ip).toBe('1.2.3.4')
    expect(b.json().ip).toBe('5.6.7.8')
    expect(a.json().ip).not.toBe(b.json().ip) // not collapsed onto one proxy bucket
    await app.close()
  })

  it('with trustProxy=false, X-Forwarded-For is IGNORED (no client spoofing)', async () => {
    const app = await whoamiApp(false)
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { 'x-forwarded-for': '9.9.9.9' } })
    expect(res.json().ip).toBe('127.0.0.1') // socket peer, not the spoofed header
    await app.close()
  })
})

async function rateLimitedApp(trustProxy: boolean | number | string) {
  const app = Fastify({ trustProxy })
  await app.register(rateLimit, {
    global: true,
    max: 1,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip, // mirrors plugins/rate-limit.ts
  })
  app.get('/ping', async () => ({ ok: true }))
  await app.ready()
  return app
}

describe('IP-aware rate limiting (key = req.ip)', () => {
  it('with trustProxy, rate-limit buckets are PER real client — client B is not punished for client A', async () => {
    const app = await rateLimitedApp(1)
    const ping = (xff: string) => app.inject({ method: 'GET', url: '/ping', headers: { 'x-forwarded-for': xff } })
    expect((await ping('1.1.1.1')).statusCode).toBe(200) // A: first
    expect((await ping('1.1.1.1')).statusCode).toBe(429) // A: over limit
    expect((await ping('2.2.2.2')).statusCode).toBe(200) // B: independent bucket
    await app.close()
  })

  it('WITHOUT trustProxy, forwarded IPs collapse onto the shared socket bucket (the bug this fixes)', async () => {
    const app = await rateLimitedApp(false)
    const ping = (xff: string) => app.inject({ method: 'GET', url: '/ping', headers: { 'x-forwarded-for': xff } })
    expect((await ping('1.1.1.1')).statusCode).toBe(200) // counted on 127.0.0.1
    expect((await ping('2.2.2.2')).statusCode).toBe(429) // different client, SAME bucket → throttled
    await app.close()
  })
})
