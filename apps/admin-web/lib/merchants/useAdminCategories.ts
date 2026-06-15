'use client'

/**
 * useAdminCategories (B2.3) - React Query hook for GET /api/v1/admin/categories.
 *
 * Returns the categories an admin can assign as a merchant's primaryCategoryId,
 * each with an `eligible` flag (>= 2 active RMV templates). Pass `enabled: false`
 * to suppress the request (e.g. the edit dialog is closed). Gated `merchant:read`
 * server-side.
 */
import { useQuery } from '@tanstack/react-query'
import { adminCategoriesApi } from '@/lib/api/categories'
import type { AdminCategory } from '@/lib/api/categories'

export const adminCategoriesQueryKey = ['admin-categories'] as const

export type UseAdminCategoriesResult = {
  categories: AdminCategory[]
  isLoading: boolean
  isError: boolean
}

export function useAdminCategories(enabled: boolean): UseAdminCategoriesResult {
  const query = useQuery({
    queryKey: adminCategoriesQueryKey,
    queryFn: () => adminCategoriesApi.list(),
    enabled,
  })
  return {
    categories: query.data?.categories ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
