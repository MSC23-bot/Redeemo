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

  // Branches PR-8 (umbrella D9): the sheet renders the multi-window grid via
  // useOpenStatus, so N windows per day appear comma-joined (no single-window
  // collapse), with overnight + 24:00 rendered honestly.
  describe('PR-8 multi-window display', () => {
    it('renders multiple windows for a day comma-joined', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
        { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
      ]
      const { getByText } = render(
        <HoursPreviewSheet
          visible={true} branchName="Colchester" isOpenNow={true}
          openingHours={hours} onDismiss={() => {}}
        />
      )
      expect(getByText('9:00 am to 2:00 pm, 5:00 pm to 11:00 pm')).toBeTruthy()
    })

    it('renders an overnight window honestly and a 24:00 close as midnight', () => {
      const hours: OpeningHourEntry[] = [
        { dayOfWeek: 5, openTime: '18:00', closeTime: '02:00', isClosed: false }, // overnight
        { dayOfWeek: 6, openTime: '09:00', closeTime: '24:00', isClosed: false }, // to midnight
      ]
      const { getByText } = render(
        <HoursPreviewSheet
          visible={true} branchName="Colchester" isOpenNow={true}
          openingHours={hours} onDismiss={() => {}}
        />
      )
      expect(getByText('6:00 pm to 2:00 am')).toBeTruthy()
      expect(getByText('9:00 am to midnight')).toBeTruthy()
    })
  })
})
