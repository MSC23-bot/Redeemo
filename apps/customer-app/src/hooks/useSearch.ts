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
 *
 * `options.staleTime` — Map Phase 2 S0 per-call override. Map's filtered
 * bbox-mode path (non-scope filters active on Map) shares the same
 * "viewport supply doesn't change minute-to-minute" reasoning as
 * `useInAreaBranches`, which already runs at 120s. Left unset, the hook
 * keeps its default 30s (SearchScreen / CategoryResultsScreen semantics
 * are unaffected — this is an opt-in override, not a global change).
 */
export function useSearch(
  params:  SearchParams,
  enabled: boolean = true,
  options: { keepPreviousData?: boolean; staleTime?: number } = {},
) {
  return useQuery({
    queryKey: searchQueryKey(params),
    queryFn:  () => discoveryApi.searchMerchants(params),
    enabled,
    staleTime: options.staleTime ?? 30 * 1000,   // 30s default — search results refresh on type
    ...(options.keepPreviousData ? { placeholderData: keepPreviousData } : {}),
  })
}
