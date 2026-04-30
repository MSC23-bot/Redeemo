import { useQuery } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'

export const homeFeedQueryKey = (opts: { lat?: number; lng?: number }) =>
  ['discovery', 'home', opts.lat ?? null, opts.lng ?? null] as const

export function useHomeFeed(opts: { lat?: number; lng?: number } = {}) {
  return useQuery({
    queryKey: homeFeedQueryKey(opts),
    queryFn:  () => discoveryApi.getHomeFeed(opts),
    staleTime: 60 * 1000,        // 1 min — home feed refreshes frequently
  })
}
