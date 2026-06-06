import React from 'react'
import { render } from '@testing-library/react-native'
import { useSharedValue } from 'react-native-reanimated'
import { HomeRefreshLoader } from '@/features/home/components/HomeRefreshLoader'

// Drive useMotionScale per test (matches the project convention).
let mockMotionScale: 0 | 1 = 1
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => mockMotionScale }))

// useAnimatedReaction is a no-op under the jest mock, so the pull-driven mount
// never flips here — these tests exercise the refreshing-driven path. The pull
// reveal itself is UI-thread (worklet) and device-QA-verified.
function Harness({ refreshing }: { refreshing: boolean }) {
  const scrollY = useSharedValue(0)
  return <HomeRefreshLoader scrollY={scrollY} refreshing={refreshing} seamY={300} />
}

beforeEach(() => {
  mockMotionScale = 1
})

describe('HomeRefreshLoader', () => {
  it('mounts the branded loader while refreshing', () => {
    const { getByTestId } = render(<Harness refreshing />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('is absent when not refreshing (and not pulling)', () => {
    const { queryByTestId } = render(<Harness refreshing={false} />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })

  it('reduced motion: still mounts while refreshing (static loader)', () => {
    mockMotionScale = 0
    const { getByTestId } = render(<Harness refreshing />)
    expect(getByTestId('home-refresh-loader')).toBeTruthy()
  })

  it('seam-height guard: absent even while refreshing until seamY is measured (> 0)', () => {
    function Unmeasured() {
      const scrollY = useSharedValue(0)
      return <HomeRefreshLoader scrollY={scrollY} refreshing seamY={0} />
    }
    const { queryByTestId } = render(<Unmeasured />)
    expect(queryByTestId('home-refresh-loader')).toBeNull()
  })
})
