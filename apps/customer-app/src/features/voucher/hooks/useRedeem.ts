import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  redemptionApi,
  type RedeemResponse,
  type RedemptionError,
} from '@/lib/api/redemption'

/**
 * Local-only error code thrown by the hook when `getBranchId()` returns
 * null at mutation time. The UI catches this and reopens the branch
 * picker instead of letting the request fly with a missing branch — which
 * would be a permanent attribution bug (VoucherRedemption.branchId is
 * immutable on the backend).
 */
export type NullBranchError = { code: 'NULL_BRANCH'; message: string }

export type UseRedeemError = RedemptionError | NullBranchError

type UseRedeemOpts = {
  voucherId: string
  /**
   * Branch-id source READ AT MUTATION TIME. Caller passes a getter so
   * the hook resolves `branchId` against the LATEST state when
   * `mutate()` fires, not against a value captured at hook construction
   * time. This is the branch-attribution contract pinned in the M2 plan
   * §11 — the redemption branch must come from whatever the user is
   * looking at WHEN they tap submit, not earlier.
   *
   * Recommended priority at the call site (per VoucherDetailScreen wiring):
   *   pickerConfirmedBranchId  // local/ref state from picker confirm
   *   ?? branchIdParam          // URL ?branch=<id>
   *   ?? merchant.selectedBranch?.id  // cold-open fallback
   *   ?? null
   */
  getBranchId: () => string | null
}

/**
 * Voucher redemption mutation hook.
 *
 * On success, invalidates:
 *   - ['voucher', voucherId]      — voucher.isRedeemedThisCycle flips
 *   - ['merchantProfile']          — voucher cards on Merchant Profile
 *                                    Voucher tab carry isRedeemedThisCycle
 *                                    per voucher; without this invalidation
 *                                    the cards show stale "redeem"
 *                                    affordance until staleTime (60 s)
 *                                    expires or the user pull-to-refreshes
 *                                    (PR-B T8h fix).  Wide invalidation
 *                                    by intent — at most 1-2 merchant
 *                                    profiles are cached at any time, so
 *                                    the refetch cost is negligible
 *                                    compared to a delayed-update bug.
 *   - ['savings']                  — lifetime / monthly aggregates
 *   - ['favouriteVouchers']        — voucher card chip state
 *   - ['my-redemptions']           — redemption history list
 *
 * On error, the hook does NOT invalidate any caches — callers handle the
 * typed RedemptionError or NullBranchError as needed (the
 * VoucherDetailScreen wiring routes ALREADY_REDEEMED to a refetch +
 * state-3 transition; PinEntrySheet shows INVALID_PIN /
 * PIN_RATE_LIMIT_EXCEEDED inline).
 */
export function useRedeem({ voucherId, getBranchId }: UseRedeemOpts) {
  const qc = useQueryClient()
  return useMutation<RedeemResponse, UseRedeemError, { pin: string }>({
    mutationFn: async ({ pin }) => {
      const branchId = getBranchId()
      if (!branchId) {
        // Defensive: never let a request fly with a missing branch.
        // VoucherRedemption.branchId is immutable on the backend, so a
        // wrong/missing branch here would be a permanent attribution bug.
        throw {
          code: 'NULL_BRANCH' as const,
          message: 'Please pick a branch before redeeming.',
        }
      }
      return redemptionApi.redeem({ voucherId, branchId, pin })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voucher', voucherId] })
      qc.invalidateQueries({ queryKey: ['merchantProfile'] })
      qc.invalidateQueries({ queryKey: ['savings'] })
      qc.invalidateQueries({ queryKey: ['favouriteVouchers'] })
      qc.invalidateQueries({ queryKey: ['my-redemptions'] })
    },
  })
}
