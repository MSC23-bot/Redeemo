/**
 * useVoucherReview hooks (Day-2 Vouchers PR-C). Verifies:
 *   useVoucherReview         : fetches the context, respects `enabled`
 *   useApproveVoucher        : invalidates QUEUE_KEY + voucherReviewQueryKey(id) on success AND error
 *   useRejectVoucher         : same invalidation contract; passes the reason through
 *   useRequestVoucherChanges : same invalidation contract; passes { proposed, note } through
 *
 * The underlying API calls are mocked; assertions are on invalidateQueries spies.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useVoucherReview,
  useApproveVoucher,
  useRejectVoucher,
  useRequestVoucherChanges,
  voucherReviewQueryKey,
} from '../useVoucherReview'
import { voucherReviewApi } from '@/lib/api/voucherReview'
import { QUEUE_KEY } from '@/lib/queue/useQueue'

jest.mock('@/lib/api/voucherReview', () => ({
  voucherReviewApi: {
    get: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    requestChanges: jest.fn(),
  },
}))

const APPROVAL_ID = 'apr-1'

function makeHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return { qc, invalidateSpy, Wrapper }
}

afterEach(() => jest.clearAllMocks())

describe('useVoucherReview', () => {
  it('does not fetch when enabled is false', () => {
    const { Wrapper } = makeHarness()
    renderHook(() => useVoucherReview(APPROVAL_ID, false), { wrapper: Wrapper })
    expect(voucherReviewApi.get as jest.Mock).not.toHaveBeenCalled()
  })

  it('fetches the context when enabled is true', async () => {
    ;(voucherReviewApi.get as jest.Mock).mockResolvedValueOnce({
      voucher: { id: 'v-1' },
      merchant: null,
      goLive: false,
    })
    const { Wrapper } = makeHarness()
    const { result } = renderHook(() => useVoucherReview(APPROVAL_ID, true), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(voucherReviewApi.get as jest.Mock).toHaveBeenCalledWith(APPROVAL_ID)
  })
})

describe('useApproveVoucher', () => {
  it('invalidates the queue + review on success', async () => {
    ;(voucherReviewApi.approve as jest.Mock).mockResolvedValueOnce({ approved: true, goLive: true })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useApproveVoucher(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: voucherReviewQueryKey(APPROVAL_ID) })
  })

  it('invalidates the queue + review on error', async () => {
    ;(voucherReviewApi.approve as jest.Mock).mockRejectedValueOnce(new Error('APPROVAL_NOT_ACTIONABLE'))
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useApproveVoucher(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: voucherReviewQueryKey(APPROVAL_ID) })
  })
})

describe('useRejectVoucher', () => {
  it('passes the reason and invalidates on success', async () => {
    ;(voucherReviewApi.reject as jest.Mock).mockResolvedValueOnce({ rejected: true })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useRejectVoucher(APPROVAL_ID), { wrapper: Wrapper })

    result.current.mutate('Saving claim is not accurate.')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(voucherReviewApi.reject as jest.Mock).toHaveBeenCalledWith(
      APPROVAL_ID,
      'Saving claim is not accurate.',
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: voucherReviewQueryKey(APPROVAL_ID) })
  })
})

describe('useRequestVoucherChanges', () => {
  it('passes { proposed, note } and invalidates on success', async () => {
    ;(voucherReviewApi.requestChanges as jest.Mock).mockResolvedValueOnce({ changesRequested: true })
    const { invalidateSpy, Wrapper } = makeHarness()
    const { result } = renderHook(() => useRequestVoucherChanges(APPROVAL_ID), { wrapper: Wrapper })

    const input = { proposed: { title: 'Better' }, note: 'Tighten the title.' }
    result.current.mutate(input)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(voucherReviewApi.requestChanges as jest.Mock).toHaveBeenCalledWith(APPROVAL_ID, input)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: QUEUE_KEY })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: voucherReviewQueryKey(APPROVAL_ID) })
  })
})
