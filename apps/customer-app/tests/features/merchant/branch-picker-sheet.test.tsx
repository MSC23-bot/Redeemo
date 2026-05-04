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
    const { getByText, getByLabelText } = render(
      <BranchPickerSheet visible branches={branches} currentBranchId="b1" onPick={onPick} onDismiss={() => {}} />,
    )
    // Visible "Unavailable" pill is rendered for the suspended branch
    expect(getByText('Unavailable')).toBeTruthy()
    // Accessibility label exposes the "Unavailable" suffix
    expect(getByLabelText(/Walton.*Unavailable/i)).toBeTruthy()
    // And tapping does nothing
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

  it('does NOT show a green Open pill on a suspended branch even when isOpenNow=true', () => {
    const fixtures = [
      // Active branch — should render the Open pill normally
      { id: 'b1', name: 'Brightlingsea', city: null, county: null,
        distanceMetres: 1500, isOpenNow: true, isActive: true,
        openingHours: [], avgRating: 4.5, reviewCount: 7 },
      // Suspended branch with isOpenNow=true — must NOT render the green Open pill
      { id: 'b2', name: 'Walton', city: null, county: null,
        distanceMetres: 8000, isOpenNow: true, isActive: false,
        openingHours: [], avgRating: null, reviewCount: 0 },
    ]
    const { queryAllByLabelText, getByText } = render(
      <BranchPickerSheet visible branches={fixtures} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}} />,
    )
    // Only ONE green Open pill renders — the active branch's. Suspended branch
    // does NOT get a green Open pill despite isOpenNow=true.
    const openPills = queryAllByLabelText(/Status: Open/)
    expect(openPills.length).toBe(1)
    // The suspended branch's row 2 shows "Unavailable" instead.
    expect(getByText('Unavailable')).toBeTruthy()
  })

  it('sorts inactive branches after active branches regardless of distance', () => {
    const fixtures = [
      // Order in input: inactive first, then active far, then active near.
      // Output order should pin current first, then active others by distance, then inactive last.
      { id: 'b3', name: 'SuspendedNearby', city: null, county: null,
        distanceMetres: 100,  isOpenNow: true,  isActive: false,  // close, but suspended → bottom
        openingHours: [], avgRating: null, reviewCount: 0 },
      { id: 'b2', name: 'FarActive',       city: null, county: null,
        distanceMetres: 5000, isOpenNow: true,  isActive: true,
        openingHours: [], avgRating: null, reviewCount: 0 },
      { id: 'b1', name: 'CurrentBranch',   city: null, county: null,
        distanceMetres: 1500, isOpenNow: true,  isActive: true,   // currentBranchId
        openingHours: [], avgRating: 4.5, reviewCount: 7 },
    ]
    const { getAllByText } = render(
      <BranchPickerSheet visible branches={fixtures} currentBranchId="b1"
        onPick={() => {}} onDismiss={() => {}} />,
    )
    const allRowNames = getAllByText(/^(CurrentBranch|FarActive|SuspendedNearby)$/)
    expect(allRowNames[0]?.props?.children).toBe('CurrentBranch')      // pinned first
    expect(allRowNames[1]?.props?.children).toBe('FarActive')           // active others next
    expect(allRowNames[2]?.props?.children).toBe('SuspendedNearby')     // inactive last
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
