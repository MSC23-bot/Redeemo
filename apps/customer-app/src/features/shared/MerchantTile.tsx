import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, X } from 'lucide-react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'
import { SavePill } from './SavePill'
import { VoucherCountPill } from './VoucherCountPill'
import { OpenStatusBadge } from './OpenStatusBadge'
import { StarRating } from './StarRating'

function formatDistance(metres: number | null): string {
  if (metres === null) return ''
  if (metres < 1000) return `${Math.round(metres)}m`
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
}

type Props = {
  merchant: MerchantTileType
  onPress: (id: string) => void
  onFavourite?: (id: string) => void
  showFeaturedBadge?: boolean
  showClose?: boolean
  onClose?: () => void
  width?: number
}

export function MerchantTile({
  merchant,
  onPress,
  onFavourite,
  showFeaturedBadge,
  showClose,
  onClose,
  width,
}: Props) {
  const distanceStr = formatDistance(merchant.distance)
  const area = merchant.primaryCategory?.name ?? ''
  const infoText = [area, distanceStr].filter(Boolean).join(' · ')

  return (
    <PressableScale
      onPress={() => onPress(merchant.id)}
      accessibilityLabel={`${merchant.businessName}, ${area}`}
      style={[styles.card, width ? { width } : undefined]}
    >
      {/* Banner */}
      <View style={styles.banner}>
        {merchant.bannerUrl ? (
          <View style={[styles.bannerImage, { backgroundColor: '#E5E7EB' }]} />
        ) : (
          <LinearGradient
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        {/* FEATURED badge */}
        {showFeaturedBadge && (
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredBadge}
          >
            <Text variant="label.md" style={styles.featuredText}>
              FEATURED
            </Text>
          </LinearGradient>
        )}

        {/* Favourite heart */}
        {onFavourite && (
          <Pressable
            onPress={() => onFavourite(merchant.id)}
            accessibilityLabel={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
            style={styles.heartButton}
          >
            <Heart
              size={16}
              color="#FFFFFF"
              fill={merchant.isFavourited ? '#FFFFFF' : 'transparent'}
            />
          </Pressable>
        )}

        {/* Close button (Map tile) */}
        {showClose && onClose && (
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            style={styles.closeButton}
          >
            <X size={14} color="#FFFFFF" />
          </Pressable>
        )}

        {/* Logo overlay */}
        <View style={styles.logoWrapper}>
          {merchant.logoUrl ? (
            <View style={[styles.logo, { backgroundColor: '#D1D5DB' }]} />
          ) : (
            <View style={[styles.logo, { backgroundColor: color.navy }]}>
              <Text
                variant="label.md"
                style={{ color: '#FFF', fontSize: 14, fontFamily: 'Lato-Bold' }}
              >
                {merchant.businessName.charAt(0)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text variant="body.sm" style={styles.name} numberOfLines={1}>
            {merchant.businessName}
          </Text>
          <StarRating rating={merchant.avgRating} count={merchant.reviewCount} />
        </View>
        <Text variant="label.md" style={styles.info} numberOfLines={1}>
          {infoText}
        </Text>
        <View style={styles.pillRow}>
          <VoucherCountPill count={merchant.voucherCount} />
          <SavePill amount={merchant.maxEstimatedSaving} />
          <OpenStatusBadge isOpen={true} />
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.sm,
  },
  banner: { height: 80, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: { position: 'absolute', bottom: -17, left: 12 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  content: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    flex: 1,
    marginRight: 4,
  },
  info: { fontSize: 10.5, color: '#9CA3AF' },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
})
