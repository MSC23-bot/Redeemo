import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrendChart } from '@/features/savings/components/TrendChart'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

const MONTHS = [
  { month: '2026-04', saving: 32, count: 7 },
  { month: '2026-03', saving: 20, count: 4 },
  { month: '2026-02', saving: 0, count: 0 },
  { month: '2026-01', saving: 15, count: 3 },
  { month: '2025-12', saving: 10, count: 2 },
  { month: '2025-11', saving: 5, count: 1 },
]

describe('TrendChart', () => {
  it('renders 6 bars', () => {
    const { getAllByRole } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={() => {}}
      />,
    )
    const bars = getAllByRole('button')
    expect(bars).toHaveLength(6)
  })

  it('calls onMonthSelect when a bar is tapped', () => {
    const onSelect = jest.fn()
    const { getAllByRole } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={onSelect}
      />,
    )
    fireEvent.press(getAllByRole('button')[1]) // tap March (second from left after reverse: Nov, Dec, Jan, Feb, Mar, Apr)
    // After reverse, index 1 = Dec 2025
    expect(onSelect).toHaveBeenCalled()
  })

  it('has accessible labels on each bar', () => {
    const { getByLabelText } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={() => {}}
      />,
    )
    expect(getByLabelText(/Apr, £32.00 saved/)).toBeTruthy()
    expect(getByLabelText(/Feb, £0.00 saved/)).toBeTruthy()
  })
})
