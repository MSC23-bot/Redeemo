import { useQuery } from '@tanstack/react-query'
import { discoveryApi, HomeFeedResponse } from '@/lib/api/discovery'

export function useHomeFeed(coords: { lat?: number; lng?: number }) {
  return useQuery<HomeFeedResponse>({
    queryKey: ['homeFeed', coords.lat, coords.lng],
    queryFn: () => discoveryApi.getHomeFeed(coords),
    staleTime: 5 * 60 * 1000,
  })
}
