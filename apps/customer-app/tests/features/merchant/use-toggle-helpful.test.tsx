import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useToggleHelpful } from '@/features/merchant/hooks/useWriteReview'
import { reviewsApi } from '@/lib/api/reviews'

// Regression for PR A round-4 QA — without optimistic updates, tapping
// Helpful felt inert (mutation succeeded server-side but the UI didn't
// reflect any change until a refetch landed). Pin: cache is patched
// synchronously inside `onMutate` so the very next render sees the
// toggled state.

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const seedReview = (id: string, marked: boolean, count: number) => ({
  id,
  branchId:          'b1',
  branchName:        'Main',
  displayName:       'A',
  rating:            5,
  comment:           null,
  isVerified:        false,
  isOwnReview:       false,
  createdAt:         '2026-04-01T00:00:00.000Z',
  updatedAt:         '2026-04-01T00:00:00.000Z',
  helpfulCount:      count,
  userMarkedHelpful: marked,
})

describe('useToggleHelpful — optimistic update', () => {
  it('flips userMarkedHelpful + bumps helpfulCount in the cache before the network call resolves', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    qc.setQueryData(['merchantReviews', 'm1'], {
      reviews: [seedReview('r1', false, 3), seedReview('r2', false, 1)],
      total: 2,
    })

    // Make the network call hang so we can observe the cache mid-flight.
    let resolveCall!: (v: { helpful: boolean }) => void
    const networkPromise = new Promise<{ helpful: boolean }>(r => { resolveCall = r })
    jest.spyOn(reviewsApi, 'toggleHelpful').mockReturnValueOnce(networkPromise)

    const { result } = renderHook(() => useToggleHelpful('m1'), { wrapper: makeWrapper(qc) })

    act(() => { result.current.mutate('r1') })

    // Cache should ALREADY reflect the flipped state, even though the
    // mutation is still pending.
    await waitFor(() => {
      const cached = qc.getQueryData<{ reviews: ReturnType<typeof seedReview>[] }>(['merchantReviews', 'm1'])
      expect(cached?.reviews[0]?.userMarkedHelpful).toBe(true)
      expect(cached?.reviews[0]?.helpfulCount).toBe(4)
      // Untargeted reviews are untouched.
      expect(cached?.reviews[1]?.userMarkedHelpful).toBe(false)
      expect(cached?.reviews[1]?.helpfulCount).toBe(1)
    })

    // Resolve the network call so the test cleans up.
    resolveCall({ helpful: true })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('rolls the cache back if the network call fails', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    qc.setQueryData(['merchantReviews', 'm1'], {
      reviews: [seedReview('r1', false, 3)],
      total: 1,
    })

    jest.spyOn(reviewsApi, 'toggleHelpful').mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useToggleHelpful('m1'), { wrapper: makeWrapper(qc) })
    act(() => { result.current.mutate('r1') })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // After rollback the cache should match the original snapshot — but
    // onSettled also invalidates, so the cache might be marked stale.
    // We check the data, which is what the UI reads.
    const cached = qc.getQueryData<{ reviews: ReturnType<typeof seedReview>[] }>(['merchantReviews', 'm1'])
    expect(cached?.reviews[0]?.userMarkedHelpful).toBe(false)
    expect(cached?.reviews[0]?.helpfulCount).toBe(3)
  })

  it('clamps helpfulCount at 0 when un-marking a review with stale count=0', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    qc.setQueryData(['merchantReviews', 'm1'], {
      reviews: [seedReview('r1', true, 0)],   // odd state, but defensive
      total: 1,
    })

    jest.spyOn(reviewsApi, 'toggleHelpful').mockResolvedValueOnce({ helpful: false })

    const { result } = renderHook(() => useToggleHelpful('m1'), { wrapper: makeWrapper(qc) })
    act(() => { result.current.mutate('r1') })

    await waitFor(() => {
      const cached = qc.getQueryData<{ reviews: ReturnType<typeof seedReview>[] }>(['merchantReviews', 'm1'])
      expect(cached?.reviews[0]?.userMarkedHelpful).toBe(false)
      expect(cached?.reviews[0]?.helpfulCount).toBe(0)  // clamped, NOT -1
    })
  })
})
