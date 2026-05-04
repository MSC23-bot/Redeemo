import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Heart, ArrowRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { VoucherCardStub } from './VoucherCardStub'
import type { VoucherType } from '@/lib/api/redemption'
import type { MerchantVoucher } from '@/lib/api/merchant'

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BOGO',
  DISCOUNT_FIXED: 'DISCOUNT',
  DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE',
  SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE',
  TIME_LIMITED: 'TIME-LIMITED',
  REUSABLE: 'REUSABLE',
}

type Props = {
  voucher: MerchantVoucher
  isRedeemed: boolean
  isFavourited: boolean
  onPress: () => void
  onToggleFavourite: () => void
}

// Visual correction round §3 (post-PR-#35 QA): voucher card rebuilt as a
// refined editorial card instead of a generic Yelp-style coupon. Skill
// allocation for this surface: /interface-design (signature element work),
// /impeccable (anti-slop + absolute-bans audit), /frontend-design (anti-
// generic AI aesthetic), /ui-ux-pro-max §6 (typography scale).
//
// Anti-slop fixes applied:
//   • Removed the 4pt left side-stripe (impeccable absolute ban).
//   • Removed the whole-card pastel gradient — was rainbow when stacked.
//   • Removed the dashed type-badge border (looked dated/Yelp-y).
//   • Type label condensed to a refined tinted chip (category-color
//     bg at 10% over the warm card surface, category-color text).
//   • "Save £X" pill chrome removed → brand-red bold inline text.
//     Owner caution: redemption clarity must remain — brand-red 14pt 800
//     stays scannable without the green pill background.
//   • "Redeem now →" stays brand-red 14pt 700 with arrow — owner caution
//     "do not weaken redemption CTA". Visual primary action preserved.
//   • Card surface: solid #FCFAF7 (warm white token from §1) instead of
//     gradient. Reads as elevated against the cream page canvas.
//   • Padding 24pt → 16pt; total card height down ~30%.
//
// Redeemo-signature kept: the perforation stub (VoucherCardStub) with
// cutout circles and dashed top border is a distinctive voucher-as-
// physical-coupon element that no other UK voucher app uses. Calmed
// internally but kept structurally — it's the one piece of decoration
// that earns its place because it carries Redeemo brand language.
//
// Voucher type semantic preserved cleanly: only ONE category-coloured
// element per card (the chip). All other accent colour (Save value,
// Redeem CTA, perforation stub) uses brand-red or neutrals — no
// rainbow-card feeling when scrolling a list of vouchers.
export function VoucherCard({ voucher, isRedeemed, isFavourited, onPress, onToggleFavourite }: Props) {
  const typeKey = voucher.type as VoucherType
  const accentColor = color.voucher.byType[typeKey] ?? color.brandRose

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

  // 8-char hex alpha = ~10% opacity tint of the category colour. RN
  // supports this hex form natively. Used only for the type chip's bg.
  const chipBg = isRedeemed ? 'rgba(0,0,0,0.05)' : `${accentColor}1A`
  const chipText = isRedeemed ? '#9CA3AF' : accentColor

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, isRedeemed && styles.cardRedeemed]}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_LABELS[typeKey]} voucher: ${voucher.title}. Save £${voucher.estimatedSaving}${isRedeemed ? '. Already redeemed this cycle' : ''}`}
    >
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.typeChip, { backgroundColor: chipBg }]}>
            <Text variant="label.md" style={[styles.typeChipText, { color: chipText }]}>
              {TYPE_LABELS[typeKey]}
            </Text>
          </View>

          <Pressable
            onPress={handleFav}
            style={styles.favBtn}
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
            hitSlop={12}
          >
            <Heart size={20} color={isFavourited ? '#E20C04' : '#9CA3AF'} fill={isFavourited ? '#E20C04' : 'none'} />
          </Pressable>
        </View>

        <Text variant="heading.sm" style={styles.title} numberOfLines={2}>
          {voucher.title}
        </Text>

        {voucher.description && (
          <Text variant="body.sm" color="secondary" style={styles.desc} numberOfLines={2}>
            {voucher.description}
          </Text>
        )}

        <View style={styles.bottomRow}>
          <Text variant="label.lg" style={[styles.saveText, isRedeemed && styles.saveTextRedeemed]}>
            Save £{voucher.estimatedSaving}
          </Text>
          {!isRedeemed && (
            <View style={styles.redeemRow}>
              <Text variant="label.lg" style={styles.redeemText}>Redeem now</Text>
              <ArrowRight size={14} color={color.brandRose} />
            </View>
          )}
          {isRedeemed && (
            <Text variant="label.md" style={styles.redeemedStamp}>
              REDEEMED
            </Text>
          )}
        </View>
      </View>

      <VoucherCardStub pills={stubPills} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FCFAF7',                  // warm card surface (§1 token)
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',             // §3 unified card border
    shadowColor: '#000',
    shadowOpacity: 0.04,                         // calmer than the previous 0.12
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRedeemed: {
    opacity: 0.7,                                // 0.5 → 0.7: still visibly muted
  },                                             // but content stays readable
  body: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  typeChip: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  favBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0E1F',
    marginTop: 10,
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  desc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    minHeight: 24,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E20C04',
    letterSpacing: -0.1,
  },
  saveTextRedeemed: {
    color: '#9CA3AF',
  },
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  redeemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E20C04',
    letterSpacing: -0.1,
  },
  redeemedStamp: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})
