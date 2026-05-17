import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SavingsHeroHeader } from '@/features/savings/components/SavingsHeroHeader'

const initialMetrics = {
  frame:  { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}

function wrap(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>)
}

describe('SavingsHeroHeader — 3 state variants', () => {
  it('free: renders Unlock hero + Subscribe CTA', () => {
    const onSubscribe = jest.fn()
    const { getByTestId, getByText } = wrap(
      <SavingsHeroHeader
        state="free"
        onSubscribe={onSubscribe}
        onBrowse={() => {}}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByTestId('savings-hero-free')).toBeTruthy()
    expect(getByText('Unlock your savings')).toBeTruthy()
    fireEvent.press(getByTestId('savings-hero-subscribe-cta'))
    expect(onSubscribe).toHaveBeenCalled()
  })

  it('subscriber-empty: renders Start-saving hero + Browse CTA', () => {
    const onBrowse = jest.fn()
    const { getByTestId, getByText } = wrap(
      <SavingsHeroHeader
        state="subscriber-empty"
        onSubscribe={() => {}}
        onBrowse={onBrowse}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByTestId('savings-hero-subscriber-empty')).toBeTruthy()
    expect(getByText('Start saving today')).toBeTruthy()
    fireEvent.press(getByTestId('savings-hero-browse-cta'))
    expect(onBrowse).toHaveBeenCalled()
  })

  it('populated: renders lifetime + chips with actual values', () => {
    const { getByTestId, getByText } = wrap(
      <SavingsHeroHeader
        state="populated"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={247.5}
        thisMonthSaving={32}
        thisMonthRedemptionCount={5}
      />,
    )
    expect(getByTestId('savings-hero-populated')).toBeTruthy()
    expect(getByText('Total saved')).toBeTruthy()
    // Lifetime amount is rendered via Animated.Text which
    // testing-library's `getByText` doesn't traverse the same way
    // as a plain Text — use the testID + children inspection.
    const lifetime = getByTestId('savings-hero-lifetime')
    expect(JSON.stringify(lifetime.props.children)).toContain('£247.50')
    expect(getByText('£32.00')).toBeTruthy()
    expect(getByText('5')).toBeTruthy()
  })
})
