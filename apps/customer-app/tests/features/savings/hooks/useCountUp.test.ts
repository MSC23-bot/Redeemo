import { renderHook } from '@testing-library/react-native'
import { useCountUp } from '@/features/savings/hooks/useCountUp'

// Light test: useCountUp returns a `useSharedValue` Reanimated handle.
// Under reduce-motion (useMotionScale === 0) the value is set
// synchronously to the target; otherwise the effect schedules
// `withTiming`.  We pin the synchronous path because the timing path
// is animation-frame driven and not deterministic in jest without
// fake-timer plumbing.

const motionScaleRef = { value: 0 as 0 | 1 }
jest.mock('@/design-system/useMotionScale', () => ({
  useMotionScale: () => motionScaleRef.value,
}))

describe('useCountUp (reduce-motion behaviour)', () => {
  beforeEach(() => { motionScaleRef.value = 0 })

  it('snaps to target immediately under reduce-motion', () => {
    const { result } = renderHook(() => useCountUp(247.5, 900))
    // useSharedValue exposes `.value`; under reduce-motion, the effect
    // assigns target synchronously on mount.
    expect(result.current.value).toBe(247.5)
  })

  it('updates target on subsequent renders under reduce-motion', () => {
    const { result, rerender } = renderHook(({ target }: { target: number }) => useCountUp(target, 900), {
      initialProps: { target: 100 },
    })
    expect(result.current.value).toBe(100)
    rerender({ target: 200 })
    expect(result.current.value).toBe(200)
  })

  it('mounts cleanly with full motion enabled (does not throw)', () => {
    motionScaleRef.value = 1
    // The mounted effect schedules `withTiming`; we just verify mount
    // succeeds without crashing.  The animation itself is owned by
    // Reanimated and tested at a higher level via screen tests.
    expect(() => renderHook(() => useCountUp(50, 500))).not.toThrow()
  })
})
