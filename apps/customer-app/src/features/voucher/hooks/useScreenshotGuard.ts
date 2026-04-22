import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'

const DEBOUNCE_MS = 5_000

type Options = {
  active: boolean
  onBannerShown: () => void
}

export function useScreenshotGuard(code: string, opts: Options) {
  const lastFireRef = useRef<number>(0)

  useEffect(() => {
    if (!opts.active) return

    if (Platform.OS === 'android') {
      try { void ScreenCapture.preventScreenCaptureAsync() } catch { /* best-effort */ }
    }

    const subscription = ScreenCapture.addScreenshotListener(() => {
      const now = Date.now()
      if (now - lastFireRef.current < DEBOUNCE_MS) return
      lastFireRef.current = now

      opts.onBannerShown()
      redemptionApi
        .postScreenshotFlag(code, Platform.OS === 'ios' ? 'ios' : 'android')
        .catch(() => { /* best-effort — server dedupes anyway */ })
    })

    return () => {
      subscription.remove()
      if (Platform.OS === 'android') {
        try { void ScreenCapture.allowScreenCaptureAsync() } catch { /* best-effort */ }
      }
    }
  }, [opts.active, code, opts.onBannerShown])
}
