import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Share2, Heart, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  voucherType: VoucherType
  title: string
  description: string | null
  estimatedSaving: number
  isFavourited: boolean
  onToggleFavourite: () => void
  onShare: () => void
  isRedeemed?: boolean
  isExpired?: boolean
  children?: React.ReactNode
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BUY ONE GET ONE FREE',
  DISCOUNT_FIXED: 'DISCOUNT',
  DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE',
  SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE DEAL',
  TIME_LIMITED: 'TIME-LIMITED OFFER',
  REUSABLE: 'REUSABLE',
}

export function CouponHeader({
  voucherType, title, description, estimatedSaving,
  isFavourited, onToggleFavourite, onShare,
  isRedeemed, isExpired, children,
}: Props) {
  const router = useRouter()
  const headerColor = color.voucher.byType[voucherType]
  const washed = isRedeemed || isExpired

  return (
    <View style={styles.wrapper}>
      <View
        testID="coupon-header"
        style={[
          styles.container,
          { backgroundColor: headerColor },
          washed && styles.washed,
        ]}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.25)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top nav bar */}
        <View style={styles.navBar}>
          <Pressable
            onPress={() => { lightHaptic(); router.back() }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.navButton}
          >
            <ArrowLeft size={20} color="#FFF" />
          </Pressable>
          <View style={styles.navRight}>
            <Pressable
              onPress={() => { lightHaptic(); onShare() }}
              accessibilityLabel="Share voucher"
              accessibilityRole="button"
              style={styles.navButton}
            >
              <Share2 size={18} color="#FFF" />
            </Pressable>
            <Pressable
              onPress={() => { lightHaptic(); onToggleFavourite() }}
              accessibilityLabel="Toggle favourite"
              accessibilityRole="button"
              style={styles.navButton}
            >
              <Heart size={18} color="#FFF" fill={isFavourited ? '#FFF' : 'transparent'} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.typeBadge}>
            <Tag size={10} color="#FFF" />
            <Text variant="label.eyebrow" color="inverse" style={styles.typeText}>
              {TYPE_LABELS[voucherType]}
            </Text>
          </View>
          <Text variant="display.md" color="inverse" style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          {description && (
            <Text variant="body.sm" color="inverse" style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>

        {/* Save badge */}
        <View style={styles.saveBadge}>
          <Text variant="label.md" color="inverse" style={styles.saveLabel}>Save</Text>
          <Text variant="heading.md" color="inverse" style={styles.saveAmount}>
            £{Number(estimatedSaving).toFixed(2)}
          </Text>
        </View>

        {/* Slot for countdown banners (time-limited variants) */}
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  container: {
    minHeight: 260,
    paddingTop: 100,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
  },
  washed: { opacity: 0.65 },
  navBar: {
    position: 'absolute',
    top: 54,
    left: spacing[5],
    right: spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  navButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
  },
  navRight: { flexDirection: 'row', gap: spacing[2] },
  content: { zIndex: 5 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing[2],
  },
  typeText: { letterSpacing: 0.12 * 11 },
  title: { maxWidth: 280, fontWeight: '800' },
  description: { maxWidth: 300, marginTop: spacing[1], opacity: 0.8 },
  saveBadge: {
    position: 'absolute',
    top: 100,
    right: spacing[5],
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  saveLabel: { fontSize: 10, opacity: 0.85 },
  saveAmount: { fontWeight: '800' },
})
