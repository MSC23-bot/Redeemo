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
    // Force a moment when local time would say "closed" (very late at night
    // in any device timezone — getHours() returns the device-local hour,
    // which we cannot easily mock without timer rewiring; instead we just
    // pass empty hours so local would compute false, and assert that server
    // value still flips it to true).
    const { getByText } = render(<Probe hours={[]} serverIsOpenNow={true} />)
    expect(getByText('open=true')).toBeTruthy()
  })

  it('uses serverIsOpenNow=false even if local computation would say true', () => {
    // Local computation would think we're "open" for at least some part of
    // the day given 24/7-style hours, but server says no — server wins.
    const allDay: OpeningHourEntry[] = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i, openTime: '00:00', closeTime: '23:59', isClosed: false,
    }))
    const { getByText } = render(<Probe hours={allDay} serverIsOpenNow={false} />)
    expect(getByText('open=false')).toBeTruthy()
  })

  it('falls back to local computation when serverIsOpenNow is undefined', () => {
    // Hook still works without the server value (test/older-caller path).
    // Just assert the call doesn't throw and renders some boolean.
    const { getByText } = render(<Probe hours={everyDay9to5} />)
    expect(getByText(/^open=(true|false)$/)).toBeTruthy()
  })
})
