import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedemptionPolling } from '@/features/voucher/hooks/useRedemptionPolling'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getMyRedemptionByCode: jest.fn() },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useRedemptionPolling', () => {
  beforeEach(() => jest.clearAllMocks())

  it('polls getMyRedemptionByCode every 5 seconds while enabled', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null,
      validationMethod: null, voucherId: 'v1',
      merchantName: 'Acme', branchName: 'Shoreditch',
    })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    await waitFor(() => {
      expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(1)
    })

    jest.advanceTimersByTime(5000)
    await waitFor(() => {
      expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2)
    })

    jest.useRealTimers()
  })

  it('stops polling once isValidated=true is observed', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock)
      .mockResolvedValueOnce({ code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null, voucherId: 'v1', merchantName: '', branchName: '' })
      .mockResolvedValueOnce({ code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z', validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: '', branchName: '' })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(1))
    jest.advanceTimersByTime(5000)
    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2))

    // one more tick should not fire another request
    jest.advanceTimersByTime(5000)
    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2))

    jest.useRealTimers()
  })

  it('stops polling after 15 minutes with no validation', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: '', branchName: '',
    })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    // 15 min / 5 sec = 180 polls
    jest.advanceTimersByTime(15 * 60 * 1000 + 5000)
    await waitFor(() => {
      const count = (redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length
      expect(count).toBeLessThanOrEqual(181)
    })

    const countBefore = (redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length
    jest.advanceTimersByTime(60_000)
    expect((redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length).toBe(countBefore)

    jest.useRealTimers()
  })
})
