import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// B3: Merchant Documents MVP (Option 1) - merchant self-serve upload/view of their
// OWN documents. Mirrors the admin Option B B4 test conventions
// (tests/api/admin/admin-merchant-documents-routes.test.ts): the storage library
// is module-mocked so the tests never touch real R2 (putObject/deleteObject/
// presignGet stubbed; kindPolicy + isStorageEnabled stay REAL). Pinned invariants:
//   - the raw fileUrl (R2 key) NEVER appears in any response
//   - list is scoped to the CALLER'S OWN merchant (resolved from the JWT, never a
//     body/query param) - there is no cross-merchant id to leak
//   - D1: view = OWNER + BRANCH_MANAGER (STAFF denied); upload = OWNER only
//   - D2: documentType is restricted to BUSINESS_VERIFICATION_1/2, PRICE_LIST
//     (AGREEMENT is rejected)
const { putObjectMock, deleteObjectMock, presignGetMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn(),
  deleteObjectMock: vi.fn(),
  presignGetMock: vi.fn(),
}))
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return { ...actual, putObject: putObjectMock, deleteObject: deleteObjectMock, presignGet: presignGetMock }
})

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function membershipRow(role: Role) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches: true, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
  }
}

function multipartPayload(
  fields: { documentType?: string },
  file?: { filename: string; contentType: string; content: string },
): { body: string; contentType: string } {
  const boundary = '----b3documentstestboundary'
  const lines: string[] = []
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue
    lines.push(`--${boundary}`, `Content-Disposition: form-data; name="${name}"`, '', value)
  }
  if (file) {
    lines.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${file.filename}"`,
      `Content-Type: ${file.contentType}`,
      '',
      file.content,
    )
  }
  lines.push(`--${boundary}--`, '')
  return { body: lines.join('\r\n'), contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('B3: merchant documents routes (self-serve, own-scope)', () => {
  let app: FastifyInstance
  let savedStorageEnabled: string | undefined
  const listUrl = '/api/v1/merchant/documents'

  async function buildAppFor(role: Role) {
    const a = await buildApp()
    a.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([membershipRow(role)]),
      },
      merchantDocument: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: new Date('2026-06-10T00:00:00Z'), fileUrl: 'document/m1/abcdef0123456789.pdf' },
        ]),
        create: vi.fn().mockResolvedValue({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: new Date('2026-06-16T00:00:00Z') }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((a as any).prisma)),
    } as any)
    a.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), exists: vi.fn().mockResolvedValue(1) } as any)
    await a.ready()
    const token = (a.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
    return { app: a, token }
  }

  beforeEach(() => {
    savedStorageEnabled = process.env.STORAGE_ENABLED
    process.env.STORAGE_ENABLED = 'true'
    putObjectMock.mockReset().mockResolvedValue({ key: 'document/m1/abcdef0123456789.pdf' })
    deleteObjectMock.mockReset().mockResolvedValue(undefined)
    presignGetMock.mockReset().mockResolvedValue({ url: 'https://r2.example/signed?sig=abc', expiresIn: 300 })
  })

  afterEach(async () => {
    if (app) await app.close()
    if (savedStorageEnabled === undefined) delete process.env.STORAGE_ENABLED
    else process.env.STORAGE_ENABLED = savedStorageEnabled
  })

  // ── Read (D1: OWNER + BRANCH_MANAGER; STAFF denied) ───────────────────────

  it('GET 401 when unauthenticated', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const res = await app.inject({ method: 'GET', url: listUrl })
    expect(res.statusCode).toBe(401)
  })

  it('GET 200 for OWNER: presigned docs, and the raw fileUrl NEVER appears in the JSON', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${made.token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0]).toMatchObject({
      id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', url: 'https://r2.example/signed?sig=abc', available: true,
    })
    expect(body.documents[0]).not.toHaveProperty('fileUrl')
    expect(res.body).not.toContain('fileUrl')
    expect(res.body).not.toContain('document/m1/abcdef0123456789.pdf')
  })

  it('GET 200 for BRANCH_MANAGER (view allowed)', async () => {
    const made = await buildAppFor('BRANCH_MANAGER')
    app = made.app
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${made.token}` } })
    expect(res.statusCode).toBe(200)
  })

  it('GET 403 INSUFFICIENT_PERMISSIONS for STAFF (view denied)', async () => {
    const made = await buildAppFor('STAFF')
    app = made.app
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${made.token}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  it('GET 200 with available:false / url:null when presign fails (storage-dark degrade)', async () => {
    presignGetMock.mockRejectedValue(new Error('storage disabled'))
    const made = await buildAppFor('OWNER')
    app = made.app
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${made.token}` } })
    expect(res.statusCode).toBe(200)
    const doc = JSON.parse(res.body).documents[0]
    expect(doc.available).toBe(false)
    expect(doc.url).toBeNull()
    expect(res.body).not.toContain('fileUrl')
  })

  // ── Upload (D1: OWNER only) ────────────────────────────────────────────────

  it('POST 403 INSUFFICIENT_PERMISSIONS for BRANCH_MANAGER (upload denied)', async () => {
    const made = await buildAppFor('BRANCH_MANAGER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 403 INSUFFICIENT_PERMISSIONS for STAFF (upload denied)', async () => {
    const made = await buildAppFor('STAFF')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(403)
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 503 STORAGE_NOT_ENABLED when storage is dark (before reading bytes)', async () => {
    delete process.env.STORAGE_ENABLED
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error.code).toBe('STORAGE_NOT_ENABLED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 200 happy path: puts the object, creates the row, audits DOCUMENT_UPLOADED (actor MERCHANT_ADMIN), redacted response', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1' },
      { filename: 'verification.pdf', contentType: 'application/pdf', content: '%PDF-1.4 hello world' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: expect.any(String) })
    expect(res.body).not.toContain('fileUrl')
    expect(putObjectMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'document', ownerId: 'm1', contentType: 'application/pdf' }))
    expect((app as any).prisma.merchantDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantId: 'm1', documentType: 'BUSINESS_VERIFICATION_1', fileUrl: 'document/m1/abcdef0123456789.pdf' }) }),
    )
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'DOCUMENT_UPLOADED', actorType: 'MERCHANT_ADMIN', actorId: 'ma1' }) }),
    )
  })

  // ── D2: documentType allow-list ───────────────────────────────────────────

  it('POST 400 when documentType is AGREEMENT (not in the D2 self-serve allow-list)', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'AGREEMENT' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 400 when documentType is an unknown value', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'NOT_A_REAL_TYPE' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── Size / type rejection ─────────────────────────────────────────────────

  it('POST 400 FILE_REQUIRED when no file part is present', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload({ documentType: 'PRICE_LIST' })
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('FILE_REQUIRED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 400 UNSUPPORTED_FILE_TYPE for a disallowed content-type', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const { body, contentType } = multipartPayload(
      { documentType: 'PRICE_LIST' },
      { filename: 'd.gif', contentType: 'image/gif', content: 'GIF89a' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 400 FILE_REQUIRED for a non-multipart (JSON) body', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const res = await app.inject({
      method: 'POST', url: listUrl,
      headers: { authorization: `Bearer ${made.token}`, 'content-type': 'application/json' },
      payload: { documentType: 'PRICE_LIST' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('FILE_REQUIRED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST orphan cleanup: when the row create fails after the object write, deleteObject is called', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    ;(app as any).prisma.merchantDocument.create.mockRejectedValueOnce(new Error('db down'))
    const { body, contentType } = multipartPayload(
      { documentType: 'PRICE_LIST' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${made.token}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(500)
    expect(putObjectMock).toHaveBeenCalledTimes(1)
    expect(deleteObjectMock).toHaveBeenCalledWith('document/m1/abcdef0123456789.pdf')
  })

  // ── No delete route (D3) ──────────────────────────────────────────────────

  it('there is no self-delete route (D3): DELETE is not found', async () => {
    const made = await buildAppFor('OWNER')
    app = made.app
    const res = await app.inject({ method: 'DELETE', url: `${listUrl}/doc-1`, headers: { authorization: `Bearer ${made.token}` } })
    expect(res.statusCode).toBe(404)
  })
})
