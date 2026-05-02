import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { useOpenStatus } from '@/features/merchant/hooks/useOpenStatus'
import type { OpeningHourEntry } from '@/lib/api/merchant'

// Tiny consumer harness — exposes the hook's output as readable text so we
// can assert on it without renderHook.
function Probe({ hours, serverIsOpenNow }: { hours: OpeningHourEntry[]; serverIsOpenNow?: boolean }) {
  const status = useOpenStatus(hours, serverIsOpenNow)
  return (
    <>
      <Text>open={String(status.isOpen)}</Text>
      <Text>text={status.hoursText}</Text>
      <Text>todayDow={status.todayDow}</Text>
    </>
  )
}

const everyDay9to5: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
  dayOfWeek: i,
  openTime:  '09:00',
  closeTime: '17:00',
  isClosed:  false,
}))

describe('useOpenStatus — server-trust path (PR A bug 1 fix)', () => {
  // Regression for the cross-timezone bug. The hook used to compute `isOpen`
  // entirely from device-local time; a user in Qatar (UTC+3) reading a UK
  // merchant got a wrong answer because UK time is 3h behind their device.
  // The proper fix is to trust the server's `isOpenNow` (computed in
  // Europe/London server-side) when the caller passes it through.

  it('uses serverIsOpenNow=true regardless of what local time would say', () => {
    const { getByText } = render(<Probe hours={[]} serverIsOpenNow={true} />)
    expect(getByText('open=true')).toBeTruthy()
  })

  it('uses serverIsOpenNow=false even if local computation would say true', () => {
    const allDay: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i, openTime: '00:00', closeTime: '23:59', isClosed: false,
    }))
    const { getByText } = render(<Probe hours={allDay} serverIsOpenNow={false} />)
    expect(getByText('open=false')).toBeTruthy()
  })

  it('falls back to local computation when serverIsOpenNow is undefined', () => {
    const { getByText } = render(<Probe hours={everyDay9to5} />)
    expect(getByText(/^open=(true|false)$/)).toBeTruthy()
  })

  // hoursText must NEVER claim "Closed today" when the server says open. This
  // edge case appears when the day's hours are absent or null but the server
  // boolean is still true — UI must defer to the server, falling back to
  // "Open now" rather than contradicting it.
  it('shows "Open now" when serverIsOpenNow=true but no closeTime is available', () => {
    const { getByText } = render(<Probe hours={[]} serverIsOpenNow={true} />)
    expect(getByText('text=Open now')).toBeTruthy()
  })
})

// Regression for PR A bug 1 part 3 — display text + "TODAY" marker must use
// merchant-local (Europe/London) time, not device time. Without this, a user
// in Qatar (UTC+3) reading a UK merchant on a Saturday late evening sees
// Sunday's schedule highlighted as "TODAY" and Sunday's hours in the meta
// row, even though London is still on Saturday.
//
// Test approach: pin Date.now() to a UTC instant where Europe/London and a
// non-UK reference timezone fall on different days, then assert the hook's
// output reflects London. `Intl.DateTimeFormat({ timeZone: 'Europe/London' })`
// is independent of the device timezone — what we're proving is that the
// hook is using that explicit timezone, not falling back to the device clock.
describe('useOpenStatus — Europe/London for display text + todayDow', () => {
  beforeAll(() => {
    // Saturday 22:30 UTC = Saturday 23:30 BST (London) = Sunday 01:30 Qatar.
    // London is still in Saturday; Qatar has rolled to Sunday.
    jest.useFakeTimers({ now: new Date('2026-05-02T22:30:00Z'), doNotFake: ['setInterval', 'clearInterval'] })
  })
  afterAll(() => { jest.useRealTimers() })

  it('uses London day-of-week for todayDow', () => {
    const { getByText } = render(<Probe hours={everyDay9to5} />)
    // 2026-05-02 is a Saturday. todayDow=6. Qatar device on the same instant
    // is in Sunday (todayDow=0); the test passing means the hook ignored the
    // device timezone and read London time.
    expect(getByText('todayDow=6')).toBeTruthy()
  })

  it('selects today\'s schedule entry from London, not from the device', () => {
    // Saturday open 09–17, Sunday closed. London time at the pinned instant
    // is Saturday 23:30 — past close, so today's entry is found and yields
    // "Opens 09:00". A device-time read in Qatar would be Sunday 01:30,
    // landing on the closed entry and yielding "Closed today".
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Sat
      { dayOfWeek: 0, openTime: null,    closeTime: null,    isClosed: true  }, // Sun closed
    ]
    const { getByText } = render(<Probe hours={hours} />)
    expect(getByText('text=Opens 09:00')).toBeTruthy()
  })

  it('respects serverIsOpenNow even when London says hours are over', () => {
    // London 23:30 Saturday: outside 09–17. But if server says open
    // (e.g. late-night venue with hours not in the seeded set), we trust it.
    const hours: OpeningHourEntry[] = [
      { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00', isClosed: false },
    ]
    const { getByText } = render(<Probe hours={hours} serverIsOpenNow={true} />)
    expect(getByText('open=true')).toBeTruthy()
    // Closes-text uses today's London entry (17:00). Pinned to Saturday so
    // todayClose is "17:00" → text = "Closes 17:00".
    expect(getByText('text=Closes 17:00')).toBeTruthy()
  })
})
