'use client'

/**
 * useQueue — single React Query entry for the admin approval work list.
 *
 * Issues TWO parallel `list` calls (status: 'PENDING' and status:
 * 'CHANGES_REQUESTED', each pageSize: 100 — note the 100-per-status cap)
 * inside ONE queryFn, merges arrays, and sorts oldest-first by submittedAt.
 * Refetches every 45 seconds but pauses when the tab is in the background.
 */
import { useQuery } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api/approvals'
import type { AdminApproval } from '@/lib/api/approvals'

export const QUEUE_KEY = ['admin-queue'] as const

export type QueueCounts = {
  all: number
  submitted: number
  underReview: number
  changesRequested: number
}

export type UseQueueResult = {
  items: AdminApproval[]
  counts: QueueCounts
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
  dataUpdatedAt: number
}

export function useQueue(): UseQueueResult {
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
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
  })

  const items = query.data ?? []

  const counts: QueueCounts = {
    all: items.length,
    submitted: items.filter(
      (i) => i.status === 'PENDING' && i.claimedById == null
    ).length,
    underReview: items.filter(
      (i) => i.status === 'PENDING' && i.claimedById != null
    ).length,
    changesRequested: items.filter((i) => i.status === 'CHANGES_REQUESTED').length,
  }

  return {
    items,
    counts,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  }
}
