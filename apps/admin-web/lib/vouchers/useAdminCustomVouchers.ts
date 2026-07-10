'use client'

/**
 * useAdminCustomVouchers: React Query hook for the admin custom (RCV) voucher
 * read (Merchant 360 A4). Fetches GET /admin/merchants/:id/vouchers, keyed per
 * merchant so each workspace caches independently. `enabled` is gated by the
 * caller on `can('merchant:read')` (the page already fail-closes on it), so a
 * role without the capability never fires the request; the backend
 * `requireAdminCapability` stays the enforcement.
 */
import { useQuery } from '@tanstack/react-query'
import { adminVouchersApi } from '@/lib/api/vouchers'
import type { ListAdminCustomResponse } from '@/lib/api/vouchers'

export const ADMIN_CUSTOM_VOUCHER_KEY = ['admin-merchant-custom-vouchers'] as const

export function adminCustomVoucherQueryKey(merchantId: string) {
  return [...ADMIN_CUSTOM_VOUCHER_KEY, merchantId] as const
}

export type UseAdminCustomVouchersResult = {
  data: ListAdminCustomResponse | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => void
}

export function useAdminCustomVouchers(
  merchantId: string,
  options?: { enabled?: boolean }
): UseAdminCustomVouchersResult {
  const query = useQuery({
    queryKey: adminCustomVoucherQueryKey(merchantId),
    queryFn: () => adminVouchersApi.listCustom(merchantId),
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
