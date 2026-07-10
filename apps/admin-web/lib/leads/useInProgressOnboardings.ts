'use client'

/**
 * useInProgressOnboardings : React Query hook backing the Leads & Onboarding
 * hub's "In-progress onboardings" section (C1, spec §A1 pt.4; SECTION 2 of the
 * task brief).
 *
 * "Pre-live" merchants are those with status REGISTERED or PENDING_APPROVAL:
 * drafts and submitted-but-not-yet-approved applications, i.e. everything
 * short of ACTIVE. The existing merchants directory read (`merchantsApi.list`,
 * GET /api/v1/admin/merchants) accepts a SINGLE `status` value per call, not
 * an OR of several, so an unfiltered-then-client-filtered fetch is NOT the
 * best available option here: this hook instead issues TWO parallel,
 * server-side status-filtered calls : one per pre-live status : mirroring the
 * existing useQueue two-status-merge pattern (lib/queue/useQueue.ts merges
 * PENDING + CHANGES_REQUESTED the same way). Each half is genuinely filtered
 * server-side; no new backend params are added. Results are merged and sorted
 * most-recently-created-first : the summary payload carries `createdAt`, not
 * an `updatedAt`/last-activity field, so "most recently created" is the
 * closest honest proxy for "most recently started" available today (no
 * fabricated "last touched" timestamp).
 *
 * `total` reports the REAL combined count from both responses' own `total`
 * fields (accurate even beyond the display cap below); `items` is capped at
 * `IN_PROGRESS_DISPLAY_CAP` so the hub stays a landing overview rather than a
 * second paginated directory : the full merchants list (with its own status
 * filter and pagination) is always reachable via the Merchants directory.
 */
import { useQuery } from '@tanstack/react-query'
import { merchantsApi } from '@/lib/api/merchants'
import type { MerchantSummary, MerchantStatusFilter } from '@/lib/api/merchants'

export const IN_PROGRESS_ONBOARDINGS_KEY = ['admin-leads-in-progress-onboardings'] as const

// Pre-live statuses: everything short of ACTIVE. Kept local (not exported
// from lib/api/merchants) since "pre-live" is a leads-hub framing, not a
// general merchant-directory concept.
const PRE_LIVE_STATUSES: readonly MerchantStatusFilter[] = ['REGISTERED', 'PENDING_APPROVAL']

const PER_STATUS_FETCH = 10
export const IN_PROGRESS_DISPLAY_CAP = 10

export type UseInProgressOnboardingsResult = {
  items: MerchantSummary[]
  total: number | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useInProgressOnboardings(options?: {
  enabled?: boolean
}): UseInProgressOnboardingsResult {
  const query = useQuery({
    queryKey: IN_PROGRESS_ONBOARDINGS_KEY,
    queryFn: async (): Promise<{ items: MerchantSummary[]; total: number }> => {
      const responses = await Promise.all(
        PRE_LIVE_STATUSES.map((status) =>
          merchantsApi.list({ status, pageSize: PER_STATUS_FETCH })
        )
      )
      const merged = responses.flatMap((r) => r.merchants)
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const total = responses.reduce((sum, r) => sum + r.total, 0)
      return { items: merged, total }
    },
    enabled: options?.enabled ?? true,
  })

  return {
    items: query.data?.items.slice(0, IN_PROGRESS_DISPLAY_CAP) ?? [],
    total: query.data?.total,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
