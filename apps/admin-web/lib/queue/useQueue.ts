'use client'

/**
 * useQueue — single React Query entry for the admin approval work list.
 *
 * Issues TWO parallel `list` calls (status: 'PENDING' and status:
 * 'CHANGES_REQUESTED', each pageSize: 100 — note the 100-per-status cap)
 * inside ONE queryFn, merges arrays, and sorts oldest-first by submittedAt.
 * Refetches every 45 seconds but pauses when the tab is in the background.
 *
 * Pass `enabled: false` to suppress the network request entirely (e.g. while
 * the session is not yet ready or the caller lacks the `approval:read` capability).
 * Defaults to `true` so the no-arg call behaves as before.
 *
 * B1 (Approval Queue two-court fidelity): this hook is unchanged at the fetch
 * layer — courts are a pure presentation regrouping of the same PENDING +
 * CHANGES_REQUESTED list (approval-queue-spec.md: "the underlying API filters
 * are unchanged"). The old `counts` field (all/submitted/underReview/
 * changesRequested — a StatusFilter-only shape) is retired here: court + type
 * counts are now derived directly from `items` where they're consumed
 * (`lib/ui/adminTones.ts` helpers), since the two-court page needs different
 * groupings (per-tab, per-type) than the old single flat chip row did.
 */
import { useQuery } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api/approvals'
import type { AdminApproval } from '@/lib/api/approvals'

export const QUEUE_KEY = ['admin-queue'] as const

export type UseQueueResult = {
  items: AdminApproval[]
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
  dataUpdatedAt: number
}

export function useQueue(options?: { enabled?: boolean }): UseQueueResult {
  const query = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: async (): Promise<AdminApproval[]> => {
      // Fetch PENDING and CHANGES_REQUESTED in parallel (100 per status cap).
      const [pendingRes, changesRes] = await Promise.all([
        approvalsApi.list({ status: 'PENDING', pageSize: 100 }),
        approvalsApi.list({ status: 'CHANGES_REQUESTED', pageSize: 100 }),
      ])
      const merged = [...pendingRes.approvals, ...changesRes.approvals]
      // Sort oldest-first by submittedAt ascending.
      merged.sort(
        (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      )
      return merged
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  })

  const items = query.data ?? []

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  }
}
