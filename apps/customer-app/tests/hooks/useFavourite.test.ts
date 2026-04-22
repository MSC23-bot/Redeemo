import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFavourite } from '@/hooks/useFavourite'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn(), del: jest.fn() },
}))

const mockApi = api as jest.Mocked<typeof api>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useFavourite', () => {
  it('toggles voucher favourite on', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav1', voucherId: 'v1' })

    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: false }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1', undefined)
  })

  it('toggles voucher favourite off', async () => {
    mockApi.del.mockResolvedValue({ success: true })

    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: true }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.del).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1')
  })

  it('toggles merchant favourite', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav2', merchantId: 'm1' })

    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: false }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1', undefined)
  })
})
