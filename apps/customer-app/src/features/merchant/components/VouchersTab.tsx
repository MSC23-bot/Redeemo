/**
 * VouchersTab — merchant-profile voucher list.
 *
 * ⚠️ CONTRACT (locked M4c, 2026-05-11): the `vouchers` prop MUST be
 * pre-sorted by the caller. The single production caller today is
 * `MerchantProfileScreen`, which applies the M4c `sortMerchantVouchers`
 * utility via `useMemo` and passes the result here. The previous
 * internal "redeemed pushed last" sort has been REMOVED — `vouchers` is
 * now rendered in input order so the screen-level five-bucket sort
 * (TIME_LIMITED urgent → active → non-TL active → outside-window →
 * redeemed; expired filtered) flows through unchanged.
 *
 * If a new caller wires this tab without `sortMerchantVouchers`, the
 * list will render in API order — likely wrong, but silent. Add the
 * util at the call site OR re-introduce the internal sort if the new
 * caller can't reasonably pre-sort.
 *
 * See: `src/features/merchant/utils/voucherCardSort.ts` for the util,
 * spec §6.3 for the locked bucket order.
 *
 * Phase 3C.1g M2.9a — `VoucherCardWrapper` retired.  The wrapper used
 * to host a `useFavourite('voucher', ...)` call so the per-card heart
 * could toggle.  After M2.9a the heart is owned by `<FavouriteHeart>`
 * inside `<VoucherCard>` itself (spec §7.2.1), and the voucher's
 * heart state comes from the new `voucher.isFavourited` field on the
 * `/merchants/:id` payload (M2.9a additive backend emit).  The wrapper
 * is no longer needed; `<VoucherCard>` mounts directly here.
 */
import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { VoucherCard } from './VoucherCard'
import { VoucherContextLabel } from './VoucherContextLabel'
import type { MerchantVoucher } from '@/lib/api/merchant'

type Props = {
  vouchers: MerchantVoucher[]
  redeemedVoucherIds: Set<string>
  onVoucherPress: (voucherId: string) => void
  /** Short name of the selected branch (from branchShortName()). */
  branchShortName: string
  /** True when the merchant has more than one branch. */
  isMultiBranch:   boolean
  /** Change to fire the fade animation — pass selectedBranch.id. */
  switchTrigger?:  string | null
  /** Phase 3C.1g M2.9a — drives `<FavouriteHeart>` contextualQueryKey. */
  merchantId:      string
  branchId:        string
}

export function VouchersTab({
  vouchers,
  redeemedVoucherIds,
  onVoucherPress,
  branchShortName,
  isMultiBranch,
  switchTrigger,
  merchantId,
  branchId,
}: Props) {
  if (vouchers.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="heading.md" color="secondary" align="center">No vouchers available yet</Text>
        <Text variant="body.sm" color="tertiary" meta align="center" style={{ marginTop: 8 }}>
          Check back soon for exclusive offers
        </Text>
      </View>
    )
  }

  // M4c (locked 2026-05-11): the previous internal sort that pushed
  // redeemed-this-cycle vouchers to the end of the list is REMOVED in
  // favour of `sortMerchantVouchers`, applied one level up in
  // `MerchantProfileScreen`. This tab is now a dumb consumer of the
  // already-sorted list — TIME_LIMITED urgent at the top, then active,
  // then non-TL active, then TL outside-window, then redeemed, expired
  // filtered out entirely (spec §6.3).
  const sorted = vouchers

  // PR-B T8h owner direction: when a voucher is redeemed this cycle,
  // the "{n} offers available" copy must reflect what's still
  // redeemable, not the total.  Subtract redeemed-this-cycle vouchers
  // from the count.  The label itself also handles the all-redeemed
  // edge case ("All offers redeemed this cycle") so the user sees a
  // clear product statement instead of "0 offers available".
  const availableCount = vouchers.length - redeemedVoucherIds.size

  return (
    <>
      <VoucherContextLabel
        count={availableCount}
        totalCount={vouchers.length}
        branchShortName={branchShortName}
        isMultiBranch={isMultiBranch}
        hasVouchers={true}
        switchTrigger={switchTrigger}
      />
      <View style={styles.list}>
        {/* Round 5 §1 (per /interaction-design): list entry stagger.
            Each voucher card fades in with a 60ms delay per index —
            cascading entrance that orients the user toward the
            first card while letting subsequent ones settle in.
            Reanimated's entering animations skip automatically when
            the OS reports reduced-motion. */}
        {sorted.map((v, i) => (
          <Animated.View key={v.id} entering={FadeInDown.delay(i * 60).duration(280)}>
            <VoucherCard
              voucher={v}
              isRedeemed={redeemedVoucherIds.has(v.id)}
              onPress={() => onVoucherPress(v.id)}
              merchantId={merchantId}
              branchId={branchId}
            />
          </Animated.View>
        ))}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 16,
  },
  empty: {
    paddingVertical: 60,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
  },
})
