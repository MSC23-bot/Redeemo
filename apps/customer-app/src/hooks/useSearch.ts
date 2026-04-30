import { useQuery } from '@tanstack/react-query'
import { discoveryApi, type SearchParams } from '@/lib/api/discovery'

export const searchQueryKey = (params: SearchParams) =>
  ['discovery', 'search', params] as const

export function useSearch(params: SearchParams, enabled: boolean = true) {
  return useQuery({
    queryKey: searchQueryKey(params),
    queryFn:  () => discoveryApi.searchMerchants(params),
    enabled,
    staleTime: 30 * 1000,        // 30s — search results refresh on type
  })
}
