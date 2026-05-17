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

  it('fires when month is a YYYY-MM string', async () => {
    mockSavingsApi.getMonthlyDetail.mockResolvedValue({
      totalSaving: 32,
      redemptionCount: 5,
      byBranch: [],
      byCategory: [],
    })

    const { result } = renderHook(() => useMonthlyDetail('2026-04'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalSaving).toBe(32)
    expect(mockSavingsApi.getMonthlyDetail).toHaveBeenCalledWith('2026-04')
  })

  it('disabled when month === null (no drill-down)', async () => {
    const { result } = renderHook(() => useMonthlyDetail(null), { wrapper })
    await new Promise((r) => setTimeout(r, 30))
    expect(mockSavingsApi.getMonthlyDetail).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
