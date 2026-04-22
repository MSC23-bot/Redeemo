import { useQuery } from '@tanstack/react-query'
import { redemptionApi } from '@/lib/api/redemption'

export function useVoucherDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['voucherDetail', id],
    queryFn: () => redemptionApi.getVoucherDetail(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}
