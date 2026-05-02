import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchPickerSheet } from '@/features/merchant/components/BranchPickerSheet'

const branches = [
  { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: 'Essex',
    distanceMetres: 800,  isOpenNow: true,  isActive: true },
  { id: 'b2', name: 'Frinton',        city: 'Frinton',       county: 'Essex',
    distanceMetres: 4000, isOpenNow: false, isActive: true },
  { id: 'b3', name: 'Walton',         city: 'Walton',        county: 'Essex',
    distanceMetres: 8000, isOpenNow: false, isActive: false },  // suspended
]

describe('BranchPickerSheet', () => {
  it('renders every branch, active and suspended', () => {
    const { getByText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('Brightlingsea')).toBeTruthy()
    expect(getByText('Frinton')).toBeTruthy()
    expect(getByText('Walton')).toBeTruthy()
  })

  it('shows the current-checkmark on the selected branch', () => {
    const { getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b2" onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(getByLabelText(/Frinton.*current/i)).toBeTruthy()
  })

  it('marks suspended branches as Unavailable + non-tappable', () => {
    const onPick = jest.fn()
    const { getByText, getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={onPick} onDismiss={() => {}} />,
    )
    expect(getByText(/Unavailable/)).toBeTruthy()
    fireEvent.press(getByLabelText(/Walton.*Unavailable/i))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('calls onPick + onDismiss when an active branch is tapped', () => {
    const onPick = jest.fn()
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={onPick} onDismiss={onDismiss} />,
    )
    fireEvent.press(getByLabelText(/Frinton/i))
    expect(onPick).toHaveBeenCalledWith('b2')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onPick when the user taps the already-selected branch', () => {
    const onPick = jest.fn()
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={onPick} onDismiss={onDismiss} />,
    )
    fireEvent.press(getByLabelText(/Brightlingsea.*current/i))
    expect(onPick).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledTimes(1)  // sheet still closes
  })
})
