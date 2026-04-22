import { useQuery } from '@tanstack/react-query'
import { discoveryApi, SearchParams, SearchResponse } from '@/lib/api/discovery'

export function useSearch(params: SearchParams, enabled = true) {
  return useQuery<SearchResponse>({
    queryKey: ['search', params],
    queryFn: () => discoveryApi.searchMerchants(params),
    enabled,
    staleTime: 2 * 60 * 1000,
  })
}
