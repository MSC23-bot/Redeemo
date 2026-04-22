import React from 'react'
import { render } from '@testing-library/react-native'
import { BenefitCards } from '@/features/savings/components/BenefitCards'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('BenefitCards', () => {
  it('renders 4 cards for free state', () => {
    const { getByText } = render(<BenefitCards variant="free" />)
    expect(getByText('Restaurants, cafés, gyms & more')).toBeTruthy()
    expect(getByText('Show your code, save instantly')).toBeTruthy()
    expect(getByText('Your subscription pays for itself')).toBeTruthy()
    expect(getByText('Cancel anytime, no commitment')).toBeTruthy()
  })

  it('renders 3 cards for subscriber-empty state (no cancel card)', () => {
    const { getByText, queryByText } = render(<BenefitCards variant="subscriber-empty" />)
    expect(getByText('Restaurants, cafés, gyms & more')).toBeTruthy()
    expect(getByText('Show your code, save instantly')).toBeTruthy()
    expect(getByText('Your subscription pays for itself')).toBeTruthy()
    expect(queryByText('Cancel anytime, no commitment')).toBeNull()
  })
})
