import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import type { VoucherDetail } from '@/lib/api/voucher'
import {
  getCurrentWindowOccurrence,
  getNextWindowOccurrence,
  getWindowState,
  type WindowState,
} from '../utils/timeLimitedWindow'

/**
 * Real (M4b-4) implementation of the TIME_LIMITED window-state hook.
 *
 * Replaces the M1 stub. Reads the backend payload (`availabilityWindows`,
 * `currentWindow`, `nextWindow`, `redeemedWindow`) and derives the 5-state
 * union via `getWindowState` from the M4b-2 helper.
 *
 * **Reactivity:**
 *   • A `setTimeout` is armed for whichever fires FIRST — the urgency
 *     threshold (60 min before window close) OR the next exposed boundary
 *     (window close in active/urgent; window open in unavailable-*).
 *     When either fires, the hook recomputes state.
 *   • A 60s `setInterval` ticks the consumer-side countdown display
 *     while the voucher is in active/urgent/unavailable-* states.
 *   • On `AppState` resume ('active'), state is recomputed.
 *
 * **`nextBoundaryAt` semantics:**
 *   What we EXPOSE here is the window close (in active/urgent) or the
 *   next window open (in unavailable-* states) — the moment consumers
 *   need to count down toward. The 60-min urgency threshold is NOT
 *   exposed; it fires the internal boundary timer so state re-derives,
 *   but the consumer-facing "ends at HH:mm" is the actual close instant.
 *
 * Implementation note: state is stored in a `useState<{...}>` so each
 * recompute commits a fresh object via `setState`. Compared to a
 * forceUpdate + render-time-derived pattern, this is more robust under
 * fake-timer + multi-mount jest scenarios where stale closures from
 * unmounted prior renders can still fire bumps.
 */

const URGENT_THRESHOLD_MS = 60 * 60_000  // 60 minutes — spec §5.3
const TICK_INTERVAL_MS    = 60_000       // 60s — minute-granularity, no seconds

/**
 * Module-level AppState fan-out. Multiple useTimeLimited mounts share ONE
 * AppState listener (registered lazily on first subscribe, removed on last
 * unsubscribe). On 'active' status, fan out to every subscribed hook.
 *
 * This also keeps test behaviour predictable: a single stable handler is
 * registered with AppState regardless of how many hook instances are alive,
 * which avoids handler-pollution under jest's shared AppState mock.
 */
type AppStateListener = () => void
const appStateListeners = new Set<AppStateListener>()
let appStateSub: { remove: () => void } | null = null

function ensureAppStateSubscribed() {
  if (appStateSub) return
  appStateSub = AppState.addEventListener('change', (status: AppStateStatus) => {
    if (status !== 'active') return
    for (const fn of appStateListeners) fn()
  })
}

function subscribeAppState(fn: AppStateListener): () => void {
  appStateListeners.add(fn)
  ensureAppStateSubscribed()
  return () => {
    appStateListeners.delete(fn)
    if (appStateListeners.size === 0 && appStateSub) {
      appStateSub.remove()
      appStateSub = null
    }
  }
}

export type TimeLimitedState = {
  /** Is the voucher type TIME_LIMITED? Drives the "Time limited" badge. */
  isTimeLimited: boolean
  /** Derived window state — see `WindowState` union. */
  windowState: WindowState
  /**
   * Absolute UTC instant of the next consumer-visible boundary:
   *   • active / urgent → current window close
   *   • unavailable-today / unavailable-future-day → next window open
   *   • no-windows / not-time-limited → null
   */
  nextBoundaryAt: Date | null
}

type Computed = {
  windowState: WindowState
  nextBoundaryAt: Date | null
}

/**
 * Pure computation of (windowState, nextBoundaryAt) from a voucher
 * snapshot + current time. Called by the hook on initial render AND
 * every boundary/interval/AppState event.
 */
function computeState(voucher: VoucherDetail, now: Date): Computed {
  let windowState: WindowState = getWindowState(
    {
      availabilityWindows: voucher.availabilityWindows,
      currentWindow:  voucher.currentWindow,
      nextWindow:     voucher.nextWindow,
      redeemedWindow: voucher.redeemedWindow,
    },
    now,
  )

  // The M4b-2 helper uses a STRICT `<` comparison for the urgency
  // threshold (so exactly-60-min-left returns 'active'). The hook
  // contract treats exactly-60-min as already inside the urgency band
  // (inclusive boundary on the consumer-facing side). Override here:
  // if we're 'active' AND the close is in the next [0, 60] minutes,
  // promote to 'urgent'.
  if (windowState === 'active' && voucher.currentWindow) {
    const closeMs = new Date(voucher.currentWindow.endsAt).getTime()
    const remainingMs = closeMs - now.getTime()
    if (remainingMs > 0 && remainingMs <= URGENT_THRESHOLD_MS) {
      windowState = 'urgent'
    }
  }

  let nextBoundaryAt: Date | null = null
  if (windowState === 'active' || windowState === 'urgent') {
    let endsAt: Date | null = null
    if (voucher.currentWindow) {
      const backendEnd = new Date(voucher.currentWindow.endsAt)
      if (now < backendEnd) endsAt = backendEnd
    }
    if (!endsAt) {
      const reCurrent = getCurrentWindowOccurrence(voucher.availabilityWindows, now)
      if (reCurrent) endsAt = reCurrent.endsAt
    }
    nextBoundaryAt = endsAt
  } else if (windowState === 'unavailable-today' || windowState === 'unavailable-future-day') {
    let startsAt: Date | null = null
    if (voucher.nextWindow) {
      const backendStart = new Date(voucher.nextWindow.startsAt)
      if (backendStart > now) startsAt = backendStart
    }
    if (!startsAt) {
      const reNext = getNextWindowOccurrence(voucher.availabilityWindows, now)
      if (reNext) startsAt = reNext.startsAt
    }
    nextBoundaryAt = startsAt
  }

  return { windowState, nextBoundaryAt }
}

export function useTimeLimited(voucher: VoucherDetail | null | undefined): TimeLimitedState {
  const isTimeLimited = !!voucher && voucher.type === 'TIME_LIMITED'

  // Compute the initial state from the voucher snapshot. Re-initialised
  // when the voucher identity changes (effect below).
  const initialState: Computed = isTimeLimited && voucher
    ? computeState(voucher, new Date())
    : { windowState: 'no-windows', nextBoundaryAt: null }

  const [computed, setComputed] = useState<Computed>(initialState)
  const voucherRef = useRef(voucher)
  voucherRef.current = voucher

  const recompute = () => {
    const v = voucherRef.current
    if (!v || v.type !== 'TIME_LIMITED') {
      setComputed({ windowState: 'no-windows', nextBoundaryAt: null })
      return
    }
    setComputed(computeState(v, new Date()))
  }

  // Reset computed when voucher identity OR backend window snapshot changes.
  const voucherId = voucher?.id ?? null
  const currentWindowEnd  = voucher?.currentWindow?.endsAt ?? null
  const nextWindowStart   = voucher?.nextWindow?.startsAt  ?? null
  useEffect(() => {
    recompute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherId, currentWindowEnd, nextWindowStart, isTimeLimited])

  // Boundary setTimeout: arm for whichever fires FIRST — the urgency
  // threshold (60 min before close, only in 'active' state) OR the
  // exposed boundary (close or next-window-open).
  const boundaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextBoundaryAtMs = computed.nextBoundaryAt ? computed.nextBoundaryAt.getTime() : 0
  const stateKey = computed.windowState
  useEffect(() => {
    if (boundaryTimerRef.current) {
      clearTimeout(boundaryTimerRef.current)
      boundaryTimerRef.current = null
    }
    if (!isTimeLimited || !nextBoundaryAtMs) return

    const nowMs = Date.now()
    let fireAtMs = nextBoundaryAtMs

    // In 'active', the urgency-crossing fires earlier than close — pick
    // the earlier instant so state flips active→urgent at the threshold.
    // Fire 1ms PAST the threshold so the helper's strict `<` AND the
    // hook's `<=` override both observe "remaining < URGENT_THRESHOLD".
    if (stateKey === 'active') {
      const urgentAtMs = nextBoundaryAtMs - URGENT_THRESHOLD_MS + 1
      if (urgentAtMs > nowMs && urgentAtMs < fireAtMs) {
        fireAtMs = urgentAtMs
      }
    }

    // Fire 1ms past the boundary so when timer triggers, `now >= boundary`
    // (half-open semantics: [open, close) — close itself flips to out).
    if (fireAtMs === nextBoundaryAtMs) fireAtMs += 1

    const delay = Math.max(0, fireAtMs - nowMs)
    boundaryTimerRef.current = setTimeout(() => {
      recompute()
    }, delay)

    return () => {
      if (boundaryTimerRef.current) {
        clearTimeout(boundaryTimerRef.current)
        boundaryTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimeLimited, nextBoundaryAtMs, stateKey])

  // Per-minute tick while in any time-limited state so consumer countdowns
  // update. Skip the interval entirely outside time-limited states.
  const intervalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wantsInterval =
    isTimeLimited &&
    (stateKey === 'active' ||
      stateKey === 'urgent' ||
      stateKey === 'unavailable-today' ||
      stateKey === 'unavailable-future-day')

  useEffect(() => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current)
      intervalTimerRef.current = null
    }
    if (!wantsInterval) return

    intervalTimerRef.current = setInterval(() => {
      recompute()
    }, TICK_INTERVAL_MS)

    return () => {
      if (intervalTimerRef.current) {
        clearInterval(intervalTimerRef.current)
        intervalTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsInterval])

  // AppState resume: when the app returns to 'active', recompute state so
  // any timer skew during background is reconciled against the real clock.
  // Subscribes to a module-level fan-out (see `subscribeAppState`) so all
  // hook mounts share one AppState listener.
  useEffect(() => {
    if (!isTimeLimited) return
    const unsubscribe = subscribeAppState(recompute)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimeLimited])

  return {
    isTimeLimited,
    windowState: computed.windowState,
    nextBoundaryAt: computed.nextBoundaryAt,
  }
}
