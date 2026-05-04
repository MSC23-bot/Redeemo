import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchChip } from '@/features/merchant/components/BranchChip'

describe('BranchChip', () => {
  it('multi-branch: renders "Switch branch ▾" text (NOT branch name or pin)', () => {
    const { getByText, queryByText } = render(
      <BranchChip isMultiBranch={true} onPress={() => {}} />
    )
    expect(getByText('Switch branch')).toBeTruthy()
    expect(queryByText('Brightlingsea')).toBeNull()
  })

  it('single-branch: chip is not rendered (returns null)', () => {
    const { toJSON } = render(<BranchChip isMultiBranch={false} onPress={() => {}} />)
    expect(toJSON()).toBeNull()
  })

  it('caret-hint testID is exposed on multi-branch', () => {
    const { getByTestId } = render(<BranchChip isMultiBranch={true} onPress={() => {}} />)
    expect(getByTestId('chip-caret')).toBeTruthy()
  })

  it('calls onPress when tapped on multi-branch', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<BranchChip isMultiBranch={true} onPress={onPress} />)
    fireEvent.press(getByLabelText('Switch branch'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
