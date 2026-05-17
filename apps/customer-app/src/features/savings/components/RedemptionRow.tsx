import React from 'react'
import { View, StyleSheet } from 'react-native'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Text } from '@/design-system/Text'
import { spacing, radius, color as tokenColor } from '@/design-system/tokens'
import { voucherTypeLabel } from '@/features/voucher/utils/voucherTheme'
import { PRESENTATION_WINDOW_MS } from '@/features/voucher/utils/presentationWindow'
import { branchShortName } from '@/features/merchant/utils/branchShortName'
import type { SavingsRedemption } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2) — Redemption history row.
//
// Three locked adaptations vs the Revision-1 reference branch:
//   1. Show-to-staff badge window: 24h → 2h via PRESENTATION_WINDOW_MS.
//      Matches §AE5 Voucher Detail show-to-staff CTA hide boundary —
//      the Savings badge must not promise an action the destination
//      won't honour.
//   2. Voucher type label: inline map → canonical `voucherTypeLabel`
//      from `@/features/voucher/utils/voucherTheme`. Covers all
//      current types including TIME_LIMITED + REUSABLE.
//   3. Meta line: type + relative-time → type + branchShortName +
//      relative-time.  Multi-branch merchants must be distinguishable
//      on the dense row.
//
// Validated badge stays 24h (celebration of a completed action, not
// an in-progress affordance).
//
// Design-fidelity: row is a white card with a 1px #E5E7EB border and
// 12px radius — matches the brainstorm `savings-design.html` visual
// treatment (each redemption is its own surface) rather than the
// ref-branch flat treatment.

const VALIDATED_WINDOW_MS = 24 * 60 * 60 * 1000

type BadgeType = 'show-to-staff' | 'validated' | 'plain'

function getBadgeType(redemption: SavingsRedemption, now: number = Date.now()): BadgeType {
  if (!redemption.isValidated) {
    const redeemed = new Date(redemption.redeemedAt).getTime()
    if (now - redeemed <= PRESENTATION_WINDOW_MS) return 'show-to-staff'
  }
  if (redemption.isValidated && redemption.validatedAt) {
    const validated = new Date(redemption.validatedAt).getTime()
    if (now - validated <= VALIDATED_WINDOW_MS) return 'validated'
  }
  return 'plain'
}

function relativeTime(dateStr: string, now: number = Date.now()): string {
  const diff = now - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Props = {
  redemption: SavingsRedemption
  onPress: (voucherId: string) => void
}

export function RedemptionRow({ redemption, onPress }: Props) {
  const badge = getBadgeType(redemption)
  const vtLabel = voucherTypeLabel(redemption.voucher.voucherType)
  const branchShort = branchShortName(redemption.branch.name)
  const relTime = relativeTime(redemption.redeemedAt)

  const logoColor =
    tokenColor.voucher?.byType?.[redemption.voucher.voucherType as keyof typeof tokenColor.voucher.byType] ??
    tokenColor.brandRose

  const a11yLabel =
    `${redemption.merchant.businessName}, ${branchShort}, ${vtLabel}, £${redemption.estimatedSaving.toFixed(2)} saved, ${relTime}`

  return (
    <PressableScale
      onPress={() => onPress(redemption.voucher.id)}
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
      style={styles.row}
      testID={`savings-redemption-row-${redemption.id}`}
    >
      <View style={[styles.logo, { backgroundColor: `${logoColor}18` }]}>
        <Text style={[styles.logoInitial, { color: logoColor }]}>
          {redemption.merchant.businessName.charAt(0)}
        </Text>
      </View>

      <View style={styles.content}>
        <Text variant="body.sm" style={styles.merchantName}>
          {redemption.merchant.businessName}
        </Text>
        <Text variant="body.sm" style={styles.meta} numberOfLines={1}>
          {vtLabel} · {branchShort} · {relTime}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.saving}>+£{redemption.estimatedSaving.toFixed(2)}</Text>
        {badge === 'show-to-staff' && (
          <View style={styles.badgeAmber} testID="savings-row-badge-show-to-staff">
            <Text style={styles.badgeAmberText}>Show to staff</Text>
          </View>
        )}
        {badge === 'validated' && (
          <View style={styles.badgeGreen} testID="savings-row-badge-validated">
            <Text style={styles.badgeGreenText}>Validated ✓</Text>
          </View>
        )}
        {badge === 'plain' && (
          <Text style={styles.plainBadge} testID="savings-row-badge-plain">Redeemed</Text>
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 18,
  },
  content: {
    flex: 1,
    gap: 1,
  },
  merchantName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  meta: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 16,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeAmberText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: '#B45309',
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeGreenText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: '#16A34A',
  },
  plainBadge: {
    fontFamily: 'Lato-Regular',
    fontSize: 11,
    color: '#9CA3AF',
  },
})
