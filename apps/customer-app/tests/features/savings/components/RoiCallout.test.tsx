import React from 'react'
import { render } from '@testing-library/react-native'
import { RoiCallout } from '@/features/savings/components/RoiCallout'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withDelay: (_d: number, v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('RoiCallout', () => {
  it('returns null when saving is 0', () => {
    const { toJSON } = render(
      <RoiCallout thisMonthSaving={0} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('shows below-breakeven copy for monthly < £6.99', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={3.50} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/You're on your way/)).toBeTruthy()
    expect(getByText(/£3\.50/)).toBeTruthy()
  })

  it('shows multiplier copy for monthly >= £6.99', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32.00} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/4\.6×/)).toBeTruthy()
    expect(getByText(/£6\.99\/mo/)).toBeTruthy()
  })

  it('uses annual breakeven threshold £5.83', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={5.83} billingInterval="ANNUAL" hasPromo={false} />,
    )
    expect(getByText(/1\.0×/)).toBeTruthy()
  })

  it('shows below-breakeven for annual < £5.83', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={4.00} billingInterval="ANNUAL" hasPromo={false} />,
    )
    expect(getByText(/You're on your way/)).toBeTruthy()
  })

  it('shows promo copy with no multiplier', () => {
    const { getByText, queryByText } = render(
      <RoiCallout thisMonthSaving={50.00} billingInterval="MONTHLY" hasPromo={true} />,
    )
    expect(getByText(/You saved/)).toBeTruthy()
    expect(getByText(/Keep it up/)).toBeTruthy()
    expect(queryByText(/×/)).toBeNull()
  })
})
