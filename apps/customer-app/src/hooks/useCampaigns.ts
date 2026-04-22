import { useQuery } from '@tanstack/react-query'
import { discoveryApi, HomeFeedResponse } from '@/lib/api/discovery'

export function useCampaigns() {
  return useQuery<HomeFeedResponse['campaigns']>({
    queryKey: ['campaigns'],
    queryFn: () => discoveryApi.getCampaigns(),
    staleTime: 10 * 60 * 1000,
  })
}
