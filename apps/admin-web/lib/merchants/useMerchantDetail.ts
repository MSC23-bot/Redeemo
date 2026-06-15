'use client'

/**
 * useMerchantDetail - React Query hook for a single merchant's detail (B2.1).
 *
 * Fetches GET /api/v1/admin/merchants/:id (the merchant record + its branches).
 * Pass `enabled: false` to suppress the request (session not ready / no
 * merchant:read). Keyed per merchant id so each merchant caches independently.
 * The backend `requireAdminCapability` stays the enforcement; the gate avoids a
 * guaranteed 403 for a role without the capability.
 */
import { useQuery } from '@tanstack/react-query'
import { merchantsApi } from '@/lib/api/merchants'
import type { MerchantDetail } from '@/lib/api/merchants'

export function merchantDetailQueryKey(id: string) {
  return ['admin-merchant-detail', id] as const
}

export type UseMerchantDetailResult = {
  data: MerchantDetail | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useMerchantDetail(id: string, enabled: boolean): UseMerchantDetailResult {
  const query = useQuery({
    queryKey: merchantDetailQueryKey(id),
    queryFn: () => merchantsApi.getById(id),
    enabled,
  })
  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}
