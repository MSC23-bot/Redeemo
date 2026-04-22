import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { elevation } from '@/design-system/tokens'
import type { FavouriteVoucherItem } from '@/lib/api/favourites'
import type { VoucherType } from '@/lib/api/savings'

type TypeStyle = {
  gradient: readonly [string, string]
  stripe: string
  badgeColor: string
  badgeBg: string
}

const TYPE_STYLES: Record<VoucherType, TypeStyle> = {
  BOGO:             { gradient: ['#F5F3FF', '#EDE9FE'], stripe: '#7C3AED', badgeColor: '#7C3AED', badgeBg: 'rgba(124,58,237,0.08)' },
  DISCOUNT_FIXED:   { gradient: ['#FEF2F2', '#FEE2E2'], stripe: '#E20C04', badgeColor: '#E20C04', badgeBg: 'rgba(226,12,4,0.08)'  },
  DISCOUNT_PERCENT: { gradient: ['#FEF2F2', '#FEE2E2'], stripe: '#E20C04', badgeColor: '#E20C04', badgeBg: 'rgba(226,12,4,0.08)'  },
  FREEBIE:          { gradient: ['#F0FDF4', '#DCFCE7'], stripe: '#16A34A', badgeColor: '#16A34A', badgeBg: 'rgba(22,163,74,0.08)'  },
  SPEND_AND_SAVE:   { gradient: ['#FFF7ED', '#FFEDD5'], stripe: '#E84A00', badgeColor: '#E84A00', badgeBg: 'rgba(232,74,0,0.08)'   },
  PACKAGE_DEAL:     { gradient: ['#EFF6FF', '#DBEAFE'], stripe: '#2563EB', badgeColor: '#2563EB', badgeBg: 'rgba(37,99,235,0.08)'  },
  TIME_LIMITED:     { gradient: ['#FFFBEB', '#FEF3C7'], stripe: '#D97706', badgeColor: '#D97706', badgeBg: 'rgba(217,119,6,0.08)'  },
  REUSABLE:         { gradient: ['#F0FDFA', '#CCFBF1'], stripe: '#0D9488', badgeColor: '#0D9488', badgeBg: 'rgba(13,148,136,0.08)' },
}

const UNAVAILABLE_STYLE: TypeStyle = {
  gradient: ['#F9FAFB', '#F3F4F6'],
  stripe: '#D1D5DB',
  badgeColor: '#9CA3AF',
  badgeBg: 'transparent',
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BOGO', DISCOUNT_FIXED: 'DISCOUNT', DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE', SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE', TIME_LIMITED: 'TIME LIMITED', REUSABLE: 'REUSABLE',
}

function isWithin30Days(expiresAt: string): boolean {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
}

function formatExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Props = {
  voucher: FavouriteVoucherItem
  onPress: (id: string) => void
  onRemove: (id: string) => void
}

export function VoucherFavCard({ voucher, onPress, onRemove }: Props) {
  const isUnavailable = voucher.isUnavailable
  const ts = isUnavailable ? UNAVAILABLE_STYLE : (TYPE_STYLES[voucher.type] ?? TYPE_STYLES.FREEBIE)
  const showExpiry = !isUnavailable && voucher.expiresAt && isWithin30Days(voucher.expiresAt)

  return (
    <PressableScale
      onPress={() => onPress(voucher.id)}
      style={styles.cardWrapper}
      accessibilityLabel={
        isUnavailable
          ? `${voucher.title} at ${voucher.merchant.businessName}, unavailable`
          : `${voucher.title} at ${voucher.merchant.businessName}, save £${voucher.estimatedSaving}`
      }
    >
      {/* Left stripe */}
      <View style={[styles.stripe, { backgroundColor: ts.stripe }]} />

      <LinearGradient
        colors={ts.gradient as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Merchant row */}
        <View style={styles.merchantRow}>
          <View style={[styles.merchantLogo, { backgroundColor: '#D1D5DB' }]} />
          <Text style={styles.merchantName} numberOfLines={1}>
            {voucher.merchant.businessName}
          </Text>
          {/* Heart */}
          <Pressable
            onPress={() => onRemove(voucher.id)}
            accessibilityLabel={`Remove ${voucher.title} from favourites`}
            accessibilityRole="button"
            hitSlop={8}
            style={[styles.heartButton, { backgroundColor: ts.badgeBg || 'rgba(0,0,0,0.04)' }]}
          >
            <Heart size={12} color="#E20C04" fill="#E20C04" />
          </Pressable>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={1}>{voucher.title}</Text>

        {/* Description */}
        {voucher.description && (
          <Text style={styles.description} numberOfLines={1}>{voucher.description}</Text>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <View style={[styles.typeBadge, { borderColor: ts.badgeColor }]}>
              <Text style={[styles.typeText, { color: ts.badgeColor }]}>
                {TYPE_LABELS[voucher.type] ?? voucher.type}
              </Text>
            </View>

            {!isUnavailable && (
              <View style={[styles.savePill, { backgroundColor: ts.stripe }]}>
                <Text style={styles.saveText}>Save £{voucher.estimatedSaving.toFixed(0)}</Text>
              </View>
            )}
          </View>

          <View style={styles.footerRight}>
            {isUnavailable ? (
              <Text style={styles.unavailableLabel}>Unavailable</Text>
            ) : voucher.isRedeemedInCurrentCycle ? (
              <Text style={styles.redeemedLabel}>Redeemed</Text>
            ) : (
              <View style={styles.redeemRow}>
                {showExpiry && (
                  <Text style={[styles.expiryLabel, { color: '#D97706' }]}>
                    Exp {formatExpiry(voucher.expiresAt!)}
                  </Text>
                )}
                <View style={styles.redeemCta}>
                  <Text style={styles.redeemText}>Redeem</Text>
                  <ChevronRight size={10} color="#E20C04" />
                </View>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  cardWrapper: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    ...elevation.sm,
  },
  stripe: { width: 4 },
  card: { flex: 1, padding: 12, gap: 4 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  merchantLogo: { width: 18, height: 18, borderRadius: 5 },
  merchantName: { flex: 1, fontSize: 10, fontWeight: '600', color: '#6B7280' },
  heartButton: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 13, fontFamily: 'Lato-Bold', color: '#010C35', letterSpacing: -0.2, lineHeight: 17 },
  description: { fontSize: 10, color: '#9CA3AF', lineHeight: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerRight: { alignItems: 'flex-end' },
  typeBadge: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  savePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  saveText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  redeemCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  redeemText: { fontSize: 10, fontWeight: '700', color: '#E20C04' },
  redeemedLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  unavailableLabel: { fontSize: 12, fontStyle: 'italic', color: '#9CA3AF' },
  expiryLabel: { fontSize: 9, fontWeight: '600' },
})
