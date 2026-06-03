import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Star } from '@/design-system/icons'
import { Text } from '@/design-system'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'

/**
 * Shared banner top-right cluster: rating chip + favourite heart, used by both
 * the Popular/Trending card and the Nearby card so the treatment stays
 * identical across Home (owner direction 2026-06-03).
 *
 * The chips must DRAW ATTENTION over busy merchant photos, so they use a strong
 * dark-glass fill + a hairline light rim + a soft shadow halo: the dark fill
 * carries them on light/bright images, the light rim + shadow separate them on
 * dark/busy images. (A faint translucent fill blended into the photo, which was
 * the previous problem.)
 */
export function BannerTopRight({
  branch,
  testIDPrefix,
}: {
  branch: BranchTileType
  testIDPrefix: string
}) {
  return (
    <View style={styles.topRight}>
      {branch.avgRating !== null && (
        <View style={styles.ratingChip} testID={`${testIDPrefix}-rating`}>
          <Star size={12} color="#F8B739" fill="#F8B739" />
          <Text style={styles.ratingValue}>{branch.avgRating.toFixed(1)}</Text>
          {branch.reviewCount > 0 ? <Text style={styles.ratingCount}>({branch.reviewCount})</Text> : null}
        </View>
      )}
      <View style={styles.heart}>
        <FavouriteHeart
          entity="branch"
          id={branch.id}
          initialIsFavourited={branch.isFavourited}
          tone="on-gradient"
          size={18}
          testID={`${testIDPrefix}-${branch.id}-heart`}
        />
      </View>
    </View>
  )
}

const GLASS = 'rgba(0,0,0,0.58)'
const RIM = 'rgba(255,255,255,0.22)'

const styles = StyleSheet.create({
  topRight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 7, zIndex: 3 },
  ratingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 13,
    backgroundColor: GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: RIM,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  ratingValue: { fontSize: 12.5, fontFamily: 'Lato-Bold', color: '#FFFFFF' },
  ratingCount: { fontSize: 10.5, fontFamily: 'Lato-Regular', color: 'rgba(255,255,255,0.85)' },
  heart: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: RIM,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
})
