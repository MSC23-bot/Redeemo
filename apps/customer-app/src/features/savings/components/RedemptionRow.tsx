import React from 'react'
import { View, StyleSheet } from 'react-native'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Text } from '@/design-system/Text'
import { spacing, radius, color as tokenColor } from '@/design-system/tokens'
import type { SavingsRedemption } from '@/lib/api/savings'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

type BadgeType = 'show-to-staff' | 'validated' | 'plain'

function getBadgeType(redemption: SavingsRedemption): BadgeType {
  const now = Date.now()
  if (!redemption.isValidated) {
    const redeemed = new Date(redemption.redeemedAt).getTime()
    if (now - redeemed <= TWENTY_FOUR_HOURS) return 'show-to-staff'
  }
  if (redemption.isValidated && redemption.validatedAt) {
    const validated = new Date(redemption.validatedAt).getTime()
    if (now - validated <= TWENTY_FOUR_HOURS) return 'validated'
  }
  return 'plain'
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function voucherTypeLabel(vt: string): string {
  const map: Record<string, string> = {
    BOGO: 'Buy One Get One',
    SPEND_AND_SAVE: 'Spend & Save',
    DISCOUNT_FIXED: 'Discount',
    DISCOUNT_PERCENT: 'Discount',
    FREEBIE: 'Freebie',
    PACKAGE_DEAL: 'Package Deal',
    TIME_LIMITED: 'Time-Limited',
    REUSABLE: 'Reusable',
  }
  return map[vt] ?? vt
}

type Props = {
  redemption: SavingsRedemption
  onPress: (voucherId: string) => void
}

export function RedemptionRow({ redemption, onPress }: Props) {
  const badge = getBadgeType(redemption)
  const vtLabel = voucherTypeLabel(redemption.voucher.voucherType)
  // Use brandRose as fallback color for logo background
  const logoColor =
    tokenColor.voucher.byType[redemption.voucher.voucherType as keyof typeof tokenColor.voucher.byType] ??
    tokenColor.brandRose

  return (
    <PressableScale
      onPress={() => onPress(redemption.voucher.id)}
      accessibilityLabel={`${redemption.merchant.businessName}, ${vtLabel}, £${redemption.estimatedSaving.toFixed(2)} saved, ${relativeTime(redemption.redeemedAt)}`}
      style={styles.row}
    >
      {/* Logo placeholder */}
      <View style={[styles.logo, { backgroundColor: `${logoColor}18` }]}>
        <Text style={[styles.logoInitial, { color: logoColor }]}>
          {redemption.merchant.businessName.charAt(0)}
        </Text>
      </View>

      {/* Text content */}
      <View style={styles.content}>
        <Text variant="body.sm" style={styles.merchantName}>{redemption.merchant.businessName}</Text>
        <Text variant="body.sm" style={styles.meta}>
          {vtLabel} · {relativeTime(redemption.redeemedAt)}
        </Text>
      </View>

      {/* Saving + badge */}
      <View style={styles.right}>
        <Text style={styles.saving}>+£{redemption.estimatedSaving.toFixed(2)}</Text>
        {badge === 'show-to-staff' && (
          <View style={styles.badgeAmber}>
            <Text style={styles.badgeAmberText}>Show to staff</Text>
          </View>
        )}
        {badge === 'validated' && (
          <View style={styles.badgeGreen}>
            <Text style={styles.badgeGreenText}>Validated ✓</Text>
          </View>
        )}
        {badge === 'plain' && (
          <Text style={styles.plainBadge}>Redeemed</Text>
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    gap: spacing[3],
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
