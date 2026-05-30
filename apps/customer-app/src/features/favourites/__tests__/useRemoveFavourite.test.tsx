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
