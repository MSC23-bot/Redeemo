import { useQuery } from '@tanstack/react-query'
import { merchantApi } from '@/lib/api/merchant'

// React Query wrapper around `merchantApi.getProfile`. Mirrors the cefaf45
// shape (queryKey + staleTime) so M2 components migrate verbatim.
export function useMerchantProfile(
  id: string | undefined,
  opts: { lat?: number; lng?: number } = {},
) {
  return useQuery({
    queryKey:  ['merchantProfile', id, opts.lat, opts.lng],
    queryFn:   () => merchantApi.getProfile(id!, opts),
    enabled:   !!id,
    staleTime: 60_000,
  })
}
