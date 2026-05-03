import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { merchantApi } from '@/lib/api/merchant'

// React Query wrapper around `merchantApi.getProfile`. Mirrors the cefaf45
// shape (queryKey + staleTime) so M2 components migrate verbatim.
//
// branchId (P2.2): scopes the cache key so different branch selections don't
// share entries. keepPreviousData keeps the old branch's content on screen
// while the new branch fetch is in-flight (spec §4.7 transitions).
export function useMerchantProfile(
  id: string | undefined,
  opts: { lat?: number; lng?: number; branchId?: string } = {},
) {
  return useQuery({
    // null sentinels make the key stable when opts are omitted.
    queryKey:        ['merchantProfile', id, opts.branchId ?? null, opts.lat ?? null, opts.lng ?? null],
    queryFn:         () => merchantApi.getProfile(id!, opts),
    enabled:         !!id,
    staleTime:       60_000,
    placeholderData: keepPreviousData,  // smooth chip-switch (spec §4.7 transitions)
  })
}
