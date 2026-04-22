import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ViewingChip } from '@/features/savings/components/ViewingChip'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('ViewingChip', () => {
  it('renders month label and dismiss button', () => {
    const onDismiss = jest.fn()
    const { getByText, getByLabelText } = render(
      <ViewingChip month="2026-03" onDismiss={onDismiss} />,
    )
    expect(getByText(/Viewing: March 2026/)).toBeTruthy()
    fireEvent.press(getByLabelText(/Tap to return to current month/))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('returns null when month is null', () => {
    const { toJSON } = render(<ViewingChip month={null} onDismiss={() => {}} />)
    expect(toJSON()).toBeNull()
  })
})
