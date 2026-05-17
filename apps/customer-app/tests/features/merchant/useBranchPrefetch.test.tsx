// §N11 prefetch hook — pins the contract that §BD-3's skeleton
// fallback is supplemented (not replaced) by a Branches-tab-open
// prefetch of the nearest active non-current branches.
//
// Cap = 5 (PREFETCH_CAP). Skips current branch. Skips suspended
// branches. Distance-sorted so the most-likely-tapped branches warm
// first. Idempotent: re-renders with the same inputs don't re-fire
// (React Query's prefetchQuery de-dupes within staleTime).
//
// The hook never returns anything — it's a side-effect-only
// integration with the React Query cache. Assertions inspect
// `qc.prefetchQuery` calls directly via spy.

import React from 'react'
import { renderHook } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { merchantApi } from '@/lib/api/merchant'
import {
  useBranchPrefetch,
  PREFETCH_CAP,
  type BranchPrefetchTile,
} from '@/features/merchant/hooks/useBranchPrefetch'

// Resolve all prefetch fetches immediately so jest doesn't leave
// open-promise handles. Returns a minimal shape — the hook doesn't
// inspect the response, only that the fetch landed.
jest.spyOn(merchantApi, 'getProfile').mockResolvedValue({} as any)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const prefetchSpy = jest.spyOn(qc, 'prefetchQuery')
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { Wrap, prefetchSpy, qc }
}

function branch(id: string, distance: number | null, isActive = true): BranchPrefetchTile {
  return { id, distance, isActive }
}

const MERCHANT = 'covelum-id'
const LOCATION = { lat: 51.81, lng: 1.02 }

describe('useBranchPrefetch — §N11 within-merchant branch prefetch', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockClear()
  })

  // Fires-on-tab-open contract.
  it('prefetches every active non-current branch when enabled (2-branch merchant)', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',                              // Brightlingsea
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    expect(prefetchSpy).toHaveBeenCalledTimes(1)
    const call = prefetchSpy.mock.calls[0]![0]!
    expect(call.queryKey).toEqual(['merchantProfile', MERCHANT, 'b2', LOCATION.lat, LOCATION.lng])
    expect(call.staleTime).toBe(60_000)
  })

  // No-op gates.
  it('does NOT prefetch when enabled is false (the Branches tab is not active)', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   LOCATION,
        enabled:    false,
      }),
      { wrapper: Wrap },
    )
    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  it('does NOT prefetch when there are no other branches (single-branch merchant)', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  it('does NOT prefetch the currently-selected branch', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000), branch('b3', 9000)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    const keys = prefetchSpy.mock.calls.map(c => (c[0] as any).queryKey)
    const branchIdsPrefetched = keys.map(k => k[2])
    expect(branchIdsPrefetched).not.toContain('b1')
    expect(branchIdsPrefetched).toEqual(expect.arrayContaining(['b2', 'b3']))
  })

  it('does NOT prefetch suspended branches', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [
          branch('b1', 100),
          branch('b2', 5000),
          branch('b3', 9000, /* isActive */ false),    // suspended
        ],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    const branchIdsPrefetched = prefetchSpy.mock.calls.map(c => ((c[0] as any).queryKey)[2])
    expect(branchIdsPrefetched).toEqual(['b2'])
    expect(branchIdsPrefetched).not.toContain('b3')
  })

  it('does NOT prefetch when merchantId is empty (defensive)', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: '',
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  // Cap + sort contract.
  it('caps prefetch count at PREFETCH_CAP (=5) and picks the nearest non-current branches', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    // 10 others: distances 100, 200, 500, 700, 1000, 2000, 3000, 5000, 7000, 9000.
    // Top 5 nearest should be 100, 200, 500, 700, 1000 → b2, b3, b4, b5, b6.
    const branches: BranchPrefetchTile[] = [
      branch('b1',  null),                           // current; excluded
      branch('b2',  100),
      branch('b3',  200),
      branch('b4',  500),
      branch('b5',  700),
      branch('b6',  1000),
      branch('b7',  2000),
      branch('b8',  3000),
      branch('b9',  5000),
      branch('b10', 7000),
      branch('b11', 9000),
    ]
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches,
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    expect(prefetchSpy).toHaveBeenCalledTimes(PREFETCH_CAP)
    const inOrder = prefetchSpy.mock.calls.map(c => ((c[0] as any).queryKey)[2])
    expect(inOrder).toEqual(['b2', 'b3', 'b4', 'b5', 'b6'])
  })

  it('passes lat/lng into the queryFn when location is set, omits them when location is null', () => {
    const { Wrap } = makeWrapper()
    const getProfileSpy = merchantApi.getProfile as jest.Mock

    // With location.
    getProfileSpy.mockClear()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    expect(getProfileSpy).toHaveBeenCalledWith(MERCHANT, { branchId: 'b2', lat: LOCATION.lat, lng: LOCATION.lng })

    // Without location — separate hook instance / wrapper so the
    // first wrapper's cache doesn't dedupe the new call.
    getProfileSpy.mockClear()
    const { Wrap: Wrap2 } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   null,
        enabled:    true,
      }),
      { wrapper: Wrap2 },
    )
    expect(getProfileSpy).toHaveBeenCalledWith(MERCHANT, { branchId: 'b2' })
  })

  it('passes prefetchQuery a 60_000ms staleTime matching useMerchantProfile (cache slot alignment)', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [branch('b1', 100), branch('b2', 5000)],
        location:   LOCATION,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    const opts = prefetchSpy.mock.calls[0]![0]!
    expect(opts.staleTime).toBe(60_000)
  })

  it('handles no-GPS branches (distance null) by skipping the sort path', () => {
    const { Wrap, prefetchSpy } = makeWrapper()
    // None have GPS → hook leaves natural order and still caps + filters.
    renderHook(
      () => useBranchPrefetch({
        merchantId: MERCHANT,
        branchId:   'b1',
        branches:   [
          branch('b1', null),                           // current
          branch('b2', null),
          branch('b3', null),
        ],
        location:   null,
        enabled:    true,
      }),
      { wrapper: Wrap },
    )
    const inOrder = prefetchSpy.mock.calls.map(c => ((c[0] as any).queryKey)[2])
    expect(inOrder).toEqual(['b2', 'b3'])
  })
})
