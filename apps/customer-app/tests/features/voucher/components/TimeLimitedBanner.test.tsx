import React from 'react'
import { render } from '@testing-library/react-native'
import { TimeLimitedBanner } from '@/features/voucher/components/TimeLimitedBanner'

describe('TimeLimitedBanner', () => {
  it('renders countdown banner when state is active', () => {
    const { getByText } = render(
      <TimeLimitedBanner
        state="active"
        formattedCountdown="2d 14h 32m"
        expiryDateFormatted="21 Apr 2026"
      />,
    )
    expect(getByText('Expires in')).toBeTruthy()
    expect(getByText('2d 14h 32m')).toBeTruthy()
  })

  it('renders availability banner when state is outside_window', () => {
    const { getByText } = render(
      <TimeLimitedBanner
        state="outside_window"
        formattedCountdown="1d 14h 22m"
        nextWindowLabel="Monday 11:00 AM"
        scheduleLabel="Mon–Fri, 11am–3pm"
      />,
    )
    expect(getByText('Available again in')).toBeTruthy()
    expect(getByText('1d 14h 22m')).toBeTruthy()
  })

  it('does not render when state is expired', () => {
    const { queryByText } = render(
      <TimeLimitedBanner state="expired" formattedCountdown="" />,
    )
    expect(queryByText('Expires in')).toBeNull()
  })

  it('does not render when state is inactive', () => {
    const { queryByText } = render(
      <TimeLimitedBanner state="inactive" formattedCountdown="" />,
    )
    expect(queryByText('Expires in')).toBeNull()
  })
})
