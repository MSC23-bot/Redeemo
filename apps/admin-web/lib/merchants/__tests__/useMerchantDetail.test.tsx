/**
 * useMerchantDetail - verifies it fetches via merchantsApi.getById, keys per
 * merchant id, and honours the `enabled` gate (no request when disabled).
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMerchantDetail, merchantDetailQueryKey } from '../useMerchantDetail'
import { merchantsApi } from '@/lib/api/merchants'

jest.mock('@/lib/api/merchants', () => ({
  merchantsApi: {
    getById: jest.fn(),
  },
}))

const DETAIL = {
  merchant: {
    id: 'm-1',
    businessName: 'Acme Coffee',
    tradingName: null,
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    onboardingStep: 'LIVE',
    websiteUrl: null,
    logoUrl: null,
    category: null,
  },
  branches: [],
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

afterEach(() => jest.clearAllMocks())

describe('merchantDetailQueryKey', () => {
  it('keys per merchant id', () => {
    expect(merchantDetailQueryKey('m-1')).toEqual(['admin-merchant-detail', 'm-1'])
    expect(merchantDetailQueryKey('m-2')).toEqual(['admin-merchant-detail', 'm-2'])
  })
})

describe('useMerchantDetail', () => {
  it('fetches via merchantsApi.getById when enabled', async () => {
    ;(merchantsApi.getById as jest.Mock).mockResolvedValueOnce(DETAIL)
    const { result } = renderHook(() => useMerchantDetail('m-1', true), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(DETAIL))
    expect(merchantsApi.getById).toHaveBeenCalledWith('m-1')
  })

  it('does NOT fetch when disabled', async () => {
    const { result } = renderHook(() => useMerchantDetail('m-1', false), { wrapper: makeWrapper() })

    // Allow a tick; the query must stay idle.
    await new Promise((r) => setTimeout(r, 0))
    expect(merchantsApi.getById).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('surfaces isError when the fetch rejects', async () => {
    ;(merchantsApi.getById as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useMerchantDetail('m-1', true), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
