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
