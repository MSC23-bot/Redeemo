import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { color } from '@/design-system'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

// Layout C — three-line info hierarchy.
//   line 1: descriptor                        (styles.infoDescriptor)
//   line 2: locality · distance  (pin icon)   (styles.infoWhere)
//   line 3: proximity clause (band coloured)  (styles.infoProximity)
// Distance is the COMPACT "X mi" form (formatDistanceCompact). The lines are
// distinct Text nodes, asserted separately. The descriptor is NO LONGER
// joined to the locality (the old "descriptor · locality" run-on is gone).
describe('BranchTile info hierarchy — Layout C (descriptor / where / proximity)', () => {
  it('IN_YOUR_AREA: descriptor line, "locality · distance" where line, sage proximity line', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()            // line 1 — descriptor only
    expect(getByText('Brightlingsea · 1.0 mi')).toBeTruthy()        // line 2 — where
    const proximityNode = getByText('In your area')                 // line 3 — proximity
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.success)
  })

  it('A_LITTLE_FURTHER renders "Short trip" with warning (amber) colour', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Colchester',
      distance:           8045,
      proximityBand:      'A_LITTLE_FURTHER',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()
    expect(getByText('Colchester · 5.0 mi')).toBeTruthy()
    const proximityNode = getByText('Short trip')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.warning)
  })

  it('NEAREST_ON_REDEEMO renders "Nearest match" in NEUTRAL navy-grey (off brand-rose)', () => {
    // Brand-rose is rare + load-bearing (One-Voice rule). Proximity metadata
    // must NOT use it — NEAREST is neutral text.secondary, not red.
    const tile = makeBranchTile({
      distance:      45000,
      proximityBand: 'NEAREST_ON_REDEEMO',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const proximityNode = getByText('Nearest match')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.text.secondary)
    expect(flat.color).not.toBe(color.brandRose)
  })

  it('NEARBY band suppresses the proximity line; where line is "locality · distance"', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      'NEARBY',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()
    expect(getByText('Brightlingsea · 0.3 mi')).toBeTruthy()
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('Short trip')).toBeNull()
    expect(queryByText('Nearest match')).toBeNull()
  })

  it('null band suppresses the proximity line', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      null,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/In your area|short trip|Nearest match/)).toBeNull()
  })

  it('null distance + non-null band: where line = locality only, no orphan separator', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           null,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()
    expect(getByText('Brightlingsea')).toBeTruthy()   // where = locality only (no " · ")
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/·/)).toBeNull()               // no middot anywhere when distance absent
  })

  it('all locality fields null + distance + band: where line = distance only', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           500,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()   // descriptor
    expect(getByText('0.3 mi')).toBeTruthy()               // where = distance only
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/·/)).toBeNull()
  })

  it('all null: descriptor only, no where line / proximity', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           null,
      proximityBand:      null,
      merchant:           { businessName: 'Covelum', descriptor: 'Café' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Café')).toBeTruthy()
    expect(queryByText(/In your area|short trip|Nearest match/)).toBeNull()
    expect(queryByText(/mi/)).toBeNull()
  })

  it('accessibility label EXCLUDES distance + proximity (intentional cascade asymmetry, spec §11.3)', () => {
    const tile = makeBranchTile({
      id:                 'brn-a11y',
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByLabelText, queryByLabelText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByLabelText('Covelum, Italian Restaurant, Brightlingsea')).toBeTruthy()
    expect(queryByLabelText(/mi\b/)).toBeNull()
    expect(queryByLabelText(/In your area/)).toBeNull()
  })
})
