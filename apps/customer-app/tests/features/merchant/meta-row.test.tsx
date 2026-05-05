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
  // Round 4 §1: rating moved out of MetaRow up to MerchantHeadline.
  // MetaRow now carries only status + distance.
  it('renders pill + status text + distance (Open state)', () => {
    const { getByText, getByLabelText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByLabelText('Status: Open')).toBeTruthy()
    expect(getByText(/Closes at /)).toBeTruthy()
    expect(getByText('1.2 miles away')).toBeTruthy()
  })

  it('hides distance when distanceMetres is null', () => {
    const { queryByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={null}
        now={dt(1, 18, 0)}
      />
    )
    expect(queryByText(/miles away$/)).toBeNull()
    expect(queryByText(/m away$/)).toBeNull()
  })

  // Round 3 §A2: the 100km suppression rule was removed because GPS-vs-
  // server distance can legitimately resolve to > 100km when the user's
  // phone reports a default fallback location.
  // Round 4 §1: distance now carries a comma thousands separator and
  // reads "miles away" rather than the abbreviated "mi" — per user
  // direction "the distance should say 3,189.6 miles away".
  it('shows large distances with comma separator + "miles away" suffix', () => {
    const { getByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={5_133_000}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByText('3,189.5 miles away')).toBeTruthy()
  })

  it('shows short distances as "{n}m away" (no comma, no miles)', () => {
    const { getByText } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={420}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByText('420m away')).toBeTruthy()
  })

  it('exposes status text + distance via testIDs for switch animation hookup', () => {
    const { getByTestId } = render(
      <MetaRow
        isOpenNow={true}
        openingHours={open9to22}
        distanceMetres={1931}
        now={dt(1, 18, 0)}
      />
    )
    expect(getByTestId('meta-row-status-text')).toBeTruthy()
    expect(getByTestId('meta-row-distance')).toBeTruthy()
  })
})
