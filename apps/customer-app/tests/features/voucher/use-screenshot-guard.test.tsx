import { renderHook, act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'
import { useScreenshotGuard } from '@/features/voucher/hooks/useScreenshotGuard'

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener:     jest.fn(),
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync:   jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: {
    postScreenshotFlag: jest.fn().mockResolvedValue({ accepted: true }),
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

// =========================================================================
// iOS — listener-based detection (after the fact)
// =========================================================================

describe('useScreenshotGuard — iOS', () => {
  let listener: () => void
  const removeSpy = jest.fn()

  beforeEach(() => {
    Platform.OS = 'ios' as any
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((cb: () => void) => {
      listener = cb
      return { remove: removeSpy }
    })
  })

  it('subscribes to screenshot events when active', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.addScreenshotListener).toHaveBeenCalledTimes(1)
  })

  it('does NOT subscribe when active=false (no listener installed)', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: false, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('fires onBannerShown + posts screenshot-flag on screenshot', () => {
    const onBannerShown = jest.fn()
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
    act(() => { listener() })
    expect(onBannerShown).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledWith('A7K2P9X4', 'ios')
  })

  it('dedupes within 5s — burst of fires triggers onBannerShown + telemetry once each', () => {
    const onBannerShown = jest.fn()
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
    act(() => {
      listener()
      jest.advanceTimersByTime(1_000)
      listener()
      jest.advanceTimersByTime(1_000)
      listener()
    })
    expect(onBannerShown).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(1)
  })

  it('re-fires after the 5s dedup window expires', () => {
    const onBannerShown = jest.fn()
    renderHook(() => useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }))
    act(() => { listener() })
    expect(onBannerShown).toHaveBeenCalledTimes(1)

    act(() => { jest.advanceTimersByTime(5_001) })
    act(() => { listener() })
    expect(onBannerShown).toHaveBeenCalledTimes(2)
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(removeSpy).not.toHaveBeenCalled()
    unmount()
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT re-install the screenshot listener when the parent passes a new callback identity (re-render stability)', () => {
    // Parent re-renders that pass `onBannerShown: () => setBlurReason('screenshot')`
    // generate a fresh function identity each render. The hook MUST
    // read the latest callback via a ref and key the native-subscription
    // install on `(active, code)` only — NOT on the callback identity.
    // Without this, anti-fraud subscriptions would tear down + re-arm
    // on every parent state change, opening tiny windows where
    // the listener is absent. Locked 2026-05-08, PR #49 review.
    //
    // (Cross-platform prevent/allow lifecycle is now in the sibling
    // `useScreenCaptureProtection` hook — see its test file.)
    const cb1 = jest.fn()
    const cb2 = jest.fn()
    const cb3 = jest.fn()
    const { rerender } = renderHook(
      ({ onBannerShown }: { onBannerShown: () => void }) =>
        useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }),
      { initialProps: { onBannerShown: cb1 } },
    )
    const initialListenerCalls = (ScreenCapture.addScreenshotListener as jest.Mock).mock.calls.length

    // Re-render twice with fresh callback identities.
    rerender({ onBannerShown: cb2 })
    rerender({ onBannerShown: cb3 })

    // Listener must NOT have been re-armed.
    expect((ScreenCapture.addScreenshotListener as jest.Mock).mock.calls.length)
      .toBe(initialListenerCalls)
    expect(removeSpy).not.toHaveBeenCalled()

    // But firing the listener picks up the LATEST callback (the ref
    // pattern is what makes it safe to drop `onBannerShown` from the
    // effect deps).
    act(() => { listener() })
    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).not.toHaveBeenCalled()
    expect(cb3).toHaveBeenCalledTimes(1)
  })

  it('DOES re-install the screenshot listener when `code` changes (per-code dedup window reset still applies)', () => {
    // Counterpart to the stability test above — the install IS keyed
    // on `code`, so a code change must rebuild the subscription with
    // a fresh dedup window. Locked 2026-05-08, PR #49 review.
    const onBannerShown = jest.fn()
    const { rerender } = renderHook(
      ({ code }: { code: string }) =>
        useScreenshotGuard(code, { active: true, onBannerShown }),
      { initialProps: { code: 'A7K2P9X4' } },
    )
    const initialListenerCalls = (ScreenCapture.addScreenshotListener as jest.Mock).mock.calls.length

    rerender({ code: 'B8L3Q0Y5' })

    expect((ScreenCapture.addScreenshotListener as jest.Mock).mock.calls.length)
      .toBe(initialListenerCalls + 1)
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })

  it('survives postScreenshotFlag rejection silently (best-effort contract)', () => {
    ;(redemptionApi.postScreenshotFlag as jest.Mock).mockRejectedValueOnce(new Error('net'))
    const onBannerShown = jest.fn()
    expect(() => {
      renderHook(() =>
        useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown }),
      )
      act(() => { listener() })
    }).not.toThrow()
    // The banner still fires — the fail-safe contract is that the
    // user-visible state doesn't depend on telemetry succeeding.
    expect(onBannerShown).toHaveBeenCalledTimes(1)
  })

})

// =========================================================================
// Android — useScreenshotGuard is iOS-only; Android relies on
// `useScreenCaptureProtection` (FLAG_SECURE blocks both screenshots
// and recordings system-wide before the listener could fire).
// =========================================================================

describe('useScreenshotGuard — Android', () => {
  beforeEach(() => {
    Platform.OS = 'android' as any
  })

  it('does NOT install a listener on Android (no after-the-fact detect needed; FLAG_SECURE handled by useScreenCaptureProtection)', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('does NOT call any prevent/allow native API (those moved to useScreenCaptureProtection)', () => {
    const { unmount } = renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    unmount()
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
  })
})
