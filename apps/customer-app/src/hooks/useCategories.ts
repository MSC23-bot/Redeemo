import { useQuery } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'

export const categoriesQueryKey = ['discovery', 'categories'] as const

export function useCategories() {
  return useQuery({
    queryKey: categoriesQueryKey,
    queryFn:  () => discoveryApi.getCategories(),
    staleTime: 5 * 60 * 1000,    // 5 min — taxonomy is locked, rarely changes
  })
}
