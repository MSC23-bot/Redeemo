import { renderHook, act } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { useMotionScale } from '@/design-system/useMotionScale'

describe('useMotionScale', () => {
  it('returns 0 when reduce motion is enabled, 1 otherwise', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true)
    const { result } = renderHook(() => useMotionScale())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe(0)
  })
  it('returns 1 when reduce motion off', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(false)
    const { result } = renderHook(() => useMotionScale())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe(1)
  })
})
