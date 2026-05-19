// PR #112 fixup-5 (2026-05-19) — proximity cue on its own row.
//
// Owner direction (latest device screenshot): fixup-4's inline meta-line
// treatment blended a "why this result is shown" cue with normal metadata
// AND wrapped badly ("Closest / match" split on the 166mi card).  The cue
// must now sit on its own muted-pill row below the meta line.
//
// Locked copy + render contract:
//   IN_YOUR_AREA       → "In your area"            (own row, muted pill)
//   A_LITTLE_FURTHER   → "A short trip"            (own row, muted pill)
//   NEAREST_ON_REDEEMO → "Closest available match" (own row, muted pill;
//                                                    NOT "Closest match" —
//                                                    owner-locked clearer copy)
//   NEARBY / null      → no row rendered
//
// Pins:
//   1. Visible copy on its own row (NOT folded into the meta line).
//   2. Meta line carries ONLY descriptor + distance — no proximity tag.
//   3. Negative pins guard fixup-2 + fixup-3 + fixup-4 legacy copy.
//   4. Helper `proximityRowLabel` unit tests cover all 5 inputs (4 bands +
//      null/undefined).

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchResultItem, proximityRowLabel } from '@/features/search/components/SearchResultItem'
import { makeBranchTile } from '../../fixtures/branchTile'

// PR #112 fixup-6 — SearchResultItem now wires `useFavourite` for the
// heart icon, so render needs a QueryClient context.
function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(React.createElement(QueryClientProvider, { client: qc }, ui))
}

describe('SearchResultItem — proximity cue on its own row (PR #112 fixup-5)', () => {
  it('IN_YOUR_AREA renders "In your area" on its own row AND the meta line carries no proximity', () => {
    const tile = makeBranchTile({
      proximityBand: 'IN_YOUR_AREA',
      distance: 2400,                       // 2400m → "1.5 miles away" (miles-only contract)
      merchant: { id: 'm1', businessName: 'M', descriptor: 'Indian Restaurant', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('In your area')).toBeTruthy()
    // Meta line is descriptor + distance ONLY (miles-only post fixup-6).
    expect(getByText(/Indian Restaurant · 1\.5 miles away/)).toBeTruthy()
    // Negative pin — meta-line-with-proximity wording must NOT appear.
    expect(queryByText(/Indian Restaurant.*In your area/)).toBeNull()
  })

  it('A_LITTLE_FURTHER renders "A short trip" on its own row', () => {
    const tile = makeBranchTile({
      proximityBand: 'A_LITTLE_FURTHER',
      distance: 10_800,
      merchant: { id: 'm2', businessName: 'M', descriptor: 'Coffee shop', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('A short trip')).toBeTruthy()
    // 10_800m → 10800/1609.34 = 6.71 → "6.7 miles away"
    expect(getByText(/Coffee shop · 6\.7 miles away/)).toBeTruthy()
    // Negative pin — folded meta-line treatment must NOT appear.
    expect(queryByText(/Coffee shop.*A short trip/)).toBeNull()
  })

  it('NEAREST_ON_REDEEMO renders "Closest available match" (owner-locked clearer copy)', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEAREST_ON_REDEEMO',
      distance: 278_900,
      merchant: { id: 'm3', businessName: 'M', descriptor: 'Pilates Studio', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(getByText('Closest available match')).toBeTruthy()
    expect(getByText(/Pilates Studio · 173\.\d miles away/)).toBeTruthy()
    // Negative pins — legacy copy across ALL prior fixups.
    expect(queryByText('Closest match')).toBeNull()                 // fixup-4 meta-line wording
    expect(queryByText('Closest match on Redeemo')).toBeNull()      // fixup-2 chip wording
    expect(queryByText('Nearest on Redeemo')).toBeNull()            // pre-fixup wording
  })

  it('NEARBY renders no proximity row (already nearby, no explanation needed)', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEARBY',
      distance: 200,
      merchant: { id: 'm4', businessName: 'M', descriptor: 'Cafe', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    // Miles-only contract — 200m → 0.1 miles.
    expect(getByText(/Cafe · 0\.1 miles away/)).toBeTruthy()
    expect(queryByText(/In your area/)).toBeNull()
    expect(queryByText(/A short trip/)).toBeNull()
    expect(queryByText(/Closest/)).toBeNull()
  })

  it('null proximityBand renders no proximity row', () => {
    const tile = makeBranchTile({
      proximityBand: null,
      distance: 5000,
      merchant: { id: 'm5', businessName: 'M', descriptor: 'Bakery', voucherCount: 0 },
    })
    const { queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    expect(queryByText(/In your area/)).toBeNull()
    expect(queryByText(/A short trip/)).toBeNull()
    expect(queryByText(/Closest/)).toBeNull()
  })

  it('regression — long-distance card MUST NOT wrap to "Closest / match" split', () => {
    // Owner-flagged screenshot bug: 166mi card wrapped the inline cue
    // across two lines.  The own-row treatment + numberOfLines={1} +
    // ellipsisMode pins single-line rendering.
    const tile = makeBranchTile({
      proximityBand: 'NEAREST_ON_REDEEMO',
      distance: 267_120, // ~166 miles
      merchant: { id: 'm6', businessName: 'Reformer Pilates Studio', descriptor: 'Pilates Studio', voucherCount: 0 },
    })
    const { getByText, queryByText } = render(
      <SearchResultItem tile={tile} query="" onPress={jest.fn()} />,
    )
    // Locked single string — wrap-safe.
    expect(getByText('Closest available match')).toBeTruthy()
    // The descriptor line carries distance only; no proximity suffix that could be split.
    expect(queryByText(/Pilates Studio.*Closest/)).toBeNull()
  })
})

describe('proximityRowLabel helper (PR #112 fixup-5)', () => {
  it('NEARBY → null (no row)', () => {
    expect(proximityRowLabel('NEARBY')).toBeNull()
  })
  it('IN_YOUR_AREA → "In your area"', () => {
    expect(proximityRowLabel('IN_YOUR_AREA')).toBe('In your area')
  })
  it('A_LITTLE_FURTHER → "A short trip"', () => {
    expect(proximityRowLabel('A_LITTLE_FURTHER')).toBe('A short trip')
  })
  it('NEAREST_ON_REDEEMO → "Closest available match" (NOT "Closest match")', () => {
    expect(proximityRowLabel('NEAREST_ON_REDEEMO')).toBe('Closest available match')
  })
  it('null / undefined → null', () => {
    expect(proximityRowLabel(null)).toBeNull()
    expect(proximityRowLabel(undefined)).toBeNull()
  })
})
