/**
 * §DH Tier 1 always-show locality (locked 2026-05-31 after PR #137)
 *
 * Owner ask: surface branch locality on the shared `<BranchTile>` so
 * multi-branch merchants are distinguishable when the same merchant
 * surfaces twice on the same rail.  Canonical case: Covelum
 * Brightlingsea vs Covelum Colchester on the Brightlingsea Featured
 * rail.
 *
 * Wire fallback per the backend `branchTileSchema`:
 *   branchLocalityName > branchPostTown > branchCity
 *
 * Locality renders FIRST in the info row so the eye lands on it
 * immediately.  Pure presentation change — wire fields were already
 * exposed by Plan 4 M1; this just consumes them.
 *
 * `<BranchTile>` is the shared card across Home Featured / Trending /
 * Popular / NearbyByCategory + Search results + Map carousel (via
 * `MapBranchTile`) + Category results.  Locality now lands on every
 * one of those surfaces.
 */

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// `<BranchTile>` mounts `<FavouriteHeart>` which needs a QueryClient.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — §DH branch locality in info row', () => {
  it('renders branchLocalityName when set (the primary wire field)', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      branchPostTown:     'Colchester',
      branchCity:         'Essex',
      distance:           1932,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Locality at the front of the info row; primary wire field
    // wins over the lower-precedence fallbacks.
    expect(getByText(/Brightlingsea · Italian Restaurant · 1\.2 miles away/)).toBeTruthy()
    // Defensive: the lower-precedence fallbacks must NOT also appear.
    expect(queryByText(/Colchester · /)).toBeNull()
    expect(queryByText(/Essex · /)).toBeNull()
  })

  it('falls back to branchPostTown when branchLocalityName is null', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     'Colchester',
      branchCity:         'Essex',
      distance:           2414,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/Colchester · Italian Restaurant · 1\.5 miles away/)).toBeTruthy()
    expect(queryByText(/Essex · /)).toBeNull()
  })

  it('falls back to branchCity when branchLocalityName + branchPostTown are both null', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         'Manchester',
      distance:           804,
      merchant:           { businessName: 'Iron Forge Gym', descriptor: 'Gym' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText(/Manchester · Gym · 0\.5 miles away/)).toBeTruthy()
  })

  it('all three locality fields null → no locality prefix + NO double-separator junk in the info row', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           1207,
      merchant:           { businessName: 'No Locality', descriptor: 'Café' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Info row renders descriptor + distance only — no leading " · "
    // separator (the `.filter(Boolean)` upstream drops the empty
    // locality string before the join).
    expect(getByText(/^Café · 0\.7 miles away$/)).toBeTruthy()
    // Defensive: no leading-separator junk and no orphaned
    // "branchLocalityName" string leaking through.
    expect(queryByText(/^ · /)).toBeNull()
    expect(queryByText(/branchLocalityName/)).toBeNull()
  })

  it('locality renders BEFORE descriptor + distance (order-of-elements pin)', () => {
    // The eye should land on the locality first when scanning a rail
    // of cards from the same merchant — locality at the FRONT of the
    // info row, not at the end.
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Anchor on the full string to lock the ORDER of locality →
    // descriptor → distance.  Reordering would surface here.
    expect(getByText('Brightlingsea · Italian Restaurant · 1.0 miles away')).toBeTruthy()
  })

  it('accessibility label includes locality when present (screen-reader disambiguation)', () => {
    const tile = makeBranchTile({
      id:                 'brn-covelum-bse',
      branchLocalityName: 'Brightlingsea',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByLabelText('Covelum, Brightlingsea, Italian Restaurant')).toBeTruthy()
  })

  it('accessibility label omits the locality segment cleanly when all wire fields are null', () => {
    const tile = makeBranchTile({
      id:                 'brn-no-locality',
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      merchant:           { businessName: 'Plainsville', descriptor: 'Café' },
    })
    const { getByLabelText, queryByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByLabelText('Plainsville, Café')).toBeTruthy()
    // Defensive: no orphaned ", , " from a leading-empty-locality
    // bug if the conditional were collapsed wrongly in future.
    expect(queryByLabelText(/, , /)).toBeNull()
  })
})
