import { useEffect, useRef } from 'react'
import * as Brightness from 'expo-brightness'

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
        // best-effort — brightness APIs can fail on Low Power Mode or permission denial
      }
    })()

    return () => {
      cancelled = true
      if (previous.current === null) return
      const restoreTo = previous.current
      previous.current = null
      Brightness.setBrightnessAsync(restoreTo).catch(() => { /* best-effort restore */ })
    }
  }, [active])
}
