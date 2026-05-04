import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { RatingBlock } from './RatingBlock'

type Props = {
  merchantName: string
  logoUrl: string | null
  avgRating: number | null
  reviewCount: number
}

// Visual correction round 4 §1 (post-PR-#35 QA round 3): identity zone
// restructured. The horizontal logo+name flex row from §A1 read as
// floating text next to a tile; the user wanted the merchant name
// underneath the logo, both left-aligned at the same edge — a more
// editorial / publication-style identity block.
//
// Layout:
//   • Logo (64pt, slightly bigger and shifted right by 4pt of padding)
//     overlaps the banner bottom by 32pt — the page's spatial anchor.
//   • Rating block sits at the TOP-RIGHT of the identity zone, just
//     below the banner bottom edge — close enough to read as
//     "associated with this merchant" without overlapping the banner.
//   • Merchant name renders below the logo, left-aligned with the logo.
//   • All three pieces share the same paddingHorizontal so the
//     identity zone reads as a single composition, not three islands.
export function MerchantHeadline({ merchantName, logoUrl, avgRating, reviewCount }: Props) {
  return (
    <View style={styles.root}>
      {/* Rating: in normal flow, right-aligned, paddingTop ensures it
          sits just below the banner edge without crowding it. The
          logo's absolute position lets it overlap the banner from the
          left while the rating sits in identity-zone-only space. */}
      <View style={styles.ratingWrap}>
        <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
      </View>

      {/* Logo: absolute-positioned so its negative top can overlap the
          banner without affecting flow layout below. Shifted right by
          paddingLeft 24 (vs page padding 20) so it sits a touch inside
          the identity zone's left edge — matches the user direction
          "could move slightly to the right". */}
      <View style={styles.logoBox}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
      </View>

      {/* Merchant name: under the logo, left-aligned at the page's
          paddingHorizontal:20 edge. Display.sm at 26pt is one step up
          from §A1's 22pt — the user direction "some content could be
          slightly bigger" applied to the headline. */}
      <Text variant="display.sm" style={styles.name} numberOfLines={2} ellipsizeMode="tail">
        {merchantName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 4,
    position: 'relative',
  },
  // Rating sits in normal flow at the top of the identity zone,
  // right-aligned; paddingTop:6 keeps a small breathing strip below
  // the banner edge.
  ratingWrap: {
    alignSelf: 'flex-end',
    paddingTop: 6,
  },
  // Logo: absolute, overlaps banner by 32pt. Larger than round 3
  // (64pt vs 56pt) per user direction. Stronger shadow gives it a
  // bit more presence as the page's spatial anchor.
  logoBox: {
    position: 'absolute',
    left: 24,
    top: -32,
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#FFF',
    backgroundColor: '#FFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  logoImage: {
    width: 59,
    height: 59,
    borderRadius: 13.5,
  },
  logoPlaceholder: {
    width: 59,
    height: 59,
    borderRadius: 13.5,
    backgroundColor: color.surface.subtle,
  },
  // Name marginTop accounts for the absolute logo's visible bottom
  // edge: logo top -32 + height 64 = bottom at +32 from root top.
  // We add ~14pt breathing space + identity zone paddingTop 4 so the
  // name starts at ~50pt from root top — clear of the logo with room.
  name: {
    marginTop: 46,
    fontSize: 26,
    fontWeight: '800',
    color: '#0F0E1F',
    letterSpacing: -0.4,
    lineHeight: 32,
  },
})
