import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// D65 personalised-agreement PREVIEW route (POST /api/v1/admin/merchants/:id/agreement/preview).
// Load-bearing pins (decision doc §4/§4b): unauthenticated 401; a caps claim lacking
// merchant:sign-agreement is 403 fail-closed; a FIELD rep is clamped to PRE-LIVE merchants; the
// strict body rejects unknown keys; a bounded per-caller rate limit blocks (429); the happy path
// returns the personalised body + the server-authoritative reviewedContentHash.

import { buildApp } from '../../../src/api/app'
import { computeContentHash } from '../../../src/api/merchant/agreement/versions'

const URL = '/api/v1/admin/merchants/m1/agreement/preview'
const BODY = { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner' }

describe('POST /admin/merchants/:id/agreement/preview', () => {
  let app: FastifyInstance
  let evalMock: ReturnType<typeof vi.fn>

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-rep-42', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  const ORIGINAL_ENV = { ...process.env }

  beforeEach(async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    app = await buildApp()
    app.decorate('prisma', {
      merchant: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'm1',
          status: 'PENDING_APPROVAL', // pre-live: FIELD allowed
          businessName: 'Kovalam Tandoori Ltd',
          tradingName: 'Kovalam Tandoori',
          companyNumber: '01234567',
          vatNumber: 'GB999999973',
        }),
      },
    } as any)
    // The atomic limiter runs one Lua script via redis.eval; default = allow ([1]).
    evalMock = vi.fn().mockResolvedValue([1])
    app.decorate('redis', { eval: evalMock } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    process.env = { ...ORIGINAL_ENV }
  })

  it('401s unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: URL, payload: BODY })
    expect(res.statusCode).toBe(401)
  })

  it('403s fail-closed when the caps claim lacks merchant:sign-agreement', async () => {
    const token = sign('OPERATIONS', [])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('FIELD is clamped to PRE-LIVE merchants (403 on an ACTIVE one)', async () => {
    ;(app.prisma.merchant.findUnique as any).mockResolvedValue({ id: 'm1', status: 'ACTIVE', businessName: 'X' })
    const token = sign('FIELD', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_PRE_LIVE_FOR_FIELD')
  })

  it('strict body: an unknown key 400s', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` },
      payload: { ...BODY, agreementVersion: 'x' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('bounded rate limit: a blocked caller gets 429 AGREEMENT_PREVIEW_RATE_LIMITED', async () => {
    evalMock.mockResolvedValue([0, 30, 'abuser', 'rl:agrprev:admin:min:admin-rep-42'])
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(429)
    expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_PREVIEW_RATE_LIMITED')
  })

  it('happy path: returns the personalised body + server-authoritative reviewedContentHash', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.version).toBe('2.1-draft')
    expect(body.isDraft).toBe(true)
    expect(body.gated).toBe(true)
    expect(typeof body.canonicalContentHash).toBe('string')
    expect(body.personalisedText).toContain('Priya Nair')
    expect(body.personalisedText).toContain('Kovalam Tandoori Ltd')
    // Server-authoritative: the hash is exactly sha256 of the returned body.
    expect(body.reviewedContentHash).toBe(computeContentHash(body.personalisedText))
    // The rate limiter was consulted before the render.
    expect(evalMock).toHaveBeenCalled()
  })
})
