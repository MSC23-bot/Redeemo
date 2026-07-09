'use client'

/**
 * useRedemptions: React Query hook for the D67 admin redemptions list.
 *
 * Fetches GET /api/v1/admin/redemptions with the given filters + pagination.
 * Keyed on the filter tuple so each distinct query caches independently.
 * `enabled` is gated by the caller on `can('redemption:read')` so a role
 * without the capability never fires the request (the backend
 * `requireAdminCapability` stays the enforcement; this avoids a guaranteed 403).
 *
 * No background polling; mirrors useMerchantsList (a directory/ops list, not
 * a live work-queue). The caller can refetch on demand.
 */
import { useQuery } from '@tanstack/react-query'
import { redemptionsApi } from '@/lib/api/redemptions'
import type { ListRedemptionsResponse, RedemptionStatusFilter } from '@/lib/api/redemptions'

export const REDEMPTIONS_LIST_KEY = ['admin-redemptions'] as const

export type RedemptionsListFilters = {
  status?: RedemptionStatusFilter
  code?: string
  includeTest?: boolean
  limit?: number
  offset?: number
}

export type UseRedemptionsResult = {
  data: ListRedemptionsResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useRedemptions(
  filters: RedemptionsListFilters,
  options?: { enabled?: boolean }
): UseRedemptionsResult {
  const query = useQuery({
    queryKey: [...REDEMPTIONS_LIST_KEY, filters],
    queryFn: () => redemptionsApi.list(filters),
    enabled: options?.enabled ?? true,
    placeholderData: (prev) => prev,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}
