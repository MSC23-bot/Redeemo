import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsSummary } from '@/features/savings/hooks/useSavingsSummary'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getSummary: jest.fn() },
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }),
}))

const mockSavingsApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSavingsSummary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('fetches savings summary when authed', async () => {
    const summary = {
      lifetimeSaving: 150,
      thisMonthSaving: 30,
      thisMonthRedemptionCount: 6,
      monthlyBreakdown: [],
      byMerchant: [],
      byCategory: [],
    }
    mockSavingsApi.getSummary.mockResolvedValue(summary)

    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.lifetimeSaving).toBe(150)
    expect(mockSavingsApi.getSummary).toHaveBeenCalledTimes(1)
  })

  it('exposes thisMonthSaving and redemptionCount', async () => {
    mockSavingsApi.getSummary.mockResolvedValue({
      lifetimeSaving: 200,
      thisMonthSaving: 45,
      thisMonthRedemptionCount: 9,
      monthlyBreakdown: [{ month: '2026-04', saving: 45, count: 9 }],
      byMerchant: [],
      byCategory: [],
    })

    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.thisMonthSaving).toBe(45)
    expect(result.current.data?.thisMonthRedemptionCount).toBe(9)
    expect(result.current.data?.monthlyBreakdown).toHaveLength(1)
  })
})
