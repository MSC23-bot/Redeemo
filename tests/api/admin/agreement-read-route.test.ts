import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'

// D65 signing-integrity: the ceremony agreement-text READ
// (GET /api/v1/admin/agreement/current). Load-bearing pins:
//  - unauthenticated 401;
//  - a caps claim lacking merchant:sign-agreement is 403 fail-closed;
//  - the happy path returns { version, text, contentHash, isDraft, gated } where the text is
//    the FULL current agreement whose sha256 == contentHash;
//  - the payload contains NO PII / no merchant fields (display == evidence, nothing else).

import { buildApp } from '../../../src/api/app'
import { getCurrentAgreement } from '../../../src/api/merchant/agreement/versions'

const URL = '/api/v1/admin/agreement/current'

describe('GET /admin/agreement/current', () => {
  let app: FastifyInstance
  const ORIGINAL_ENV = { ...process.env }

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign(
      { sub: 'admin-rep-42', role: 'admin', adminRole, caps, sessionId: 's1' },
      { expiresIn: '1h' },
    )

  beforeEach(async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    app = await buildApp()
    // The read touches no DB, but the app decorates prisma/redis on ready.
    app.decorate('prisma', {} as any)
    app.decorate('redis', { get: () => null, set: () => null, del: () => null } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    process.env = { ...ORIGINAL_ENV }
  })

  it('401s unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: URL })
    expect(res.statusCode).toBe(401)
  })

  it('403s fail-closed when the caps claim lacks merchant:sign-agreement', async () => {
    const token = sign('OPERATIONS', []) // minted caps claim is authoritative
    const res = await app.inject({ method: 'GET', url: URL, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('returns the current version + FULL text + hash + status; sha256(text) == contentHash', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'GET', url: URL, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const current = getCurrentAgreement()
    expect(body.version).toBe(current.version)
    expect(body.contentHash).toBe(current.contentHash)
    expect(body.isDraft).toBe(current.isDraft)
    // gated follows isVersionWatermarked (== the version's draft status today).
    expect(body.gated).toBe(current.isDraft)

    // The text is the FULL agreement, not a summary, and it is exactly the bytes the
    // evidence record pins: sha256(text) must equal the returned contentHash.
    expect(typeof body.text).toBe('string')
    expect(body.text).toBe(current.content)
    expect(body.text.length).toBeGreaterThan(500)
    const recomputed = crypto.createHash('sha256').update(body.text, 'utf8').digest('hex')
    expect(recomputed).toBe(body.contentHash)
  })

  it('carries NO PII / no merchant data (exactly the 5 contract keys)', async () => {
    const token = sign('FIELD', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'GET', url: URL, headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(Object.keys(body).sort()).toEqual(['contentHash', 'gated', 'isDraft', 'text', 'version'])
    // Defence: none of the common PII / merchant identifiers leak into the payload.
    for (const forbidden of [
      'merchantId', 'merchant', 'signerName', 'witnessName', 'witnessEmail', 'email',
      'businessName', 'ipAddress', 'pdfKey', 'actorAdminId',
    ]) {
      expect(body[forbidden]).toBeUndefined()
    }
  })
})
