import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHomeFeed } from '@/hooks/useHomeFeed'

jest.mock('@/lib/api/discovery', () => ({
  discoveryApi: {
    getHomeFeed: jest.fn().mockResolvedValue({
      locationContext: { city: 'London', lat: 51.5, lng: -0.1, source: 'coordinates' },
      featured: [{ id: 'm1', businessName: 'Test Merchant' }],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
    }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useHomeFeed', () => {
  it('fetches home feed data', async () => {
    const { result } = renderHook(() => useHomeFeed({ lat: 51.5, lng: -0.1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.featured).toHaveLength(1)
    expect(result.current.data?.featured[0].businessName).toBe('Test Merchant')
  })
})
