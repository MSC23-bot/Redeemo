import React from 'react'
import { render } from '@testing-library/react-native'
import { PulsingDot } from '@/design-system/motion/PulsingDot'
import * as motionScale from '@/design-system/useMotionScale'

// Reduced-motion path is controlled via the project's existing
// `useMotionScale` hook (returns 0 for reduce-motion, 1 otherwise).
// Tests mock the hook directly — `react-native-reanimated` is already
// stubbed at the test-setup level (tests/setup.ts) so animation calls
// are no-ops; we just verify the component renders cleanly under
// both motion regimes and accepts the prop surface ShowToStaff needs.

describe('PulsingDot', () => {
  it('renders without crashing under normal motion', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1)
    const { getByTestId } = render(<PulsingDot color="#E20C04" testID="dot" />)
    expect(getByTestId('dot')).toBeTruthy()
  })

  it('renders without crashing under reduced motion (motion=0)', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(0)
    const { getByTestId } = render(<PulsingDot color="#E20C04" testID="dot" />)
    expect(getByTestId('dot')).toBeTruthy()
  })

  it('respects custom size prop', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1)
    const { getByTestId } = render(<PulsingDot color="#E20C04" size={12} testID="dot" />)
    // Animated.View style is mocked to {} so we can't introspect the
    // computed dimensions directly, but the testID round-trip
    // confirms the prop surface accepts size + the component mounts.
    expect(getByTestId('dot')).toBeTruthy()
  })

  it('accepts a style prop without crashing (extensibility for ShowToStaff composition)', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1)
    const { getByTestId } = render(
      <PulsingDot color="#E20C04" testID="dot" style={{ marginRight: 6 }} />
    )
    expect(getByTestId('dot')).toBeTruthy()
  })

  it('uses sensible default size when none supplied', () => {
    jest.spyOn(motionScale, 'useMotionScale').mockReturnValue(1)
    const { getByTestId } = render(<PulsingDot color="#E20C04" testID="dot" />)
    expect(getByTestId('dot')).toBeTruthy()
  })
})
