import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRedeem } from '@/features/voucher/hooks/useRedeem'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { redeem: jest.fn() },
}))

const mockRedeem = redemptionApi.redeem as jest.MockedFunction<typeof redemptionApi.redeem>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useRedeem', () => {
  it('calls redemptionApi.redeem and returns redemption data', async () => {
    const response = {
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'ABC1234567', estimatedSaving: 10,
      isValidated: false, redeemedAt: '2026-04-17T10:00:00Z',
    }
    mockRedeem.mockResolvedValue(response)

    const { result } = renderHook(() => useRedeem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    })

    expect(mockRedeem).toHaveBeenCalledWith({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(result.current.data).toEqual(response)
  })

  it('exposes error on failure', async () => {
    mockRedeem.mockRejectedValue({ code: 'INVALID_PIN', message: 'Incorrect PIN', status: 400 })

    const { result } = renderHook(() => useRedeem(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ voucherId: 'v1', branchId: 'b1', pin: '0000' })
      } catch { /* expected */ }
    })

    expect(result.current.isError).toBe(true)
  })
})
