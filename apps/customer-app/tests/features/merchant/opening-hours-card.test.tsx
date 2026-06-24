import React from 'react'
import { render } from '@testing-library/react-native'
import { OpeningHoursCard } from '@/features/merchant/components/OpeningHoursCard'

// Branches PR-8 (umbrella D9): OpeningHoursCard is a pure presentational
// renderer of the `weekSchedule` grid that useOpenStatus builds. Under the
// multi-row model that grid carries N windows per day (comma-joined, openTime
// ascending) plus the honest overnight / 24:00 / open-24h / closed strings.
// These tests confirm the card renders those day strings verbatim (no
// single-window collapse, no truncation) and marks the TODAY row.

type DaySchedule = {
  day: string
  shortDay: string
  hours: string
  isToday: boolean
  isClosed: boolean
}

function row(day: string, shortDay: string, hours: string, opts: Partial<DaySchedule> = {}): DaySchedule {
  return { day, shortDay, hours, isToday: false, isClosed: hours === 'Closed', ...opts }
}

describe('OpeningHoursCard — PR-8 multi-window display', () => {
  it('renders the open-now header pill when isOpen=true', () => {
    const week: DaySchedule[] = [row('Monday', 'Mon', '9:00 am to 5:00 pm', { isToday: true })]
    const { getByText } = render(<OpeningHoursCard weekSchedule={week} isOpen={true} />)
    expect(getByText('Open now')).toBeTruthy()
    expect(getByText('Monday')).toBeTruthy()
  })

  it('renders multiple windows in a day comma-joined (no collapse)', () => {
    const week: DaySchedule[] = [
      row('Monday', 'Mon', '9:00 am to 2:00 pm, 5:00 pm to 11:00 pm', { isToday: true }),
    ]
    const { getByText } = render(<OpeningHoursCard weekSchedule={week} isOpen={true} />)
    expect(getByText('9:00 am to 2:00 pm, 5:00 pm to 11:00 pm')).toBeTruthy()
  })

  it('renders overnight, 24:00-as-midnight, open-24h and closed strings honestly', () => {
    const week: DaySchedule[] = [
      row('Friday', 'Fri', '6:00 pm to 2:00 am'),
      row('Saturday', 'Sat', '9:00 am to midnight'),
      row('Sunday', 'Sun', 'Open 24 hours'),
      row('Monday', 'Mon', 'Closed'),
    ]
    const { getByText, getAllByText } = render(<OpeningHoursCard weekSchedule={week} isOpen={false} />)
    expect(getByText('6:00 pm to 2:00 am')).toBeTruthy()
    expect(getByText('9:00 am to midnight')).toBeTruthy()
    expect(getByText('Open 24 hours')).toBeTruthy()
    // "Closed" appears twice: the header pill (isOpen=false) AND the Monday row.
    expect(getAllByText('Closed').length).toBeGreaterThanOrEqual(2)
  })
})
