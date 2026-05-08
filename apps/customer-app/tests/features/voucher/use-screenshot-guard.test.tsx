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

  it('calls preventScreenCaptureAsync on iOS for SCREEN-RECORDING protection (iOS 11+ system blur during capture)', () => {
    // Locked 2026-05-08 (deferred-followups §AB / §AE) — extends iOS
    // anti-fraud beyond just post-fact screenshot detection. iOS does
    // NOT prevent screenshots (Apple has no API), but
    // `expo-screen-capture.preventScreenCaptureAsync` does cover
    // screen recording / mirroring on iOS 11+ via the system
    // `UIScreen.isCaptured` observer + a blurred-snapshot overlay.
    // Without this, a screen recording would capture the QR + the
    // live ticking clock + the LIVE pulse — replay would defeat the
    // live trust signals. WITH this, recordings capture a blurred
    // view.
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('calls allowScreenCaptureAsync on unmount so other app screens are unaffected', () => {
    const { unmount } = renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('survives preventScreenCaptureAsync rejection silently (best-effort contract; listener still installs)', () => {
    ;(ScreenCapture.preventScreenCaptureAsync as jest.Mock).mockRejectedValueOnce(new Error('iOS unsupported'))
    expect(() => {
      renderHook(() =>
        useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
      )
    }).not.toThrow()
    // Listener still installs even if the screen-recording prevention failed.
    expect(ScreenCapture.addScreenshotListener).toHaveBeenCalled()
  })
})

// =========================================================================
// Android — FLAG_SECURE blocks screenshots system-wide for the screen
// =========================================================================

describe('useScreenshotGuard — Android', () => {
  beforeEach(() => {
    Platform.OS = 'android' as any
  })

  it('calls preventScreenCaptureAsync on mount when active', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('calls allowScreenCaptureAsync on unmount', () => {
    const { unmount } = renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1)
  })

  it('does NOT call preventScreenCaptureAsync when active=false', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: false, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
  })

  it('does NOT install a listener on Android (no after-the-fact detect needed)', () => {
    renderHook(() =>
      useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
    )
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
  })

  it('survives preventScreenCaptureAsync rejection silently (best-effort contract)', () => {
    ;(ScreenCapture.preventScreenCaptureAsync as jest.Mock).mockRejectedValueOnce(new Error('Permission'))
    expect(() => {
      renderHook(() =>
        useScreenshotGuard('A7K2P9X4', { active: true, onBannerShown: jest.fn() }),
      )
    }).not.toThrow()
  })
})
