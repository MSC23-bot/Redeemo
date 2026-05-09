import { useEffect, useRef } from 'react'
import * as Brightness from 'expo-brightness'

/**
 * Show-to-Staff brightness boost (M3 Task 11).
 *
 * Captures the current screen brightness on mount, ramps to maximum
 * for QR scannability, restores on unmount. Best-effort by design:
 * `expo-brightness` can reject under iOS Low Power Mode, missing
 * permissions, or platform quirks (Android system-vs-app
 * brightness semantics differ). All failures are silently
 * swallowed — the surface MUST NOT crash the customer's
 * Show-to-Staff session because brightness boost couldn't
 * apply.
 *
 * Restore semantics: the hook only attempts a restore if the
 * capture step succeeded. If `getBrightnessAsync` rejected, no
 * prior value was recorded and the unmount cleanup is a no-op.
 *
 * Backgrounding behaviour (locked plan §Backgrounding): the
 * caller (ShowToStaff) drives this hook with a focus-derived
 * `active` boolean — restore on blur, re-capture+boost on focus.
 * iOS naturally ramps brightness down when the app backgrounds;
 * the explicit restore-on-blur is defensive against multi-foreground
 * cycles where state could otherwise drift.
 */
export function useBrightnessBoost(active: boolean) {
  const previous = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    ;(async () => {
      try {
        const current = await Brightness.getBrightnessAsync()
        if (cancelled) return
        previous.current = current
        await Brightness.setBrightnessAsync(1)
      } catch {
        // Best-effort — Low Power Mode, permission denial, or
        // platform quirks. Silently no-op.
      }
    })()

    return () => {
      cancelled = true
      const restoreTo = previous.current
      previous.current = null
      if (restoreTo === null) return
      Brightness.setBrightnessAsync(restoreTo).catch(() => {
        // Best-effort restore.
      })
    }
  }, [active])
}
