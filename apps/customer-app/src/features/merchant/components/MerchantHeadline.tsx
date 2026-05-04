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

// Round 4 §3 (post-PR-#35 QA round 4 §2): rating moved from its own
// top-right slot INTO the same row as the merchant name. The
// previous layout had the rating sitting at paddingTop:22 with the
// name 32pt below it, producing a ~60pt visual emptiness on the
// LEFT under the logo (the rating column lived only on the right;
// the left side beneath the logo was bare cream until the name
// appeared).
//
// New layout:
//   • Logo (now 72pt, was 64pt — "a little bit more bigger") sits
//     absolute-positioned and overlaps the banner exactly half
//     (top: -36, height 72 → 36pt above + 36pt below the boundary).
//   • Below the logo, a single horizontal row carries the merchant
//     name on the left (flex:1, wraps to 2 lines) and the rating
//     block on the right.
//   • The name's marginTop is tuned so it clears the logo's bottom
//     edge with a tight breathing strip (~7pt visible gap from the
//     logo's bottom edge to the merchant name's first cap).
//
// Effect: the "huge gap" below the logo collapses. The name reads as
// directly anchored to the logo, and the rating shares the same
// horizontal baseline so the eye reads "merchant + reputation" as one
// unit rather than two scattered surfaces.
export function MerchantHeadline({ merchantName, logoUrl, avgRating, reviewCount }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.logoBox}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
      </View>

      <View style={styles.nameRatingRow}>
        <Text variant="display.sm" style={styles.name} numberOfLines={2} ellipsizeMode="tail">
          {merchantName}
        </Text>
        <View style={styles.ratingWrap}>
          <RatingBlock avgRating={avgRating} reviewCount={reviewCount} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    position: 'relative',
  },
  // Logo bumped 64 → 72pt per direction "a little bit more bigger".
  // Negative top scaled to -36 to keep the half-on-banner /
  // half-on-identity-zone composition (logo's vertical centre still
  // sits exactly on the banner-identity boundary).
  logoBox: {
    position: 'absolute',
    left: 24,
    top: -36,
    width: 72,
    height: 72,
    borderRadius: 18,
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
    width: 67,
    height: 67,
    borderRadius: 15.5,
  },
  logoPlaceholder: {
    width: 67,
    height: 67,
    borderRadius: 15.5,
    backgroundColor: color.surface.subtle,
  },
  // Single horizontal row carrying name (left, flex:1) + rating
  // (right). marginTop:38 keeps the name's first cap ~7pt below the
  // logo's bottom edge — tight visual coupling, no floating gap.
  // alignItems:'center' baseline-aligns the rating chip against the
  // name's first line for single-line names; 2-line names center
  // the rating between lines (acceptable edge case).
  nameRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 38,
  },
  name: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#0F0E1F',
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  ratingWrap: {
    flexShrink: 0,
  },
})
