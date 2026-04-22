import { useCallback, useEffect, useRef, useState } from 'react'

const HIDE_AFTER_MS   = 2 * 60 * 1000
const WARNING_LEAD_MS = 10 * 1000

export type AutoHideState = 'visible' | 'warning' | 'hidden'

type Options = {
  active: boolean
  /** When true (e.g. validated), force state to 'visible' and disable timer. */
  frozen?: boolean
}

export function useAutoHideTimer({ active, frozen }: Options) {
  const [state, setState] = useState<AutoHideState>('visible')
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (hideTimer.current)    clearTimeout(hideTimer.current)
    warningTimer.current = null
    hideTimer.current    = null
  }, [])

  const schedule = useCallback(() => {
    clear()
    warningTimer.current = setTimeout(() => setState('warning'), HIDE_AFTER_MS - WARNING_LEAD_MS)
    hideTimer.current    = setTimeout(() => setState('hidden'),  HIDE_AFTER_MS)
  }, [clear])

  const resetTimer = useCallback(() => {
    setState('visible')
    if (active && !frozen) schedule()
  }, [active, frozen, schedule])

  useEffect(() => {
    if (!active || frozen) {
      clear()
      setState('visible')
      return
    }
    schedule()
    return clear
  }, [active, frozen, schedule, clear])

  return { state, resetTimer }
}
