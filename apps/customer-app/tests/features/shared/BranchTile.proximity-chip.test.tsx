// Plan 4 M3b — proximity chip wiring in shared BranchTile.
//
// Covers all five band states (3 visible, 2 hidden + the absent case).
// BranchTile is used by Home Featured / Trending / NearbyByCategory,
// Category results, and the Map carousel (via MapBranchTile). One
// wiring in BranchTile.tsx feeds every consumer; this test pins it.

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

// Phase 3C.1g M2.7 — `<BranchTile>` now renders `<FavouriteHeart>`
// which needs a `<QueryClientProvider>` in scope.  Wrap render here
// so the existing proximity-chip pins below stay untouched.
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — proximity chip wiring (Plan 4 M3b)', () => {
  it('renders "In your area" when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeBranchTile({ proximityBand: 'IN_YOUR_AREA' })
    const { getByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('In your area')).toBeTruthy()
  })

  // PR #112 device-QA copy refresh (2026-05-19) — owner-locked copy on
  // ProximityBandChip. Negative pins guard against silent revert.
  it('renders "A short trip away" when proximityBand is A_LITTLE_FURTHER (PR #112 copy)', () => {
    const tile = makeBranchTile({ proximityBand: 'A_LITTLE_FURTHER' })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('A short trip away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()
  })

  it('renders "Nearest match on Redeemo" when proximityBand is NEAREST_ON_REDEEMO (v1.9 PR #126 device-QA-6 copy)', () => {
    // v1.9 PR #126 device-QA-6 (2026-05-23): copy refined from "Closest match
    // on Redeemo" to "Nearest match on Redeemo" — "Nearest" reads more
    // distance-specific than "Closest" per owner direction.
    const tile = makeBranchTile({ proximityBand: 'NEAREST_ON_REDEEMO' })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('Nearest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()        // pre-fixup-2 wording
    expect(queryByText('Closest match on Redeemo')).toBeNull()  // v1.7/v1.8 transitional copy
  })

  it('renders no chip when proximityBand is NEARBY', () => {
    const tile = makeBranchTile({ proximityBand: 'NEARBY' })
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is null (V2-rejected branch in hybrid phase)', () => {
    const tile = makeBranchTile({ proximityBand: null })
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('renders no chip when proximityBand is absent (pre-M3 response)', () => {
    const tile = makeBranchTile() // fixture default omits the field
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })
})
