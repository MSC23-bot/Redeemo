import { useQuery } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'

type CategoryMerchantsParams = {
  scope?:  'nearby' | 'city' | 'platform'
  lat?:    number
  lng?:    number
  limit?:  number
  offset?: number
}

export const categoryMerchantsQueryKey = (id: string, params: CategoryMerchantsParams) =>
  ['discovery', 'category-merchants', id, params] as const

export function useCategoryMerchants(
  id: string | null | undefined,
  params: CategoryMerchantsParams = {},
) {
  return useQuery({
    queryKey: categoryMerchantsQueryKey(id ?? '', params),
    queryFn:  () => discoveryApi.getCategoryMerchants(id as string, params),
    enabled:  Boolean(id),
    staleTime: 60 * 1000,        // 1 min
  })
}
