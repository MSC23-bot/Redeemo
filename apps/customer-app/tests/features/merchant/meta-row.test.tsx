import React from 'react'
import { render } from '@testing-library/react-native'
import { MetaRow } from '@/features/merchant/components/MetaRow'
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

// Construct dates with the local-time constructor for cross-timezone portability
// (matches the smartStatus.test.tsx pattern). Mon = 2026-05-04 (dayOfWeek 1).
function dt(dayOfWeek: number, hh: number, mm: number): Date {
  return new Date(2026, 4, 3 + dayOfWeek, hh, mm, 0, 0)
}

describe('MetaRow', () => {
  it('renders pill + status text + distance + rating block (Open state)', () => {
    const { getByText, getByLabelText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}
        avgRating={4.5}
        reviewCount={7}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByLabelText('Status: Open')).toBeTruthy()
    expect(getByText(/Closes at /)).toBeTruthy()
    expect(getByText('1.2 mi')).toBeTruthy()
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(7)')).toBeTruthy()
  })

  it('hides distance when distanceMetres is null', () => {
    const { queryByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={null}
        avgRating={4.5}
        reviewCount={7}
        now={dt(1, 18, 0)}
      />
    )
    expect(queryByText(/mi$/)).toBeNull()
    expect(queryByText(/^\d+m$/)).toBeNull()
  })

  it('shows "No reviews yet" placeholder when reviewCount=0', () => {
    const { getByText, queryByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={null}
        avgRating={null}
        reviewCount={0}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByText('No reviews yet')).toBeTruthy()
    expect(queryByText('(0)')).toBeNull()
  })

  it('exposes status text + distance via testIDs for switch animation hookup', () => {
    const { getByTestId } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}
        avgRating={4.5}
        reviewCount={7}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByTestId('meta-row-status-text')).toBeTruthy()
    expect(getByTestId('meta-row-distance')).toBeTruthy()
  })
})
