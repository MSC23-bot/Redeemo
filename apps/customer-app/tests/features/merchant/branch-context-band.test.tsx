import React from 'react'
import { Text, View } from 'react-native'
import { render } from '@testing-library/react-native'
import { BranchContextBand } from '@/features/merchant/components/BranchContextBand'

const Children = () => (
  <>
    <Text testID="child-chip">CHIP</Text>
    <Text testID="child-descriptor">DESCRIPTOR</Text>
    <Text testID="child-meta">META</Text>
  </>
)

describe('BranchContextBand', () => {
  it('renders the branch line and band testID on multi-branch', () => {
    const { getByTestId, getByText } = render(
      <BranchContextBand isMultiBranch={true} branchLine="Brightlingsea">
        <Children />
      </BranchContextBand>
    )
    expect(getByTestId('branch-context-band')).toBeTruthy()
    expect(getByTestId('merchant-branch-line')).toBeTruthy()
    expect(getByText('Brightlingsea')).toBeTruthy()
  })

  it('renders all children inside the band', () => {
    const { getByTestId } = render(
      <BranchContextBand isMultiBranch={true} branchLine="Brightlingsea">
        <Children />
      </BranchContextBand>
    )
    expect(getByTestId('child-chip')).toBeTruthy()
    expect(getByTestId('child-descriptor')).toBeTruthy()
    expect(getByTestId('child-meta')).toBeTruthy()
  })

  it('hides the band styling and branch line on single-branch (no testID, no text)', () => {
    const { queryByTestId, queryByText } = render(
      <BranchContextBand isMultiBranch={false} branchLine={null}>
        <Children />
      </BranchContextBand>
    )
    expect(queryByTestId('branch-context-band')).toBeNull()
    expect(queryByTestId('merchant-branch-line')).toBeNull()
    expect(queryByText(/Brightlingsea/)).toBeNull()
  })

  it('renders children even on single-branch (flat layout)', () => {
    const { getByTestId } = render(
      <BranchContextBand isMultiBranch={false} branchLine={null}>
        <Children />
      </BranchContextBand>
    )
    expect(getByTestId('child-chip')).toBeTruthy()
    expect(getByTestId('child-descriptor')).toBeTruthy()
    expect(getByTestId('child-meta')).toBeTruthy()
  })

  it('hides band styling when isMultiBranch=true but branchLine=null (defensive)', () => {
    const { queryByTestId } = render(
      <BranchContextBand isMultiBranch={true} branchLine={null}>
        <Children />
      </BranchContextBand>
    )
    expect(queryByTestId('branch-context-band')).toBeNull()
    expect(queryByTestId('merchant-branch-line')).toBeNull()
  })
})
