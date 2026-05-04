import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Share2, Heart, TrendingUp, Award } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  bannerUrl: string | null
  isFeatured?: boolean
  isTrending?: boolean
  isFavourited: boolean
  onToggleFavourite: () => void
  onShare: () => void
}

// Visual correction round 3 §A1 + §A7: the logo moved out of HeroSection
// and into MerchantHeadline (where it sits in a horizontal flex row with
// the merchant name). HeroSection now owns only the banner image, the
// nav row, and badge row.
//
// §A7: top inset is now driven by `useSafeAreaInsets()` so the back/share
// /favourite buttons clear the Dynamic Island on Pro devices (which need
// ~59pt) AND sit correctly on older notch devices (~47pt). The previous
// hardcoded `top: 52` split the difference and undershot DI devices.
export function HeroSection({
  bannerUrl, isFeatured, isTrending,
  isFavourited, onToggleFavourite, onShare,
}: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.hero}>
      {bannerUrl ? (
        <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <LinearGradient colors={['#0a1025', '#111d3a', '#1a2d52']} style={StyleSheet.absoluteFillObject} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.45)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.navRow, { top: insets.top + 8 }]}>
        <Pressable
          onPress={() => { lightHaptic(); router.back() }}
          style={styles.frostedBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={18} color="#FFF" />
        </Pressable>
        <View style={styles.rightActions}>
          <Pressable
            onPress={() => { lightHaptic(); onShare() }}
            style={styles.frostedBtn}
            accessibilityRole="button"
            accessibilityLabel="Share merchant"
          >
            <Share2 size={18} color="#FFF" />
          </Pressable>
          <Pressable
            onPress={() => { lightHaptic(); onToggleFavourite() }}
            style={[styles.frostedBtn, isFavourited && styles.favActive]}
            accessibilityRole="button"
            accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          >
            <Heart size={18} color="#FFF" fill={isFavourited ? '#E20C04' : 'none'} />
          </Pressable>
        </View>
      </View>

      {(isFeatured || isTrending) && (
        <View style={styles.badgeRow}>
          {isFeatured && (
            <View style={[styles.badge, styles.badgeFeatured]}>
              <Award size={12} color="#FFF" />
              <Text variant="label.md" style={styles.badgeLabel}>FEATURED</Text>
            </View>
          )}
          {isTrending && (
            <View style={[styles.badge, styles.badgeTrending]}>
              <TrendingUp size={12} color="#FFF" />
              <Text variant="label.md" style={styles.badgeLabel}>TRENDING</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    height: 200,
    position: 'relative',
    overflow: 'visible',
  },
  navRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
  },
  frostedBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  favActive: {
    backgroundColor: 'rgba(226,12,4,0.3)',
  },
  rightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeRow: {
    position: 'absolute',
    bottom: 14,
    right: spacing[5],
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badgeFeatured: {
    backgroundColor: 'rgba(217,119,6,0.85)',
  },
  badgeTrending: {
    backgroundColor: 'rgba(226,12,4,0.85)',
  },
  badgeLabel: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
