/**
 * useInProgressOnboardings : React Query hook tests.
 *
 * Mocks merchantsApi.list to return distinct REGISTERED + PENDING_APPROVAL
 * sets. Verifies two server-side status-filtered calls, the merged+sorted
 * result, the real combined total, and the display cap.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useInProgressOnboardings, IN_PROGRESS_DISPLAY_CAP } from '../useInProgressOnboardings'
import { merchantsApi } from '@/lib/api/merchants'
import type { MerchantSummary } from '@/lib/api/merchants'

jest.mock('@/lib/api/merchants', () => ({
  merchantsApi: {
    list: jest.fn(),
  },
}))

const mockedList = merchantsApi.list as jest.MockedFunction<typeof merchantsApi.list>

function makeMerchant(overrides: Partial<MerchantSummary> & { id: string }): MerchantSummary {
  return {
    businessName: 'Test Merchant',
    tradingName: null,
    status: 'REGISTERED',
    verificationStatus: 'NOT_SUBMITTED',
    onboardingStep: 'REGISTERED',
    logoUrl: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    category: null,
    branchCount: 0,
    ...overrides,
  }
}

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

describe('useInProgressOnboardings', () => {
  beforeEach(() => {
    mockedList.mockClear()
  })

  it('issues two parallel list calls : one for REGISTERED, one for PENDING_APPROVAL', async () => {
    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 0, merchants: [] })
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 0, merchants: [] })

    const { result } = renderHook(() => useInProgressOnboardings(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockedList).toHaveBeenCalledTimes(2)
    const statuses = mockedList.mock.calls.map((c) => c[0]?.status).sort()
    expect(statuses).toEqual(['PENDING_APPROVAL', 'REGISTERED'])
  })

  it('merges results and sorts most-recently-created-first', async () => {
    const older = makeMerchant({ id: 'm-older', businessName: 'Older Co', createdAt: '2026-06-01T10:00:00.000Z' })
    const newer = makeMerchant({ id: 'm-newer', businessName: 'Newer Co', status: 'PENDING_APPROVAL', createdAt: '2026-07-05T10:00:00.000Z' })

    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 1, merchants: [older] })
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 1, merchants: [newer] })

    const { result } = renderHook(() => useInProgressOnboardings(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.items.map((m) => m.id)).toEqual(['m-newer', 'm-older'])
  })

  it('reports the REAL combined total from both responses, even beyond the display cap', async () => {
    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 7, merchants: [] })
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 4, merchants: [] })

    const { result } = renderHook(() => useInProgressOnboardings(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.total).toBe(11))
  })

  it('caps the displayed items at IN_PROGRESS_DISPLAY_CAP', async () => {
    const registered = Array.from({ length: IN_PROGRESS_DISPLAY_CAP }, (_, i) =>
      makeMerchant({ id: `m-r-${i}`, createdAt: `2026-07-0${(i % 9) + 1}T10:00:00.000Z` })
    )
    const pending = Array.from({ length: IN_PROGRESS_DISPLAY_CAP }, (_, i) =>
      makeMerchant({ id: `m-p-${i}`, status: 'PENDING_APPROVAL', createdAt: `2026-06-0${(i % 9) + 1}T10:00:00.000Z` })
    )

    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: registered.length, merchants: registered })
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: pending.length, merchants: pending })

    const { result } = renderHook(() => useInProgressOnboardings(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.items.length).toBe(IN_PROGRESS_DISPLAY_CAP)
    expect(result.current.total).toBe(registered.length + pending.length)
  })

  it('does NOT call merchantsApi.list when enabled is false', async () => {
    mockedList.mockResolvedValue({ page: 1, pageSize: 10, total: 0, merchants: [] })

    const { result } = renderHook(() => useInProgressOnboardings({ enabled: false }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockedList).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
    expect(result.current.total).toBeUndefined()
  })

  it('surfaces isError when either fetch fails', async () => {
    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 10, total: 0, merchants: [] })
      .mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useInProgressOnboardings(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
