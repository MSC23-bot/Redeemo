/**
 * Pins the cross-platform prevent/allow lifecycle of the shared
 * `useScreenCaptureProtection` hook. This hook is consumed by BOTH
 * `<ShowToStaff>` and `<SuccessPopup>` to share the screen-capture
 * baseline (FLAG_SECURE on Android; iOS 11+ system blur during
 * recording/mirroring) without duplicating native call logic.
 *
 * Sibling hook `useScreenshotGuard` handles the iOS post-fact
 * screenshot listener + telemetry separately — that's Show-to-Staff-
 * only. SuccessPopup intentionally uses ONLY this hook (no listener,
 * no telemetry).
 *
 * Locked 2026-05-08, PR #49 final wave.
 */
import { renderHook } from '@testing-library/react-native'

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync:   jest.fn().mockResolvedValue(undefined),
}))

import * as ScreenCapture from 'expo-screen-capture'
import { useScreenCaptureProtection } from '@/features/voucher/hooks/useScreenCaptureProtection'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useScreenCaptureProtection', () => {
  it('calls preventScreenCaptureAsync when active=true on mount', () => {
    renderHook(() => useScreenCaptureProtection(true))
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('calls allowScreenCaptureAsync on unmount (cleanup releases prevention)', () => {
    const { unmount } = renderHook(() => useScreenCaptureProtection(true))
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('does NOT call prevention when active=false (no work to do)', () => {
    renderHook(() => useScreenCaptureProtection(false))
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('toggles prevent/allow when `active` flips false → true → false', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useScreenCaptureProtection(active),
      { initialProps: { active: false } },
    )
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    rerender({ active: true })
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
    rerender({ active: false })
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('survives preventScreenCaptureAsync rejection silently (best-effort contract; no throw)', () => {
    ;(ScreenCapture.preventScreenCaptureAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'))
    expect(() => {
      renderHook(() => useScreenCaptureProtection(true))
    }).not.toThrow()
  })

  it('survives allowScreenCaptureAsync rejection silently on unmount', () => {
    ;(ScreenCapture.allowScreenCaptureAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'))
    const { unmount } = renderHook(() => useScreenCaptureProtection(true))
    expect(() => unmount()).not.toThrow()
  })
})
