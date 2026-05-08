import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { redemptionApi, RedemptionStatusByCode } from '@/lib/api/redemption'

/**
 * Show-to-Staff validation polling (M3 Task 10).
 *
 * Polls `GET /api/v1/redemption/me/:code` every 5 seconds while the
 * Show-to-Staff surface is visible. Stops on:
 *   - validated transition (`isValidated: true` in the payload),
 *   - 15-minute total budget (counted from the first enable, even
 *     across background/foreground cycles per plan §Backgrounding),
 *   - hook unmount,
 *   - `enabled: false`.
 *
 * Two flags drive the lifecycle:
 *   - `enabled` is the "is the surface mounted at all" toggle. When
 *     false, the hook does nothing; on the next true the budget timer
 *     resets (a fresh user session).
 *   - `paused` is the "AppState went to background" toggle. When true
 *     and `enabled` is true, the React Query refetch is suspended but
 *     `startedAt` is preserved — backgrounded time still consumes the
 *     15-minute budget per the locked backgrounding contract. Resume
 *     on focus picks up where it left off.
 */

const POLL_INTERVAL_MS    = 5_000
const MAX_POLL_DURATION_MS = 15 * 60 * 1_000

type Options = {
  enabled: boolean
  paused?: boolean
}

export type PollState =
  | { phase: 'polling';   data: RedemptionStatusByCode | null }
  | { phase: 'validated'; data: RedemptionStatusByCode }
  | { phase: 'timed-out'; data: RedemptionStatusByCode | null }

export function useRedemptionPolling(code: string, opts: Options): PollState {
  const startedAt = useRef<number>(Date.now())
  const [timedOut, setTimedOut] = useState(false)

  // Reset the budget on enable transitions only — NOT on pause toggles.
  // Backgrounded time continues to count against the 15-min budget per
  // the M3 plan §Backgrounding behavior contract.
  useEffect(() => {
    if (!opts.enabled) return
    startedAt.current = Date.now()
    setTimedOut(false)
  }, [opts.enabled])

  const isPolling = opts.enabled && !opts.paused

  const query = useQuery<RedemptionStatusByCode>({
    queryKey: ['redemption', 'by-code', code],
    queryFn:  () => redemptionApi.getMyRedemptionByCode(code),
    enabled:  isPolling,
    refetchInterval: (q) => {
      if (!opts.enabled) return false
      if (opts.paused)   return false
      if (q.state.data?.isValidated) return false
      if (Date.now() - startedAt.current >= MAX_POLL_DURATION_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL_MS
    },
  })

  const data = query.data ?? null
  if (data?.isValidated) return { phase: 'validated', data }
  if (timedOut)          return { phase: 'timed-out', data }
  return { phase: 'polling', data }
}
