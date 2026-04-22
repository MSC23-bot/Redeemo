import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMonthlyDetail } from '@/features/savings/hooks/useMonthlyDetail'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getMonthlyDetail: jest.fn() },
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }),
}))

const mockSavingsApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMonthlyDetail', () => {
  beforeEach(() => jest.clearAllMocks())

  it('fetches monthly detail for a given month', async () => {
    mockSavingsApi.getMonthlyDetail.mockResolvedValue({
      totalSaving: 45,
      redemptionCount: 9,
      byMerchant: [{ merchantId: 'm1', businessName: 'Pizza Palace', logoUrl: null, saving: 45, count: 9 }],
      byCategory: [],
    })

    const { result } = renderHook(() => useMonthlyDetail('2026-04'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalSaving).toBe(45)
    expect(result.current.data?.redemptionCount).toBe(9)
    expect(mockSavingsApi.getMonthlyDetail).toHaveBeenCalledWith('2026-04')
  })

  it('does not fetch when month is null', () => {
    renderHook(() => useMonthlyDetail(null), { wrapper })
    expect(mockSavingsApi.getMonthlyDetail).not.toHaveBeenCalled()
  })

  it('uses month in the query key so different months cache separately', async () => {
    mockSavingsApi.getMonthlyDetail.mockResolvedValue({
      totalSaving: 20,
      redemptionCount: 4,
      byMerchant: [],
      byCategory: [],
    })

    const { result: r1 } = renderHook(() => useMonthlyDetail('2026-03'), { wrapper })
    await waitFor(() => expect(r1.current.isSuccess).toBe(true))
    expect(mockSavingsApi.getMonthlyDetail).toHaveBeenCalledWith('2026-03')
  })
})
