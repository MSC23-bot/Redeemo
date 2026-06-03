import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Star, MapPin, ChevronRight } from '@/design-system/icons'
import { Text, color } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { LiveStatusDot } from './LiveStatusDot'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistanceCompact, formatGbpCompact } from '@/design-system/utils/formatters'

/**
 * Featured editorial hero (2026-06-02 premium pass).
 *
 * Featured is paid placement, so it gets its own ARCHETYPE — image-led, like a
 * magazine feature, not a wider rail card. The merchant lockup (logo + name +
 * category) sits OVER the photo on a bottom gradient scrim; below the image a
 * calm white strip carries one quiet meta line (locality · distance · open) and
 * the saving as the hero (the £ amount is the largest thing on the card). The
 * content fills the width, so there is no hollow middle.
 *
 * Differentiated from the Popular/Trending rail card (`BranchTile`) by layout,
 * not just size.
 */
const BANNER_H = 164

export function FeaturedHeroCard({
  branch,
  onPress,
  width,
}: {
  branch: BranchTileType
  onPress: (id: string) => void
  width?: number
}) {
  const distance = formatDistanceCompact(branch.distance) ?? ''
  const descriptor = branch.merchant.descriptor ?? branch.merchant.primaryCategory?.name ?? ''
  const locality = branch.branchLocalityName ?? branch.branchPostTown ?? branch.branchCity ?? ''
  const hasLoc = Boolean(locality || distance)
  // Total saving across ALL the merchant's vouchers (sum), not the best single
  // voucher (owner-confirmed 2026-06-03).
  const save = branch.merchant.totalEstimatedSaving
  const showSave = save !== null && save > 0
  const count = branch.merchant.voucherCount
  const countLabel = count === 1 ? '1 voucher' : `${count} vouchers`
  const a11y = locality
    ? `${branch.merchant.businessName}, ${descriptor}, ${locality}`
    : `${branch.merchant.businessName}, ${descriptor}`

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={a11y}
      style={[styles.card, width ? { width } : undefined]}
    >
      <View style={styles.banner}>
        {branch.merchant.bannerUrl ? (
          <Image
            testID="featured-hero-banner"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImg}
            contentFit="cover"
            transition={200}
            recyclingKey={branch.id}
          />
        ) : (
          <LinearGradient
            testID="featured-hero-banner-fallback"
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImg}
          />
        )}

        {/* Bottom scrim — carries the white lockup over any photo. */}
        <LinearGradient
          colors={['rgba(1,12,53,0)', 'rgba(1,12,53,0.10)', 'rgba(1,12,53,0.86)']}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Text style={styles.badgeText}>FEATURED</Text>
        </LinearGradient>

        <View style={styles.heart}>
          <FavouriteHeart
            entity="branch"
            id={branch.id}
            initialIsFavourited={branch.isFavourited}
            tone="on-gradient"
            size={20}
            testID={`featured-hero-${branch.id}-heart`}
          />
        </View>

        {/* Lockup over the photo: logo + name + category. */}
        <View style={styles.overlay}>
          <View style={styles.logoWrap}>
            {branch.merchant.logoUrl ? (
              <Image
                testID="featured-hero-logo"
                source={{ uri: branch.merchant.logoUrl }}
                style={styles.logo}
                contentFit="cover"
                recyclingKey={`${branch.id}-logo`}
              />
            ) : (
              <View style={[styles.logo, { backgroundColor: color.navy }]}>
                <Text style={styles.logoInitial}>{branch.merchant.businessName.charAt(0)}</Text>
              </View>
            )}
          </View>
          <View style={styles.lockupText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{branch.merchant.businessName}</Text>
              {branch.avgRating !== null && (
                <View style={styles.bannerRating} testID="featured-hero-rating">
                  <Star size={14} color="#FBBF24" fill="#FBBF24" />
                  <Text style={styles.bannerRatingValue}>{branch.avgRating.toFixed(1)}</Text>
                  {branch.reviewCount > 0 ? <Text style={styles.bannerRatingCount}>({branch.reviewCount})</Text> : null}
                </View>
              )}
            </View>
            {descriptor ? <Text style={styles.descriptor} numberOfLines={1}>{descriptor}</Text> : null}
          </View>
        </View>
      </View>

      {/* Calm white strip — meta line (where + open), a hairline, then the
          saving as the hero. */}
      <View style={styles.content}>
        {/* Inline location · open. Only the locality flexes; distance + open are
            pinned so they're never truncated on long localities. */}
        <View style={styles.metaRow}>
          {hasLoc ? <MapPin size={13} color={color.text.tertiary} strokeWidth={2} /> : null}
          {locality ? <Text style={styles.locality} numberOfLines={1}>{locality}</Text> : null}
          {locality && distance ? <Text style={styles.metaSep}>·</Text> : null}
          {distance ? <Text style={styles.distance}>{distance}</Text> : null}
          <LiveStatusDot open={branch.isOpenNow} style={hasLoc ? styles.openDot : null} />
          <Text style={[styles.openLabel, { color: branch.isOpenNow ? color.success : color.text.tertiary }]}>
            {branch.isOpenNow ? 'Open' : 'Closed'}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* The deal (left, hero) balanced by the rating (right). */}
        <View style={styles.dealRow}>
          {(showSave || count > 0) ? (
            <View style={styles.saving} testID="featured-hero-value">
              {showSave ? <Text style={styles.savingLabel}>Save up to</Text> : null}
              <View style={styles.savingValueRow}>
                {showSave ? <Text style={styles.savingAmount}>{formatGbpCompact(save) ?? ''}</Text> : null}
                {count > 0 ? (
                  <Text style={showSave ? styles.savingContext : styles.savingCountOnly}>
                    {showSave ? `across ${countLabel}` : `${countLabel} available`}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : <View style={styles.saving} />}

          {/* CTA affordance — the paid Featured slot gets a clear next step;
              fills the space the rating left when it moved up to the banner. */}
          <View style={styles.cta}>
            <Text style={styles.ctaText}>View offers</Text>
            <ChevronRight size={16} color={color.navy} />
          </View>
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDE4D7',
    shadowColor: '#010C35',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  banner: { height: BANNER_H, position: 'relative', overflow: 'hidden', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  bannerImg: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
  badge: { position: 'absolute', top: 12, left: 12, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Lato-SemiBold', letterSpacing: 1.2, textTransform: 'uppercase' },
  heart: {
    position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(1,12,53,0.32)', alignItems: 'center', justifyContent: 'center',
  },
  // CTA affordance (bottom-right of the deal row) — signals the destination on
  // the paid Featured slot; navy keeps the brand-rose reserved for the badge.
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  ctaText: { color: color.text.primary, fontSize: 14, fontFamily: 'Lato-SemiBold' },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoWrap: {},
  logo: {
    width: 48, height: 48, borderRadius: 12, borderWidth: 2.5, borderColor: '#FFFFFF',
    backgroundColor: '#FFF6EE', alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { color: '#FFF', fontSize: 19, fontFamily: 'Lato-Bold' },
  lockupText: { flex: 1 },
  // Rating now lives on the banner, right of the name (the conventional, scannable
  // home for it). White on the scrim.
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontFamily: 'Lato-Bold', letterSpacing: -0.3 },
  bannerRating: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  bannerRatingValue: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Lato-Bold' },
  bannerRatingCount: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'Lato-Regular' },
  // Tight under the name so the lockup reads as one unit (owner direction:
  // reduce the name→category gap, it looked dislocated).
  descriptor: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 17, fontFamily: 'Lato-Medium', marginTop: 1 },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16, gap: 12, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  // Inline meta line: pin + location · open (no far-right floating badge).
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  // Only the locality flexShrinks; distance + open stay pinned (never truncated).
  locality: { fontSize: 14, lineHeight: 19, fontFamily: 'Lato-Regular', color: color.text.secondary, flexShrink: 1 },
  metaSep:  { fontSize: 14, lineHeight: 19, color: color.text.secondary },
  distance: { fontSize: 14, lineHeight: 19, fontFamily: 'Lato-Regular', color: color.text.secondary, flexShrink: 0 },
  openDot: { marginLeft: 5 },
  openLabel: { fontSize: 13, fontFamily: 'Lato-SemiBold', letterSpacing: 0.1 },
  // Subtle warm hairline — separates the place from the deal; echoes the
  // coupon perforation (brand signature) without nesting a card.
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EAE0D2' },
  // Deal row — saving (left, hero) + rating (right), vertically centred.
  dealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // The saving is the hero. Stacked so the £ amount (Mustica Pro, the brand
  // display face) LEADS its own value line instead of floating mid-sentence:
  //   Save up to            <- quiet label
  //   £24  across N vouchers <- amount anchors the line, context trails it
  saving: { flex: 1, gap: 1 },
  savingLabel: { fontSize: 13, lineHeight: 17, fontFamily: 'Lato-Medium', color: color.text.secondary },
  savingValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 9, rowGap: 1 },
  savingAmount: { fontSize: 24, lineHeight: 28, fontFamily: 'MusticaPro-Semibold', color: '#15803D', letterSpacing: -0.2 },
  savingContext: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.text.primary },
  savingCountOnly: { fontSize: 15, fontFamily: 'Lato-SemiBold', color: color.text.primary },
})
