/**
 * useAwaitingReviewCount : React Query hook tests.
 *
 * Mocks approvalsApi.list to verify the request shape (status/type/pageSize)
 * and that the hook reads `total`, not the row count.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAwaitingReviewCount } from '../useAwaitingReviewCount'
import { approvalsApi } from '@/lib/api/approvals'

jest.mock('@/lib/api/approvals', () => ({
  approvalsApi: {
    list: jest.fn(),
  },
}))

const mockedList = approvalsApi.list as jest.MockedFunction<typeof approvalsApi.list>

function makeWrapper() {
  let qc: QueryClient
  function Wrapper({ children }: { children: React.ReactNode }) {
    if (!qc) {
      qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    }
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

describe('useAwaitingReviewCount', () => {
  beforeEach(() => {
    mockedList.mockClear()
  })

  it('calls approvalsApi.list filtered to PENDING + MERCHANT_ONBOARDING, pageSize 1', async () => {
    mockedList.mockResolvedValueOnce({ page: 1, pageSize: 1, total: 6, approvals: [] })

    const { result } = renderHook(() => useAwaitingReviewCount(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockedList).toHaveBeenCalledTimes(1)
    expect(mockedList).toHaveBeenCalledWith({
      status: 'PENDING',
      type: 'MERCHANT_ONBOARDING',
      pageSize: 1,
    })
  })

  it('reads the count from the response total, not the returned rows', async () => {
    mockedList.mockResolvedValueOnce({ page: 1, pageSize: 1, total: 42, approvals: [] })

    const { result } = renderHook(() => useAwaitingReviewCount(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.count).toBe(42))
  })

  it('does NOT call approvalsApi.list when enabled is false', async () => {
    mockedList.mockResolvedValue({ page: 1, pageSize: 1, total: 0, approvals: [] })

    const { result } = renderHook(() => useAwaitingReviewCount({ enabled: false }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockedList).not.toHaveBeenCalled()
    expect(result.current.count).toBeUndefined()
  })

  it('surfaces isError on a failed fetch', async () => {
    mockedList.mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useAwaitingReviewCount(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.count).toBeUndefined()
  })
})
