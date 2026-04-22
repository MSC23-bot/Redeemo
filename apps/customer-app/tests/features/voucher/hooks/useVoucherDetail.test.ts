import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useVoucherDetail } from '@/features/voucher/hooks/useVoucherDetail'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getVoucherDetail: jest.fn() },
}))

const mockGetVoucherDetail = redemptionApi.getVoucherDetail as jest.MockedFunction<typeof redemptionApi.getVoucherDetail>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useVoucherDetail', () => {
  beforeEach(() => { jest.clearAllMocks() })
  it('fetches voucher detail by id', async () => {
    const voucher = {
      id: 'v1', title: 'BOGO Pizza', type: 'BOGO' as const,
      description: null, terms: null, imageUrl: null,
      estimatedSaving: 10, expiryDate: null, code: 'RMV-001',
      status: 'ACTIVE', approvalStatus: 'APPROVED',
      isRedeemedThisCycle: false, isFavourited: false,
      merchant: { id: 'm1', businessName: 'Pizza Palace', tradingName: null, logoUrl: null, status: 'ACTIVE' },
    }
    mockGetVoucherDetail.mockResolvedValue(voucher)

    const { result } = renderHook(() => useVoucherDetail('v1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(voucher))
    expect(mockGetVoucherDetail).toHaveBeenCalledWith('v1')
  })

  it('does not fetch when id is undefined', () => {
    renderHook(() => useVoucherDetail(undefined), { wrapper })
    expect(mockGetVoucherDetail).not.toHaveBeenCalled()
  })
})
