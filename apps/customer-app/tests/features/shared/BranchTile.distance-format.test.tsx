// Batch 1B Tier 3 (2026-06-01) — the shared `<BranchTile>` switched from the
// long-form "X miles away" (formatDistance) to the COMPACT "X mi"
// (formatDistanceCompact) on the dedicated line 2 of the two-line info
// hierarchy. The compact form keeps line 2 (`distance · proximity`) short
// enough that the proximity clause never tail-truncates.
//
// This pin locks the compact format on `<BranchTile>`:
//   - sub-1-mile  → "0.2 mi"   (NEVER bare metres "276m")
//   - >1km        → "5.1 mi"
//   - NEVER the long-form "X miles away" (that stays on <SearchResultItem>)
//   - still miles-only, never metres (preserves the single-unit trust rule)

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — compact distance formatter (Batch 1B Tier 3)', () => {
  it('sub-1-mile distance renders as "0.X mi" — NEVER bare metres, NEVER long-form', () => {
    const tile = makeBranchTile({
      id:       'brn-close',
      distance: 276, // ~0.2 miles
      merchant: { businessName: 'Just Round The Corner' },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    expect(getByText('0.2 mi')).toBeTruthy()
    // Negative pins:
    expect(queryByText(/276m/)).toBeNull()        // never bare metres
    expect(queryByText(/miles away/)).toBeNull()  // long-form stays on <SearchResultItem>
  })

  it('>1km distance renders as "X.X mi" — compact, not long-form', () => {
    const tile = makeBranchTile({
      id:       'brn-far',
      distance: 8200, // ~5.1 miles
      merchant: { businessName: 'Across Town' },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    expect(getByText('5.1 mi')).toBeTruthy()
    expect(queryByText(/miles away/)).toBeNull()
  })

  it('null distance renders empty (no "0 mi" / "0 miles" placeholder)', () => {
    const tile = makeBranchTile({
      id:       'brn-unknown',
      distance: null,
      merchant: { businessName: 'No Distance Known' },
    })
    const { queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    // No distance text rendered at all. The info hierarchy may still show
    // the descriptor / locality on line 1 but no "mi" on line 2.
    expect(queryByText(/\bmi\b/)).toBeNull()
    expect(queryByText(/miles/)).toBeNull()
  })

  it('null distance + non-null proximityBand renders proximity clause on line 2 without orphan separator', () => {
    const tile = makeBranchTile({
      id:            'brn-no-dist-with-band',
      distance:      null,
      proximityBand: 'IN_YOUR_AREA',
      merchant:      { businessName: 'Just Round The Corner', descriptor: 'Café' },
    })
    const { getByText, queryByText } = render(
      <BranchTile branch={tile} onPress={() => {}} />,
    )
    // Line 1 descriptor + line 2 proximity clause; no orphan separator.
    expect(getByText('Café')).toBeTruthy()
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/· ·/)).toBeNull()
    expect(queryByText(/^ · /)).toBeNull()
  })
})
