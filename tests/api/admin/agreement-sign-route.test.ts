import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// D65 ceremony route (POST /api/v1/admin/merchants/:id/agreement/sign).
// Load-bearing pins: unauthenticated 401; a caps claim lacking
// merchant:sign-agreement is 403 fail-closed; a FIELD rep is clamped to PRE-LIVE
// merchants (403 MERCHANT_NOT_PRE_LIVE_FOR_FIELD on an ACTIVE one); the strict
// body rejects unknown keys; the happy path (OPERATIONS, staging, storage live)
// returns the evidence summary with the witnessing rep = req.user.sub.

vi.mock('../../../src/api/shared/storage', () => ({
  isStorageEnabled: vi.fn(() => process.env.STORAGE_ENABLED === 'true'),
  putObject: vi.fn(async () => ({ key: 'document/m1/cafebabecafebabe.pdf' })),
  deleteObject: vi.fn(async () => {}),
  presignGet: vi.fn(),
  kindPolicy: vi.fn(() => ({ contentTypes: { 'application/pdf': 'pdf' }, maxBytes: 10 * 1024 * 1024, visibility: 'private' })),
}))
vi.mock('../../../src/api/merchant/agreement/pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/merchant/agreement/pdf')>()
  return { ...actual, renderAgreementPdf: vi.fn(async () => Buffer.from('%PDF-mock')) }
})

import { buildApp } from '../../../src/api/app'
import { getCurrentAgreement } from '../../../src/api/merchant/agreement/versions'
import { renderReviewedBody } from '../../../src/api/merchant/agreement/reviewedBody'

const URL = '/api/v1/admin/merchants/m1/agreement/sign'

// FIX 1: agreementVersion + reviewedContentHash are now REQUIRED. The ceremony echoes the
// preview's version + server-authoritative hash; the route rejects a body missing either. The
// honest hash is derived from the SAME shared module the service re-derives from, over the m1
// merchant identity the mock returns below.
const CUR = getCurrentAgreement()
const REVIEWED_HASH = renderReviewedBody({
  version: CUR.version,
  canonicalContentHash: CUR.contentHash,
  content: CUR.content,
  method: 'IN_PERSON_ASSISTED',
  businessLegalName: 'Kovalam Tandoori Ltd',
  tradingName: null,
  companyNumber: null,
  vatNumber: null,
  signerName: 'Priya Nair',
  signerRoleConfirmation: 'Owner',
}).reviewedContentHash
const BODY = {
  signerName: 'Priya Nair',
  signerRoleConfirmation: 'Owner',
  agreementVersion: CUR.version,
  reviewedContentHash: REVIEWED_HASH,
}

describe('POST /admin/merchants/:id/agreement/sign', () => {
  let app: FastifyInstance
  let merchantFindUnique: ReturnType<typeof vi.fn>
  let recordCreate: ReturnType<typeof vi.fn>

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-rep-42', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  const ORIGINAL_ENV = { ...process.env }

  beforeEach(async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.STORAGE_ENABLED = 'true'
    delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED

    app = await buildApp()
    merchantFindUnique = vi.fn().mockResolvedValue({
      id: 'm1',
      status: 'PENDING_APPROVAL', // pre-live: FIELD allowed
      contractStatus: 'NOT_SIGNED',
      businessName: 'Kovalam Tandoori Ltd',
      tradingName: null,
      companyNumber: null,
      vatNumber: null,
    })
    recordCreate = vi.fn().mockResolvedValue({ id: 'rec-1', signedAt: new Date() })
    const tx = {
      merchantAgreementRecord: { create: recordCreate },
      merchantContract: { upsert: vi.fn().mockResolvedValue({}) },
      // N1: the ceremony status flip is now an atomic conditional updateMany guard.
      merchant: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    app.decorate('prisma', {
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
      merchant: { findUnique: merchantFindUnique },
      // FIX 2: the ceremony looks up the authenticated rep identity server-side.
      adminUser: { findUnique: vi.fn().mockResolvedValue({ firstName: 'Rep', lastName: 'Fortytwo', email: 'rep42@redeemo.com' }) },
    } as any)
    app.decorate('redis', { get: vi.fn(), set: vi.fn(), del: vi.fn(), keys: vi.fn().mockResolvedValue([]) } as any)
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
    const token = sign('OPERATIONS', []) // minted caps claim is authoritative
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('FIELD is clamped to PRE-LIVE merchants (403 on an ACTIVE one)', async () => {
    merchantFindUnique.mockResolvedValue({ id: 'm1', status: 'ACTIVE', contractStatus: 'NOT_SIGNED' })
    const token = sign('FIELD', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_NOT_PRE_LIVE_FOR_FIELD')
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('strict body: an unknown key 400s before the service runs', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` },
      payload: { ...BODY, reason: 'not-a-field' },
    })
    expect(res.statusCode).toBe(400)
    expect(recordCreate).not.toHaveBeenCalled()
  })

  // FIX 1 route bypass reproductions: the strict route now REQUIRES agreementVersion +
  // reviewedContentHash (z.string().min(1)). A body omitting either is 400'd before the service
  // runs, so a signature cannot be recorded without the review echo.
  it('FIX 1: omitting agreementVersion 400s (required), no record written', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const { agreementVersion: _omit, ...noVersion } = BODY
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: noVersion,
    })
    expect(res.statusCode).toBe(400)
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('FIX 1: omitting reviewedContentHash 400s (required), no record written', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const { reviewedContentHash: _omit, ...noHash } = BODY
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: noHash,
    })
    expect(res.statusCode).toBe(400)
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('FIX 1: a WRONG reviewedContentHash echo is refused (409 AGREEMENT_REVIEW_HASH_MISMATCH), no record written', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` },
      payload: { ...BODY, reviewedContentHash: 'deadbeef-not-the-hash' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_REVIEW_HASH_MISMATCH')
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('happy path (OPERATIONS, staging, gated): signs, records the rep as witness, reports gated: true', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.recordId).toBe('rec-1')
    expect(body.contractStatus).toBe('SIGNED')
    expect(body.gated).toBe(true)
    // The witnessing rep comes from req.user.sub, never the payload. FIX 2: the witness
    // identity is the server-looked-up AdminUser (name + email), not any request field.
    expect(recordCreate.mock.calls[0][0].data).toMatchObject({
      actorAdminId: 'admin-rep-42',
      signerName: 'Priya Nair',
      witnessName: 'Rep Fortytwo',
      witnessEmail: 'rep42@redeemo.com',
      method: 'IN_PERSON_ASSISTED',
    })
  })

  it('FIX 2: strict body rejects a client-supplied witnessLabel (400, no write)', async () => {
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({
      method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` },
      payload: { ...BODY, witnessLabel: 'I typed my own witness name' },
    })
    expect(res.statusCode).toBe(400)
    expect(recordCreate).not.toHaveBeenCalled()
  })

  it('production + gated: the route refuses the binding write (403 AGREEMENT_LEGAL_REVIEW_REQUIRED)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const token = sign('OPERATIONS', ['merchant:sign-agreement'])
    const res = await app.inject({ method: 'POST', url: URL, headers: { authorization: `Bearer ${token}` }, payload: BODY })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    expect(recordCreate).not.toHaveBeenCalled()
  })
})
