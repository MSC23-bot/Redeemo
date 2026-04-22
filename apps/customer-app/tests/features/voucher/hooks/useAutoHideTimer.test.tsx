import { renderHook, act } from '@testing-library/react-native'
import { useAutoHideTimer } from '@/features/voucher/hooks/useAutoHideTimer'

describe('useAutoHideTimer', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('transitions to "warning" at 1:50 and "hidden" at 2:00 when active', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')

    act(() => { jest.advanceTimersByTime(10_000) })
    expect(result.current.state).toBe('hidden')
  })

  it('resetTimer returns to "visible" and restarts the 2-min clock', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')

    act(() => { result.current.resetTimer() })
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')
  })

  it('active=false keeps state at "visible" regardless of time', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: false }))
    act(() => { jest.advanceTimersByTime(5 * 60 * 1000) })
    expect(result.current.state).toBe('visible')
  })

  it('after validation signal, state is forced to "visible" and timer stops (see Task 16 integration — hook accepts `frozen` flag)', () => {
    const { result, rerender } = renderHook(
      ({ active, frozen }: { active: boolean; frozen: boolean }) =>
        useAutoHideTimer({ active, frozen }),
      { initialProps: { active: true, frozen: false } }
    )

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')

    rerender({ active: true, frozen: true })
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.state).toBe('visible')
  })
})
