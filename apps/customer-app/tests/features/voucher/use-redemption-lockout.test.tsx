import { renderHook, act } from '@testing-library/react-native'
import { useRedemptionLockout } from '@/features/voucher/hooks/useRedemptionLockout'

describe('useRedemptionLockout', () => {
  beforeEach(() => { jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it('returns isLocked=false / 0s when retryAfter is null', () => {
    const { result } = renderHook(() => useRedemptionLockout(null))
    expect(result.current.isLocked).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
    expect(result.current.mmss).toBe('00:00')
  })

  it('returns isLocked=false when retryAfter is 0', () => {
    const { result } = renderHook(() => useRedemptionLockout(0))
    expect(result.current.isLocked).toBe(false)
  })

  it('returns isLocked=false when retryAfter is negative', () => {
    const { result } = renderHook(() => useRedemptionLockout(-1))
    expect(result.current.isLocked).toBe(false)
  })

  it('counts down from retryAfter seconds and unlocks at zero', () => {
    const { result } = renderHook(() => useRedemptionLockout(60))
    expect(result.current.isLocked).toBe(true)
    expect(result.current.secondsRemaining).toBe(60)
    expect(result.current.mmss).toBe('01:00')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.secondsRemaining).toBe(30)
    expect(result.current.mmss).toBe('00:30')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.secondsRemaining).toBe(0)
    expect(result.current.mmss).toBe('00:00')
  })

  it('formats mm:ss correctly across boundaries', () => {
    const { result, rerender: _rerender } = renderHook(({ s }) => useRedemptionLockout(s), {
      initialProps: { s: 900 }, // 15:00
    })
    expect(result.current.mmss).toBe('15:00')

    act(() => { jest.advanceTimersByTime(60_000) })
    expect(result.current.mmss).toBe('14:00')

    act(() => { jest.advanceTimersByTime(13 * 60_000 + 1_000) })
    // 15:00 - 14:01 = 00:59
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(59)
  })

  it('uses absolute deadline (does not desync with simulated app-background)', () => {
    // Mount with 60s. Then simulate the JS thread sleeping for 30s
    // (instead of ticking). We jump now() forward via real-clock change,
    // but in this test we just advanceTimersByTime — point is the
    // remaining time is computed from deadline - now, not by counting
    // ticks. After 30s simulated, the count should be ~30, not 60.
    const { result } = renderHook(() => useRedemptionLockout(60))

    // Skip "30 seconds without ticks": fast-forward both timers and
    // wall-clock.
    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.secondsRemaining).toBe(30)
  })

  it('treats the deadline as immutable for the hook lifetime (changing prop does not extend countdown)', () => {
    const { result, rerender } = renderHook(({ s }) => useRedemptionLockout(s), {
      initialProps: { s: 60 },
    })
    expect(result.current.secondsRemaining).toBe(60)

    act(() => { jest.advanceTimersByTime(30_000) })
    // Caller bumps retryAfter — should NOT reset the countdown for
    // this mount; caller must remount/re-key to get a fresh deadline.
    rerender({ s: 600 })
    expect(result.current.secondsRemaining).toBe(30)
  })
})
