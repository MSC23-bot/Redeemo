import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchChip } from '@/features/merchant/components/BranchChip'

const baseProps = {
  branchName: 'Brightlingsea',
  city: 'Brightlingsea',
  county: 'Essex',
  distanceMetres: null as number | null,
  isOpenNow: true,
  closesAt: '17:00' as string | null,
  isMultiBranch: true,
  onPress: () => {},
}

describe('BranchChip', () => {
  it('shows distance when GPS distance < 100km', () => {
    const { getByText } = render(<BranchChip {...baseProps} distanceMetres={2500} />)
    expect(getByText(/1\.6 mi/)).toBeTruthy()
  })

  it('shows metres when distance < 1km', () => {
    const { getByText } = render(<BranchChip {...baseProps} distanceMetres={400} />)
    expect(getByText(/400m/)).toBeTruthy()
  })

  it('falls back to city + county when distance >= 100km', () => {
    const { getByText, queryByText } = render(<BranchChip {...baseProps} distanceMetres={5_000_000} />)
    expect(getByText(/Brightlingsea, Essex/)).toBeTruthy()
    expect(queryByText(/mi/)).toBeNull()
  })

  it('falls back to city when distance is null', () => {
    const { getByText } = render(<BranchChip {...baseProps} distanceMetres={null} />)
    expect(getByText(/Brightlingsea, Essex/)).toBeTruthy()
  })

  it('shows "Closes 17:00" when open', () => {
    const { getByText } = render(<BranchChip {...baseProps} isOpenNow={true} closesAt="17:00" />)
    expect(getByText(/Closes 17:00/)).toBeTruthy()
  })

  it('shows "Closed" when closed and no opening info', () => {
    const { getByText } = render(<BranchChip {...baseProps} isOpenNow={false} closesAt={null} />)
    expect(getByText(/Closed/)).toBeTruthy()
  })

  it('renders a caret + is interactive on multi-branch', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<BranchChip {...baseProps} isMultiBranch onPress={onPress} />)
    fireEvent.press(getByLabelText(/Switch branch/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is non-interactive (no caret, no haptic) on single-branch', () => {
    const onPress = jest.fn()
    const { queryByLabelText } = render(<BranchChip {...baseProps} isMultiBranch={false} onPress={onPress} />)
    expect(queryByLabelText(/Switch branch/)).toBeNull()
  })
})
