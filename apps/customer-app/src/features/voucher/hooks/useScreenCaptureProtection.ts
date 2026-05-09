import { useEffect } from 'react'
import * as ScreenCapture from 'expo-screen-capture'

/**
 * Cross-platform screen-capture prevention for surfaces that display
 * the redemption code (currently `<ShowToStaff>` and
 * `<VoucherDetailScreen>` while the persisted RedemptionDetailsCard
 * is showing the code during the 2-hour presentation window).
 * `<SuccessPopup>` was a consumer until 2026-05-09 — removed when
 * the popup stopped rendering the code (locked plan §0.9 / brief
 * §13.1 / D15).
 *
 * Calls `expo-screen-capture.preventScreenCaptureAsync()` while
 * `active === true`; clears it on `active === false` or unmount.
 *
 * Platform behaviour (per `expo-screen-capture@8.0.9` docs):
 *   - **Android**: enables `FLAG_SECURE` on the window. Blocks BOTH
 *     screenshots AND screen recordings system-wide while the flag
 *     is set. Recents-screen previews go black.
 *   - **iOS** (iOS 11+ for recordings, iOS 13+ for screenshots):
 *     observes `UIScreen.isCaptured` and overlays the captured view
 *     with a blurred snapshot. Active screen recordings + AirPlay /
 *     screen-mirroring sessions capture the blurred view, NOT the
 *     QR / code. Apple has no public API to truly PREVENT
 *     screenshots — those are post-fact only and require a separate
 *     listener; see `useScreenshotGuard` for that path.
 *
 * Best-effort contract (matches `useScreenshotGuard` + brightness
 * boost):
 *   - Native rejection is silent (`.catch(() => {})`). The
 *     consuming component renders normally even if the prevention
 *     fails on a specific OS version or device.
 *   - The cleanup `allowScreenCaptureAsync()` releases the
 *     prevention so OTHER app screens (reviews, profile, settings,
 *     etc.) can be screenshotted/recorded normally after this
 *     surface is dismissed.
 *
 * Single-purpose by design: this hook does ONE thing — toggle the
 * native prevent/allow lifecycle. It does NOT install a screenshot
 * listener and does NOT post telemetry. Consumers that also want
 * post-fact iOS screenshot detection (banner + telemetry) call
 * `useScreenshotGuard` alongside this hook. Locked 2026-05-08
 * (PR #49 final wave) — owner-directed split to share the
 * prevention baseline cleanly across code surfaces without
 * duplicating native call logic.
 */
export function useScreenCaptureProtection(active: boolean): void {
  useEffect(() => {
    if (!active) return
    ScreenCapture.preventScreenCaptureAsync().catch(() => {
      /* swallow — best-effort */
    })
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {
        /* swallow — best-effort */
      })
    }
  }, [active])
}
