import { documentsApi } from '@/lib/api/documents'

// B3: the merchant documents API client. apiFetch is mocked; the client must
// compose the right calls against the real merged backend
// (src/api/merchant/documents/routes.ts).

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

beforeEach(() => {
  apiFetch.mockReset()
})

describe('lib/api/documents', () => {
  it('list() GETs the merchant documents with auth (no merchantId param - own-scope)', async () => {
    apiFetch.mockResolvedValueOnce({
      documents: [{ id: 'doc-1', documentType: 'PRICE_LIST', uploadedAt: '2026-06-10T00:00:00.000Z', url: 'https://r2.example/x', available: true }],
    })
    const res = await documentsApi.list()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/documents', { method: 'GET', auth: true })
    expect(res.documents[0].id).toBe('doc-1')
  })

  it('upload() POSTs multipart/form-data with documentType + file (no reason field)', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'doc-new', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-16T00:00:00.000Z' })
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })
    const res = await documentsApi.upload({ documentType: 'BUSINESS_VERIFICATION_1', file })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [path, options] = apiFetch.mock.calls[0]
    expect(path).toBe('/api/v1/merchant/documents')
    expect(options.method).toBe('POST')
    expect(options.auth).toBe(true)
    expect(options.body).toBeInstanceOf(FormData)
    expect((options.body as FormData).get('documentType')).toBe('BUSINESS_VERIFICATION_1')
    expect((options.body as FormData).get('file')).toBe(file)
    expect((options.body as FormData).has('reason')).toBe(false)
    expect(res.id).toBe('doc-new')
  })

  it('DOCUMENT_TYPES excludes AGREEMENT (D2 self-serve allow-list)', async () => {
    const { DOCUMENT_TYPES } = await import('@/lib/api/documents')
    expect(DOCUMENT_TYPES).toEqual(['BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST'])
  })
})
