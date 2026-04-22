import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { elevation, color } from '@/design-system/tokens'
import { StarRating } from '@/features/shared/StarRating'
import { VoucherCountPill } from '@/features/shared/VoucherCountPill'
import { SavePill } from '@/features/shared/SavePill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'
import type { FavouriteMerchantItem } from '@/lib/api/favourites'

type Props = {
  merchant: FavouriteMerchantItem
  onPress: (id: string) => void
  onRemove: (id: string) => void
}

export function MerchantFavCard({ merchant, onPress, onRemove }: Props) {
  const isUnavailable = merchant.isUnavailable

  const infoText = isUnavailable
    ? 'Unavailable'
    : [
        merchant.primaryCategory?.name,
        merchant.branch?.addressLine1 ?? undefined,
      ].filter(Boolean).join(' · ')

  return (
    <PressableScale
      onPress={() => onPress(merchant.id)}
      style={[styles.card, isUnavailable && styles.cardDimmed]}
      accessibilityLabel={
        isUnavailable
          ? `${merchant.businessName}, unavailable`
          : `${merchant.businessName}, ${merchant.primaryCategory?.name ?? ''}, ${merchant.isOpen ? 'open' : 'closed'}`
      }
    >
      {/* Banner */}
      <View style={styles.banner}>
        {!isUnavailable && merchant.bannerUrl ? (
          <View style={[styles.bannerImage, { backgroundColor: '#E5E7EB' }]} />
        ) : (
          <LinearGradient
            colors={isUnavailable ? ['#94A3B8', '#CBD5E1'] : ['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        {/* Heart — always red, triggers removal */}
        <Pressable
          onPress={() => onRemove(merchant.id)}
          accessibilityLabel={`Remove ${merchant.businessName} from favourites`}
          accessibilityRole="button"
          style={styles.heartButton}
          hitSlop={8}
        >
          <Heart size={14} color="#E20C04" fill="#E20C04" />
        </Pressable>

        {/* Logo */}
        <View style={styles.logoWrapper}>
          {merchant.logoUrl ? (
            <View style={[styles.logo, { backgroundColor: '#D1D5DB' }]} />
          ) : (
            <View style={[styles.logo, { backgroundColor: color.navy }]}>
              <Text style={styles.logoInitial}>{merchant.businessName.charAt(0)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{merchant.businessName}</Text>
          {!isUnavailable && (
            <StarRating rating={merchant.avgRating} count={merchant.reviewCount} />
          )}
        </View>
        <Text
          style={[styles.info, isUnavailable && styles.infoUnavailable]}
          numberOfLines={1}
        >
          {infoText}
        </Text>
        {!isUnavailable && (
          <View style={styles.pillRow}>
            <VoucherCountPill count={merchant.voucherCount} />
            <SavePill amount={merchant.maxEstimatedSaving} />
            <OpenStatusBadge isOpen={merchant.isOpen} />
          </View>
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...elevation.sm,
  },
  cardDimmed: { opacity: 0.45 },
  banner: { height: 64, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  heartButton: {
    position: 'absolute',
    top: 8, right: 8,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoWrapper: { position: 'absolute', bottom: -14, left: 12 },
  logo: {
    width: 28, height: 28,
    borderRadius: 8,
    borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { fontSize: 12, color: '#FFF', fontFamily: 'Lato-Bold' },
  content: { paddingTop: 18, paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13, fontFamily: 'Lato-Bold', color: '#010C35',
    flex: 1, marginRight: 4,
  },
  info: { fontSize: 10, color: '#9CA3AF' },
  infoUnavailable: { fontStyle: 'italic' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
})
