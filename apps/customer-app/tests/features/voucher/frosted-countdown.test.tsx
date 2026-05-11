import { render } from '@testing-library/react-native'
import { FrostedCountdown } from '@/features/voucher/components/FrostedCountdown'

describe('FrostedCountdown (M4b-7)', () => {
  const now = new Date('2026-05-11T11:00:00Z')

  it('active ≥60min: primary "Active until 14:30", supporting "Ends in 2h 14m · schedule"', () => {
    const { getByTestId, getByText } = render(
      <FrostedCountdown
        windowState="active"
        now={now}
        boundaryAt={new Date('2026-05-11T13:14:00Z')}
        scheduleString="Mon-Fri, 11am-3pm"
      />
    )
    expect(getByTestId('vd-frosted-countdown')).toBeTruthy()
    expect(getByText('Active until')).toBeTruthy()
    expect(getByText('14:14')).toBeTruthy()
    expect(getByText('Ends in 2h 14m · Mon-Fri, 11am-3pm')).toBeTruthy()
  })

  it('urgent <60min: applies urgent visual variant + duration primary', () => {
    const { getByTestId, getByText } = render(
      <FrostedCountdown
        windowState="urgent"
        now={now}
        boundaryAt={new Date('2026-05-11T11:18:00Z')}
        scheduleString="Mon-Fri, 11am-3pm"
      />
    )
    expect(getByTestId('vd-frosted-countdown')).toBeTruthy()
    expect(getByTestId('vd-frosted-countdown')).toHaveProp('isUrgent', true)
    expect(getByText('Ending in')).toBeTruthy()
    expect(getByText('18m')).toBeTruthy()
  })

  it('unavailable-today: "Available in" + duration + "Starts at HH:MM"', () => {
    const { getByText } = render(
      <FrostedCountdown
        windowState="unavailable-today"
        now={now}
        boundaryAt={new Date('2026-05-11T14:12:00Z')}
        scheduleString="Mon-Fri, 5-7pm"
      />
    )
    expect(getByText('Available in')).toBeTruthy()
    expect(getByText('3h 12m')).toBeTruthy()
    expect(getByText('Starts at 15:12 · Mon-Fri, 5-7pm')).toBeTruthy()
  })

  it('unavailable-future-day: "Starts in 2d 4h"', () => {
    const { getByText } = render(
      <FrostedCountdown
        windowState="unavailable-future-day"
        now={now}
        boundaryAt={new Date('2026-05-13T15:00:00Z')}
        scheduleString="Tuesdays, 6-10pm"
      />
    )
    expect(getByText('Starts in')).toBeTruthy()
    expect(getByText('2d 4h')).toBeTruthy()
  })

  it('expired: renders dimmed placeholder', () => {
    const { getByTestId, getByText } = render(
      <FrostedCountdown
        windowState="expired"
        now={now}
        boundaryAt={null}
        scheduleString="Mon-Fri, 11am-3pm"
      />
    )
    expect(getByTestId('vd-frosted-countdown')).toHaveProp('isDimmed', true)
    expect(getByText('Was active')).toBeTruthy()
    expect(getByText('—')).toBeTruthy()
  })

  it('no-windows: renders nothing', () => {
    const { queryByTestId } = render(
      <FrostedCountdown
        windowState="no-windows"
        now={now}
        boundaryAt={null}
        scheduleString=""
      />
    )
    expect(queryByTestId('vd-frosted-countdown')).toBeNull()
  })
})
