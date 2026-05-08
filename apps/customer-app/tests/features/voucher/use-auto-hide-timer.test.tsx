import { renderHook, act } from '@testing-library/react-native'
import { useAutoHideTimer } from '@/features/voucher/hooks/useAutoHideTimer'

// Locked timing per plan §M3b Task 12 + §Backgrounding behavior:
//   - 2 min idle → 'warning'
//   - +10 sec → 'hidden'
//   - resetTimer() → back to 'visible' + re-arm
//   - frozen=true → stay 'visible' indefinitely (validated state)
//   - active=false → stay 'visible' (timers cleared)

describe('useAutoHideTimer', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(()  => jest.useRealTimers())

  it('starts in visible state', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    expect(result.current.state).toBe('visible')
  })

  it('transitions to warning at 1m50s and hidden at 2m', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))

    act(() => { jest.advanceTimersByTime(110_000) })   // 1m50s
    expect(result.current.state).toBe('warning')

    act(() => { jest.advanceTimersByTime(10_001) })    // total 2m+
    expect(result.current.state).toBe('hidden')
  })

  it('resetTimer flips back to visible and re-arms', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))

    act(() => { jest.advanceTimersByTime(120_001) })
    expect(result.current.state).toBe('hidden')

    act(() => { result.current.resetTimer() })
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')
  })

  it('frozen=true short-circuits — stays visible regardless of time', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true, frozen: true }))
    act(() => { jest.advanceTimersByTime(180_000) })   // 3 min
    expect(result.current.state).toBe('visible')
  })

  it('active=false stays visible and clears timers', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: false }))
    act(() => { jest.advanceTimersByTime(180_000) })
    expect(result.current.state).toBe('visible')
  })

  it('flipping frozen mid-flight clears the warning + re-pins to visible', () => {
    const { result, rerender } = renderHook(
      ({ frozen }: { frozen: boolean }) => useAutoHideTimer({ active: true, frozen }),
      { initialProps: { frozen: false } },
    )

    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')

    // Validated path — caller flips frozen=true to lock the screen.
    rerender({ frozen: true })
    expect(result.current.state).toBe('visible')

    // Even after generous idle, frozen keeps it visible.
    act(() => { jest.advanceTimersByTime(60_000) })
    expect(result.current.state).toBe('visible')
  })

  it('flipping active false then true re-arms the timer', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useAutoHideTimer({ active }),
      { initialProps: { active: true } },
    )

    rerender({ active: false })
    act(() => { jest.advanceTimersByTime(180_000) })
    expect(result.current.state).toBe('visible')

    rerender({ active: true })
    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')
  })
})
