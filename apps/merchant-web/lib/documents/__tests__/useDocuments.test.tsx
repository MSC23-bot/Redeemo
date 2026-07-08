/**
 * B3: tests for lib/documents/useDocuments.ts. Mocks the lib/api/documents client
 * at module level and a QueryClientProvider with retry:false. Mirrors
 * lib/branches/useBranches.test.tsx's shape.
 */
import * as React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMerchantDocuments, useUploadDocument, MERCHANT_DOCUMENTS_KEY } from '../useDocuments'

const api = {
  list: jest.fn(),
  upload: jest.fn(),
}
jest.mock('@/lib/api/documents', () => ({
  documentsApi: {
    list: (...a: unknown[]) => api.list(...a),
    upload: (...a: unknown[]) => api.upload(...a),
  },
}))

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  api.list.mockReset()
  api.upload.mockReset()
})

describe('useMerchantDocuments', () => {
  it('fetches the list under MERCHANT_DOCUMENTS_KEY', async () => {
    api.list.mockResolvedValue({ documents: [{ id: 'd1', documentType: 'PRICE_LIST', uploadedAt: '2026-06-10', url: null, available: false }] })
    const qc = freshClient()
    const { result } = renderHook(() => useMerchantDocuments(), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.documents).toHaveLength(1)
    expect(qc.getQueryData(MERCHANT_DOCUMENTS_KEY)).toBeDefined()
  })

  it('does not fetch when enabled=false', async () => {
    const qc = freshClient()
    renderHook(() => useMerchantDocuments(false), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(api.list).not.toHaveBeenCalled()
  })
})

describe('useUploadDocument', () => {
  it('invalidates the documents query on success', async () => {
    api.upload.mockResolvedValue({ id: 'd2', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-16' })
    const qc = freshClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUploadDocument(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.mutateAsync({ documentType: 'BUSINESS_VERIFICATION_1', file: new File(['x'], 'a.pdf') })
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MERCHANT_DOCUMENTS_KEY })
  })

  it('invalidates the documents query on error too', async () => {
    api.upload.mockRejectedValue(new Error('boom'))
    const qc = freshClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useUploadDocument(), { wrapper: wrapper(qc) })

    await act(async () => {
      await result.current.mutateAsync({ documentType: 'PRICE_LIST', file: new File(['x'], 'a.pdf') }).catch(() => {})
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MERCHANT_DOCUMENTS_KEY })
  })
})
