import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsSummary } from '@/features/savings/hooks/useSavingsSummary'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getSummary: jest.fn() },
}))

// §Savings Rebaseline (PR-B, Revision 2): auth store selector mocked
// to return `'authed'` so the React-Query gate is open.  When the
// gate is closed, the next test exercises the disabled path.
let mockAuthStatus = 'authed'
jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: mockAuthStatus }),
}))

const mockSavingsApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSavingsSummary', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAuthStatus = 'authed' })

  it('fetches savings summary when authed (Revision-2 byBranch shape)', async () => {
    const summary = {
      lifetimeSaving: 150,
      thisMonthSaving: 30,
      thisMonthRedemptionCount: 6,
      monthlyBreakdown: [],
      byBranch: [],
      byCategory: [],
    }
    mockSavingsApi.getSummary.mockResolvedValue(summary)

    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.lifetimeSaving).toBe(150)
    expect(result.current.data?.byBranch).toEqual([])
    expect(mockSavingsApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('exposes thisMonthSaving + redemptionCount + monthlyBreakdown', async () => {
    mockSavingsApi.getSummary.mockResolvedValue({
      lifetimeSaving: 200,
      thisMonthSaving: 45,
      thisMonthRedemptionCount: 9,
      monthlyBreakdown: [{ month: '2026-04', saving: 45, count: 9 }],
      byBranch: [],
      byCategory: [],
    })

    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.thisMonthSaving).toBe(45)
    expect(result.current.data?.thisMonthRedemptionCount).toBe(9)
    expect(result.current.data?.monthlyBreakdown).toHaveLength(1)
  })

  it('does NOT fire when unauthenticated', async () => {
    mockAuthStatus = 'unauthenticated'
    mockSavingsApi.getSummary.mockResolvedValue({
      lifetimeSaving: 0, thisMonthSaving: 0, thisMonthRedemptionCount: 0,
      monthlyBreakdown: [], byBranch: [], byCategory: [],
    })
    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    // `enabled: false` → status stays at pending; the queryFn never fires.
    await new Promise((r) => setTimeout(r, 50))
    expect(mockSavingsApi.getSummary).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })
})
