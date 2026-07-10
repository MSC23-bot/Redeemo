'use client'

/**
 * useAdminStaff: React Query hook for the admin staff roster read (Merchant 360
 * A4). Fetches GET /admin/merchants/:id/staff, keyed per merchant. `enabled` is
 * gated by the caller on `can('merchant:read')` (the page fail-closes on it), so
 * a role without the capability never fires the request; the backend
 * `requireAdminCapability` stays the enforcement.
 */
import { useQuery } from '@tanstack/react-query'
import { adminStaffApi } from '@/lib/api/staff'
import type { AdminStaffResponse } from '@/lib/api/staff'

export const ADMIN_STAFF_KEY = ['admin-merchant-staff'] as const

export function adminStaffQueryKey(merchantId: string) {
  return [...ADMIN_STAFF_KEY, merchantId] as const
}

export type UseAdminStaffResult = {
  data: AdminStaffResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useAdminStaff(
  merchantId: string,
  options?: { enabled?: boolean }
): UseAdminStaffResult {
  const query = useQuery({
    queryKey: adminStaffQueryKey(merchantId),
    queryFn: () => adminStaffApi.list(merchantId),
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
