import { useMutation, useQueryClient } from '@tanstack/react-query'
import { redemptionApi, type RedeemParams, type RedemptionResponse } from '@/lib/api/redemption'

export function useRedeem() {
  const queryClient = useQueryClient()

  return useMutation<RedemptionResponse, { code: string; message: string; status: number }, RedeemParams>({
    mutationFn: (params) => redemptionApi.redeem(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['voucherDetail', variables.voucherId] })
      queryClient.invalidateQueries({ queryKey: ['favouriteVouchers'] })
      queryClient.invalidateQueries({ queryKey: ['savings'] })
    },
  })
}
