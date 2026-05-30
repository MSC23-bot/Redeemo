/**
 * Phase 3C.1g Device-QA R1 Wave 6.7 (2026-05-31) — unit pins for the
 * optimistic cross-surface cache patch helper.
 *
 * Walker is intentionally surgical: only flips objects matching
 * `id === targetId` AND `typeof isFavourited === 'boolean'`.  Tests
 * cover: branch tile match / nested tile match / no match / id-only
 * but no isFavourited field / id collision with non-tile shape /
 * multiple matches in array / no-op when already at target value /
 * voucher shape coexistence / structural-sharing.
 */

import { QueryClient } from '@tanstack/react-query'
import {
  deepPatchTilesById,
  applyOptimisticFavouriteToDiscoveryCache,
} from '@/features/favourites/lib/optimisticCachePatch'

describe('deepPatchTilesById — §W6.7 walker unit pins', () => {
  it('flips isFavourited on a top-level branch tile matching id', () => {
    const data = { id: 'b1', name: 'Branch', isFavourited: false }
    const next = deepPatchTilesById(data, 'b1', true)
    expect(next).toEqual({ id: 'b1', name: 'Branch', isFavourited: true })
    expect(next).not.toBe(data)
  })

  it('flips isFavourited on a deeply nested tile inside an array inside an object', () => {
    const data = {
      featured: { branches: [{ id: 'b1', name: 'A', isFavourited: false }] },
      trending: { branches: [{ id: 'b2', name: 'B', isFavourited: true }] },
    }
    const next = deepPatchTilesById(data, 'b1', true)
    expect(next.featured.branches[0]?.isFavourited).toBe(true)
    expect(next.trending.branches[0]?.isFavourited).toBe(true)
    expect(next.featured).not.toBe(data.featured)
    expect(next.trending).toBe(data.trending)
  })

  it('does NOT flip an object with matching id but no isFavourited field (e.g. merchant sub-object)', () => {
    const data = {
      id: 'b1',
      merchant: { id: 'b1', name: 'Embedded merchant — colliding id, no isFavourited' },
      isFavourited: false,
    }
    const next = deepPatchTilesById(data, 'b1', true)
    expect(next.isFavourited).toBe(true)
    expect(next.merchant).toEqual({ id: 'b1', name: 'Embedded merchant — colliding id, no isFavourited' })
    expect(next.merchant).toBe(data.merchant)
  })

  it('returns SAME reference when nothing changes (no match)', () => {
    const data = { branches: [{ id: 'b1', isFavourited: false }] }
    const next = deepPatchTilesById(data, 'NO_MATCH', true)
    expect(next).toBe(data)
  })

  it('returns SAME reference when match already has target value (no-op)', () => {
    const data = { branches: [{ id: 'b1', isFavourited: true }] }
    const next = deepPatchTilesById(data, 'b1', true)
    expect(next).toBe(data)
  })

  it('flips multiple matching tiles in the same array', () => {
    const data = {
      branches: [
        { id: 'b1', isFavourited: false, name: 'A' },
        { id: 'b2', isFavourited: false, name: 'B' },
        { id: 'b1', isFavourited: false, name: 'A-duplicate (paginated)' },
      ],
    }
    const next = deepPatchTilesById(data, 'b1', true)
    expect(next.branches[0]?.isFavourited).toBe(true)
    expect(next.branches[1]?.isFavourited).toBe(false)
    expect(next.branches[2]?.isFavourited).toBe(true)
  })

  it('preserves all other fields on the flipped tile', () => {
    const tile = {
      id:           'b1',
      name:         'Iron Forge Gym',
      isFavourited: false,
      distanceKm:   1.4,
      rating:       4.6,
      merchant:     { id: 'm-abc', name: 'Iron Forge' },
      vouchers:     [{ id: 'v-1' }],
    }
    const next = deepPatchTilesById({ tile }, 'b1', true)
    expect(next.tile).toEqual({ ...tile, isFavourited: true })
  })

  it('voucher tile flips independently of branch tiles in the same payload', () => {
    const data = {
      vouchers: [{ id: 'v1', title: 'BOGO', type: 'BOGO', isFavourited: false }],
      branches: [{ id: 'v1', name: 'Branch v1', isFavourited: false }],
    }
    // Same id 'v1' on both tiles — both flip; walker doesn't
    // discriminate by shape (callers scope by queryKey instead).
    const next = deepPatchTilesById(data, 'v1', true)
    expect(next.vouchers[0]?.isFavourited).toBe(true)
    expect(next.branches[0]?.isFavourited).toBe(true)
  })

  it('handles null + undefined + primitive leaves without crashing', () => {
    const data = {
      a:  null,
      b:  undefined,
      c:  42,
      d:  'string',
      e:  true,
      f:  { id: 'x', isFavourited: false },
    }
    const next = deepPatchTilesById(data, 'x', true)
    expect(next.f?.isFavourited).toBe(true)
    expect(next.a).toBeNull()
    expect(next.b).toBeUndefined()
  })

  it('infinite-query pages shape (favourite-list style) walks each page', () => {
    const data = {
      pages: [
        { items: [{ id: 'b1', isFavourited: false }, { id: 'b2', isFavourited: false }] },
        { items: [{ id: 'b3', isFavourited: false }] },
      ],
      pageParams: [],
    }
    const next = deepPatchTilesById(data, 'b3', true)
    expect(next.pages[0]?.items[0]?.isFavourited).toBe(false)
    expect(next.pages[0]?.items[1]?.isFavourited).toBe(false)
    expect(next.pages[1]?.items[0]?.isFavourited).toBe(true)
  })
})

describe('applyOptimisticFavouriteToDiscoveryCache — §W6.7 setQueriesData wiring', () => {
  function makeClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } })
  }

  it('flips a branch tile in a ["discovery", "home", ...] cache entry', () => {
    const qc = makeClient()
    qc.setQueryData(['discovery', 'home', 53.6, -1.8], {
      featured: { branches: [{ id: 'iron-forge', name: 'Iron Forge', isFavourited: false }] },
    })
    applyOptimisticFavouriteToDiscoveryCache(qc, 'branch', 'iron-forge', true)
    const next = qc.getQueryData<{ featured: { branches: Array<{ id: string; isFavourited: boolean }> } }>(['discovery', 'home', 53.6, -1.8])
    expect(next?.featured.branches[0]?.isFavourited).toBe(true)
  })

  it('also flips a tile in ["discovery", "search", ...] cache entry', () => {
    const qc = makeClient()
    qc.setQueryData(['discovery', 'search', { q: 'gym' }], {
      branches: [{ id: 'iron-forge', isFavourited: false }],
    })
    applyOptimisticFavouriteToDiscoveryCache(qc, 'branch', 'iron-forge', true)
    const next = qc.getQueryData<{ branches: Array<{ id: string; isFavourited: boolean }> }>(['discovery', 'search', { q: 'gym' }])
    expect(next?.branches[0]?.isFavourited).toBe(true)
  })

  it('flips a tile in ["merchantProfile", ...] cache entry (vouchers tab)', () => {
    const qc = makeClient()
    qc.setQueryData(['merchantProfile', 'm-iron-forge', { branchId: 'iron-forge' }], {
      merchant:  { id: 'm-iron-forge', name: 'Iron Forge' },
      vouchers:  [{ id: 'v-bogo', isFavourited: false, title: 'BOGO Sun' }],
      branches:  [{ id: 'iron-forge', isFavourited: false, name: 'Main' }],
    })
    applyOptimisticFavouriteToDiscoveryCache(qc, 'branch', 'iron-forge', true)
    const next = qc.getQueryData<{ branches: Array<{ id: string; isFavourited: boolean }>; vouchers: Array<{ id: string; isFavourited: boolean }> }>(
      ['merchantProfile', 'm-iron-forge', { branchId: 'iron-forge' }],
    )
    expect(next?.branches[0]?.isFavourited).toBe(true)
    expect(next?.vouchers[0]?.isFavourited).toBe(false)
  })

  it('voucher branch ALSO touches ["voucher", ...] cache entries', () => {
    const qc = makeClient()
    qc.setQueryData(['voucher', 'v-bogo'], { id: 'v-bogo', isFavourited: false, title: 'BOGO' })
    applyOptimisticFavouriteToDiscoveryCache(qc, 'voucher', 'v-bogo', true)
    const next = qc.getQueryData<{ isFavourited: boolean }>(['voucher', 'v-bogo'])
    expect(next?.isFavourited).toBe(true)
  })

  it('branch branch does NOT touch ["voucher", ...] cache entries (scope discipline)', () => {
    const qc = makeClient()
    qc.setQueryData(['voucher', 'v-bogo'], { id: 'v-bogo', isFavourited: false, title: 'BOGO' })
    // patch a BRANCH whose id (coincidentally) collides with a voucher id
    applyOptimisticFavouriteToDiscoveryCache(qc, 'branch', 'v-bogo', true)
    const next = qc.getQueryData<{ isFavourited: boolean }>(['voucher', 'v-bogo'])
    // Branch patch should NOT have reached the voucher cache (key
    // prefix omitted for branch entity), so the voucher detail
    // cache stays at its original value.
    expect(next?.isFavourited).toBe(false)
  })

  it('does NOT mutate UNRELATED cache entries (e.g. profile cache)', () => {
    const qc = makeClient()
    qc.setQueryData(['profile'], { id: 'b1', isFavourited: false /* coincidentally */ })
    applyOptimisticFavouriteToDiscoveryCache(qc, 'branch', 'b1', true)
    const next = qc.getQueryData<{ isFavourited: boolean }>(['profile'])
    expect(next?.isFavourited).toBe(false)
  })
})
