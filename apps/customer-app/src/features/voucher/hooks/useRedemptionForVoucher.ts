import { useQuery } from '@tanstack/react-query'
import { redemptionApi } from '@/lib/api/redemption'

export function useRedemptionForVoucher(voucherId: string | undefined, isRedeemed: boolean) {
  return useQuery({
    queryKey: ['redemptionForVoucher', voucherId],
    queryFn: async () => {
      const redemptions = await redemptionApi.getMyRedemptions({ limit: 100 })
      return redemptions.find(r => r.voucherId === voucherId) ?? null
    },
    enabled: !!voucherId && isRedeemed,
    staleTime: 120_000,
  })
}
