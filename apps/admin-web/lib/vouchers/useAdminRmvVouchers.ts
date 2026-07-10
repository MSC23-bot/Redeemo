'use client'

/**
 * useAdminRmvVouchers: React Query hook for the admin RMV co-build read
 * (Merchant 360 A3). Fetches GET /admin/merchants/:id/vouchers/rmv, keyed per
 * merchant so each workspace caches independently. `enabled` is gated by the
 * caller on `can('merchant:read')` (the page already fail-closes on it), so a
 * role without the capability never fires the request; the backend
 * `requireAdminCapability` stays the enforcement.
 */
import { useQuery } from '@tanstack/react-query'
import { adminVouchersApi } from '@/lib/api/vouchers'
import type { ListAdminRmvResponse } from '@/lib/api/vouchers'

export const ADMIN_RMV_KEY = ['admin-merchant-rmv'] as const

export function adminRmvQueryKey(merchantId: string) {
  return [...ADMIN_RMV_KEY, merchantId] as const
}

export type UseAdminRmvVouchersResult = {
  data: ListAdminRmvResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useAdminRmvVouchers(
  merchantId: string,
  options?: { enabled?: boolean }
): UseAdminRmvVouchersResult {
  const query = useQuery({
    queryKey: adminRmvQueryKey(merchantId),
    queryFn: () => adminVouchersApi.listRmv(merchantId),
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
