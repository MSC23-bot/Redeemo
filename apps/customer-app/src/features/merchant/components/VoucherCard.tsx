import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, Tag, ArrowRight, CheckCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { VoucherCardStub } from './VoucherCardStub'
import type { VoucherType } from '@/lib/api/redemption'
import type { MerchantVoucher } from '@/lib/api/merchant'

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'Buy One Get One',
  DISCOUNT_FIXED: 'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE: 'Freebie',
  SPEND_AND_SAVE: 'Spend & Save',
  PACKAGE_DEAL: 'Package Deal',
  TIME_LIMITED: 'Time Limited',
  REUSABLE: 'Reusable',
}

type Props = {
  voucher: MerchantVoucher
  isRedeemed: boolean
  isFavourited: boolean
  onPress: () => void
  onToggleFavourite: () => void
}

export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const typeKey = voucher.type as VoucherType
  const accentColor = color.voucher.byType[typeKey] ?? color.brandRose
  const gradientPair = isRedeemed
    ? color.voucher.gradientByType.REDEEMED
    : (color.voucher.gradientByType[typeKey] ?? ['#FEF2F2', '#FEE2E2'])
  const badgeTextColor = isRedeemed
    ? color.voucher.badgeTextByType.REDEEMED
    : (color.voucher.badgeTextByType[typeKey] ?? '#B91C1C')

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const handleFav = useCallback(() => {
    lightHaptic()
    onToggleFavourite()
  }, [onToggleFavourite])

  const expiryLabel = voucher.expiryDate
    ? `Expires ${new Date(voucher.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : null

  const stubPills: Array<{ label: string; type: 'expiry' | 'term' | 'redeemed' | 'view-code' }> = []
  if (isRedeemed) {
    stubPills.push({ label: 'Redeemed this cycle', type: 'redeemed' })
    stubPills.push({ label: 'View code', type: 'view-code' })
  } else {
    if (expiryLabel) stubPills.push({ label: expiryLabel, type: 'expiry' })
    if (voucher.terms) stubPills.push({ label: 'T&Cs apply', type: 'term' })
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, isRedeemed && styles.cardRedeemed]}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_LABELS[typeKey]} voucher: ${voucher.title}. Save £${voucher.estimatedSaving}${isRedeemed ? '. Already redeemed this cycle' : ''}`}
    >
      <LinearGradient
        colors={gradientPair}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.stripe, { backgroundColor: isRedeemed ? '#9CA3AF' : accentColor }]} />

      <Pressable
        onPress={handleFav}
        style={[styles.favBtn, isFavourited && styles.favBtnActive]}
        accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
      >
        <Heart size={16} color={isFavourited ? '#E20C04' : '#9CA3AF'} fill={isFavourited ? '#E20C04' : 'none'} />
      </Pressable>

      {isRedeemed && (
        <View style={styles.stamp}>
          <CheckCircle size={12} color="#9CA3AF" />
          <Text variant="label.md" style={styles.stampText}>REDEEMED</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={[styles.typeBadge, { borderColor: isRedeemed ? '#9CA3AF' : accentColor }]}>
          <Tag size={10} color={badgeTextColor} />
          <Text variant="label.md" style={[styles.typeText, { color: badgeTextColor }]}>
            {TYPE_LABELS[typeKey]}
          </Text>
        </View>

        <Text variant="heading.sm" style={styles.title}>{voucher.title}</Text>

        {voucher.description && (
          <Text variant="body.sm" color="secondary" style={styles.desc} numberOfLines={2}>
            {voucher.description}
          </Text>
        )}

        <View style={[styles.savePill, { backgroundColor: isRedeemed ? '#9CA3AF' : accentColor }]}>
          <Tag size={13} color="#FFF" />
          <Text variant="label.lg" style={styles.saveText}>Save £{voucher.estimatedSaving}</Text>
        </View>

        {!isRedeemed && (
          <View style={styles.redeemRow}>
            <Text variant="label.lg" style={styles.redeemText}>Redeem now</Text>
            <ArrowRight size={14} color={color.brandRose} />
          </View>
        )}
      </View>

      <VoucherCardStub pills={stubPills} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cardRedeemed: {
    opacity: 0.5,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  favBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    zIndex: 2,
  },
  favBtnActive: {
    backgroundColor: 'rgba(226,12,4,0.1)',
    borderColor: 'rgba(226,12,4,0.2)',
  },
  stamp: {
    position: 'absolute',
    top: 16,
    right: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    zIndex: 2,
  },
  stampText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    paddingTop: 20,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 20,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  typeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#010C35',
    marginTop: 12,
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  savePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  saveText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  redeemText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E20C04',
  },
})
