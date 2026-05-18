import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RoiCallout } from '@/features/savings/components/RoiCallout'

describe('RoiCallout — variant copy', () => {
  it('hidden when thisMonthSaving === 0', () => {
    const { queryByTestId } = render(
      <RoiCallout thisMonthSaving={0} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(queryByTestId('savings-roi-callout')).toBeNull()
  })

  it('below-breakeven: "You\'re on your way. £X saved so far." (no multiplier)', () => {
    const { getByText, queryByText } = render(
      <RoiCallout thisMonthSaving={3.5} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/on your way/)).toBeTruthy()
    expect(getByText('£3.50')).toBeTruthy()
    expect(queryByText(/money back/)).toBeNull()
  })

  it('monthly + above-breakeven: "monthly plan" copy + multiplier', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="MONTHLY" hasPromo={false} />,
    )
    // §Savings device-QA fixup 4 2026-05-18 — copy changed:
    //   was: "Saved £X on your £6.99/mo plan. That's X× your money back."
    //   now: "You've saved £X on your £6.99 monthly plan. That's X× your money back."
    expect(getByText(/You/)).toBeTruthy()
    expect(getByText(/£6.99 monthly plan/)).toBeTruthy()
    expect(getByText(/your money back/)).toBeTruthy()
    // 32 / 6.99 = 4.578... → 4.6
    expect(getByText('4.6×')).toBeTruthy()
  })

  it('annual + above-breakeven: "annual plan" copy + annual-cost multiplier', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="ANNUAL" hasPromo={false} />,
    )
    expect(getByText(/your annual plan/)).toBeTruthy()
    expect(getByText(/your money back/)).toBeTruthy()
    // 32 / 5.83 = 5.488... → 5.5
    expect(getByText('5.5×')).toBeTruthy()
  })

  it('promo applied: gentle "Keep it up" copy, NO multiplier shown', () => {
    const { getByText, queryByText } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="MONTHLY" hasPromo={true} />,
    )
    expect(getByText(/Keep it up/)).toBeTruthy()
    expect(queryByText(/money back/)).toBeNull()
    expect(queryByText(/your way/)).toBeNull()
  })
})

describe('RoiCallout — session-only dismiss', () => {
  it('dismiss button hides the callout for the current session', () => {
    const { getByTestId, queryByTestId } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByTestId('savings-roi-callout')).toBeTruthy()
    fireEvent.press(getByTestId('savings-roi-callout-dismiss'))
    expect(queryByTestId('savings-roi-callout')).toBeNull()
  })
})
