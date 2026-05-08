import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'

/**
 * Show-to-Staff anti-fraud screen-capture guard (M3 Task 14, extended
 * 2026-05-08 with iOS screen-recording prevention).
 *
 * Platform asymmetry — locked product framing
 * (deferred-followups §AB; never describe iOS as "screenshot
 * prevention" in spec/PR/marketing/in-app copy):
 *
 * Android — `preventScreenCaptureAsync()` enables `FLAG_SECURE` on
 *   mount. The OS blocks BOTH screenshots AND screen recordings
 *   system-wide while ShowToStaff is mounted; recents-screen previews
 *   go black; recordings capture a blank frame. `allowScreenCaptureAsync()`
 *   clears the flag on unmount. No listener needed because the OS
 *   prevents capture before we'd have anything to react to.
 *
 * iOS — TWO complementary paths, both best-effort:
 *
 *   (a) `preventScreenCaptureAsync()` — per `expo-screen-capture` v8,
 *       on iOS 11+ the package observes `UIScreen.isCaptured` and
 *       overlays the captured view with a blurred snapshot. Active
 *       SCREEN RECORDINGS and AirPlay/screen-mirroring sessions
 *       capture a blurred view, NOT the QR. This closes the bigger
 *       fraud vector: a screen recording that captures the QR + the
 *       live ticking clock + the LIVE pulse animations, replayed
 *       later. Without this, the live trust signals can be replayed.
 *       NOTE: this does NOT prevent SCREENSHOTS on iOS — Apple does
 *       not expose any API for that.
 *
 *   (b) `addScreenshotListener()` — fires AFTER a screenshot is taken
 *       (the captured image WILL contain the unblurred QR + 8-char
 *       code). On every fire:
 *         1. Calls `onBannerShown` so ShowToStaff can blur the QR
 *            view + surface a banner ("Screenshot detected. Staff
 *            verify only the live screen. Tap the QR to show again.").
 *         2. Fire-and-forget POST to `/api/v1/redemption/:code/
 *            screenshot-flag` for backend telemetry. Server-side
 *            Redis SETNX dedupes within 5s; we ALSO dedupe on the
 *            client to avoid spamming the banner + the network on
 *            rapid bursts.
 *       The user-visible trust signal on iOS for screenshots is the
 *       LIVE SCREEN ITSELF (animated border, pulsing LIVE dot,
 *       ticking en-GB London datetime, validated chip transition) —
 *       a static screenshot freezes all of these and trained staff
 *       can spot it. Locked: never frame iOS as "screenshot
 *       prevention". See deferred-followups §AB.
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

    // Reset the dedup window on every (active, code) transition. Without
    // this, a future hook reuse that swaps `code` mid-mount could
    // silently dedup the new code's first screenshot against the old
    // code's timestamp. PR #49 review hardening.
    lastFireRef.current = 0

    if (Platform.OS === 'android') {
      // FLAG_SECURE — best-effort. Blocks BOTH screenshots and
      // screen recordings on Android. Rejection is silent.
      ScreenCapture.preventScreenCaptureAsync().catch(() => {
        /* swallow — see best-effort contract above */
      })
      return () => {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {
          /* swallow — best-effort */
        })
      }
    }

    if (Platform.OS === 'ios') {
      // (a) preventScreenCaptureAsync — covers SCREEN RECORDING +
      // mirroring on iOS 11+ via the system isCaptured observer +
      // blurred-snapshot overlay. Does NOT prevent SCREENSHOTS on
      // iOS (Apple has no public API for that).
      ScreenCapture.preventScreenCaptureAsync().catch(() => {
        /* swallow — best-effort */
      })

      // (b) addScreenshotListener — post-fact detection of screenshots.
      // Dedup at the client side so a burst of fires doesn't spam
      // onBannerShown + telemetry.
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
        try {
          subscription?.remove?.()
        } catch {
          /* swallow — listener cleanup is also best-effort */
        }
        // Also clear the screen-capture prevention so the user can
        // screenshot/record OTHER screens of the app normally after
        // leaving Show-to-Staff.
        ScreenCapture.allowScreenCaptureAsync().catch(() => {
          /* swallow — best-effort */
        })
      }
    }
  }, [active, code, onBannerShown])
}
