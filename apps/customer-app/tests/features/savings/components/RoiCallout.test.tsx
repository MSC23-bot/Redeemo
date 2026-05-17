import React from 'react'
import { render } from '@testing-library/react-native'
import { RoiCallout } from '@/features/savings/components/RoiCallout'

describe('RoiCallout — variant copy', () => {
  it('hidden when thisMonthSaving === 0', () => {
    const { queryByTestId } = render(
      <RoiCallout thisMonthSaving={0} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(queryByTestId('savings-roi-callout')).toBeNull()
  })

  it('below-breakeven: "You\'re on your way — £X saved this month" (no multiplier)', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={3.5} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/on your way/)).toBeTruthy()
    expect(getByText('£3.50')).toBeTruthy()
  })

  it('monthly + above-breakeven: multiplier copy ("X× your money back")', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/£6.99\/mo plan/)).toBeTruthy()
    expect(getByText(/your money back/)).toBeTruthy()
    // 32 / 6.99 = 4.578... → 4.6
    expect(getByText('4.6×')).toBeTruthy()
  })

  it('annual + above-breakeven: uses annual cost denominator', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32} billingInterval="ANNUAL" hasPromo={false} />,
    )
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
