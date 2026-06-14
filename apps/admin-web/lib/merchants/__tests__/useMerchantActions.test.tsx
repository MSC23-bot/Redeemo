/**
 * useMerchantActions — verifies the cache-invalidation contract on success:
 *   useCreateDraft     — no review/queue invalidation (a draft has no approval)
 *   useSuspend         — invalidates QUEUE_KEY + reviewQueryKey(approvalId)
 *   useReactivate      — invalidates QUEUE_KEY + reviewQueryKey(approvalId)
 *   useConfirmLocation — invalidates reviewQueryKey(approvalId) ONLY (not the queue)
 *
 * The underlying API calls are mocked; we assert on invalidateQueries spies.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useCreateDraft,
  useSuspend,
  useReactivate,
  useConfirmLocation,
} from '../useMerchantActions'
import { merchantsApi } from '@/lib/api/merchants'
import { branchesApi } from '@/lib/api/branches'
import { QUEUE_KEY } from '@/lib/queue/useQueue'
import { reviewQueryKey } from '@/lib/review/useReview'

jest.mock('@/lib/api/merchants', () => ({
  merchantsApi: {
    createDraft: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
  },
}))
jest.mock('@/lib/api/branches', () => ({
  branchesApi: {
    confirmLocation: jest.fn(),
  },
}))

const APPROVAL_ID = 'apr-1'
const MERCHANT_ID = 'm-1'

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, invalidateSpy, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useCreateDraft', () => {
  it('does NOT invalidate the review or queue on success', async () => {
    ;(merchantsApi.createDraft as jest.Mock).mockResolvedValueOnce({
      merchantId: MERCHANT_ID,
      ownerAdminId: 'adm-1',
      ownerEmail: 'o@acme.test',
      passwordSetupRequired: true,
    })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useCreateDraft(), { wrapper: Wrapper })

    result.current.mutate({
      businessName: 'Acme',
      ownerEmail: 'o@acme.test',
      ownerFirstName: 'O',
      ownerLastName: 'A',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useSuspend', () => {
  it('invalidates the queue AND the review on success', async () => {
    ;(merchantsApi.suspend as jest.Mock).mockResolvedValueOnce({
      suspended: true,
      alreadySuspended: false,
    })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useSuspend(MERCHANT_ID, APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate('Fraud.')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
  })

  it('invalidates the queue AND the review on ERROR (stale state moved on)', async () => {
    ;(merchantsApi.suspend as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useSuspend(MERCHANT_ID, APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate('Fraud.')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
  })
})

describe('useReactivate', () => {
  it('invalidates the queue AND the review on success', async () => {
    ;(merchantsApi.reactivate as jest.Mock).mockResolvedValueOnce({
      reactivated: true,
      alreadyActive: false,
    })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useReactivate(MERCHANT_ID, APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
  })

  it('invalidates the queue AND the review on ERROR (stale state moved on)', async () => {
    ;(merchantsApi.reactivate as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useReactivate(MERCHANT_ID, APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
  })
})

describe('useConfirmLocation', () => {
  it('invalidates the review ONLY (not the queue) on success', async () => {
    ;(branchesApi.confirmLocation as jest.Mock).mockResolvedValueOnce({
      branchId: 'br-1',
      latitude: 1,
      longitude: 2,
      locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useConfirmLocation(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate({ branchId: 'br-1', input: { latitude: 1, longitude: 2 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
  })

  it('invalidates the review ONLY (not the queue) on ERROR', async () => {
    ;(branchesApi.confirmLocation as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useConfirmLocation(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate({ branchId: 'br-1', input: { latitude: 1, longitude: 2 } })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: reviewQueryKey(APPROVAL_ID) })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
  })

  it('passes the branchId + input through to branchesApi.confirmLocation', async () => {
    ;(branchesApi.confirmLocation as jest.Mock).mockResolvedValueOnce({
      branchId: 'br-9',
      latitude: 53.6,
      longitude: -1.7,
      locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useConfirmLocation(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate({ branchId: 'br-9', input: { latitude: 53.6, longitude: -1.7 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(branchesApi.confirmLocation).toHaveBeenCalledWith('br-9', { latitude: 53.6, longitude: -1.7 })
  })
})
