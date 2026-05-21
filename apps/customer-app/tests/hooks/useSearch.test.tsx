// §AY — useSearch opt-in keep-previous flag for Map's bbox-mode path.
//
// MapScreen passes `{ keepPreviousData: true }` so that pan/zoom while
// non-scope filters are active doesn't blank the map. SearchScreen +
// CategoryResultsScreen must NOT change behaviour — typing a new query
// must still clear the previous results during the next fetch.

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'
import { useSearch } from '@/hooks/useSearch'
import { makeBranchTile } from '../fixtures/branchTile'

jest.spyOn(discoveryApi, 'searchMerchants')

// Phase 3a Task B: migrated from makeMerchantTile to makeBranchTile.
// Assertions updated from merchants[0]?.id → branches[0]?.merchant?.id;
// expected values ('a', 'b') unchanged.
const branchA = makeBranchTile({ id: 'brn-a', merchant: { id: 'a', businessName: 'A' } })
const branchB = makeBranchTile({ id: 'brn-b', merchant: { id: 'b', businessName: 'B' } })

const responseA = { merchants: [], total: 1, branches: [branchA], totalBranches: 1 }
const responseB = { merchants: [], total: 1, branches: [branchB], totalBranches: 1 }

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSearch — keepPreviousData opt-in (§AY)', () => {
  beforeEach(() => { (discoveryApi.searchMerchants as jest.Mock).mockReset() })

  it('with keepPreviousData=true: previous results stay visible during next fetch', async () => {
    (discoveryApi.searchMerchants as jest.Mock).mockResolvedValueOnce(responseA)
    const wrapper = makeWrapper()
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearch({ q, limit: 30 }, true, { keepPreviousData: true }),
      { wrapper, initialProps: { q: 'first' } },
    )
    await waitFor(() => expect(result.current.data?.branches?.[0]?.merchant?.id).toBe('a'))

    // New query, response pending.
    let resolveB: (value: typeof responseB) => void = () => {}
    const pendingB = new Promise<typeof responseB>((r) => { resolveB = r })
    ;(discoveryApi.searchMerchants as jest.Mock).mockReturnValueOnce(pendingB)
    rerender({ q: 'second' })

    await waitFor(() => expect(result.current.isFetching).toBe(true))
    // Previous results still visible — the §AY win.
    expect(result.current.data?.branches?.[0]?.merchant?.id).toBe('a')

    resolveB(responseB)
    await waitFor(() => expect(result.current.data?.branches?.[0]?.merchant?.id).toBe('b'))
  })

  it('without the flag (default): previous results clear during next fetch (SearchScreen / Category behaviour)', async () => {
    (discoveryApi.searchMerchants as jest.Mock).mockResolvedValueOnce(responseA)
    const wrapper = makeWrapper()
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearch({ q, limit: 30 }),
      { wrapper, initialProps: { q: 'first' } },
    )
    await waitFor(() => expect(result.current.data?.branches?.[0]?.merchant?.id).toBe('a'))

    // New query, response pending.
    let resolveB: (value: typeof responseB) => void = () => {}
    const pendingB = new Promise<typeof responseB>((r) => { resolveB = r })
    ;(discoveryApi.searchMerchants as jest.Mock).mockReturnValueOnce(pendingB)
    rerender({ q: 'second' })

    await waitFor(() => expect(result.current.isFetching).toBe(true))
    // Default: previous results gone.
    expect(result.current.data).toBeUndefined()

    resolveB(responseB)
    await waitFor(() => expect(result.current.data?.branches?.[0]?.merchant?.id).toBe('b'))
  })
})
