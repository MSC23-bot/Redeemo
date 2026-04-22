import { useQuery } from '@tanstack/react-query'
import { merchantApi, type BranchDetail } from '@/lib/api/merchant'

export function useMerchantBranches(merchantId: string | undefined) {
  return useQuery({
    queryKey: ['merchantBranches', merchantId],
    queryFn: () => merchantApi.getBranches(merchantId!),
    enabled: !!merchantId,
    staleTime: 120_000,
  })
}
