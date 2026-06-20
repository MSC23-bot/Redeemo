import { useQuery } from '@tanstack/react-query'
import { getMerchantProfile } from '@/lib/api/profile'

// M1 Slice 5: the lifecycle source (GET /merchant/profile, Bearer). React Query keys
// it ['merchantProfile'] so the shell (StatusPill) and the home page share one fetch.
// Only fetched once authenticated.
export function useMerchantProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['merchantProfile'],
    queryFn: getMerchantProfile,
    enabled,
    staleTime: 60_000,
  })
}
