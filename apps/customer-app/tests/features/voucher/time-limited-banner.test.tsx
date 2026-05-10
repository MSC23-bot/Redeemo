import { render } from '@testing-library/react-native'
import { TimeLimitedBanner } from '@/features/voucher/components/TimeLimitedBanner'

describe('TimeLimitedBanner — real variants (M4b-5)', () => {
  it('active state: amber "Available Now" + per-window-rule body', () => {
    const { getByTestId, getByText } = render(
      <TimeLimitedBanner
        windowState="active"
        scheduleString="Mon-Fri, 11am-3pm"
      />
    )
    expect(getByTestId('time-limited-banner-active')).toBeTruthy()
    expect(getByText(/Available Now/)).toBeTruthy()
    expect(getByText(/once each window/i)).toBeTruthy()
  })

  it('urgent state: coral "Window Closing Soon"', () => {
    const { getByTestId, getByText } = render(
      <TimeLimitedBanner
        windowState="urgent"
        scheduleString="Mon-Fri, 11am-3pm"
        currentWindowEndsAt={new Date('2026-05-11T14:00:00Z')}
      />
    )
    expect(getByTestId('time-limited-banner-urgent')).toBeTruthy()
    expect(getByText(/Window Closing Soon/)).toBeTruthy()
  })

  it('unavailable-today: blue "Not Currently Available" + schedule + come-back-at copy', () => {
    const { getByTestId, getByText } = render(
      <TimeLimitedBanner
        windowState="unavailable-today"
        scheduleString="Mon-Fri, 5-7pm"
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
      />
    )
    expect(getByTestId('time-limited-banner-unavailable')).toBeTruthy()
    expect(getByText(/Not Currently Available/)).toBeTruthy()
    expect(getByText(/Mon-Fri, 5-7pm/)).toBeTruthy()
  })

  it('unavailable-future-day: same blue treatment, copy mentions schedule', () => {
    const { getByText } = render(
      <TimeLimitedBanner
        windowState="unavailable-future-day"
        scheduleString="Tuesdays, 6-10pm"
        nextWindowStartsAt={new Date('2026-05-12T17:00:00Z')}
      />
    )
    expect(getByText(/Tuesdays, 6-10pm/)).toBeTruthy()
  })

  it('no-windows / expired / unrecognised state: renders nothing', () => {
    const { queryByTestId } = render(
      <TimeLimitedBanner windowState="no-windows" scheduleString="" />
    )
    expect(queryByTestId('time-limited-banner-active')).toBeNull()
    expect(queryByTestId('time-limited-banner-urgent')).toBeNull()
    expect(queryByTestId('time-limited-banner-unavailable')).toBeNull()
  })
})
