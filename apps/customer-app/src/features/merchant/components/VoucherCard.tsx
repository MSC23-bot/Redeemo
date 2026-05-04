import React, { useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, ArrowRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { VoucherCardStub } from './VoucherCardStub'
import type { VoucherType } from '@/lib/api/redemption'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Round 3 §B3: full descriptive type labels replace the cryptic
// abbreviations. The chip now CARRIES the voucher type's identity
// (white text on a saturated category-coloured pill) so the user
// understands "what kind of offer is this" at a glance — without
// needing to read the title.
const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO:             'BUY ONE, GET ONE FREE',
  DISCOUNT_FIXED:   'MONEY OFF',
  DISCOUNT_PERCENT: 'PERCENTAGE OFF',
  FREEBIE:          'FREE ITEM',
  SPEND_AND_SAVE:   'SPEND & SAVE',
  PACKAGE_DEAL:     'PACKAGE DEAL',
  TIME_LIMITED:     'TIME-LIMITED',
  REUSABLE:         'REUSABLE',
}

type Props = {
  voucher: MerchantVoucher
  isRedeemed: boolean
  isFavourited: boolean
  onPress: () => void
  onToggleFavourite: () => void
}

// Visual correction round 3 §B3 (post-PR-#35 QA): voucher card refined
// further on top of round 2's editorial rebuild. Skill allocation:
// /interface-design (signature element work), /impeccable (anti-slop
// audit), /frontend-design (anti-generic AI aesthetic).
//
// Round 3 changes on top of round 2:
//   • Subtle category-coloured top wash. A 60pt-tall LinearGradient at
//     the top of the card from `${accentColor}10` (6% tint) → transparent.
//     Gives each card a quiet identity halo without competing with the
//     warm card surface or the brand-red Save value.
//   • Type chip becomes "more substantial": solid category-colour pill
//     + WHITE text + slightly larger padding (5/10 vs 4/8) + larger font
//     (10pt vs 9pt). Reads as a category badge rather than a soft label.
//   • Full descriptive labels ("BUY ONE, GET ONE FREE" not "BOGO",
//     "MONEY OFF" not "DISCOUNT") so first-time users understand the
//     offer type without context. Owner caution: brand consistency with
//     the rest of the app (uppercase tab indicators, etc.) preserved
//     by keeping uppercase + letter-spacing.
//
// Untouched (still load-bearing from round 2):
//   • Brand-red `Save £X` 14pt 800 (no pill chrome — owner caution).
//   • Brand-red `Redeem now →` 14pt 700 (owner caution: do not weaken).
//   • Perforation stub (Redeemo signature decoration).
//   • Single category-colour element per card (the chip) — no rainbow
//     when scrolling a list of vouchers.
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

  // Round 3 §B3: chip becomes solid category-colour pill with white
  // text. Redeemed state stays neutral (50% opacity grey) so the card
  // doesn't shout "free item!" once it's already been redeemed.
  const chipBg = isRedeemed ? 'rgba(0,0,0,0.10)' : accentColor
  const chipTextColor = isRedeemed ? '#9CA3AF' : '#FFF'

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.card, isRedeemed && styles.cardRedeemed]}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_LABELS[typeKey]} voucher: ${voucher.title}. Save £${voucher.estimatedSaving}${isRedeemed ? '. Already redeemed this cycle' : ''}`}
    >
      {/* Round 3 §B3: subtle category-coloured top wash. 60pt high,
          fades from `${accentColor}10` → transparent. Provides per-type
          identity without competing with content. Suppressed on redeemed
          cards so the muted state stays muted. */}
      {!isRedeemed && (
        <LinearGradient
          colors={[`${accentColor}1A`, 'transparent']}
          locations={[0, 1]}
          style={styles.topWash}
          pointerEvents="none"
        />
      )}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.typeChip, { backgroundColor: chipBg }]}>
            <Text variant="label.md" style={[styles.typeChipText, { color: chipTextColor }]} numberOfLines={1}>
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
    backgroundColor: '#FCFAF7',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRedeemed: {
    opacity: 0.7,
  },
  // Subtle category-coloured top wash. Sits behind body content (no
  // pointer events). 60pt tall covers the chip-and-title area only.
  topWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
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
    gap: 10,
  },
  // Round 3 §B3: chip is now a substantial pill (was tinted 10% chip).
  typeChip: {
    flexShrink: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
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
