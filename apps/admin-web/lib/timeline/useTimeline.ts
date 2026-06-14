'use client'

/**
 * useTimeline — React Query hook for a merchant's communication + activity timeline.
 *
 * Fetches GET /api/v1/admin/merchants/:id/timeline and returns the merged,
 * newest-first feed plus the merchant lifecycle state. Pass `enabled: false`
 * to suppress the network request (e.g. while the session is not yet ready or
 * the caller lacks approval:read).
 */
import { useQuery } from '@tanstack/react-query'
import { timelineApi } from '@/lib/api/timeline'
import type { MerchantTimeline } from '@/lib/api/timeline'

export function timelineQueryKey(merchantId: string) {
  return ['admin-timeline', merchantId] as const
}

export type UseTimelineResult = {
  data: MerchantTimeline | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useTimeline(merchantId: string, enabled: boolean): UseTimelineResult {
  const query = useQuery({
    queryKey: timelineQueryKey(merchantId),
    queryFn: () => timelineApi.get(merchantId),
    enabled,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
