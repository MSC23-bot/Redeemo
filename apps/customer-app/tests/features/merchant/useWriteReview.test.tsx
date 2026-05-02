import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { reviewsApi } from '@/lib/api/reviews'
import {
  useCreateReview, useDeleteReview, useToggleHelpful,
} from '@/features/merchant/hooks/useWriteReview'

// Plan §12 self-review: "write-review happy + error path".

jest.spyOn(reviewsApi, 'createReview')
jest.spyOn(reviewsApi, 'deleteReview')
jest.spyOn(reviewsApi, 'toggleHelpful')

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { Wrap, invalidateSpy, qc }
}

describe('useCreateReview', () => {
  beforeEach(() => { (reviewsApi.createReview as jest.Mock).mockReset() })

  it('happy path: forwards rating + comment, invalidates merchant queries on success', async () => {
    ;(reviewsApi.createReview as jest.Mock).mockResolvedValueOnce({
      id: 'r1', branchId: 'b1', branchName: 'Main', displayName: 'Ada L.',
      rating: 5, comment: 'Excellent', isVerified: true, isOwnReview: true,
      createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
    })
    const { Wrap, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateReview('m1'), { wrapper: Wrap })

    await act(async () => {
      await result.current.mutateAsync({ branchId: 'b1', rating: 5, comment: 'Excellent' })
    })

    expect(reviewsApi.createReview).toHaveBeenCalledWith('b1', { rating: 5, comment: 'Excellent' })
    // The hook invalidates three caches on success — verify all three.
    const calls = invalidateSpy.mock.calls.map(c => (c[0] as any).queryKey)
    expect(calls).toContainEqual(['merchantReviews', 'm1'])
    expect(calls).toContainEqual(['reviewSummary',  'm1'])
    expect(calls).toContainEqual(['merchantProfile', 'm1'])
  })

  it('omits the comment field when caller passes none (exactOptionalPropertyTypes)', async () => {
    ;(reviewsApi.createReview as jest.Mock).mockResolvedValueOnce({
      id: 'r1', branchId: 'b1', branchName: 'Main', displayName: 'Ada L.',
      rating: 4, comment: null, isVerified: false, isOwnReview: true,
      createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z',
    })
    const { Wrap } = makeWrapper()
    const { result } = renderHook(() => useCreateReview('m1'), { wrapper: Wrap })
    await act(async () => {
      await result.current.mutateAsync({ branchId: 'b1', rating: 4 })
    })
    expect(reviewsApi.createReview).toHaveBeenCalledWith('b1', { rating: 4 })
  })

  it('error path: rejects + does NOT invalidate on failure', async () => {
    ;(reviewsApi.createReview as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { Wrap, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateReview('m1'), { wrapper: Wrap })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ branchId: 'b1', rating: 5, comment: 'x' }),
      ).rejects.toThrow('boom')
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useDeleteReview', () => {
  beforeEach(() => { (reviewsApi.deleteReview as jest.Mock).mockReset() })

  it('happy path: forwards branchId + reviewId, invalidates merchant queries on success', async () => {
    ;(reviewsApi.deleteReview as jest.Mock).mockResolvedValueOnce({ success: true })
    const { Wrap, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useDeleteReview('m1'), { wrapper: Wrap })
    await act(async () => {
      await result.current.mutateAsync({ branchId: 'b1', reviewId: 'r1' })
    })
    expect(reviewsApi.deleteReview).toHaveBeenCalledWith('b1', 'r1')
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('error path: rejects + does NOT invalidate', async () => {
    ;(reviewsApi.deleteReview as jest.Mock).mockRejectedValueOnce(new Error('not yours'))
    const { Wrap, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useDeleteReview('m1'), { wrapper: Wrap })
    await act(async () => {
      await expect(
        result.current.mutateAsync({ branchId: 'b1', reviewId: 'r1' }),
      ).rejects.toThrow('not yours')
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useToggleHelpful', () => {
  beforeEach(() => { (reviewsApi.toggleHelpful as jest.Mock).mockReset() })

  it('happy path: forwards reviewId', async () => {
    ;(reviewsApi.toggleHelpful as jest.Mock).mockResolvedValueOnce({ success: true, helpful: true })
    const { Wrap } = makeWrapper()
    const { result } = renderHook(() => useToggleHelpful('m1'), { wrapper: Wrap })
    await act(async () => { await result.current.mutateAsync('r1') })
    expect(reviewsApi.toggleHelpful).toHaveBeenCalledWith('r1')
  })

  it('error path: rejects', async () => {
    ;(reviewsApi.toggleHelpful as jest.Mock).mockRejectedValueOnce(new Error('rate limited'))
    const { Wrap } = makeWrapper()
    const { result } = renderHook(() => useToggleHelpful('m1'), { wrapper: Wrap })
    await act(async () => {
      await expect(result.current.mutateAsync('r1')).rejects.toThrow('rate limited')
    })
  })
})
