// §AY — useInAreaMerchants keeps previous merchants visible during
// bbox refetch (pan/zoom anti-flicker behaviour).
//
// Map pan/zoom triggers a new bbox query. Default React Query
// behaviour clears `data` on key change → MapScreen renders no
// pins until the new fetch resolves → user sees a blank map for
// the refetch duration. This test pins the fix: while the next
// bbox request is in-flight, the previous bbox's merchants
// remain visible.

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'
import { useInAreaMerchants } from '@/features/map/hooks/useInAreaMerchants'
import { makeMerchantTile } from '../../fixtures/merchantTile'

jest.spyOn(discoveryApi, 'getInAreaMerchants')

const tileA = makeMerchantTile({ id: 'a', businessName: 'Bbox-A Cafe' })
const tileB = makeMerchantTile({ id: 'b', businessName: 'Bbox-B Cafe' })

const responseA = {
  merchants: [tileA],
  total: 1,
  meta: {
    resolvedArea:     'A',
    nearbyCount:      1,
    cityCount:        0,
    distantCount:     0,
    emptyStateReason: 'none' as const,
  },
}
const responseB = {
  merchants: [tileB],
  total: 1,
  meta: {
    resolvedArea:     'B',
    nearbyCount:      1,
    cityCount:        0,
    distantCount:     0,
    emptyStateReason: 'none' as const,
  },
}

const bboxA = { minLat: 53.6, maxLat: 53.7, minLng: -1.85, maxLng: -1.75 }
const bboxB = { minLat: 51.7, maxLat: 51.9, minLng: 0.9, maxLng: 1.1 }

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useInAreaMerchants — pan/zoom keep-previous behaviour (§AY)', () => {
  beforeEach(() => { (discoveryApi.getInAreaMerchants as jest.Mock).mockReset() })

  it('keeps previous viewport merchants visible while the next bbox request is in-flight', async () => {
    // First bbox resolves to responseA.
    (discoveryApi.getInAreaMerchants as jest.Mock).mockResolvedValueOnce(responseA)
    const wrapper = makeWrapper()
    const { result, rerender } = renderHook(
      ({ bbox }: { bbox: typeof bboxA }) => useInAreaMerchants(bbox),
      { wrapper, initialProps: { bbox: bboxA } },
    )

    await waitFor(() => expect(result.current.data?.merchants[0]?.id).toBe('a'))

    // Pan: bbox changes. The next fetch is pending (never resolves
    // during this assertion window), so default behaviour would
    // surface `data === undefined`. With keep-previous, the previous
    // viewport's merchants stay until the new fetch resolves.
    let resolveB: (value: typeof responseB) => void = () => {}
    const pendingB = new Promise<typeof responseB>((resolve) => { resolveB = resolve })
    ;(discoveryApi.getInAreaMerchants as jest.Mock).mockReturnValueOnce(pendingB)
    rerender({ bbox: bboxB })

    // During the in-flight gap: previous merchants still visible.
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    expect(result.current.data?.merchants[0]?.id).toBe('a')

    // Resolve the second fetch → swap to new viewport.
    resolveB(responseB)
    await waitFor(() => expect(result.current.data?.merchants[0]?.id).toBe('b'))
    expect(result.current.isFetching).toBe(false)
  })

  it('clears previous data when the hook becomes disabled (bbox is null)', () => {
    // Defensive: if bbox is later null'd out (offshore / permission revoked
    // / unmount-equivalent), the previous data must not stick forever.
    // keepPreviousData should NOT survive across `enabled=false` transitions.
    (discoveryApi.getInAreaMerchants as jest.Mock).mockResolvedValue(responseA)
    const wrapper = makeWrapper()
    const { result, rerender } = renderHook(
      ({ bbox }: { bbox: typeof bboxA | null }) => useInAreaMerchants(bbox),
      { wrapper, initialProps: { bbox: bboxA as typeof bboxA | null } },
    )
    rerender({ bbox: null })
    // With bbox=null, the hook is disabled — `data` should be undefined
    // (the previous in-flight is cancelled; placeholderData should not
    // keep the now-disabled query's previous result).
    expect(result.current.data).toBeUndefined()
  })
})
