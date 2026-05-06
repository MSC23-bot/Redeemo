import { useQuery } from '@tanstack/react-query'
import { voucherApi } from '@/lib/api/voucher'

/**
 * Voucher detail fetch — wraps `GET /api/v1/customer/vouchers/:id` in
 * React Query.
 *
 * Cache key: `['voucher', voucherId]`. Independent from the merchant-
 * profile cache so opening / closing voucher detail doesn't invalidate
 * branch-context data. `staleTime: 30s` keeps `isRedeemedThisCycle`
 * responsive after a redemption (M2 will also call
 * `queryClient.invalidateQueries(['voucher', voucherId])` from
 * `useRedeem` to refresh state #3 immediately).
 *
 * Per the locked branch-attribution contract (plan §11), this hook
 * intentionally does NOT carry branch data. Branch context comes from
 * `useMerchantProfile(merchant.id, { branchId })` — hosted by the
 * VoucherDetailScreen orchestrator.
 */
export function useCustomerVoucher(voucherId: string | undefined) {
  return useQuery({
    queryKey: ['voucher', voucherId],
    queryFn: () => {
      if (!voucherId) throw new Error('voucherId is required')
      return voucherApi.getById(voucherId)
    },
    enabled: !!voucherId,
    staleTime: 30_000,
  })
}
