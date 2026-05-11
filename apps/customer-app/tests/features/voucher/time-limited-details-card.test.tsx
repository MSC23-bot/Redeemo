import { render } from '@testing-library/react-native'
import { TimeLimitedDetailsCard } from '@/features/voucher/components/TimeLimitedDetailsCard'
import type { WindowState } from '@/features/voucher/utils/timeLimitedWindow'

describe('TimeLimitedDetailsCard (M4b-6)', () => {
  const baseProps = {
    scheduleString: 'Mon-Fri, 11am-3pm',
    expiryDate: null as string | null,
    windowState: 'active' as WindowState,
    currentWindowEndsAt: new Date('2026-05-11T14:00:00Z'),
    nextWindowStartsAt: null as Date | null,
  }

  it('always shows "Available during" with the schedule', () => {
    const { getByText } = render(<TimeLimitedDetailsCard {...baseProps} />)
    expect(getByText('Available during')).toBeTruthy()
    expect(getByText('Mon-Fri, 11am-3pm')).toBeTruthy()
  })

  it('always shows "Usage rule" with the locked copy', () => {
    const { getByText } = render(<TimeLimitedDetailsCard {...baseProps} />)
    expect(getByText('Usage rule')).toBeTruthy()
    expect(getByText('Redeem once per active window.')).toBeTruthy()
  })

  it('shows "Current window ends" only in active or urgent states', () => {
    const { getByText, rerender, queryByText } = render(
      <TimeLimitedDetailsCard {...baseProps} windowState="active" />
    )
    expect(getByText('Current window ends')).toBeTruthy()

    rerender(<TimeLimitedDetailsCard {...baseProps} windowState="unavailable-today" />)
    expect(queryByText('Current window ends')).toBeNull()
  })

  it('shows "Next available" only in unavailable-* and redeemed-this-window states', () => {
    const { rerender, queryByText, getByText } = render(
      <TimeLimitedDetailsCard {...baseProps}
        windowState="unavailable-today"
        currentWindowEndsAt={null}
        nextWindowStartsAt={new Date('2026-05-11T16:00:00Z')}
      />
    )
    expect(getByText('Next available')).toBeTruthy()

    rerender(<TimeLimitedDetailsCard {...baseProps} windowState="active" />)
    expect(queryByText('Next available')).toBeNull()
  })

  it('shows "Offer ends" only when expiryDate is set AND state !== "expired"', () => {
    const { getByText, rerender, queryByText } = render(
      <TimeLimitedDetailsCard {...baseProps} expiryDate="2026-12-31T00:00:00Z" />
    )
    expect(getByText('Offer ends')).toBeTruthy()
    expect(getByText(/31 December 2026/)).toBeTruthy()

    rerender(<TimeLimitedDetailsCard {...baseProps} expiryDate={null} />)
    expect(queryByText('Offer ends')).toBeNull()
  })

  it('never shows "Renews on" (TIME_LIMITED-specific lock)', () => {
    const { queryByText } = render(<TimeLimitedDetailsCard {...baseProps} />)
    expect(queryByText(/Renews on/i)).toBeNull()
  })
})
