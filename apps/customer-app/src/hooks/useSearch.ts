import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { discoveryApi, type SearchParams } from '@/lib/api/discovery'

export const searchQueryKey = (params: SearchParams) =>
  ['discovery', 'search', params] as const

/**
 * `options.keepPreviousData` — opt-in: when true, the hook surfaces the
 * previous query's results while the next params are in-flight. Used by
 * MapScreen's filtered bbox-mode to avoid blank-map flicker during
 * pan/zoom (§AY).
 *
 * DEFAULT IS FALSE because SearchScreen + CategoryResultsScreen rely on
 * the standard clear-on-key-change behaviour (typing a new query must
 * not leave the previous results visible during the next fetch).
 */
export function useSearch(
  params:  SearchParams,
  enabled: boolean = true,
  options: { keepPreviousData?: boolean } = {},
) {
  return useQuery({
    queryKey: searchQueryKey(params),
    queryFn:  () => discoveryApi.searchMerchants(params),
    enabled,
    staleTime: 30 * 1000,        // 30s — search results refresh on type
    ...(options.keepPreviousData ? { placeholderData: keepPreviousData } : {}),
  })
}
