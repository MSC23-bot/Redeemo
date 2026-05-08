import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'

/**
 * Show-to-Staff iOS post-fact screenshot detection (M3 Task 14, slimmed
 * 2026-05-08 PR #49 final wave).
 *
 * Single-purpose: subscribes to `addScreenshotListener` on iOS so the
 * caller can blur the QR + show a "Screenshot detected" banner +
 * post telemetry AFTER iOS has written the screenshot to Photos.
 * Apple does NOT expose any way to PREVENT screenshots on iOS —
 * the captured Photo will contain the unblurred QR + 8-char code.
 * The user-visible trust signal on iOS is the LIVE SCREEN ITSELF
 * (animated border, pulsing LIVE dot, ticking en-GB London datetime,
 * validated chip transition) — a static screenshot freezes all of
 * these and trained staff can spot it. Locked at deferred-followups
 * §AB; never frame iOS as "screenshot prevention".
 *
 * Cross-platform `preventScreenCaptureAsync` (FLAG_SECURE on Android;
 * iOS 11+ system blur during screen recording / mirroring) lives in
 * the sibling `useScreenCaptureProtection` hook so both
 * `<ShowToStaff>` and `<SuccessPopup>` share the prevention baseline
 * without duplicating native call logic. Consumers of THIS hook
 * (currently only ShowToStaff) should also call
 * `useScreenCaptureProtection` for the prevention path.
 *
 * Best-effort contract (matches the brightness boost + protection
 * hooks):
 *   - Listener install rejection is silent.
 *   - Telemetry POSTs are fire-and-forget; rejection does NOT
 *     prevent `onBannerShown` from firing.
 *   - ShowToStaff render is independent of this hook's success.
 *
 * 5-second client dedup: a rapid screenshot burst (e.g. iOS
 * Side-button + Volume-Up tap pair fires twice) collapses to one
 * banner + one telemetry POST per (userId, code) per 5s. The
 * backend (Task 2) also dedupes via Redis SETNX so this is belt-
 * and-braces.
 *
 * Callback stability: `onBannerShown` is stashed in a ref so the
 * native-listener install is keyed only on `[active, code]`. Without
 * this, parent re-renders that pass a fresh inline callback would
 * tear down + re-install the listener on every render — small re-arm
 * windows we want to avoid for anti-fraud code. The latest callback
 * still fires when the listener triggers because we read via the ref.
 */

const DEDUP_WINDOW_MS = 5_000

type Options = {
  active: boolean
  onBannerShown: () => void
}

export function useScreenshotGuard(code: string, { active, onBannerShown }: Options) {
  const lastFireRef = useRef<number>(0)
  // Stash the callback in a ref so the native-subscription effect
  // below does NOT depend on `onBannerShown`. Locked 2026-05-08,
  // PR #49 review hardening.
  const onBannerShownRef = useRef(onBannerShown)
  useEffect(() => {
    onBannerShownRef.current = onBannerShown
  }, [onBannerShown])

  useEffect(() => {
    if (!active) return
    // Android FLAG_SECURE blocks screenshots before they happen, so
    // there's no after-the-fact event to listen for. The screen-
    // capture protection hook (`useScreenCaptureProtection`) handles
    // FLAG_SECURE; this hook is iOS-only.
    if (Platform.OS !== 'ios') return

    // Reset the dedup window on every (active, code) transition. Without
    // this, a future hook reuse that swaps `code` mid-mount could
    // silently dedup the new code's first screenshot against the old
    // code's timestamp.
    lastFireRef.current = 0

    const subscription = ScreenCapture.addScreenshotListener(() => {
      const now = Date.now()
      if (now - lastFireRef.current < DEDUP_WINDOW_MS) return
      lastFireRef.current = now

      // Banner first — user-visible state must NOT depend on
      // telemetry succeeding. Then fire-and-forget the POST.
      // `onBannerShownRef.current` reads the LATEST callback so
      // parent re-renders that swap the callback don't lose state
      // updates — but the LISTENER itself was installed once.
      onBannerShownRef.current()
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
    }
    // NOTE: `onBannerShown` is intentionally NOT in the deps array.
    // It's read via the ref above. Native install is keyed only on
    // `(active, code)`.
  }, [active, code])
}
