import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SavingsHeroHeader } from '@/features/savings/components/SavingsHeroHeader'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: any, r: any) => React.createElement(Text, { ...p, ref: r })),
    },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: { out: (fn: any) => fn, bezier: () => (x: number) => x },
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

describe('SavingsHeroHeader', () => {
  it('renders free user state with subscribe CTA', () => {
    const onSubscribe = jest.fn()
    const { getByText } = render(
      <SavingsHeroHeader
        state="free"
        onSubscribe={onSubscribe}
        onBrowse={() => {}}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Unlock your savings')).toBeTruthy()
    expect(getByText(/Subscribe — from £6\.99\/mo/)).toBeTruthy()
    fireEvent.press(getByText(/Subscribe — from £6\.99\/mo/))
    expect(onSubscribe).toHaveBeenCalled()
  })

  it('renders subscriber-empty state with browse CTA', () => {
    const onBrowse = jest.fn()
    const { getByText } = render(
      <SavingsHeroHeader
        state="subscriber-empty"
        onSubscribe={() => {}}
        onBrowse={onBrowse}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Start saving today')).toBeTruthy()
    expect(getByText('Browse vouchers')).toBeTruthy()
    fireEvent.press(getByText('Browse vouchers'))
    expect(onBrowse).toHaveBeenCalled()
  })

  it('renders populated state with stats', () => {
    const { getByText } = render(
      <SavingsHeroHeader
        state="populated"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={156.5}
        thisMonthSaving={32.0}
        thisMonthRedemptionCount={7}
      />,
    )
    expect(getByText('Total saved')).toBeTruthy()
    expect(getByText('Savings')).toBeTruthy()
  })

  it('renders "Savings" title in all states', () => {
    const { getByText } = render(
      <SavingsHeroHeader
        state="free"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Savings')).toBeTruthy()
  })
})
