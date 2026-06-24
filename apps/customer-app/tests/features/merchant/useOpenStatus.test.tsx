import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { useOpenStatus } from '@/features/merchant/hooks/useOpenStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// Tiny consumer harness — exposes weekSchedule entries as readable text so
// we can assert on the (now Europe/London-derived) day selection and hours
// rendering without reaching into hook internals.
function Probe({ hours }: { hours: OpeningHourEntry[] }) {
  const { weekSchedule } = useOpenStatus(hours)
  return (
    <>
      {weekSchedule.map((d, i) => (
        <Text key={i}>
          {`row${i}=${d.shortDay}|today=${String(d.isToday)}|hours=${d.hours}`}
        </Text>
      ))}
    </>
  )
}

const everyDay9to5: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  openTime:  '09:00',
  closeTime: '17:00',
  isClosed:  false,
}))

// Regression for PR A bug 1 part 3 — Europe/London day-of-week selection.
// A user's device timezone must NOT shift which row gets `isToday` or which
// row's hours show in the schedule grid. The hook reads via
// `Intl.DateTimeFormat({ timeZone: 'Europe/London' })`; pinning Date.now()
// to a UTC instant where London and a non-UK reference timezone fall on
// different days proves the timezone-explicit derivation is wired.
describe('useOpenStatus — Europe/London for schedule grid', () => {
  beforeAll(() => {
    // Saturday 22:30 UTC = Saturday 23:30 BST (London) = Sunday 01:30 Qatar.
    // London is still on Saturday; Qatar has rolled to Sunday.
    jest.useFakeTimers({ now: new Date('2026-05-02T22:30:00Z'), doNotFake: ['setInterval', 'clearInterval'] })
  })
  afterAll(() => { jest.useRealTimers() })

  it('marks Saturday (todayDow=6) as today via the London clock', () => {
    const { getByText } = render(<Probe hours={everyDay9to5} />)
    // Saturday row has isToday=true; Sunday row (which a Qatar-device read
    // would mis-mark) has isToday=false.
    expect(getByText(/row6=Sat\|today=true\|/)).toBeTruthy()
    expect(getByText(/row0=Sun\|today=false\|/)).toBeTruthy()
  })

  it('renders Closed for entries flagged isClosed', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Sat
      { dayOfWeek: 0, openTime: null,    closeTime: null,    isClosed: true  }, // Sun closed
    ]
    const { getByText } = render(<Probe hours={hours} />)
    // PR-8: hours now render via the human-friendly multi-window formatter
    // ("9:00 am to 5:00 pm") instead of the raw 24h "09:00 – 17:00" string.
    expect(getByText(/row6=Sat\|today=true\|hours=9:00 am to 5:00 pm/)).toBeTruthy()
    expect(getByText(/row0=Sun\|today=false\|hours=Closed/)).toBeTruthy()
  })

  it('renders Closed when an entry has null openTime/closeTime even without isClosed=true', () => {
    // Defensive parity with the original hook's null-safe rendering.
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 6, openTime: null, closeTime: null, isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row6=Sat\|today=true\|hours=Closed/)).toBeTruthy()
  })
})

// Branches PR-8 (umbrella D9): the weekly grid now groups N windows per day,
// renders them comma-joined (openTime ascending), and renders overnight /
// 24:00 / open-24h honestly. These tests don't depend on the London "today"
// derivation (covered above) — they assert the rendered hours strings, so we
// use real timers and an arbitrary device time.
describe('useOpenStatus — PR-8 multi-window grid rendering', () => {
  it('renders N windows for a day comma-joined, ordered by openTime', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false },
      { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row1=Mon\|.*\|hours=9:00 am to 2:00 pm, 5:00 pm to 11:00 pm/)).toBeTruthy()
  })

  it('renders an overnight window (close < open) honestly', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 5, openTime: '18:00', closeTime: '02:00', isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row5=Fri\|.*\|hours=6:00 pm to 2:00 am/)).toBeTruthy()
  })

  it('renders a 24:00 close as "to midnight"', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 4, openTime: '09:00', closeTime: '24:00', isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row4=Thu\|.*\|hours=9:00 am to midnight/)).toBeTruthy()
  })

  it('renders a full 00:00 → 24:00 window as "Open 24 hours"', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 0, openTime: '00:00', closeTime: '24:00', isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row0=Sun\|.*\|hours=Open 24 hours/)).toBeTruthy()
  })

  it('renders an explicit closed day as "Closed"', () => {
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 2, openTime: null, closeTime: null, isClosed: true },
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText(/row2=Tue\|.*\|hours=Closed/)).toBeTruthy()
  })
})
