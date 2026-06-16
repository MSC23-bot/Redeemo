import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'

// Option B B4: the admin merchant documents routes (read / upload / delete on
// behalf). The storage library is module-mocked so the tests never touch real R2:
// putObject/deleteObject/presignGet are stubbed, while kindPolicy + isStorageEnabled
// stay REAL (isStorageEnabled reads STORAGE_ENABLED, toggled per test). The SAFETY
// invariant pinned throughout: the raw fileUrl (R2 key) NEVER appears in any response.
const { putObjectMock, deleteObjectMock, presignGetMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn(),
  deleteObjectMock: vi.fn(),
  presignGetMock: vi.fn(),
}))
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return { ...actual, putObject: putObjectMock, deleteObject: deleteObjectMock, presignGet: presignGetMock }
})

function multipartPayload(
  fields: { documentType?: string; reason?: string },
  file?: { filename: string; contentType: string; content: string },
): { body: string; contentType: string } {
  const boundary = '----b4documentstestboundary'
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

describe('B4: admin merchant documents routes', () => {
  let app: FastifyInstance
  let savedStorageEnabled: string | undefined
  const signAdmin = (adminRole?: string) =>
    (app.jwt as any).admin.sign({ sub: 'admin-1', role: 'admin', adminRole, sessionId: 's1' }, { expiresIn: '1h' })
  const listUrl = '/api/v1/admin/merchants/m1/documents'

  beforeEach(async () => {
    savedStorageEnabled = process.env.STORAGE_ENABLED
    process.env.STORAGE_ENABLED = 'true'
    putObjectMock.mockReset().mockResolvedValue({ key: 'document/m1/abcdef0123456789.pdf' })
    deleteObjectMock.mockReset().mockResolvedValue(undefined)
    presignGetMock.mockReset().mockResolvedValue({ url: 'https://r2.example/signed?sig=abc', expiresIn: 300 })

    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
      merchantDocument: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: new Date('2026-06-10T00:00:00Z'), fileUrl: 'document/m1/abcdef0123456789.pdf' },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: 'doc-1', documentType: 'PRICE_LIST', fileUrl: 'document/m1/abcdef0123456789.pdf' }),
        create: vi.fn().mockResolvedValue({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: new Date('2026-06-16T00:00:00Z') }),
        delete: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((app as any).prisma)),
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') } as any)
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    if (savedStorageEnabled === undefined) delete process.env.STORAGE_ENABLED
    else process.env.STORAGE_ENABLED = savedStorageEnabled
  })

  // ── Read (merchant:read) ──────────────────────────────────────────────────

  it('GET 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: listUrl })
    expect(res.statusCode).toBe(401)
  })

  it('GET 403 ADMIN_CAPABILITY_DENIED for SUPPORT (lacks merchant:read)', async () => {
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPPORT')}` } })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('GET 200 for OPERATIONS: presigned docs, and the raw fileUrl NEVER appears in the JSON', async () => {
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0]).toMatchObject({
      id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', url: 'https://r2.example/signed?sig=abc', available: true,
    })
    // SAFETY: the raw R2 key must never be serialised (as a field or anywhere).
    expect(body.documents[0]).not.toHaveProperty('fileUrl')
    expect(res.body).not.toContain('fileUrl')
    expect(res.body).not.toContain('document/m1/abcdef0123456789.pdf')
  })

  it('GET 200 with available:false / url:null when presign fails (storage-dark path)', async () => {
    presignGetMock.mockRejectedValue(new Error('storage disabled'))
    const res = await app.inject({ method: 'GET', url: listUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` } })
    expect(res.statusCode).toBe(200)
    const doc = JSON.parse(res.body).documents[0]
    expect(doc.available).toBe(false)
    expect(doc.url).toBeNull()
    expect(res.body).not.toContain('fileUrl')
  })

  // ── Upload (merchant:manage-documents, SUPER_ADMIN) ───────────────────────

  it('POST 403 for OPERATIONS (lacks merchant:manage-documents)', async () => {
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1', reason: 'r' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('ADMIN_CAPABILITY_DENIED')
  })

  it('POST 503 STORAGE_NOT_ENABLED when storage is dark (before reading bytes)', async () => {
    delete process.env.STORAGE_ENABLED
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1', reason: 'r' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error.code).toBe('STORAGE_NOT_ENABLED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 200 happy path: puts the object, creates the row, audits DOCUMENT_UPLOADED (actor ADMIN), redacted response', async () => {
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1', reason: 'Owner emailed it to us.' },
      { filename: 'verification.pdf', contentType: 'application/pdf', content: '%PDF-1.4 hello world' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(200)
    // Redacted response: no key, no url.
    expect(JSON.parse(res.body)).toEqual({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: expect.any(String) })
    expect(res.body).not.toContain('fileUrl')
    // putObject got the document kind + the merchant ownerId + the real content-type.
    expect(putObjectMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'document', ownerId: 'm1', contentType: 'application/pdf' }))
    expect((app as any).prisma.merchantDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantId: 'm1', documentType: 'BUSINESS_VERIFICATION_1', fileUrl: 'document/m1/abcdef0123456789.pdf' }) }),
    )
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'DOCUMENT_UPLOADED', actorType: 'ADMIN', actorId: 'admin-1', reason: 'Owner emailed it to us.' }) }),
    )
  })

  it('POST 400 FILE_REQUIRED when no file part is present', async () => {
    const { body, contentType } = multipartPayload({ documentType: 'BUSINESS_VERIFICATION_1', reason: 'r' })
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('FILE_REQUIRED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 400 UNSUPPORTED_FILE_TYPE for a disallowed content-type', async () => {
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1', reason: 'r' },
      { filename: 'd.gif', contentType: 'image/gif', content: 'GIF89a' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('POST 400 when reason is missing (validation)', async () => {
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(400)
  })

  it('POST orphan cleanup: when the row create fails after the object write, deleteObject is called', async () => {
    ;(app as any).prisma.merchantDocument.create.mockRejectedValueOnce(new Error('db down'))
    const { body, contentType } = multipartPayload(
      { documentType: 'BUSINESS_VERIFICATION_1', reason: 'r' },
      { filename: 'd.pdf', contentType: 'application/pdf', content: '%PDF-1.4 x' },
    )
    const res = await app.inject({ method: 'POST', url: listUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}`, 'content-type': contentType }, payload: body })
    expect(res.statusCode).toBe(500)
    expect(putObjectMock).toHaveBeenCalledTimes(1)
    expect(deleteObjectMock).toHaveBeenCalledWith('document/m1/abcdef0123456789.pdf')
  })

  // ── Delete (merchant:manage-documents, SUPER_ADMIN) ───────────────────────

  const delUrl = '/api/v1/admin/merchants/m1/documents/doc-1/delete'

  it('DELETE 403 for OPERATIONS', async () => {
    const res = await app.inject({ method: 'POST', url: delUrl, headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` }, payload: { reason: 'remove' } })
    expect(res.statusCode).toBe(403)
  })

  it('DELETE 400 when reason is missing', async () => {
    const res = await app.inject({ method: 'POST', url: delUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('DELETE 404 DOCUMENT_NOT_FOUND when the doc is absent / not this merchant', async () => {
    ;(app as any).prisma.merchantDocument.findFirst.mockResolvedValueOnce(null)
    const res = await app.inject({ method: 'POST', url: delUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'remove' } })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('DOCUMENT_NOT_FOUND')
  })

  it('DELETE 200 happy: deletes the row, audits DOCUMENT_DELETED, best-effort deletes the object', async () => {
    const res = await app.inject({ method: 'POST', url: delUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'Superseded by a newer version.' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect((app as any).prisma.merchantDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } })
    expect((app as any).prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'DOCUMENT_DELETED', actorType: 'ADMIN', reason: 'Superseded by a newer version.' }) }),
    )
    expect(deleteObjectMock).toHaveBeenCalledWith('document/m1/abcdef0123456789.pdf')
  })

  it('DELETE 200 even when the best-effort object delete fails (row delete is the source of truth)', async () => {
    deleteObjectMock.mockRejectedValueOnce(new Error('R2 down'))
    const res = await app.inject({ method: 'POST', url: delUrl, headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` }, payload: { reason: 'remove' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect((app as any).prisma.merchantDocument.delete).toHaveBeenCalled()
  })
})
