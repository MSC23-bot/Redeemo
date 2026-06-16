/**
 * documents.ts - typed client for the B4 admin merchant document endpoints.
 * apiFetch is mocked to verify URL, method, auth, body shape, and Zod parsing.
 */
import { documentsApi } from '../documents'
import { apiFetch, ApiError } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number
    statusCode: number
    code: string | undefined
    body: unknown
    constructor(status: number, body: unknown) {
      const b = body as { error?: { code?: string; message?: string } } | null
      const nested = b?.error != null && typeof b.error === 'object' ? b.error : null
      super(nested?.message ?? `API error ${status}`)
      this.name = 'ApiError'
      this.status = status
      this.statusCode = status
      this.code = nested?.code
      this.body = body
    }
  },
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>
afterEach(() => jest.clearAllMocks())

describe('documentsApi.list', () => {
  const LIST = {
    documents: [
      { id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-10T00:00:00Z', url: 'https://signed', available: true },
      { id: 'doc-2', documentType: 'PRICE_LIST', uploadedAt: '2026-06-11T00:00:00Z', url: null, available: false },
    ],
  }

  it('GET /api/v1/admin/merchants/:id/documents with auth:true and parses the list', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST)
    const res = await documentsApi.list('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/documents', { auth: true })
    expect(res.documents).toHaveLength(2)
    expect(res.documents[1]).toMatchObject({ available: false, url: null })
  })

  it('tolerates an unknown documentType (drift resilience)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ documents: [{ id: 'd', documentType: 'NEW_KIND', uploadedAt: '2026-06-10T00:00:00Z', url: null, available: false }] })
    const res = await documentsApi.list('m-1')
    expect(res.documents[0].documentType).toBe('NEW_KIND')
  })

  it('throws on a malformed response (Zod)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(documentsApi.list('m-1')).rejects.toThrow()
  })
})

describe('documentsApi.upload', () => {
  it('POSTs multipart FormData (documentType + reason + file) and parses the redacted response', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-16T00:00:00Z' })
    const file = new File(['%PDF-1.4 x'], 'doc.pdf', { type: 'application/pdf' })
    const res = await documentsApi.upload('m-1', { documentType: 'BUSINESS_VERIFICATION_1', reason: 'Owner emailed it.', file })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/documents',
      expect.objectContaining({ method: 'POST', auth: true }),
    )
    const opts = mockedApiFetch.mock.calls[0][1] as { body: FormData }
    expect(opts.body).toBeInstanceOf(FormData)
    expect(opts.body.get('documentType')).toBe('BUSINESS_VERIFICATION_1')
    expect(opts.body.get('reason')).toBe('Owner emailed it.')
    expect(opts.body.get('file')).toBeInstanceOf(File)
    expect(res).toEqual({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-16T00:00:00Z' })
  })

  it('propagates ApiError with .code on STORAGE_NOT_ENABLED', async () => {
    const err = new ApiError(503, { error: { code: 'STORAGE_NOT_ENABLED', message: 'dark' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    const file = new File(['x'], 'd.pdf', { type: 'application/pdf' })
    await expect(documentsApi.upload('m-1', { documentType: 'PRICE_LIST', reason: 'r', file })).rejects.toMatchObject({ code: 'STORAGE_NOT_ENABLED' })
  })
})

describe('documentsApi.remove', () => {
  it('POST .../:documentId/delete with the reason JSON body and parses { ok }', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true })
    const res = await documentsApi.remove('m-1', 'doc-1', 'Superseded.')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/documents/doc-1/delete', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Superseded.' }),
    })
    expect(res.ok).toBe(true)
  })

  it('propagates ApiError with .code on DOCUMENT_NOT_FOUND', async () => {
    const err = new ApiError(404, { error: { code: 'DOCUMENT_NOT_FOUND', message: 'gone' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(documentsApi.remove('m-1', 'doc-x', 'r')).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' })
  })
})
