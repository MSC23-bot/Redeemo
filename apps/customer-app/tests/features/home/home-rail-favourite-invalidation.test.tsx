/**
 * Phase 3C.1g M2.7 — `<BranchTile>` heart-tap invalidates the
 * Favourites tab cache (spec §7.8 Home rail invalidation fix).
 *
 * Before M2.7, the rails wired a custom `onFavourite` callback that
 * had to be hand-piped down from the rail parent to the tile.
 * After M2.7 the heart is owned by `<FavouriteHeart>` which calls
 * `useFavourite()` internally; on POST/DELETE success the hook
 * invalidates the `['favouriteBranches']` cache key — driving the
 * Favourites tab refetch automatically with zero rail wiring.
 *
 * This test mounts a single `<BranchTile>` inside a QueryClient
 * Provider, taps the heart, and asserts:
 *   - api.post fires with the branch-keyed endpoint.
 *   - queryClient.invalidateQueries fires with `['favouriteBranches']`.
 */

import React from 'react'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { BranchTile } from '@/features/shared/BranchTile'
import type { BranchTile as BranchTileType } from '@/lib/api/discovery'

jest.spyOn(api, 'post')
jest.spyOn(api, 'del')

function makeTile(overrides: Partial<BranchTileType> = {}): BranchTileType {
  const base: BranchTileType = {
    id:                 'br-A',
    name:               'Test Branch',
    localityId:         null,
    localityName:       null,
    postTown:           null,
    city:               'Testtown',
    latitude:           51.5,
    longitude:          -0.1,
    locationConfidence: 'MANUALLY_CONFIRMED',
    distance:           400,
    distanceMetres:     400,
    proximityBand:      null,
    supplyRung:         null,
    isFavourited:       false,
    matchContext:       null,
    merchant: {
      id:                  'm-A',
      businessName:        'Test Co',
      tradingName:         null,
      logoUrl:             null,
      bannerUrl:           null,
      primaryCategory:     null,
      primaryCategoryId:   null,
      descriptor:          'Test Restaurant',
      highlights:          [],
      voucherCount:        2,
      maxEstimatedSaving:  10,
    },
    avgRating:    4.5,
    reviewCount:  10,
  } as unknown as BranchTileType
  return { ...base, ...overrides }
}

function mountTile(props: Partial<React.ComponentProps<typeof BranchTile>> = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={qc}>
      <BranchTile branch={makeTile()} onPress={jest.fn()} {...props} />
    </QueryClientProvider>,
  )
  return { ...utils, qc, invalidateSpy }
}

beforeEach(() => {
  ;(api.post as jest.Mock).mockReset()
  ;(api.del  as jest.Mock).mockReset()
})

describe('BranchTile — heart-tap invalidates favouriteBranches (Phase 3C.1g M2.7)', () => {
  it('add: tapping the heart POSTs to /favourites/branches/:id and invalidates the Favourites cache', async () => {
    ;(api.post as jest.Mock).mockResolvedValueOnce({ ok: true })
    const { getByTestId, invalidateSpy } = mountTile()

    const heart = getByTestId('branch-tile-br-A-heart')
    await act(async () => { fireEvent.press(heart) })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/customer/favourites/branches/br-A', undefined)
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favouriteBranches'] })
    })
  })

  it('renders <FavouriteHeart> as a child of the BranchTile (no inline Heart UI)', () => {
    const { getByTestId } = mountTile()
    expect(getByTestId('branch-tile-br-A-heart')).toBeTruthy()
  })
})
