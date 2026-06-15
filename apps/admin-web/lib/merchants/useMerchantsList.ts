'use client'

/**
 * useMerchantsList — React Query hook for the WP2 merchants directory.
 *
 * Fetches GET /api/v1/admin/merchants with the given filters (name search +
 * status + pagination). Keyed on the filter tuple so each distinct query caches
 * independently. `enabled` is gated by the caller on `can('merchant:read')` so a
 * role without the capability never fires the request (the backend
 * `requireAdminCapability` stays the enforcement; this avoids a guaranteed 403).
 *
 * No background polling — the directory is not a live work-queue. The caller can
 * refetch on demand.
 */
import { useQuery } from '@tanstack/react-query'
import { merchantsApi } from '@/lib/api/merchants'
import type { ListMerchantsResponse, MerchantStatusFilter } from '@/lib/api/merchants'

export const MERCHANTS_LIST_KEY = ['admin-merchants'] as const

export type MerchantsListFilters = {
  q?: string
  status?: MerchantStatusFilter
  page?: number
  pageSize?: number
}

export type UseMerchantsListResult = {
  data: ListMerchantsResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useMerchantsList(
  filters: MerchantsListFilters,
  options?: { enabled?: boolean }
): UseMerchantsListResult {
  const query = useQuery({
    queryKey: [...MERCHANTS_LIST_KEY, filters],
    queryFn: () => merchantsApi.list(filters),
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
