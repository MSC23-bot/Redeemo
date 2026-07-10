'use client'

/**
 * useQueueHistory — the "History" court affordance's data source.
 *
 * Not part of the design spec's two-court model (which only fetches
 * PENDING + CHANGES_REQUESTED — approval-queue-spec.md §A.1); added per the
 * B1 task brief so terminal-status approvals (APPROVED / REJECTED /
 * WITHDRAWN) stay reachable once the queue's default view narrows to the two
 * live courts. Uses the SAME `approvalsApi.list` read the live queue uses
 * (generic `status` filter, already supports any AdminApproval status
 * value) — no backend change.
 *
 * Deliberately lazy (`enabled` defaults to false): History is an archive
 * view, not a live work list, so it does not poll and only fetches once the
 * caller flips it on (i.e. the admin actually selects the History tab).
 * `hasLoaded` distinguishes "never fetched yet" from "fetched and empty" so
 * the tab's count badge can stay blank instead of flashing a misleading 0.
 */
import { useQuery } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api/approvals'
import type { AdminApproval } from '@/lib/api/approvals'

export const QUEUE_HISTORY_KEY = ['admin-queue-history'] as const

const HISTORY_STATUSES = ['APPROVED', 'REJECTED', 'WITHDRAWN'] as const

export type UseQueueHistoryResult = {
  items: AdminApproval[]
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  hasLoaded: boolean
  refetch: () => void
}

export function useQueueHistory(options?: { enabled?: boolean }): UseQueueHistoryResult {
  const query = useQuery({
    queryKey: QUEUE_HISTORY_KEY,
    queryFn: async (): Promise<AdminApproval[]> => {
      const responses = await Promise.all(
        HISTORY_STATUSES.map((status) => approvalsApi.list({ status, pageSize: 100 }))
      )
      const merged = responses.flatMap((r) => r.approvals)
      // Newest-resolved-first: an archive reads most naturally as "most
      // recently closed at the top" (the live courts stay oldest-first —
      // that ordering is about triage priority, which no longer applies
      // once an item is terminal).
      merged.sort((a, b) => {
        const aTime = new Date(a.actionedAt ?? a.submittedAt).getTime()
        const bTime = new Date(b.actionedAt ?? b.submittedAt).getTime()
        return bTime - aTime
      })
      return merged
    },
    enabled: options?.enabled ?? false,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    hasLoaded: query.data !== undefined,
    refetch: query.refetch,
  }
}
