import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BranchesTab } from '@/features/merchant/components/BranchesTab'
import type { BranchTile } from '@/lib/api/merchant'

const mk = (id: string, name: string, isActive = true): BranchTile => ({
  id, name, isActive, isMainBranch: false,
  addressLine1: '1 St', addressLine2: null, city: 'X', postcode: 'X1 1XX',
  latitude: null, longitude: null, phone: '+44', email: null,
  distance: null, isOpenNow: true, avgRating: null, reviewCount: 0,
  openingHours: [],  // Task 1 made this required on BranchTile.
})

const noop = () => {}

describe('BranchesTab — Other Locations', () => {
  it('excludes the current branch from the list', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const { queryByText, getByText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={noop} onDirections={noop} onHoursPreview={noop} onSwitch={noop}
      />
    )
    expect(queryByText('Brightlingsea')).toBeNull()
    expect(getByText('Colchester')).toBeTruthy()
  })

  it('excludes suspended branches', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester', false)]
    const { queryByText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={noop} onDirections={noop} onHoursPreview={noop} onSwitch={noop}
      />
    )
    expect(queryByText('Colchester')).toBeNull()
  })

  it('renders 4 actions per card and Switch fires onSwitch', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const onSwitch = jest.fn()
    const { getAllByLabelText, getByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={noop} onDirections={noop} onHoursPreview={noop} onSwitch={onSwitch}
      />
    )
    expect(getAllByLabelText(/^Call$|^Directions$|^Hours$/).length).toBe(3)
    fireEvent.press(getByLabelText('Switch to this branch'))
    expect(onSwitch).toHaveBeenCalledWith('b2')
  })

  it('Hours button fires onHoursPreview with the tapped branch id', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const onHoursPreview = jest.fn()
    const { getByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={noop} onDirections={noop} onHoursPreview={onHoursPreview} onSwitch={noop}
      />
    )
    fireEvent.press(getByLabelText('Hours'))
    expect(onHoursPreview).toHaveBeenCalledWith('b2')
  })

  it('Call button fires onCall with branch id and phone', () => {
    const branches = [mk('b1', 'Brightlingsea'), mk('b2', 'Colchester')]
    const onCall = jest.fn()
    const { getByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={onCall} onDirections={noop} onHoursPreview={noop} onSwitch={noop}
      />
    )
    fireEvent.press(getByLabelText('Call'))
    expect(onCall).toHaveBeenCalledWith('b2', '+44')
  })

  it('renders empty wrapper when no other active branches', () => {
    const branches = [mk('b1', 'Brightlingsea')]
    const { queryByLabelText } = render(
      <BranchesTab
        branches={branches} currentBranchId="b1" selectedOpeningHours={[]}
        onCall={noop} onDirections={noop} onHoursPreview={noop} onSwitch={noop}
      />
    )
    expect(queryByLabelText('Switch to this branch')).toBeNull()
  })
})
