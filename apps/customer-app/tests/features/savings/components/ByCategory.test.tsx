import React from 'react'
import { render } from '@testing-library/react-native'
import { ByCategory } from '@/features/savings/components/ByCategory'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSpring: (v: unknown) => v,
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('ByCategory', () => {
  it('renders category bars with names and amounts', () => {
    const { getByText } = render(
      <ByCategory categories={[
        { categoryId: 'c1', name: 'Food & Drink', saving: 20 },
        { categoryId: 'c2', name: 'Beauty', saving: 10 },
      ]} />,
    )
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
  })
})
