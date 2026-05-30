/**
 * Phase 3C.1g M2.4 — `useRemoveFavourite` contract pins.
 *
 * Covers spec §7.3 — optimistic-remove + 4s undo + DELETE-on-timeout
 * + restore-on-error.
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'

const mockRemoveBranch  = jest.fn()
const mockRemoveVoucher = jest.fn()
jest.mock('@/lib/api/favourites', () => ({
  favouritesApi: {
    removeBranch:  (...args: unknown[]) => mockRemoveBranch(...args),
    removeVoucher: (...args: unknown[]) => mockRemoveVoucher(...args),
  },
}))

// Provide the `FavouriteBranchesResponse` type the hook uses; we only
// use it for its `items` shape so an empty stub mock is fine.

import { useRemoveFavourite } from '../hooks/useRemoveFavourite'

const QK_BRANCHES = ['favouriteBranches'] as const
const QK_VOUCHERS = ['favouriteVouchers'] as const

type Row = { id: string; name?: string }

function seedBranches(qc: QueryClient, rows: Row[]) {
  const data: InfiniteData<{ items: Row[]; total: number; page: number; limit: number }> = {
    pageParams: [1],
    pages: [{ items: rows, total: rows.length, page: 1, limit: 20 }],
  }
  qc.setQueryData([...QK_BRANCHES], data)
}

function seedVouchers(qc: QueryClient, rows: Row[]) {
  const data: InfiniteData<{ items: Row[]; total: number; page: number; limit: number }> = {
    pageParams: [1],
    pages: [{ items: rows, total: rows.length, page: 1, limit: 20 }],
  }
  qc.setQueryData([...QK_VOUCHERS], data)
}

function getBranches(qc: QueryClient): Row[] {
  const data = qc.getQueryData<InfiniteData<{ items: Row[]; total: number }>>([...QK_BRANCHES])
  if (!data) return []
  return data.pages.flatMap(p => p.items)
}

function getVouchers(qc: QueryClient): Row[] {
  const data = qc.getQueryData<InfiniteData<{ items: Row[]; total: number }>>([...QK_VOUCHERS])
  if (!data) return []
  return data.pages.flatMap(p => p.items)
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, Wrapper }
}

beforeEach(() => {
  jest.useFakeTimers()
  mockRemoveBranch.mockReset()
  mockRemoveVoucher.mockReset()
})
afterEach(() => {
  jest.useRealTimers()
})

describe('useRemoveFavourite — optimistic splice', () => {
  it('remove() splices the row from the branches cache immediately', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'b' }) })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'c'])
  })

  it('remove() works on the vouchers cache when entity="voucher"', () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v1' }, { id: 'v2' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v2' }) })
    expect(getVouchers(qc).map(r => r.id)).toEqual(['v1'])
  })

  it('remove() is a no-op when the row id is not in the cache', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'ghost' }) })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a'])
    expect(result.current.isPending).toBe(false)
  })
})

describe('useRemoveFavourite — undo within 4s', () => {
  it('undo() restores the row at its original index and cancels the DELETE', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'b' }) })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'c'])

    act(() => { result.current.undo() })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'b', 'c'])

    // Even after the original 4s window elapses, the DELETE never fires.
    act(() => { jest.advanceTimersByTime(4_000) })
    expect(mockRemoveBranch).not.toHaveBeenCalled()
  })

  it('isPending flips true after remove() and false after undo()', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    expect(result.current.isPending).toBe(true)
    act(() => { result.current.undo() })
    expect(result.current.isPending).toBe(false)
  })
})

describe('useRemoveFavourite — timeout fires DELETE', () => {
  it('fires removeBranch(id) after the 4s window', async () => {
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    expect(mockRemoveBranch).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(4_000)
    })

    await waitFor(() => expect(mockRemoveBranch).toHaveBeenCalledWith('a'))
    expect(result.current.isPending).toBe(false)
  })

  it('fires removeVoucher(id) after the 4s window when entity="voucher"', async () => {
    mockRemoveVoucher.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v1' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v1' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(mockRemoveVoucher).toHaveBeenCalledWith('v1'))
  })

  // ── §R5 Device-QA R1 Wave 3 (2026-05-30) — cross-surface invalidation ──
  //
  // Finding #15: removing a voucher via the Favourites tab left the
  // matching voucher card on Merchant Profile still showing a filled
  // heart.  After the backend DELETE confirms, the hook now invalidates
  // both `['merchantProfile']` (broad — every merchant+branch variation)
  // and `['discovery']` (Home rail + Map + Search + Category) on top of
  // its own list key.  Symmetric with the `useFavourite` cross-surface
  // invalidation added the same wave (see useFavourite §R5).

  it('§R5 — after a successful branch DELETE, invalidates [\'merchantProfile\'] AND [\'discovery\'] on top of the list key', async () => {
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(mockRemoveBranch).toHaveBeenCalledWith('a'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
  })

  it('§R5 — after a successful voucher DELETE, invalidates [\'merchantProfile\'] AND [\'discovery\'] on top of the list key', async () => {
    mockRemoveVoucher.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v1' }])
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v1' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(mockRemoveVoucher).toHaveBeenCalledWith('v1'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteVouchers'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
  })

  // ── §R6 Wave 4 #21 (2026-05-30) — ['voucher'] prefix invalidation ────
  // Symmetric with `useFavourite` §R6: removing a voucher from the
  // Favourites tab MUST also invalidate the ['voucher'] cache so the
  // Voucher Detail surface refetches the correct isFavourited flag on
  // next focus.
  it('§R6 — after a successful voucher DELETE, also invalidates [\'voucher\'] prefix', async () => {
    mockRemoveVoucher.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v1' }])
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v1' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(mockRemoveVoucher).toHaveBeenCalledWith('v1'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['voucher'] })
  })

  it('§R6 — after a successful branch DELETE, also invalidates [\'voucher\'] prefix (defence-in-depth)', async () => {
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(mockRemoveBranch).toHaveBeenCalledWith('a'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['voucher'] })
  })
})

// ── §W6.3 Wave 6.3 (2026-05-30) — flushPending() ─────────────────────
//
// Owner-reported symptom: user removes the last favourited merchant +
// immediately taps "Discover merchants" → Home shows the still-
// favourited heart because the 4s undo-window timer hasn't fired
// yet, so the DELETE hasn't reached the backend and the discovery /
// merchantProfile / voucher caches haven't been invalidated.
//
// Fix: new `flushPending()` cancels the timer, calls the DELETE
// immediately, and resolves once invalidation has fired.
// `FavouritesScreen` calls it from `useFocusEffect` cleanup so the
// blur (user navigating away) deterministically flushes pending
// removals.
describe('useRemoveFavourite — §W6.3 flushPending()', () => {
  it('flushPending fires the DELETE immediately (no 4s wait) + invalidates the same caches', async () => {
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    // DO NOT advance timers — flushPending must fire WITHOUT waiting
    // for the 4s undo window.
    expect(mockRemoveBranch).not.toHaveBeenCalled()

    await act(async () => { await result.current.flushPending() })

    expect(mockRemoveBranch).toHaveBeenCalledWith('a')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['merchantProfile'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['discovery'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['voucher'] })
  })

  it('flushPending is a safe no-op when no removal is pending', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    // No remove() called — flushPending should resolve cleanly + not
    // touch the backend.
    await act(async () => { await result.current.flushPending() })
    expect(mockRemoveBranch).not.toHaveBeenCalled()
  })

  it('flushPending followed by the 4s timer does NOT double-fire the DELETE', async () => {
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    await act(async () => { await result.current.flushPending() })

    // Advance the 4s timer AFTER flush — the original setTimeout was
    // cleared so the DELETE must NOT fire again.
    await act(async () => { jest.advanceTimersByTime(4_000) })
    expect(mockRemoveBranch).toHaveBeenCalledTimes(1)
  })

  it('flushPending works for the voucher entity too', async () => {
    mockRemoveVoucher.mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v1' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v1' }) })
    await act(async () => { await result.current.flushPending() })
    expect(mockRemoveVoucher).toHaveBeenCalledWith('v1')
  })
})

describe('useRemoveFavourite — DELETE error rollback', () => {
  it('restores the row to its original index and exposes `error` on DELETE rejection', async () => {
    const boom = new Error('boom')
    mockRemoveBranch.mockRejectedValueOnce(boom)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'b' }) })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'c'])

    await act(async () => { jest.advanceTimersByTime(4_000) })

    await waitFor(() => expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'b', 'c']))
    expect(result.current.error).toBe(boom)
    expect(result.current.isPending).toBe(false)
  })

  it('clearError() resets the error to null', async () => {
    mockRemoveBranch.mockRejectedValueOnce(new Error('boom'))
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    await act(async () => { jest.advanceTimersByTime(4_000) })
    await waitFor(() => expect(result.current.error).not.toBeNull())

    act(() => { result.current.clearError() })
    expect(result.current.error).toBeNull()
  })
})

// ── §W6.5 (2026-05-31) — multi-pending removals ─────────────────────
//
// Owner-reported symptom on Wave 6.4 ship: removing 2-3 merchants /
// vouchers in quick succession showed only the FIRST toast + the
// rest were silently removed.  Root cause: pre-Wave-6.5
// `pending.current` was a single ref — each new `remove()` overwrote
// the previous record, the FIRST timer's `setIsPending(false)` in
// the finally block prematurely cleared the screen-level
// `undoMessage`, and items 2+ DELETEd silently.
//
// Fix: `pendingMap` (rowId → PendingRemoval) + `pendingCount`
// state.  isPending stays true until EVERY pending DELETE
// finishes.  `undo()` targets the most-recently-added entry
// (matches the toast the user is currently looking at).
// `flushPending()` fires all in parallel.
describe('useRemoveFavourite — §W6.5 multi-pending removals', () => {
  it('§W6.5-1: two concurrent removes both fire DELETE after their respective timers', async () => {
    mockRemoveBranch
      .mockResolvedValueOnce(undefined)  // for 'a'
      .mockResolvedValueOnce(undefined)  // for 'b'
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    act(() => { result.current.remove({ id: 'b' }) })

    // Cache shows both removed optimistically.
    expect(getBranches(qc).map(r => r.id)).toEqual(['c'])
    // isPending stays true while EITHER timer is still pending.
    expect(result.current.isPending).toBe(true)

    // Fire timers.
    await act(async () => { jest.advanceTimersByTime(4_000) })

    // BOTH DELETEs fired — pre-Wave-6.5 only 'b' would have fired
    // because 'a' overwrote pending.current.
    await waitFor(() => expect(mockRemoveBranch).toHaveBeenCalledTimes(2))
    expect(mockRemoveBranch).toHaveBeenCalledWith('a')
    expect(mockRemoveBranch).toHaveBeenCalledWith('b')
    // isPending falls to false only AFTER both DELETEs finish.
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('§W6.5-2: isPending stays true between the first and last timer fire (toast must NOT disappear early)', async () => {
    mockRemoveBranch
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 1000)))  // 'b' DELETE hangs 1s
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    act(() => { result.current.remove({ id: 'b' }) })
    expect(result.current.isPending).toBe(true)

    // Fire timers.  'a' resolves immediately, 'b' takes 1s more.
    await act(async () => { jest.advanceTimersByTime(4_000) })
    // After 'a' resolves, isPending should STILL be true because
    // 'b' is mid-flight.  Pre-Wave-6.5 this would have flipped
    // false the moment 'a' finished.
    expect(result.current.isPending).toBe(true)

    // Now let 'b' resolve.
    await act(async () => { jest.advanceTimersByTime(1_000) })
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('§W6.5-3: undo() targets the MOST RECENTLY removed row (LIFO)', async () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    act(() => { result.current.remove({ id: 'b' }) })
    expect(getBranches(qc).map(r => r.id)).toEqual(['c'])

    // Undo restores 'b' (most recent), 'a' stays pending.
    act(() => { result.current.undo() })
    expect(getBranches(qc).map(r => r.id)).toEqual(['b', 'c'])
    expect(result.current.isPending).toBe(true)

    // Another undo restores 'a'.
    act(() => { result.current.undo() })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.isPending).toBe(false)

    // Extra undo is a no-op (defensive).
    act(() => { result.current.undo() })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('§W6.5-4: undone row does NOT fire DELETE when its timer would have fired', async () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    act(() => { result.current.remove({ id: 'b' }) })

    // Undo most recent ('b').  Only 'a' should DELETE on timer.
    act(() => { result.current.undo() })
    mockRemoveBranch.mockResolvedValueOnce(undefined)
    await act(async () => { jest.advanceTimersByTime(4_000) })
    await waitFor(() => expect(mockRemoveBranch).toHaveBeenCalledWith('a'))
    expect(mockRemoveBranch).not.toHaveBeenCalledWith('b')
    expect(mockRemoveBranch).toHaveBeenCalledTimes(1)
  })

  it('§W6.5-5: flushPending fires ALL pending DELETEs in parallel', async () => {
    mockRemoveBranch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    act(() => { result.current.remove({ id: 'b' }) })
    act(() => { result.current.remove({ id: 'c' }) })

    expect(mockRemoveBranch).not.toHaveBeenCalled()
    await act(async () => { await result.current.flushPending() })

    // All three DELETEs fired without waiting for the 4s timers.
    expect(mockRemoveBranch).toHaveBeenCalledTimes(3)
    expect(mockRemoveBranch).toHaveBeenCalledWith('a')
    expect(mockRemoveBranch).toHaveBeenCalledWith('b')
    expect(mockRemoveBranch).toHaveBeenCalledWith('c')
    expect(result.current.isPending).toBe(false)
  })

  it('§W6.5-6: removing the same rowId twice keeps a single pending entry (defensive)', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'a' }, { id: 'b' }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'a' }) })
    // After first remove, row 'a' is gone from cache — second
    // splice('a') returns null and the second remove() bails
    // early.  Net effect: still one pending entry for 'a'.
    act(() => { result.current.remove({ id: 'a' }) })

    // Undo restores 'a' once.  No double-restoration.
    act(() => { result.current.undo() })
    expect(getBranches(qc).map(r => r.id)).toEqual(['a', 'b'])
    expect(result.current.isPending).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// §W6.7 — Wave 6.7 optimistic cross-surface cache patch
// ─────────────────────────────────────────────────────────────────
//
// Owner-reported on Wave 6.6 ship: removing Iron Forge Gym + a few
// other merchants from Favourites left their Home rail hearts
// FILLED for ~minutes (backend home-feed refetch is 12-15s per
// request on dev/Neon).  Wave 6.7 closes the gap by synchronously
// flipping isFavourited=false on every cached discovery / merchant-
// profile tile for the removed row, the moment remove() is invoked
// — BEFORE the 4s undo window even starts.  Undo + DELETE-error
// rollback revert the patch.  Multi-remove patches ALL removed
// rows independently (not just the most recent).
describe('useRemoveFavourite — §W6.7 optimistic cross-surface patch', () => {
  // Seed a Home discovery cache with the three branches that a
  // typical favourites-tab remove would also be on a Home rail.
  function seedHomeDiscovery(qc: QueryClient, branches: Array<{ id: string; isFavourited: boolean }>) {
    qc.setQueryData(['discovery', 'home', 53.6, -1.8], {
      featured: { branches },
    })
  }
  function readHomeFavMap(qc: QueryClient): Record<string, boolean> {
    const data = qc.getQueryData<{ featured: { branches: Array<{ id: string; isFavourited: boolean }> } }>(
      ['discovery', 'home', 53.6, -1.8],
    )
    if (!data) return {}
    return Object.fromEntries(data.featured.branches.map(b => [b.id, b.isFavourited]))
  }

  it('§W6.7-1: single remove() flips matching tile in cached [discovery] query SYNCHRONOUSLY (no network wait)', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'iron-forge' }, { id: 'b' }])
    seedHomeDiscovery(qc, [
      { id: 'iron-forge', isFavourited: true },
      { id: 'b',          isFavourited: true },
    ])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'iron-forge' }) })

    // Synchronous patch — Home rail heart for iron-forge is now
    // empty, no network has been called yet (4s undo window
    // hasn't elapsed).
    expect(readHomeFavMap(qc)).toEqual({ 'iron-forge': false, b: true })
    expect(mockRemoveBranch).not.toHaveBeenCalled()
  })

  it('§W6.7-2: multi-remove patches ALL removed rows in the discovery cache (not just the most recent)', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'iron-forge' }, { id: 'lemieux' }, { id: 'old-foundry' }, { id: 'kovalam' }])
    seedHomeDiscovery(qc, [
      { id: 'iron-forge',  isFavourited: true },
      { id: 'lemieux',     isFavourited: true },
      { id: 'old-foundry', isFavourited: true },
      { id: 'kovalam',     isFavourited: true },
    ])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'iron-forge'  }) })
    act(() => { result.current.remove({ id: 'lemieux'     }) })
    act(() => { result.current.remove({ id: 'old-foundry' }) })

    // All three removed rows flipped to false synchronously;
    // kovalam (untouched) stays true.  Wave 6.5 single-slot
    // bug regression: pre-W6.5 only the MOST RECENT row would
    // have shown the toast — pre-W6.7 only the MOST RECENT row
    // would have had its cross-surface heart patched.  Both
    // bugs are independent — this pin locks the W6.7 fix.
    expect(readHomeFavMap(qc)).toEqual({
      'iron-forge':  false,
      'lemieux':     false,
      'old-foundry': false,
      'kovalam':     true,
    })
  })

  it('§W6.7-3: undo() reverts the optimistic cross-surface patch for the last-removed row', () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'iron-forge' }])
    seedHomeDiscovery(qc, [{ id: 'iron-forge', isFavourited: true }])
    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'iron-forge' }) })
    expect(readHomeFavMap(qc)).toEqual({ 'iron-forge': false })

    act(() => { result.current.undo() })

    // Heart flipped back to filled — same render tick as the
    // splice restoration into the favourites list cache.
    expect(readHomeFavMap(qc)).toEqual({ 'iron-forge': true })
  })

  it('§W6.7-4: DELETE backend error rollback reverts the optimistic cross-surface patch', async () => {
    const { qc, Wrapper } = makeWrapper()
    seedBranches(qc, [{ id: 'iron-forge' }])
    seedHomeDiscovery(qc, [{ id: 'iron-forge', isFavourited: true }])
    mockRemoveBranch.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useRemoveFavourite<Row>('branch'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'iron-forge' }) })
    expect(readHomeFavMap(qc)).toEqual({ 'iron-forge': false })

    // Advance past the 4s undo window so the DELETE fires +
    // rejects + rolls back.
    await act(async () => { jest.advanceTimersByTime(4_100); await Promise.resolve() })

    await waitFor(() => { expect(result.current.error).toBeTruthy() })

    // Rollback restores the cross-surface heart to filled.
    expect(readHomeFavMap(qc)).toEqual({ 'iron-forge': true })
  })

  it('§W6.7-5: voucher entity patches the [voucher] cache too', () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v-bogo' }])
    qc.setQueryData(['voucher', 'v-bogo'], { id: 'v-bogo', isFavourited: true, title: 'BOGO' })
    qc.setQueryData(['discovery', 'home'], {
      // Voucher payloads can appear in cached discovery responses
      // too (e.g. featured-vouchers rail in some surfaces).
      featuredVouchers: [{ id: 'v-bogo', isFavourited: true }],
    })

    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v-bogo' }) })

    const v = qc.getQueryData<{ isFavourited: boolean }>(['voucher', 'v-bogo'])
    const d = qc.getQueryData<{ featuredVouchers: Array<{ id: string; isFavourited: boolean }> }>(['discovery', 'home'])
    expect(v?.isFavourited).toBe(false)
    expect(d?.featuredVouchers[0]?.isFavourited).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// §W6.8 — Wave 6.8 voucher parity pins (no implementation change;
// these are EXPLICIT coverage pins per owner ask).
// ─────────────────────────────────────────────────────────────────
//
// Owner ask on Wave 6.7 re-QA acceptance: confirm voucher
// optimistic cross-surface patching covers ALL voucher-heart
// surfaces (not only Voucher Detail).  The Wave 6.7 implementation
// already does this — the helper key set for voucher entity is
// `[['discovery'], ['merchantProfile'], ['voucher']]` and the
// walker is shape-agnostic so it flips voucher tiles inside the
// Merchant Profile `vouchers[]` array AND the root of any cached
// voucher-detail payload.  Wave 6.8 ships ZERO implementation
// changes; these pins lock the voucher parity contract explicitly:
//
//   §W6.8-1: voucher remove from Favourites flips matching tile
//            inside Merchant Profile vouchers[] cache
//   §W6.8-2: voucher multi-remove patches ALL removed voucher IDs
//            across Merchant Profile vouchers[] + voucher detail
//            caches (not just the most recent)
//   §W6.8-3: undo restores voucher tile across MP + voucher detail
//   §W6.8-4: rollback on DELETE error restores voucher tile across
//            MP + voucher detail
describe('useRemoveFavourite — §W6.8 voucher cross-surface parity', () => {
  type MPCache = {
    merchant: { id: string }
    vouchers: Array<{ id: string; isFavourited: boolean; title: string }>
    branches: Array<{ id: string; isFavourited: boolean }>
  }

  function seedMpCache(qc: QueryClient, vouchers: Array<{ id: string; isFavourited: boolean; title: string }>) {
    qc.setQueryData<MPCache>(
      ['merchantProfile', 'm-iron-forge', { branchId: 'b-main' }],
      {
        merchant: { id: 'm-iron-forge' },
        vouchers,
        branches: [{ id: 'b-main', isFavourited: false }],
      },
    )
  }
  function readMpVouchers(qc: QueryClient): Record<string, boolean> {
    const data = qc.getQueryData<MPCache>(['merchantProfile', 'm-iron-forge', { branchId: 'b-main' }])
    if (!data) return {}
    return Object.fromEntries(data.vouchers.map(v => [v.id, v.isFavourited]))
  }
  function readVoucherDetail(qc: QueryClient, id: string): boolean | undefined {
    return qc.getQueryData<{ isFavourited: boolean }>(['voucher', id])?.isFavourited
  }

  it('§W6.8-1: voucher remove from Favourites flips matching tile inside MerchantProfile vouchers[] cache SYNCHRONOUSLY', () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v-bogo' }])
    seedMpCache(qc, [
      { id: 'v-bogo',   isFavourited: true,  title: 'BOGO Sundays' },
      { id: 'v-spend',  isFavourited: false, title: 'Spend & Save' },
    ])

    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })
    act(() => { result.current.remove({ id: 'v-bogo' }) })

    // MP voucher-card heart for v-bogo flips immediately; the
    // other voucher in the same MP cache is untouched.
    expect(readMpVouchers(qc)).toEqual({ 'v-bogo': false, 'v-spend': false })
  })

  it('§W6.8-2: voucher multi-remove patches ALL removed voucher IDs across MP + voucher detail caches', () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v-bogo' }, { id: 'v-spend' }, { id: 'v-freebie' }, { id: 'v-package' }])
    seedMpCache(qc, [
      { id: 'v-bogo',    isFavourited: true, title: 'BOGO' },
      { id: 'v-spend',   isFavourited: true, title: 'Spend' },
      { id: 'v-freebie', isFavourited: true, title: 'Freebie' },
      { id: 'v-package', isFavourited: true, title: 'Package' },
    ])
    // Each voucher also has its own voucher-detail cache entry.
    qc.setQueryData(['voucher', 'v-bogo'],    { id: 'v-bogo',    isFavourited: true })
    qc.setQueryData(['voucher', 'v-spend'],   { id: 'v-spend',   isFavourited: true })
    qc.setQueryData(['voucher', 'v-freebie'], { id: 'v-freebie', isFavourited: true })
    qc.setQueryData(['voucher', 'v-package'], { id: 'v-package', isFavourited: true })

    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v-bogo'    }) })
    act(() => { result.current.remove({ id: 'v-spend'   }) })
    act(() => { result.current.remove({ id: 'v-freebie' }) })

    // All three removed voucher IDs flipped across BOTH the MP
    // vouchers[] cache AND each voucher detail cache.  v-package
    // (not removed) stays favourited everywhere.
    expect(readMpVouchers(qc)).toEqual({
      'v-bogo':    false,
      'v-spend':   false,
      'v-freebie': false,
      'v-package': true,
    })
    expect(readVoucherDetail(qc, 'v-bogo')).toBe(false)
    expect(readVoucherDetail(qc, 'v-spend')).toBe(false)
    expect(readVoucherDetail(qc, 'v-freebie')).toBe(false)
    expect(readVoucherDetail(qc, 'v-package')).toBe(true)
  })

  it('§W6.8-3: undo() restores voucher tile across MP + voucher detail caches', () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v-bogo' }])
    seedMpCache(qc, [{ id: 'v-bogo', isFavourited: true, title: 'BOGO' }])
    qc.setQueryData(['voucher', 'v-bogo'], { id: 'v-bogo', isFavourited: true, title: 'BOGO' })

    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v-bogo' }) })
    expect(readMpVouchers(qc)).toEqual({ 'v-bogo': false })
    expect(readVoucherDetail(qc, 'v-bogo')).toBe(false)

    act(() => { result.current.undo() })

    expect(readMpVouchers(qc)).toEqual({ 'v-bogo': true })
    expect(readVoucherDetail(qc, 'v-bogo')).toBe(true)
  })

  it('§W6.8-4: DELETE-error rollback restores voucher tile across MP + voucher detail caches', async () => {
    const { qc, Wrapper } = makeWrapper()
    seedVouchers(qc, [{ id: 'v-bogo' }])
    seedMpCache(qc, [{ id: 'v-bogo', isFavourited: true, title: 'BOGO' }])
    qc.setQueryData(['voucher', 'v-bogo'], { id: 'v-bogo', isFavourited: true, title: 'BOGO' })
    mockRemoveVoucher.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useRemoveFavourite<Row>('voucher'), { wrapper: Wrapper })

    act(() => { result.current.remove({ id: 'v-bogo' }) })
    expect(readMpVouchers(qc)).toEqual({ 'v-bogo': false })
    expect(readVoucherDetail(qc, 'v-bogo')).toBe(false)

    await act(async () => { jest.advanceTimersByTime(4_100); await Promise.resolve() })
    await waitFor(() => { expect(result.current.error).toBeTruthy() })

    expect(readMpVouchers(qc)).toEqual({ 'v-bogo': true })
    expect(readVoucherDetail(qc, 'v-bogo')).toBe(true)
  })
})
