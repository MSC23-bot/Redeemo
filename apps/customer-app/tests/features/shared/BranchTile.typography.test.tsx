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
  it('merchant name renders at 17pt Lato-Bold (premium v3 — confident name)', () => {
    const tile = makeBranchTile({
      merchant: { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const nameNode = getByText('Covelum')
    const flat = StyleSheet.flatten(nameNode.props.style)
    expect(flat.fontSize).toBe(17)
    expect(flat.fontFamily).toBe('Lato-Bold')
  })

  it('descriptor line renders at 13pt Lato-Medium (premium v3 — quieter under the bold name)', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const descriptorNode = getByText('Italian Restaurant')
    const flat = StyleSheet.flatten(descriptorNode.props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Medium')
  })

  it('where line (Layout C line 2) renders "locality · distance" at 13pt Lato-Regular', () => {
    const tile = makeBranchTile({
      branchLocalityName: 'Brightlingsea',
      distance:           1609,
      merchant:           { businessName: 'Covelum', descriptor: 'Italian Restaurant' },
    })
    const { getByText } = render(<BranchTile branch={tile} onPress={() => {}} />)
    const whereNode = getByText('Brightlingsea · 1.0 mi')
    const flat = StyleSheet.flatten(whereNode.props.style)
    expect(flat.fontSize).toBe(13)
    expect(flat.fontFamily).toBe('Lato-Regular')
  })
})
