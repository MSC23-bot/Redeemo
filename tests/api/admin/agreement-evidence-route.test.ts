import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'

// D65 lane-2: the admin signing-evidence read surface (decision doc 2026-07-15-d65-legal-object
// §11 tiering + §17 PDF integrity retrieval). Two routes, both gated on contract:view-evidence
// (OPERATIONS + SUPER_ADMIN only) and both bounded by the shared evidence limiter:
//   GET /api/v1/admin/merchants/:id/agreement/evidence       (ordinary-tier detail)
//   GET /api/v1/admin/merchants/:id/agreement/evidence/pdf    (server-proxied retrieve-hash-serve)
//
// Load-bearing pins: unauthenticated 401; a caps claim lacking contract:view-evidence is 403
// fail-closed (and FIELD, which holds sign-agreement, is refused); a merchant with no record (or a
// cross-merchant record) is a NON-LEAKING EVIDENCE_NOT_FOUND 404; the ordinary fields are returned
// and the WITHHELD tier (witnessEmail / ipAddress / userAgent / pdfKey) NEVER appears; the view is
// audited; the rate limit blocks (429). PDF: a hash match serves the exact bytes; a tampered object
// or a missing object fails closed (502, no bytes) with an integrity-failure audit + alert; storage
// dark fails closed (503) before any read.

// Mock storage so getObject + isStorageEnabled are controllable; everything else stays real.
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return {
    ...actual,
    isStorageEnabled: vi.fn(() => true),
    getObject: vi.fn(),
  }
})

// The evidence read imports isVersionWatermarked from the agreement service, which transitively
// imports the PDF renderer (pdfkit). This surface never renders a PDF, so stub the renderer to keep
// the unit test independent of the heavy pdfkit dependency (mirrors agreement-service.test.ts).
vi.mock('../../../src/api/merchant/agreement/pdf', () => ({
  renderAgreementPdf: vi.fn(async () => Buffer.from('%PDF-mock')),
}))

import { buildApp } from '../../../src/api/app'
import { isStorageEnabled, getObject } from '../../../src/api/shared/storage'

const MERCHANT = 'm1'
const DETAIL_URL = `/api/v1/admin/merchants/${MERCHANT}/agreement/evidence`
const PDF_URL = `/api/v1/admin/merchants/${MERCHANT}/agreement/evidence/pdf`

const PDF_BYTES = Buffer.from('%PDF-1.7 signed-agreement-bytes')
const PDF_HASH = crypto.createHash('sha256').update(PDF_BYTES).digest('hex')

// A full agreement record row INCLUDING the withheld-tier columns, so the response-shape assertions
// prove the payload is curated regardless of what the row carries.
const FULL_RECORD = {
  id: 'rec-1',
  merchantId: MERCHANT,
  agreementVersion: '2.1-draft',
  contentHash: 'canonicalhash',
  reviewedContentHash: 'reviewedhash',
  signerName: 'Priya Nair',
  signerRoleConfirmation: 'Owner',
  method: 'IN_PERSON_ASSISTED',
  signedAt: new Date('2026-07-16T10:00:00.000Z'),
  witnessName: 'Sam Rep',
  // WITHHELD tier (must never surface):
  witnessEmail: 'sam.rep@redeemo.com',
  ipAddress: '203.0.113.9',
  userAgent: 'RedeemoRepTablet/1.0',
  pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
  pdfHash: PDF_HASH,
}

describe('D65 lane-2 admin signing-evidence read', () => {
  let app: FastifyInstance
  let evalMock: ReturnType<typeof vi.fn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  const ORIGINAL_ENV = { ...process.env }

  const sign = (adminRole?: string, caps?: string[]) =>
    (app.jwt as any).admin.sign({ sub: 'admin-7', role: 'admin', adminRole, caps, sessionId: 's1' }, { expiresIn: '1h' })

  beforeEach(async () => {
    ;(isStorageEnabled as any).mockReturnValue(true)
    ;(getObject as any).mockReset()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    app = await buildApp()
    app.decorate('prisma', {
      merchantAgreementRecord: {
        findFirst: vi.fn().mockResolvedValue(FULL_RECORD),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    evalMock = vi.fn().mockResolvedValue([1]) // limiter allows by default
    app.decorate('redis', { eval: evalMock } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    errorSpy.mockRestore()
    process.env = { ...ORIGINAL_ENV }
  })

  // ── Detail route ────────────────────────────────────────────────────────────

  describe('GET .../agreement/evidence (detail)', () => {
    it('401s unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: DETAIL_URL })
      expect(res.statusCode).toBe(401)
    })

    it('403s fail-closed when the caps claim lacks contract:view-evidence', async () => {
      const token = sign('OPERATIONS', [])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('403s a FIELD rep (holds sign-agreement, NOT contract:view-evidence)', async () => {
      const token = sign('FIELD', ['merchant:sign-agreement'])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
    })

    it('returns the ORDINARY tier and NEVER the withheld fields', async () => {
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      // Ordinary tier present.
      expect(body).toMatchObject({
        agreementVersion: '2.1-draft',
        isDraft: true,
        gated: true,
        contentHash: 'canonicalhash',
        reviewedContentHash: 'reviewedhash',
        signerName: 'Priya Nair',
        signerRoleConfirmation: 'Owner',
        method: 'IN_PERSON_ASSISTED',
        witnessName: 'Sam Rep',
      })
      expect(typeof body.signedAt).toBe('string')
      // WITHHELD tier absent (§11): witnessEmail / ipAddress / userAgent / pdfKey never leak.
      expect(body).not.toHaveProperty('witnessEmail')
      expect(body).not.toHaveProperty('ipAddress')
      expect(body).not.toHaveProperty('userAgent')
      expect(body).not.toHaveProperty('pdfKey')
      // And no value equal to a withheld secret sneaks in under another key.
      expect(res.body).not.toContain('sam.rep@redeemo.com')
      expect(res.body).not.toContain('203.0.113.9')
      expect(res.body).not.toContain('deadbeefdeadbeef')
    })

    it('audits every view (AGREEMENT_EVIDENCE_VIEWED, no PII / no pdfKey)', async () => {
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      const create = (app.prisma as any).auditLog.create
      expect(create).toHaveBeenCalledTimes(1)
      const data = create.mock.calls[0][0].data
      expect(data.event).toBe('AGREEMENT_EVIDENCE_VIEWED')
      expect(data.entityType).toBe('merchant')
      expect(data.entityId).toBe(MERCHANT)
      expect(data.actorType).toBe('ADMIN')
      expect(data.metadata).toEqual({ recordId: 'rec-1', agreementVersion: '2.1-draft' })
      // The audit metadata never carries signer PII or the pdfKey.
      expect(JSON.stringify(data.metadata)).not.toContain('Priya')
      expect(JSON.stringify(data.metadata)).not.toContain('deadbeef')
    })

    it('NON-LEAKING 404 (EVIDENCE_NOT_FOUND) when the merchant has no record', async () => {
      ;(app.prisma as any).merchantAgreementRecord.findFirst.mockResolvedValue(null)
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.body).error.code).toBe('EVIDENCE_NOT_FOUND')
    })

    it('defensive relationship 404: a record whose merchantId differs is EVIDENCE_NOT_FOUND', async () => {
      ;(app.prisma as any).merchantAgreementRecord.findFirst.mockResolvedValue({ ...FULL_RECORD, merchantId: 'other-merchant' })
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.body).error.code).toBe('EVIDENCE_NOT_FOUND')
    })

    it('bounded rate limit: a blocked caller gets 429 AGREEMENT_EVIDENCE_RATE_LIMITED', async () => {
      evalMock.mockResolvedValue([0, 30, 'abuser', 'rl:agrev:admin:min:admin-7'])
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: DETAIL_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(429)
      expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_EVIDENCE_RATE_LIMITED')
    })
  })

  // ── PDF route (server-proxied retrieve-hash-compare-serve) ────────────────────

  describe('GET .../agreement/evidence/pdf (server-proxied)', () => {
    it('403s fail-closed without contract:view-evidence', async () => {
      const token = sign('OPERATIONS', [])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('serves the EXACT bytes on a hash match, audits the RELEASE (no integrity audit)', async () => {
      ;(getObject as any).mockResolvedValue(PDF_BYTES)
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('application/pdf')
      expect(res.headers['content-disposition']).toContain('attachment')
      expect(res.rawPayload.equals(PDF_BYTES)).toBe(true)
      expect(getObject).toHaveBeenCalledWith(FULL_RECORD.pdfKey)
      const create = (app.prisma as any).auditLog.create
      const events = create.mock.calls.map((c: any) => c[0].data.event)
      // A successful RELEASE is audited distinctly (a direct /pdf call must leave its own trail,
      // never rely on a preceding VIEWED)...
      const dl = create.mock.calls.find((c: any) => c[0].data.event === 'AGREEMENT_EVIDENCE_PDF_DOWNLOADED')
      expect(dl).toBeTruthy()
      expect(dl[0].data.entityType).toBe('merchant')
      expect(dl[0].data.entityId).toBe(MERCHANT)
      expect(dl[0].data.actorType).toBe('ADMIN')
      // ...with recordId only: never signer PII / IP / UA / pdfKey.
      expect(dl[0].data.metadata).toEqual({ recordId: 'rec-1' })
      expect(JSON.stringify(dl[0].data.metadata)).not.toContain('deadbeef')
      // ...and a match writes NO integrity-failure audit.
      expect(events).not.toContain('AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
    })

    it('TAMPERED bytes: fail closed 502, release NO bytes, audit + alert', async () => {
      ;(getObject as any).mockResolvedValue(Buffer.from('%PDF-TAMPERED'))
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(502)
      expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
      // No PDF bytes released (JSON error envelope, not application/pdf).
      expect(res.headers['content-type']).toContain('application/json')
      // Integrity-failure audit written (reason hash_mismatch), pdfKey NOT in metadata.
      const create = (app.prisma as any).auditLog.create
      const failCall = create.mock.calls.find((c: any) => c[0].data.event === 'AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
      expect(failCall).toBeTruthy()
      expect(failCall[0].data.metadata).toEqual({ recordId: 'rec-1', reason: 'hash_mismatch' })
      // High-severity structured alert emitted.
      const alertCall = errorSpy.mock.calls.find((c: any) => c[1] && c[1].event === 'AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
      expect(alertCall).toBeTruthy()
      expect((alertCall as any)[1].severity).toBe('high')
      expect((alertCall as any)[1].reason).toBe('hash_mismatch')
    })

    it('MISSING object: getObject throws -> fail closed 502, audit reason=missing', async () => {
      ;(getObject as any).mockRejectedValue(new Error('NoSuchKey'))
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(502)
      expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
      const create = (app.prisma as any).auditLog.create
      const failCall = create.mock.calls.find((c: any) => c[0].data.event === 'AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
      expect(failCall[0].data.metadata.reason).toBe('missing')
    })

    it('STORAGE dark: fail closed 503 STORAGE_NOT_ENABLED before any read', async () => {
      ;(isStorageEnabled as any).mockReturnValue(false)
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(503)
      expect(JSON.parse(res.body).error.code).toBe('STORAGE_NOT_ENABLED')
      expect(getObject).not.toHaveBeenCalled()
    })

    it('NON-LEAKING 404 when the merchant has no record', async () => {
      ;(app.prisma as any).merchantAgreementRecord.findFirst.mockResolvedValue(null)
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(404)
      expect(JSON.parse(res.body).error.code).toBe('EVIDENCE_NOT_FOUND')
    })

    it('bounded rate limit: a blocked caller gets 429', async () => {
      evalMock.mockResolvedValue([0, 30, 'abuser', 'rl:agrev:ip:min:127.0.0.1'])
      const token = sign('OPERATIONS', ['contract:view-evidence'])
      const res = await app.inject({ method: 'GET', url: PDF_URL, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(429)
      expect(JSON.parse(res.body).error.code).toBe('AGREEMENT_EVIDENCE_RATE_LIMITED')
    })
  })
})
