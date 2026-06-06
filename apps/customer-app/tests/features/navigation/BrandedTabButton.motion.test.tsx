// M3 — press feedback + haptics + reduced motion on the bottom-tab button.
// Reanimated mock follows the project convention (see FavouriteHeart.test):
// capture withTiming/withSpring so we can assert the press scale runs (or not).

const mockWithTimingCalls = jest.fn()
const mockWithSpringCalls = jest.fn()
jest.mock('react-native-reanimated', () => {
  const View = jest.requireActual('react-native').View
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (target: number, ...rest: unknown[]) => {
      mockWithTimingCalls(target, ...rest)
      return target
    },
    withSpring: (target: number, ...rest: unknown[]) => {
      mockWithSpringCalls(target, ...rest)
      return target
    },
  }
})

const mockLightHaptic = jest.fn()
jest.mock('@/design-system/haptics', () => ({
  __esModule: true,
  lightHaptic: () => mockLightHaptic(),
}))

let mockMotionScale: 0 | 1 = 1
jest.mock('@/design-system/useMotionScale', () => ({
  __esModule: true,
  useMotionScale: () => mockMotionScale,
}))

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { BrandedTabButton } from '@/features/navigation/BrandedTabButton'

beforeEach(() => {
  mockWithTimingCalls.mockReset()
  mockWithSpringCalls.mockReset()
  mockLightHaptic.mockReset()
  mockMotionScale = 1
})

const renderButton = () =>
  render(<BrandedTabButton name="home" label="Home" aria-selected={false} testID="tab" />)

describe('BrandedTabButton — press feedback + haptics + reduced motion (M3)', () => {
  it('press fires a single light haptic (lightHaptic self-guards on the haptics setting)', () => {
    const { getByTestId } = renderButton()
    fireEvent(getByTestId('tab'), 'pressIn')
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
  })

  it('motion on: press scales the cell to 0.96, release springs back to 1', () => {
    const { getByTestId } = renderButton()
    fireEvent(getByTestId('tab'), 'pressIn')
    expect(mockWithTimingCalls).toHaveBeenCalledWith(0.96, expect.anything())
    fireEvent(getByTestId('tab'), 'pressOut')
    expect(mockWithSpringCalls).toHaveBeenCalledWith(1, expect.anything())
  })

  it('reduced motion: press scale is DISABLED (no withTiming/withSpring) but the haptic still fires', () => {
    mockMotionScale = 0
    const { getByTestId } = renderButton()
    fireEvent(getByTestId('tab'), 'pressIn')
    fireEvent(getByTestId('tab'), 'pressOut')
    expect(mockWithTimingCalls).not.toHaveBeenCalled()
    expect(mockWithSpringCalls).not.toHaveBeenCalled()
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
  })
})
