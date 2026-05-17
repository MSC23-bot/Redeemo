import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsRedemptions } from '@/features/savings/hooks/useSavingsRedemptions'
import { savingsApi, type SavingsRedemption } from '@/lib/api/savings'

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

function makeRedemption(id: string): SavingsRedemption {
  return {
    id,
    redeemedAt: '2026-05-17T10:30:00.000Z',
    estimatedSaving: 1,
    isValidated: false,
    validatedAt: null,
    merchant: { id: 'm', businessName: 'M', logoUrl: null },
    voucher: { id: `v-${id}`, title: 't', voucherType: 'BOGO' },
    branch: { id: 'b', name: 'B' },
  }
}

describe('useSavingsRedemptions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('fetches the first page when authed', async () => {
    mockSavingsApi.getRedemptions.mockResolvedValue({
      redemptions: [makeRedemption('1')],
      total: 1,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0].redemptions).toHaveLength(1)
    expect(mockSavingsApi.getRedemptions).toHaveBeenCalledWith({ limit: 20, offset: 0 })
  })

  it('marks `hasNextPage: true` until cumulative count reaches total', async () => {
    mockSavingsApi.getRedemptions.mockResolvedValueOnce({
      redemptions: [makeRedemption('1'), makeRedemption('2')],
      total: 5,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // 2 of 5 loaded — hasNextPage should be true.
    expect(result.current.hasNextPage).toBe(true)
  })

  it('marks `hasNextPage: false` when cumulative count meets total', async () => {
    mockSavingsApi.getRedemptions.mockResolvedValue({
      redemptions: [makeRedemption('1'), makeRedemption('2')],
      total: 2,
    })

    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(false)
  })
})
