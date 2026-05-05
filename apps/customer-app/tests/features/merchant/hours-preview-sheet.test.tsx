import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HoursPreviewSheet } from '@/features/merchant/components/HoursPreviewSheet'
import type { OpeningHourEntry } from '@/lib/api/merchant'

const open9to22: OpeningHourEntry[] = [
  { dayOfWeek: 0, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 1, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 2, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 3, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 4, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 5, openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 6, openTime: '09:00', closeTime: '22:00', isClosed: false },
]

describe('HoursPreviewSheet', () => {
  it('renders branch name in header', () => {
    const { getByText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getByText('Colchester')).toBeTruthy()
  })

  it('renders status pill in header', () => {
    const { getByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getByLabelText(/Status: /)).toBeTruthy()
  })

  it('renders 7 day rows when openingHours has 7 entries', () => {
    const { getAllByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(getAllByLabelText(/^Hours row /)).toHaveLength(7)
  })

  it('renders "Hours not available" when openingHours is empty', () => {
    const { getByText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={false}
        openingHours={[]} onDismiss={() => {}}
      />
    )
    expect(getByText('Hours not available')).toBeTruthy()
  })

  it('calls onDismiss when close button is tapped', () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <HoursPreviewSheet
        visible={true} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={onDismiss}
      />
    )
    fireEvent.press(getByLabelText('Close hours preview'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <HoursPreviewSheet
        visible={false} branchName="Colchester" isOpenNow={true}
        openingHours={open9to22} onDismiss={() => {}}
      />
    )
    expect(toJSON()).toBeNull()
  })
})
