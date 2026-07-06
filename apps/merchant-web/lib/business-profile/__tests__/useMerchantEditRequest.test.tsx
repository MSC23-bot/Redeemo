/**
 * Business Profile M4: the reviewed-lane mutation hooks. Mocks lib/api/profile's
 * createMerchantEditRequest / withdrawMerchantEditRequest at module level (mirrors
 * lib/business-profile/useUpdateMerchantProfile.test.tsx + lib/branches/useBranches
 * test conventions). Pins that BOTH mutations invalidate the SAME
 * ['merchantProfile'] key useUpdateMerchantProfile writes to, so a create/withdraw
 * here re-syncs with the shared profile read.
 */
import * as React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateMerchantEditRequest, useWithdrawMerchantEditRequest } from '@/lib/business-profile/useMerchantEditRequest'
import { MERCHANT_PROFILE_KEY } from '@/lib/business-profile/useUpdateMerchantProfile'

const createMerchantEditRequest = jest.fn()
const withdrawMerchantEditRequest = jest.fn()
jest.mock('@/lib/api/profile', () => {
  const actual = jest.requireActual('@/lib/api/profile')
  return {
    ...actual,
    createMerchantEditRequest: (...a: unknown[]) => createMerchantEditRequest(...a),
    withdrawMerchantEditRequest: (...a: unknown[]) => withdrawMerchantEditRequest(...a),
  }
})

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  createMerchantEditRequest.mockReset()
  withdrawMerchantEditRequest.mockReset()
})

describe('useCreateMerchantEditRequest', () => {
  it('calls createMerchantEditRequest with the given changes', async () => {
    createMerchantEditRequest.mockResolvedValue({ id: 'pe1', status: 'PENDING' })
    const qc = freshClient()
    const { result } = renderHook(() => useCreateMerchantEditRequest(), { wrapper: wrapper(qc) })

    result.current.mutate({ businessName: 'New Name' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(createMerchantEditRequest).toHaveBeenCalledWith({ businessName: 'New Name' })
  })

  it('invalidates the ["merchantProfile"] cache on success', async () => {
    createMerchantEditRequest.mockResolvedValue({ id: 'pe1', status: 'PENDING' })
    const qc = freshClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateMerchantEditRequest(), { wrapper: wrapper(qc) })

    result.current.mutate({ businessName: 'New Name' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MERCHANT_PROFILE_KEY })
  })

  it('surfaces a rejection (e.g. PENDING_EDIT_EXISTS) without invalidating', async () => {
    createMerchantEditRequest.mockRejectedValue(new Error('PENDING_EDIT_EXISTS'))
    const qc = freshClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCreateMerchantEditRequest(), { wrapper: wrapper(qc) })

    result.current.mutate({ businessName: 'New Name' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useWithdrawMerchantEditRequest', () => {
  it('calls withdrawMerchantEditRequest with the editId', async () => {
    withdrawMerchantEditRequest.mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })
    const qc = freshClient()
    const { result } = renderHook(() => useWithdrawMerchantEditRequest(), { wrapper: wrapper(qc) })

    result.current.mutate('pe1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(withdrawMerchantEditRequest).toHaveBeenCalledWith('pe1')
  })

  it('invalidates the ["merchantProfile"] cache on success', async () => {
    withdrawMerchantEditRequest.mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })
    const qc = freshClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useWithdrawMerchantEditRequest(), { wrapper: wrapper(qc) })

    result.current.mutate('pe1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: MERCHANT_PROFILE_KEY })
  })
})
