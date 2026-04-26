import { useQuery } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'

export function useInterestsCatalogue() {
  return useQuery({
    queryKey: ['interests-catalogue'],
    queryFn: () => profileApi.getAvailableInterests(),
    staleTime: 60 * 60 * 1000,
  })
}
