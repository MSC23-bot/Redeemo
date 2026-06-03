// Batch 1B refactor (2026-06-01) — the standalone <ProximityBandChip> mount
// in <BranchTile> was retired in favour of an inline semantic-coloured
// proximity clause inside the info line. The three band copy strings
// + the three null/NEARBY/undefined defensive pins survive — they now
// assert against the inline clause instead of a chip element.
//
// (Filename retained to avoid CI grep churn. Rename to
// `BranchTile.proximity-clause.test.tsx` deferred to a Tier 0 hygiene PR.)

import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile — proximity clause wiring (Batch 1B inline-clause replacement)', () => {
  it('renders "In your area" inline when proximityBand is IN_YOUR_AREA', () => {
    const tile = makeBranchTile({
      proximityBand: 'IN_YOUR_AREA',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('In your area')).toBeTruthy()
    // Defensive: chip element must NOT also render alongside the inline clause.
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders "Short trip" inline when proximityBand is A_LITTLE_FURTHER', () => {
    const tile = makeBranchTile({
      proximityBand: 'A_LITTLE_FURTHER',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('Short trip')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()  // pre-fixup-3 wording
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders "Nearest match" inline when proximityBand is NEAREST_ON_REDEEMO', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEAREST_ON_REDEEMO',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(getByText('Nearest match')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()        // pre-fixup-2 wording
    expect(queryByText('Closest match on Redeemo')).toBeNull()  // v1.7/v1.8 transitional copy
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is NEARBY', () => {
    const tile = makeBranchTile({
      proximityBand: 'NEARBY',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText, queryByTestId } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('Short trip')).toBeNull()
    expect(queryByText('Nearest match')).toBeNull()
    expect(queryByTestId('proximity-band-chip')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is null', () => {
    const tile = makeBranchTile({
      proximityBand: null,
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('Short trip')).toBeNull()
    expect(queryByText('Nearest match')).toBeNull()
  })

  it('renders no proximity copy when proximityBand is absent (pre-M3 response)', () => {
    const tile = makeBranchTile()  // fixture default has proximityBand:null
    const { queryByText } = render(<BranchTile branch={tile} onPress={jest.fn()} />)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('Short trip')).toBeNull()
    expect(queryByText('Nearest match')).toBeNull()
  })
})
