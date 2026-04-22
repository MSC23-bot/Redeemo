import { renderHook, act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'
import { useScreenshotGuard } from '@/features/voucher/hooks/useScreenshotGuard'

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener: jest.fn(),
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}))

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { postScreenshotFlag: jest.fn().mockResolvedValue({ logged: true }) },
}))

describe('useScreenshotGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockReturnValue({ remove: jest.fn() })
  })

  it('iOS: registers screenshot listener, shows banner, POSTs flag on capture', async () => {
    Platform.OS = 'ios' as any
    let capturedHandler: (() => void) | null = null
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((h) => {
      capturedHandler = h
      return { remove: jest.fn() }
    })

    const onBanner = jest.fn()
    renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: onBanner }))

    await act(async () => { capturedHandler?.() })
    expect(onBanner).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledWith('K3F9P7', 'ios')
  })

  it('iOS: debounces banner+POST to at most once per 5 seconds', async () => {
    Platform.OS = 'ios' as any
    let capturedHandler: (() => void) | null = null
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((h) => {
      capturedHandler = h
      return { remove: jest.fn() }
    })

    jest.useFakeTimers()
    const onBanner = jest.fn()
    renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: onBanner }))

    await act(async () => { capturedHandler?.() })
    await act(async () => { capturedHandler?.() })
    await act(async () => { capturedHandler?.() })

    expect(onBanner).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(5_100)
    await act(async () => { capturedHandler?.() })
    expect(onBanner).toHaveBeenCalledTimes(2)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(2)

    jest.useRealTimers()
  })

  it('Android: calls preventScreenCaptureAsync on mount, allowScreenCaptureAsync on unmount', () => {
    Platform.OS = 'android' as any
    const { unmount } = renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: jest.fn() }))
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalled()
  })

  it('active=false: no listener registered, no FLAG_SECURE applied', () => {
    renderHook(() => useScreenshotGuard('K3F9P7', { active: false, onBannerShown: jest.fn() }))
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
  })
})
