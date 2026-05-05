import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { subscriptionApi } from '@/lib/api/subscription'
import { useSubscription } from '@/hooks/useSubscription'

jest.spyOn(subscriptionApi, 'getMySubscription')

// useSubscription gates on `useAuthStore((s) => s.status) === 'authed'`.
// Mock the auth store to report authed so the React Query call enables.
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({ status: 'authed' })),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('useSubscription', () => {
  beforeEach(() => { (subscriptionApi.getMySubscription as jest.Mock).mockReset() })

  it('reports isSubscribed:true when /subscription/me returns an ACTIVE row', async () => {
    (subscriptionApi.getMySubscription as jest.Mock).mockResolvedValue({
      id: 's1',
      status: 'ACTIVE',
      currentPeriodStart: '2026-05-05T21:14:31.410Z',
      currentPeriodEnd: '2027-05-05T21:14:31.410Z',
      cancelAtPeriodEnd: false,
      promoCodeId: null,
      plan: { id: 'p1', name: 'Monthly', billingInterval: 'MONTHLY', priceGbp: 6.99 },
    })
    const { result } = renderHook(() => useSubscription(), {
      wrapper: ({ children }) => wrap(<>{children}</>),
    })
    await waitFor(() => expect(result.current.isSubLoading).toBe(false))
    expect(result.current.isSubscribed).toBe(true)
    expect(result.current.subscription?.status).toBe('ACTIVE')
  })

  it('reports isSubscribed:true for TRIALLING (still inside the active redemption set)', async () => {
    (subscriptionApi.getMySubscription as jest.Mock).mockResolvedValue({
      id: 's1',
      status: 'TRIALLING',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      plan: { id: 'p1', name: 'Monthly', billingInterval: 'MONTHLY', priceGbp: 6.99 },
    })
    const { result } = renderHook(() => useSubscription(), {
      wrapper: ({ children }) => wrap(<>{children}</>),
    })
    await waitFor(() => expect(result.current.isSubLoading).toBe(false))
    expect(result.current.isSubscribed).toBe(true)
  })

  it('reports isSubscribed:false for PAST_DUE — backend rejects redemption; user sees subscribe CTA', async () => {
    (subscriptionApi.getMySubscription as jest.Mock).mockResolvedValue({
      id: 's1',
      status: 'PAST_DUE',
      currentPeriodStart: '2026-05-05T21:14:31.410Z',
      currentPeriodEnd: '2027-05-05T21:14:31.410Z',
      cancelAtPeriodEnd: false,
      plan: { id: 'p1', name: 'Monthly', billingInterval: 'MONTHLY', priceGbp: 6.99 },
    })
    const { result } = renderHook(() => useSubscription(), {
      wrapper: ({ children }) => wrap(<>{children}</>),
    })
    await waitFor(() => expect(result.current.isSubLoading).toBe(false))
    expect(result.current.isSubscribed).toBe(false)
  })

  it('reports isSubscribed:false when /subscription/me returns null (free user)', async () => {
    (subscriptionApi.getMySubscription as jest.Mock).mockResolvedValue(null)
    const { result } = renderHook(() => useSubscription(), {
      wrapper: ({ children }) => wrap(<>{children}</>),
    })
    await waitFor(() => expect(result.current.isSubLoading).toBe(false))
    expect(result.current.isSubscribed).toBe(false)
    expect(result.current.subscription).toBeNull()
  })
})
