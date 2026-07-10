/**
 * useQueueHistory — React Query hook tests.
 *
 * Mocks approvalsApi.list to return distinct APPROVED/REJECTED/WITHDRAWN
 * sets. Verifies the lazy `enabled` gate, three parallel calls, the
 * merged+sorted (newest-actioned-first) result, and `hasLoaded`.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useQueueHistory } from '../useQueueHistory'
import { approvalsApi } from '@/lib/api/approvals'

jest.mock('@/lib/api/approvals', () => ({
  approvalsApi: {
    list: jest.fn(),
  },
}))

const mockedList = approvalsApi.list as jest.MockedFunction<typeof approvalsApi.list>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeApproval(overrides: {
  id: string
  status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  submittedAt: string
  actionedAt: string | null
}) {
  return {
    id: overrides.id,
    type: 'MERCHANT_ONBOARDING' as const,
    referenceId: 'ref-1',
    referenceType: 'MERCHANT',
    status: overrides.status,
    adminUserId: 'admin-1',
    comment: null,
    submittedAt: overrides.submittedAt,
    actionedAt: overrides.actionedAt,
    claimedById: null,
    claimedAt: null,
    claimedBy: null,
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      status: 'ACTIVE',
    },
  }
}

const APPROVED = makeApproval({
  id: 'a-approved',
  status: 'APPROVED',
  submittedAt: '2026-06-10T10:00:00.000Z',
  actionedAt: '2026-06-12T10:00:00.000Z',
})

const REJECTED = makeApproval({
  id: 'a-rejected',
  status: 'REJECTED',
  submittedAt: '2026-06-09T10:00:00.000Z',
  actionedAt: '2026-06-14T10:00:00.000Z', // most recently actioned
})

const WITHDRAWN = makeApproval({
  id: 'a-withdrawn',
  status: 'WITHDRAWN',
  submittedAt: '2026-06-08T10:00:00.000Z',
  actionedAt: null, // withdrawn rows may carry no actionedAt -> falls back to submittedAt
})

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

describe('useQueueHistory', () => {
  beforeEach(() => {
    mockedList.mockClear()
  })

  it('does NOT call approvalsApi.list when enabled is false (default)', async () => {
    mockedList.mockResolvedValue({ page: 1, pageSize: 100, total: 0, approvals: [] })

    const { result } = renderHook(() => useQueueHistory(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockedList).not.toHaveBeenCalled()
    expect(result.current.hasLoaded).toBe(false)
  })

  it('issues three parallel list calls (APPROVED/REJECTED/WITHDRAWN) when enabled', async () => {
    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [APPROVED] })
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [REJECTED] })
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [WITHDRAWN] })

    const { result } = renderHook(() => useQueueHistory({ enabled: true }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockedList).toHaveBeenCalledTimes(3)
    const statuses = mockedList.mock.calls.map((c) => c[0]?.status).sort()
    expect(statuses).toEqual(['APPROVED', 'REJECTED', 'WITHDRAWN'])
  })

  it('merges + sorts newest-actioned-first, falling back to submittedAt when actionedAt is null', async () => {
    mockedList
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [APPROVED] })
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [REJECTED] })
      .mockResolvedValueOnce({ page: 1, pageSize: 100, total: 1, approvals: [WITHDRAWN] })

    const { result } = renderHook(() => useQueueHistory({ enabled: true }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // REJECTED actioned 06-14 (newest) > APPROVED actioned 06-12 > WITHDRAWN
    // falls back to submittedAt 06-08 (oldest).
    expect(result.current.items.map((i) => i.id)).toEqual([
      'a-rejected',
      'a-approved',
      'a-withdrawn',
    ])
  })

  it('sets hasLoaded true only after a successful fetch', async () => {
    mockedList.mockResolvedValue({ page: 1, pageSize: 100, total: 0, approvals: [] })

    const { result } = renderHook(() => useQueueHistory({ enabled: true }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    expect(result.current.items).toEqual([])
  })
})
