import { useQuery } from '@tanstack/react-query'
import { merchantApi } from '@/lib/api/merchant'

export function useMerchantProfile(id: string | undefined, opts: { lat?: number; lng?: number } = {}) {
  return useQuery({
    queryKey: ['merchantProfile', id, opts.lat, opts.lng],
    queryFn: () => merchantApi.getProfile(id!, opts),
    enabled: !!id,
    staleTime: 60_000,
  })
}
