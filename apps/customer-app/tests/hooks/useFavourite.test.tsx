import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFavourite } from '@/hooks/useFavourite'

// Covers plan §12's "favourite-toggle" requirement.
//
// Implementation note: useFavourite is **pessimistic-with-onSuccess** — state
// only advances after the API resolves successfully. On failure, state never
// advances at all (so there's nothing to roll back, the prior value is just
// retained). The plan's "optimistic + rollback" wording predated the salvaged
// hook; the tests below assert the *actual* observable behaviour:
//   - success path: state transitions on resolve
//   - failure path: state stays at the prior value (mutation throws, state
//     never advanced — equivalent to a rollback from the consumer's view)
// Switching to a truly optimistic implementation (advance immediately, revert
// on error) is a deliberate behaviour change and is left as a follow-up.
//
// Phase 3C.1g M2.2 — the hook gained a third 'branch' discriminator and
// the optional `contextualQueryKey` for per-screen contextual invalidation.
// The prop name on the input shape is `initialIsFavourited` (spec §7.2).

jest.spyOn(api, 'post')
jest.spyOn(api, 'del')

function wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// Test helper for M2.2 contextualQueryKey pins — wraps with a QueryClient
// whose `invalidateQueries` can be spied on so the test can assert both
// invalidations fire.
function wrapWithSpy({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  ;(wrapWithSpy as unknown as { __lastClient?: QueryClient }).__lastClient = qc
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
function getSpyClient(): QueryClient {
  const c = (wrapWithSpy as unknown as { __lastClient?: QueryClient }).__lastClient
  if (!c) throw new Error('wrapWithSpy not used yet')
  return c
}

describe('useFavourite', () => {
  beforeEach(() => {
    ;(api.post as jest.Mock).mockReset()
    ;(api.del  as jest.Mock).mockReset()
  })

  it('flips to favourited after a successful add', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', initialIsFavourited: false }),
      { wrapper: wrap },
    )
    expect(result.current.isFavourited).toBe(false)
    await act(async () => { await result.current.toggle() })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1', undefined)
    expect(result.current.isFavourited).toBe(true)
  })

  it('flips to NOT favourited after a successful remove', async () => {
    ;(api.del as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', initialIsFavourited: true }),
      { wrapper: wrap },
    )
    expect(result.current.isFavourited).toBe(true)
    await act(async () => { await result.current.toggle() })
    expect(api.del).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1')
    expect(result.current.isFavourited).toBe(false)
  })

  it('failure: if the add API rejects, isFavourited stays false (state never advances)', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', initialIsFavourited: false }),
      { wrapper: wrap },
    )
    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('boom')
    })
    expect(result.current.isFavourited).toBe(false)
  })

  it('failure: if the remove API rejects, isFavourited stays true (state never advances)', async () => {
    ;(api.del as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', initialIsFavourited: true }),
      { wrapper: wrap },
    )
    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('boom')
    })
    expect(result.current.isFavourited).toBe(true)
  })

  it('uses the voucher endpoint when type is voucher', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', initialIsFavourited: false }),
      { wrapper: wrap },
    )
    await act(async () => { await result.current.toggle() })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1', undefined)
  })

  it('re-syncs when the parent prop changes', async () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: boolean }) =>
        useFavourite({ type: 'merchant', id: 'm1', initialIsFavourited: initial }),
      { wrapper: wrap, initialProps: { initial: false } },
    )
    expect(result.current.isFavourited).toBe(false)
    rerender({ initial: true })
    await waitFor(() => expect(result.current.isFavourited).toBe(true))
  })

  // ── Phase 3C.1g M2.2 — branch discriminator + contextualQueryKey ──────

  it('M2.2 — branch discriminator: POSTs to /favourites/branches/:id and invalidates favouriteBranches', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'branch', id: 'b1', initialIsFavourited: false }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => { await result.current.toggle() })

    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/branches/b1', undefined)
    expect(result.current.isFavourited).toBe(true)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
  })

  it('M2.2 — branch discriminator: DELETEs to /favourites/branches/:id when removing', async () => {
    ;(api.del as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'branch', id: 'b1', initialIsFavourited: true }),
      { wrapper: wrap },
    )
    await act(async () => { await result.current.toggle() })
    expect(api.del).toHaveBeenCalledWith('/api/v1/customer/favourites/branches/b1')
    expect(result.current.isFavourited).toBe(false)
  })

  it('M2.2 — contextualQueryKey is invalidated alongside the list key on add success', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const contextKey: readonly unknown[] = ['merchantProfile', 'm1', 'b1']
    const { result } = renderHook(
      () => useFavourite({
        type:                'branch',
        id:                  'b1',
        initialIsFavourited: false,
        contextualQueryKey:  contextKey,
      }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => { await result.current.toggle() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contextKey })
  })

  it('M2.2 — contextualQueryKey is invalidated alongside the list key on remove success', async () => {
    ;(api.del as jest.Mock).mockResolvedValueOnce({ ok: true })
    const contextKey: readonly unknown[] = ['voucher', 'v1']
    const { result } = renderHook(
      () => useFavourite({
        type:                'voucher',
        id:                  'v1',
        initialIsFavourited: true,
        contextualQueryKey:  contextKey,
      }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => { await result.current.toggle() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contextKey })
  })

  it('M2.2 — contextualQueryKey is NOT invalidated on failure (state never advanced)', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const contextKey: readonly unknown[] = ['merchantProfile', 'm1']
    const { result } = renderHook(
      () => useFavourite({
        type:                'branch',
        id:                  'b1',
        initialIsFavourited: false,
        contextualQueryKey:  contextKey,
      }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('boom')
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
