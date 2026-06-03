import { renderHook, act } from '@testing-library/react-native'
import { useScrollActivity } from '@/features/home/hooks/useScrollActivity'
import { scrollActivity } from '@/design-system/motion/scrollActivity'

// useFocusEffect needs a navigation context. The hook also registers the same
// reset on a plain useEffect unmount cleanup, which this unit test exercises
// directly (the blur path wires the identical reset).
jest.mock('expo-router', () => ({ useFocusEffect: () => {} }))

describe('useScrollActivity', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    scrollActivity.value = 0
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('holds the flag at 1 while scrolling', () => {
    const { result } = renderHook(() => useScrollActivity())
    act(() => { result.current.onScrollBeginDrag() })
    expect(scrollActivity.value).toBe(1)
  })

  it('debounce-resets to 0 after a drag with no momentum', () => {
    const { result } = renderHook(() => useScrollActivity())
    act(() => { result.current.onScrollBeginDrag() })
    act(() => { result.current.onScrollEndDrag() })
    // Still 1 inside the debounce window — loops do not resume immediately.
    expect(scrollActivity.value).toBe(1)
    act(() => { jest.advanceTimersByTime(120) })
    expect(scrollActivity.value).toBe(0)
  })

  it('never resumes mid-fling: momentum-begin cancels the pending stop', () => {
    const { result } = renderHook(() => useScrollActivity())
    act(() => { result.current.onScrollBeginDrag() })
    act(() => { result.current.onScrollEndDrag() })       // schedule stop
    act(() => { result.current.onMomentumScrollBegin() }) // the fling takes over
    act(() => { jest.advanceTimersByTime(300) })
    expect(scrollActivity.value).toBe(1)                  // stayed 1 through the fling
    act(() => { result.current.onMomentumScrollEnd() })   // fling ends
    act(() => { jest.advanceTimersByTime(120) })
    expect(scrollActivity.value).toBe(0)
  })

  it('force-resets to 0 on unmount even mid-scroll (no app-wide animation freeze)', () => {
    const { result, unmount } = renderHook(() => useScrollActivity())
    act(() => { result.current.onScrollBeginDrag() })
    expect(scrollActivity.value).toBe(1)
    unmount()
    expect(scrollActivity.value).toBe(0)
  })
})
