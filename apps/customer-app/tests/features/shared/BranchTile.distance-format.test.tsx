// PR-3 fixup-1 (2026-05-20) — Codex #2 regression pin.
//
// The shared `<BranchTile>` is consumed by Home Featured / Trending /
// NearbyByCategory, Search Category Results, AND the Map carousel (via
// `MapBranchTile`).  Before this fix, the local helper
// rendered `${Math.round(metres)}m` for sub-1km (e.g. "500m") and
// `${miles.toFixed(1)} mi` for >=1km (e.g. "1.2 mi").  Search-side
// `<SearchResultItem>` rendered "miles away" via the shared
// `formatDistance` helper (PR #112 fixup-6 lock).
//
// This pin locks the unified miles-only copy on the shared
// `<BranchTile>` — sub-1-mile distances now render as
// "0.3 miles away", NEVER as "500m" or " mi".

import React from 'react'
import { render } from '@testing-library/react-native'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

describe('BranchTile — shared distance formatter (Codex #2)', () => {
  it('sub-1-mile distance renders as "0.X miles away" — NEVER bare metres', () => {
    const tile = makeBranchTile({
      id:       'brn-close',
      distance: 276, // ~0.2 miles
      merchant: { businessName: 'Just Round The Corner' },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    expect(getByText(/0\.2 miles away/)).toBeTruthy()
    // Negative pins — the old local formatter would have emitted "276m".
    expect(queryByText(/276m/)).toBeNull()
    expect(queryByText(/ mi$/)).toBeNull()
  })

  it('>1km distance renders as "X.X miles away" — NOT the old " mi" suffix', () => {
    const tile = makeBranchTile({
      id:       'brn-far',
      distance: 8200, // ~5.1 miles
      merchant: { businessName: 'Across Town' },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    expect(getByText(/5\.1 miles away/)).toBeTruthy()
    expect(queryByText(/5\.1 mi$/)).toBeNull()
    expect(queryByText(/5\.1 mi\b(?! away)/)).toBeNull()
  })

  it('null distance renders empty (no "0 miles away" placeholder)', () => {
    const tile = makeBranchTile({
      id:       'brn-unknown',
      distance: null,
      merchant: { businessName: 'No Distance Known' },
    })
    const { queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    // No distance text rendered at all.  The info line may still
    // contain the descriptor / category name but no "miles away".
    expect(queryByText(/miles away/)).toBeNull()
  })
})
