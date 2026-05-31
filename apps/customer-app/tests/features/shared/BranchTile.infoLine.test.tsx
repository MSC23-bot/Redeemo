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

// Batch 1B Tier 3 — Layout B two-line info hierarchy.
//   line 1: `descriptor · locality`            (styles.infoPrimary)
//   line 2: `<distance> · <proximity clause>`  (styles.infoSecondary, clause coloured)
// Distance is the COMPACT "X mi" form (formatDistanceCompact). The two
// lines are distinct Text nodes, so we assert line 1 and line 2 separately
// instead of one combined string.
describe('BranchTile info hierarchy — Batch 1B Tier 3 Layout B (descriptor·locality / distance·proximity)', () => {
  it('IN_YOUR_AREA: line 1 descriptor·locality, line 2 "1.0 mi · In your area" with sage proximity', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Line 1 — descriptor · locality (exact, its own Text node):
    expect(getByText('Italian Restaurant · Brightlingsea')).toBeTruthy()
    // Line 2 — compact distance + proximity together:
    expect(getByText(/1\.0 mi · In your area/)).toBeTruthy()
    // Proximity clause is a nested <Text> with semantic colour:
    const proximityNode = getByText('In your area')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.success)
  })

  it('A_LITTLE_FURTHER renders "A short trip away" with warning (amber) colour on line 2', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Colchester',
      distance:           8045,
      proximityBand:      'A_LITTLE_FURTHER',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant · Colchester')).toBeTruthy()
    const proximityNode = getByText('A short trip away')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.warning)
  })

  it('NEAREST_ON_REDEEMO renders "Nearest match on Redeemo" with brandRose colour on line 2', () => {
    const tile = makeBranchTile({
      distance:      45000,
      proximityBand: 'NEAREST_ON_REDEEMO',
      merchant:      { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const proximityNode = getByText('Nearest match on Redeemo')
    const flat = StyleSheet.flatten(proximityNode.props.style)
    expect(flat.color).toBe(color.brandRose)
  })

  it('NEARBY band suppresses the proximity clause; line 2 is the compact distance alone', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      'NEARBY',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant · Brightlingsea')).toBeTruthy()  // line 1
    expect(getByText('0.3 mi')).toBeTruthy()                              // line 2 (distance only)
    expect(queryByText('In your area')).toBeNull()
    expect(queryByText('A short trip away')).toBeNull()
    expect(queryByText('Nearest match on Redeemo')).toBeNull()
  })

  it('null band suppresses the proximity clause', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           500,
      proximityBand:      null,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(queryByText(/In your area|short trip|Nearest match/)).toBeNull()
  })

  it('null distance + non-null band: line 1 descriptor·locality, line 2 = proximity clause only, no orphan separator', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           null,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant · Brightlingsea')).toBeTruthy()
    expect(getByText('In your area')).toBeTruthy()
    // No leading "<empty> · " separator when distance is absent.
    expect(queryByText(/· ·/)).toBeNull()
    expect(queryByText(/^ · /)).toBeNull()
  })

  it('all locality fields null + distance + band: line 1 = descriptor only, line 2 = "0.3 mi · In your area"', () => {
    const tile = makeBranchTile({
      branchLocalityName: null,
      branchPostTown:     null,
      branchCity:         null,
      distance:           500,
      proximityBand:      'IN_YOUR_AREA',
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText, queryByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    expect(getByText('Italian Restaurant')).toBeTruthy()        // line 1 (descriptor only)
    expect(getByText(/0\.3 mi · In your area/)).toBeTruthy()     // line 2
    expect(getByText('In your area')).toBeTruthy()
    expect(queryByText(/· ·/)).toBeNull()
  })

  it('all null: line 1 = descriptor only, no second line / proximity clause', () => {
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
    // Spoken label stays "businessName, descriptor, locality". Distance +
    // proximity are visible-only — they add VoiceOver noise without changing
    // the tap decision. Owner-confirmed asymmetry.
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
