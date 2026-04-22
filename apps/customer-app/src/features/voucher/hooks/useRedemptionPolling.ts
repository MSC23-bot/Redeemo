import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { redemptionApi, RedemptionStatusByCode } from '@/lib/api/redemption'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 15 * 60 * 1_000

type Options = { enabled: boolean }

export type PollState =
  | { phase: 'polling'; data: RedemptionStatusByCode | null }
  | { phase: 'validated'; data: RedemptionStatusByCode }
  | { phase: 'timed-out'; data: RedemptionStatusByCode | null }

export function useRedemptionPolling(code: string, opts: Options) {
  const startedAt = useRef<number>(Date.now())
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!opts.enabled) return
    startedAt.current = Date.now()
    setTimedOut(false)
  }, [opts.enabled])

  const query = useQuery<RedemptionStatusByCode>({
    queryKey: ['redemption', 'by-code', code],
    queryFn: () => redemptionApi.getMyRedemptionByCode(code),
    refetchInterval: (q) => {
      if (!opts.enabled) return false
      if (q.state.data?.isValidated) return false
      if (Date.now() - startedAt.current >= MAX_POLL_DURATION_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL_MS
    },
    enabled: opts.enabled,
  })

  const data = query.data ?? null
  const state: PollState = data?.isValidated
    ? { phase: 'validated', data }
    : timedOut
      ? { phase: 'timed-out', data }
      : { phase: 'polling', data }

  return state
}
