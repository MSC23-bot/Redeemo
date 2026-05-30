import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useFavourite } from '@/hooks/useFavourite'

// Covers plan §12's "favourite-toggle" requirement.
//
// Phase 3C.1g M2.2 — the hook gained a third 'branch' discriminator and
// the optional `contextualQueryKey` for per-screen contextual invalidation.
// The prop name on the input shape is `initialIsFavourited` (spec §7.2).
//
// Device-QA R1 (2026-05-30) — owner-direction shipped the optimistic
// rewrite: state flips synchronously in `onMutate`, success invalidates,
// generic errors REVERT, and STALE-STATE codes
// (ALREADY_FAVOURITED on POST / FAVOURITE_NOT_FOUND on DELETE) keep the
// optimistic flip AND invalidate caches.  The successful-path + generic-
// failure tests below are still correct under the new contract because
// the FINAL state matches in both directions; the new §R1 pins below
// lock the stale-code reconcile branch explicitly.

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

  it('failure: if the add API rejects with a generic error, isFavourited reverts to false', async () => {
    // Device-QA R1: state flips to true optimistically inside onMutate,
    // then reverts to false in onError because the error code is not
    // one of the stale-state codes (ALREADY_FAVOURITED).
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

  it('failure: if the remove API rejects with a generic error, isFavourited reverts to true', async () => {
    // Device-QA R1: state flips to false optimistically, then reverts
    // because the error is not FAVOURITE_NOT_FOUND.
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

  it('M2.2 — contextualQueryKey is NOT invalidated on a generic failure (state reverts)', async () => {
    // Device-QA R1: generic error → revert path → invalidate is NOT
    // called.  Stale-state codes are pinned separately in §R1 below.
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

  // ── §R1 Device-QA R1 (2026-05-30) — stale-state reconcile path ────────
  //
  // The backend surfaces ALREADY_FAVOURITED on POST and FAVOURITE_NOT_FOUND
  // on DELETE when the toggle target is already in the desired state
  // (e.g. a stale cached row that the user double-tapped, or another
  // device that flipped the state first).  The hook treats these as
  // SILENT successes — the optimistic flip stands, both cache keys
  // invalidate so other views reconcile, and the global MutationCache
  // toast is suppressed via the errors.ts `surface: 'silent'` mapping.

  it('§R1 — ALREADY_FAVOURITED keeps the optimistic add AND invalidates both keys', async () => {
    const staleErr = Object.assign(new Error('already favourited'), { code: 'ALREADY_FAVOURITED' })
    ;(api.post as jest.Mock).mockRejectedValueOnce(staleErr)
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

    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('already favourited')
    })

    // Optimistic flip stands.
    expect(result.current.isFavourited).toBe(true)
    // Both list + contextual keys invalidate so stale screens reconcile.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contextKey })
  })

  it('§R1 — FAVOURITE_NOT_FOUND keeps the optimistic remove AND invalidates both keys', async () => {
    const staleErr = Object.assign(new Error('not found'), { code: 'FAVOURITE_NOT_FOUND' })
    ;(api.del as jest.Mock).mockRejectedValueOnce(staleErr)
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

    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('not found')
    })

    // Optimistic flip stands — server already has it un-favourited.
    expect(result.current.isFavourited).toBe(false)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contextKey })
  })

  // ── §R5 Device-QA R1 Wave 3 (2026-05-30) — cross-surface invalidation ──
  //
  // Findings #14 (Home rail heart stale after Merchant-Profile favourite)
  // and #15 (Merchant Profile voucher card heart stale after Favourites
  // removal) both stem from the hook only invalidating its OWN list
  // key + optional contextualQueryKey.  Toggling a heart anywhere now
  // additionally invalidates broad prefixes `['discovery']` (catches
  // Home / Map / Search / Category) and `['merchantProfile']` (catches
  // every merchant+branch variation).  Defence-in-depth on top of
  // contextualQueryKey, not a replacement.

  it('§R5 — add success invalidates [\'discovery\'] AND [\'merchantProfile\'] (broad cross-surface reconcile)', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'branch', id: 'b1', initialIsFavourited: false }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => { await result.current.toggle() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('§R5 — remove success invalidates [\'discovery\'] AND [\'merchantProfile\']', async () => {
    ;(api.del as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', initialIsFavourited: true }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => { await result.current.toggle() })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('§R5 — stale-state reconcile path STILL invalidates the broad keys (silent success === full reconcile)', async () => {
    const staleErr = Object.assign(new Error('already favourited'), { code: 'ALREADY_FAVOURITED' })
    ;(api.post as jest.Mock).mockRejectedValueOnce(staleErr)
    const { result } = renderHook(
      () => useFavourite({ type: 'branch', id: 'b1', initialIsFavourited: false }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('already favourited')
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })

  it('§R5 — generic error revert path does NOT invalidate the broad keys (no false reconcile)', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('500'))
    const { result } = renderHook(
      () => useFavourite({ type: 'branch', id: 'b1', initialIsFavourited: false }),
      { wrapper: wrapWithSpy },
    )
    const qc = getSpyClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    await act(async () => {
      await expect(result.current.toggle()).rejects.toThrow('500')
    })

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['discovery'] })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
  })
})
