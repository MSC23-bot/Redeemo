import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchPickerSheet } from '@/features/merchant/components/BranchPickerSheet'

const branches = [
  { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: 'Essex',
    distanceMetres: 800,  isOpenNow: true,  isActive: true,
    openingHours: [], avgRating: null, reviewCount: 0 },
  { id: 'b2', name: 'Frinton',        city: 'Frinton',       county: 'Essex',
    distanceMetres: 4000, isOpenNow: false, isActive: true,
    openingHours: [], avgRating: null, reviewCount: 0 },
  { id: 'b3', name: 'Walton',         city: 'Walton',        county: 'Essex',
    distanceMetres: 8000, isOpenNow: false, isActive: false,
    openingHours: [], avgRating: null, reviewCount: 0 },  // suspended
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
    expect(getByLabelText(/Frinton.*currently viewing/i)).toBeTruthy()
  })

  it('marks suspended branches as Unavailable + non-tappable', () => {
    const onPick = jest.fn()
    const { getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={onPick} onDismiss={() => {}} />,
    )
    expect(getByLabelText(/Walton.*Unavailable/i)).toBeTruthy()
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
    fireEvent.press(getByLabelText(/Brightlingsea.*currently viewing/i))
    expect(onPick).not.toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledTimes(1)  // sheet still closes
  })

  it('renders rows in name-first two-line layout', () => {
    const newBranches = [
      { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: null,
        distanceMetres: 1500, isOpenNow: true,  isActive: true,
        openingHours: [], avgRating: 4.5, reviewCount: 7 },
      { id: 'b2', name: 'Colchester',    city: 'Colchester',    county: null,
        distanceMetres: 5400, isOpenNow: false, isActive: true,
        openingHours: [], avgRating: 4.0, reviewCount: 1 },
    ]
    const { getByText, getByLabelText } = render(
      <BranchPickerSheet visible branches={newBranches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('Brightlingsea')).toBeTruthy()
    expect(getByText('Colchester')).toBeTruthy()
    expect(getByLabelText(/Status: Open/)).toBeTruthy()
    expect(getByLabelText(/Status: Closed/)).toBeTruthy()
  })

  it('pins the current branch at the top with the "Currently viewing" tag', () => {
    const newBranches = [
      // Note: Colchester listed FIRST in the input, but Brightlingsea (currentBranchId) should render first.
      { id: 'b2', name: 'Colchester',    city: 'Colchester',    county: null,
        distanceMetres: 5400, isOpenNow: false, isActive: true,
        openingHours: [], avgRating: null, reviewCount: 0 },
      { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', county: null,
        distanceMetres: 1500, isOpenNow: true,  isActive: true,
        openingHours: [], avgRating: 4.5, reviewCount: 7 },
    ]
    const { getByText, getAllByText } = render(
      <BranchPickerSheet visible branches={newBranches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('Currently viewing')).toBeTruthy()
    // First rendered branch name should be Brightlingsea (the current one), not Colchester
    const allRowNames = getAllByText(/^(Brightlingsea|Colchester)$/)
    expect(allRowNames[0]?.props?.children).toBe('Brightlingsea')
  })

  it('renders rating block on each row, with placeholder when count=0', () => {
    const newBranches = [
      { id: 'b1', name: 'Brightlingsea', city: null, county: null,
        distanceMetres: null, isOpenNow: true,  isActive: true,
        openingHours: [], avgRating: 4.5, reviewCount: 7 },
      { id: 'b2', name: 'Colchester',    city: null, county: null,
        distanceMetres: null, isOpenNow: false, isActive: true,
        openingHours: [], avgRating: null, reviewCount: 0 },
    ]
    const { getByText } = render(
      <BranchPickerSheet visible branches={newBranches} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}} />,
    )
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('No reviews yet')).toBeTruthy()
  })
})
