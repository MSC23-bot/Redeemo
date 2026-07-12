import { renderHook, act } from '@testing-library/react-native'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

describe('useDebouncedValue', () => {
  it('returns the initial value immediately (no delay on first paint)', () => {
    const { result } = renderHook(() => useDebouncedValue('first', 300))
    expect(result.current).toBe('first')
  })

  it('does not update before the delay elapses', () => {
    jest.useFakeTimers()
    try {
      const { result, rerender } = renderHook(
        ({ value }: { value: string }) => useDebouncedValue(value, 300),
        { initialProps: { value: 'a' } },
      )
      rerender({ value: 'b' })
      act(() => { jest.advanceTimersByTime(200) })
      expect(result.current).toBe('a')
    } finally {
      jest.useRealTimers()
    }
  })

  it('updates to the latest value once the delay elapses', () => {
    jest.useFakeTimers()
    try {
      const { result, rerender } = renderHook(
        ({ value }: { value: string }) => useDebouncedValue(value, 300),
        { initialProps: { value: 'a' } },
      )
      rerender({ value: 'b' })
      act(() => { jest.advanceTimersByTime(300) })
      expect(result.current).toBe('b')
    } finally {
      jest.useRealTimers()
    }
  })

  it('rapid changes within the window only commit the LATEST value', () => {
    jest.useFakeTimers()
    try {
      const { result, rerender } = renderHook(
        ({ value }: { value: string }) => useDebouncedValue(value, 300),
        { initialProps: { value: 'a' } },
      )
      rerender({ value: 'b' })
      act(() => { jest.advanceTimersByTime(100) })
      rerender({ value: 'c' })
      act(() => { jest.advanceTimersByTime(100) })
      rerender({ value: 'd' })
      act(() => { jest.advanceTimersByTime(300) })
      expect(result.current).toBe('d')
    } finally {
      jest.useRealTimers()
    }
  })
})
