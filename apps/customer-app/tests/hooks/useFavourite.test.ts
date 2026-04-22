import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFavourite } from '@/hooks/useFavourite'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn(), del: jest.fn() },
}))

const mockApi = api as jest.Mocked<typeof api>

// Create a fresh QueryClient per test to avoid state leakage
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('useFavourite', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls api.post when toggling voucher on', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav1', voucherId: 'v1' })
    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: false }),
      { wrapper: makeWrapper() },
    )
    result.current.toggle()
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1', undefined)
    })
  })

  it('calls api.del when toggling voucher off', async () => {
    mockApi.del.mockResolvedValue({ success: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: true }),
      { wrapper: makeWrapper() },
    )
    result.current.toggle()
    await waitFor(() => {
      expect(mockApi.del).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1')
    })
  })

  it('calls api.post when toggling merchant on', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav2', merchantId: 'm1' })
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: false }),
      { wrapper: makeWrapper() },
    )
    result.current.toggle()
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1', undefined)
    })
  })
})
