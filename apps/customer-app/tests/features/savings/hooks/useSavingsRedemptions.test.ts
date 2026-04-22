import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsRedemptions } from '@/features/savings/hooks/useSavingsRedemptions'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getRedemptions: jest.fn() },
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }),
}))

const mockSavingsApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const mockRedemption = {
  id: 'r1',
  redeemedAt: '2026-04-01T10:00:00Z',
  estimatedSaving: 10,
  isValidated: true,
  validatedAt: '2026-04-01T10:05:00Z',
  merchant: { id: 'm1', businessName: 'Pizza Palace', logoUrl: null },
  voucher: { id: 'v1', title: 'BOGO Pizza', voucherType: 'BOGO' as const },
  branch: { id: 'b1', name: 'Central Branch' },
}

describe('useSavingsRedemptions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('fetches first page of redemptions when authed', async () => {
    mockSavingsApi.getRedemptions.mockResolvedValue({
      redemptions: [mockRedemption],
      total: 1,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0]?.redemptions).toHaveLength(1)
    expect(mockSavingsApi.getRedemptions).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('returns undefined for getNextPageParam when all loaded', async () => {
    mockSavingsApi.getRedemptions.mockResolvedValue({
      redemptions: [mockRedemption],
      total: 1,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('indicates hasNextPage when more items remain', async () => {
    const redemptions = Array.from({ length: 20 }, (_, i) => ({ ...mockRedemption, id: `r${i}` }))
    mockSavingsApi.getRedemptions.mockResolvedValue({
      redemptions,
      total: 35,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)
  })
})
