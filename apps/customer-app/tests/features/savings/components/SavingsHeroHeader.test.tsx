import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SavingsHeroHeader } from '@/features/savings/components/SavingsHeroHeader'

// Force reduce-motion for hero tests.  The hero's lifetime amount is
// driven by `useCountUp` → `withTiming` → `useAnimatedReaction` →
// `setDisplayed`.  The jest reanimated mock does NOT actually animate
// `withTiming` synchronously to the target; it returns a placeholder
// value.  Forcing `useMotionScale → 0` makes `useCountUp` short-
// circuit and write the target value directly to the shared value,
// so `useAnimatedReaction` reads the real target and `displayed`
// settles on it.  This pins the steady-state rendered text, which
// is what users actually see post-animation in production.
// The mid-animation behaviour is exercised in the production
// `useCountUp` + Reanimated codepath, not in jest.
jest.mock('@/design-system/useMotionScale', () => ({
  useMotionScale: () => 0,
}))

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

  it('populated: renders lifetime amount on cream identity zone + single editorial caption', () => {
    // §Savings impeccable 6/6 rework: the populated hero MOVED from
    // brand-rose-drench-with-stat-chips (the SaaS metric template
    // PRODUCT.md + DESIGN.md ban) to a cream identity zone with the
    // amount in display.xl navy + a one-line caption beneath.
    // No more "Total saved" eyebrow chip and no more two frosted
    // stat chips.  The caption sentence now carries the this-month
    // + redemption-count breakdown.
    const { getByTestId } = wrap(
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

    // Lifetime amount is rendered via Animated.Text — getByText
    // doesn't traverse the same way as a plain Text — use the testID
    // + children inspection.
    const lifetime = getByTestId('savings-hero-lifetime')
    expect(JSON.stringify(lifetime.props.children)).toContain('£247.50')

    // Single editorial caption beneath the amount.  Singular vs
    // plural redemption-count is part of the brand-tone polish.
    const caption = getByTestId('savings-hero-populated-caption')
    expect(JSON.stringify(caption.props.children)).toContain('£32.00 this month')
    expect(JSON.stringify(caption.props.children)).toContain('5 redemptions')
  })

  it('populated: caption uses singular "redemption" when count === 1', () => {
    const { getByTestId } = wrap(
      <SavingsHeroHeader
        state="populated"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={12.5}
        thisMonthSaving={12.5}
        thisMonthRedemptionCount={1}
      />,
    )
    const caption = getByTestId('savings-hero-populated-caption')
    expect(JSON.stringify(caption.props.children)).toContain('1 redemption')
    expect(JSON.stringify(caption.props.children)).not.toContain('1 redemptions')
  })
})
