import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'

/**
 * Show-to-Staff anti-fraud screenshot guard (M3 Task 14).
 *
 * Two platform paths, both best-effort:
 *
 * iOS — listener-based, fires AFTER the screenshot has been taken.
 *   Apple does not expose a way to prevent screenshots. The hook
 *   subscribes to `expo-screen-capture.addScreenshotListener` and
 *   on every fire:
 *     1. Calls `onBannerShown` so ShowToStaff can blur the QR +
 *        surface a banner ("Screenshot taken — staff verify only
 *        the live screen").
 *     2. Fire-and-forget POST to `/api/v1/redemption/:code/
 *        screenshot-flag` for backend telemetry. Server-side
 *        Redis SETNX dedupes within 5s; we ALSO dedupe on the
 *        client to avoid spamming the banner + the network on
 *        rapid bursts.
 *
 * Android — system-level FLAG_SECURE on mount; cleared on unmount.
 *   `expo-screen-capture.preventScreenCaptureAsync()` blocks
 *   screenshots system-wide while ShowToStaff is mounted; recents-
 *   screen previews go black. `allowScreenCaptureAsync()` clears
 *   the flag on unmount/blur. No listener needed because the OS
 *   prevents capture before we'd have anything to react to.
 *
 * Best-effort contract (matches Task 11 brightness boost):
 *   - Every Native API call is wrapped in `try`/`catch` or
 *     `.catch(() => {})`. Failures are silent.
 *   - Telemetry POSTs are fire-and-forget; rejection does NOT
 *     prevent `onBannerShown` from firing.
 *   - ShowToStaff render is independent of this hook's success.
 *
 * 5-second client dedup: a rapid screenshot burst (e.g. iOS
 * Side-button + Volume-Up tap pair fires twice) collapses to one
 * banner + one telemetry POST per (userId, code) per 5s. The
 * backend (Task 2) also dedupes via Redis SETNX so this is belt-
 * and-braces.
 */

const DEDUP_WINDOW_MS = 5_000

type Options = {
  active: boolean
  onBannerShown: () => void
}

export function useScreenshotGuard(code: string, { active, onBannerShown }: Options) {
  const lastFireRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    if (Platform.OS === 'android') {
      // FLAG_SECURE — best-effort. Rejection is silent.
      ScreenCapture.preventScreenCaptureAsync().catch(() => {
        /* swallow — see best-effort contract above */
      })
      return () => {
        if (cancelled) return
        cancelled = true
        ScreenCapture.allowScreenCaptureAsync().catch(() => {
          /* swallow — best-effort */
        })
      }
    }

    if (Platform.OS === 'ios') {
      // Listener fires AFTER the screenshot. Dedup at the client side
      // so a burst of fires doesn't spam onBannerShown + telemetry.
      const subscription = ScreenCapture.addScreenshotListener(() => {
        const now = Date.now()
        if (now - lastFireRef.current < DEDUP_WINDOW_MS) return
        lastFireRef.current = now

        // Banner first — user-visible state must NOT depend on
        // telemetry succeeding. Then fire-and-forget the POST.
        onBannerShown()
        redemptionApi
          .postScreenshotFlag(code, 'ios')
          .catch(() => { /* swallow — best-effort telemetry */ })
      })

      return () => {
        cancelled = true
        try {
          subscription?.remove?.()
        } catch {
          /* swallow — listener cleanup is also best-effort */
        }
      }
    }
  }, [active, code, onBannerShown])
}
