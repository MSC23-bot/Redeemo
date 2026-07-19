import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Text, color } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { VoucherValue } from '@/features/shared/VoucherValue'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistanceCompact } from '@/design-system/utils/formatters'
import { merchantDisplayName } from '@/lib/merchantDisplayName'

/**
 * Map Phase 2 W2b (F11, W2-D5) — the Map carousel merchant card.
 *
 * The OPT-IN presentation of `<BranchTile>` for the Map carousel (reached
 * via `<BranchTile variant="mapCarousel">`, which delegates here). Kept a
 * separate component so the DEFAULT `<BranchTile>` render path (Home /
 * Search / Favourites / Category) stays byte-for-byte unchanged.
 *
 * Structure:
 *   - Photo area with a soft dark bottom scrim; a white status pill
 *     top-left ON the photo ("Open until HH:MM" when open via the existing
 *     `closesAtLocal`/`isOpenNow` fields, else "Closed"); the heart as a
 *     white circular chip top-right; the logo as a 52px tile bridging the
 *     photo/body seam (3px white border).
 *   - Body: name, then "category · locality · distance"; a single value
 *     line (shared `<VoucherValue>` save capsule + voucher stub).
 *
 * Brand-locked fallbacks (W2-D5): no banner photo = red-to-coral brand
 * gradient with a soft cream radial glow (NEVER an arbitrary colour); no
 * logo = navy tile with the merchant initial.
 */

const BANNER_H = 120
const LOGO = 52
const LOGO_OVERHANG = 26

type Props = {
  branch:  BranchTileType
  onPress: (id: string) => void
  width?:  number
}

export function BranchCarouselCard({ branch, onPress, width }: Props) {
  const displayName = merchantDisplayName(branch.merchant)
  const category = branch.merchant.descriptor || branch.merchant.primaryCategory?.name || ''
  const locality = branch.branchLocalityName || branch.branchPostTown || branch.branchCity || ''
  const distanceStr = formatDistanceCompact(branch.distance) ?? ''
  const meta = [category, locality, distanceStr].filter(Boolean).join(' · ')

  const statusText = branch.isOpenNow
    ? (branch.closesAtLocal ? `Open until ${branch.closesAtLocal}` : 'Open')
    : 'Closed'

  const logoTop = BANNER_H - (LOGO - LOGO_OVERHANG)
  const glowWidth = width ?? 280
  const glowId = `creamGlow-${branch.id}`

  const accessibilityLabel = locality
    ? `${displayName}, ${category}, ${locality}`
    : `${displayName}, ${category}`

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, width ? { width } : undefined]}
    >
      {/* Photo area */}
      <View style={[styles.banner, { height: BANNER_H }]}>
        {branch.merchant.bannerUrl ? (
          <Image
            testID="branch-carousel-banner-image"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImage}
            contentFit="cover"
            transition={180}
            recyclingKey={branch.id}
          />
        ) : (
          // Brand-locked fallback (W2-D5): red-to-coral brand gradient with
          // a soft cream radial glow. Never an arbitrary colour.
          <View testID="branch-carousel-banner-fallback" style={styles.bannerImage}>
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Svg width={glowWidth} height={BANNER_H} style={StyleSheet.absoluteFill}>
              <Defs>
                {/* Unique id per card so several fallback cards in the
                    carousel can't collide on one gradient def. */}
                <RadialGradient id={glowId} cx="30%" cy="22%" r="80%">
                  <Stop offset="0" stopColor={color.cream} stopOpacity={0.55} />
                  <Stop offset="1" stopColor={color.cream} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width={glowWidth} height={BANNER_H} fill={`url(#${glowId})`} />
            </Svg>
          </View>
        )}

        {/* Soft dark bottom scrim. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.34)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bottomScrim}
          pointerEvents="none"
        />

        {/* Status pill top-left ON the photo. */}
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: branch.isOpenNow ? color.savingsGreen : '#B54708' }]} />
          <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
        </View>

        {/* Heart — white circular chip top-right. */}
        <View style={styles.heartChip}>
          <FavouriteHeart
            entity="branch"
            id={branch.id}
            initialIsFavourited={branch.isFavourited}
            tone="on-light"
            size={18}
            testID={`branch-carousel-${branch.id}-heart`}
          />
        </View>
      </View>

      {/* Bridging logo tile (overlaps the photo/body seam). */}
      <View style={[styles.logoWrapper, { top: logoTop }]}>
        {branch.merchant.logoUrl ? (
          <Image
            testID="branch-carousel-logo-image"
            source={{ uri: branch.merchant.logoUrl }}
            style={styles.logo}
            contentFit="cover"
            transition={180}
            recyclingKey={`${branch.id}-logo`}
          />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoInitial}>{displayName.charAt(0)}</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
        <View style={styles.footer}>
          {/* OWNER DECISION 2026-07-18: Map surfaces show the TOTAL of all
              the merchant's vouchers (totalEstimatedSaving), not the best
              single voucher. Wire field confirmed in the accumulation
              store's render-relevant identity list (W1.1). */}
          <VoucherValue
            saveAmount={branch.merchant.totalEstimatedSaving}
            voucherCount={branch.merchant.voucherCount}
            testID="branch-carousel-value"
          />
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     '#EDE4D7',
    shadowColor:     '#010C35',
    shadowOpacity:   0.10,
    shadowRadius:    16,
    shadowOffset:    { width: 0, height: 8 },
    elevation:       5,
  },
  banner: {
    position:          'relative',
    overflow:          'hidden',
    borderTopLeftRadius:  18,
    borderTopRightRadius: 18,
  },
  bannerImage: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
  statusPill: {
    position:          'absolute',
    top:               10,
    left:              10,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    backgroundColor:   'rgba(255,255,255,0.94)',
    borderRadius:      999,
    paddingHorizontal: 9,
    paddingVertical:   4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize:   12,
    lineHeight: 15,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
  heartChip: {
    position:        'absolute',
    top:             10,
    right:           10,
    width:           30,
    height:          30,
    borderRadius:    15,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoWrapper: { position: 'absolute', left: 14, zIndex: 2 },
  logo: {
    width:        LOGO,
    height:       LOGO,
    borderRadius: 14,
    borderWidth:  3,
    borderColor:  '#FFFFFF',
    backgroundColor: '#FFF6EE',
    shadowColor:  '#010C35',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation:    4,
  },
  logoFallback: {
    backgroundColor: color.navy,
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoInitial: {
    color:      '#FFFFFF',
    fontSize:   21,
    fontFamily: 'Lato-Bold',
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom:     14,
    paddingTop:        LOGO_OVERHANG + 10,
    gap:               5,
  },
  name: {
    fontSize:   17,
    lineHeight: 22,
    fontFamily: 'Lato-Bold',
    color:      color.text.primary,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize:   13,
    lineHeight: 18,
    fontFamily: 'Lato-Medium',
    color:      color.text.secondary,
  },
  footer: {
    marginTop: 4,
  },
})
