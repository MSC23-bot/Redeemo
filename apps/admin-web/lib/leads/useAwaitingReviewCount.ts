'use client'

/**
 * useAwaitingReviewCount : React Query hook backing the Leads & Onboarding
 * hub's "Inbound · self-serve registrations" pointer card (C1, spec §A1.1).
 *
 * Reuses the EXISTING approvals list read (`approvalsApi.list`, i.e.
 * GET /api/v1/admin/approvals : no new endpoint) filtered to
 * `status: PENDING, type: MERCHANT_ONBOARDING`, requesting `pageSize: 1` and
 * reading the response's server-computed `total` rather than fetching (and
 * counting) full rows. Both `status` and `type` are existing, already-
 * supported query params on the SAME endpoint the Approval Queue page uses
 * (see lib/queue/useQueue.ts) : this is a genuine server-side filter, so the
 * count stays exact even beyond any client-side page cap (unlike deriving it
 * from useQueue's own 100-per-status merged list, which would silently
 * undercount once total PENDING items exceed that cap).
 *
 * `enabled` should be gated by the caller on `ready && can('approval:read')`
 * (the capability that already guards the approvals list elsewhere): a role
 * that lacks it never fires the request : the two-layer-gating convention
 * every other admin-web list hook follows.
 */
import { useQuery } from '@tanstack/react-query'
import { approvalsApi } from '@/lib/api/approvals'

export const AWAITING_REVIEW_COUNT_KEY = ['admin-leads-awaiting-review-count'] as const

export type UseAwaitingReviewCountResult = {
  count: number | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useAwaitingReviewCount(options?: {
  enabled?: boolean
}): UseAwaitingReviewCountResult {
  const query = useQuery({
    queryKey: AWAITING_REVIEW_COUNT_KEY,
    queryFn: async (): Promise<number> => {
      const res = await approvalsApi.list({
        status: 'PENDING',
        type: 'MERCHANT_ONBOARDING',
        pageSize: 1,
      })
      return res.total
    },
    enabled: options?.enabled ?? true,
  })

  return {
    count: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
