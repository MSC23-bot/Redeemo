/**
 * useMerchantDocuments hooks (B4) - verifies the upload/delete mutations
 * invalidate the documents query on success AND error. The API is mocked.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUploadDocument, useDeleteDocument, merchantDocumentsQueryKey } from '../useMerchantDocuments'
import { documentsApi } from '@/lib/api/documents'

jest.mock('@/lib/api/documents', () => ({
  documentsApi: { list: jest.fn(), upload: jest.fn(), remove: jest.fn() },
}))

const MERCHANT_ID = 'm-1'

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { invalidateSpy, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useUploadDocument', () => {
  it('invalidates the documents query on success', async () => {
    ;(documentsApi.upload as jest.Mock).mockResolvedValueOnce({ id: 'd', documentType: 'PRICE_LIST', uploadedAt: '2026-06-16T00:00:00Z' })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useUploadDocument(MERCHANT_ID), { wrapper: Wrapper })
    const file = new File(['x'], 'd.pdf', { type: 'application/pdf' })
    result.current.mutate({ documentType: 'PRICE_LIST', reason: 'r', file })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(documentsApi.upload).toHaveBeenCalledWith(MERCHANT_ID, { documentType: 'PRICE_LIST', reason: 'r', file })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantDocumentsQueryKey(MERCHANT_ID) })
  })

  it('invalidates the documents query on ERROR', async () => {
    ;(documentsApi.upload as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useUploadDocument(MERCHANT_ID), { wrapper: Wrapper })
    const file = new File(['x'], 'd.pdf', { type: 'application/pdf' })
    result.current.mutate({ documentType: 'PRICE_LIST', reason: 'r', file })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantDocumentsQueryKey(MERCHANT_ID) })
  })
})

describe('useDeleteDocument', () => {
  it('invalidates the documents query on success, passing documentId + reason', async () => {
    ;(documentsApi.remove as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useDeleteDocument(MERCHANT_ID), { wrapper: Wrapper })
    result.current.mutate({ documentId: 'doc-1', reason: 'Superseded.' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(documentsApi.remove).toHaveBeenCalledWith(MERCHANT_ID, 'doc-1', 'Superseded.')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantDocumentsQueryKey(MERCHANT_ID) })
  })

  it('invalidates the documents query on ERROR', async () => {
    ;(documentsApi.remove as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useDeleteDocument(MERCHANT_ID), { wrapper: Wrapper })
    result.current.mutate({ documentId: 'doc-1', reason: 'r' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: merchantDocumentsQueryKey(MERCHANT_ID) })
  })
})
