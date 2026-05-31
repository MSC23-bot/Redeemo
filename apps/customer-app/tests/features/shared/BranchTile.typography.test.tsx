import React from 'react'
import { render as rtlRender } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('BranchTile typography promotion (spec §9.7)', () => {
  it('merchant name renders at 18pt Lato-SemiBold (Batch 1B Tier 3 promotion)', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const nameNode = getByText('Covelum')
    const flat = StyleSheet.flatten(nameNode.props.style)
    expect(flat.fontSize).toBe(18)
    expect(flat.fontFamily).toBe('Lato-SemiBold')
  })

  it('info line 1 (descriptor · locality) renders at 13pt Lato-Regular', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    // Anchor on info line 1 (descriptor · locality) — its own Text node,
    // distinct from the merchant name and the line-2 distance/proximity.
    const infoNode = getByText('Italian Restaurant · Brightlingsea')
    const flat = StyleSheet.flatten(infoNode.props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Regular')
  })
})
