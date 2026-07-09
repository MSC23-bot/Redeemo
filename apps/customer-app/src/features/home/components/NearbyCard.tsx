import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin } from '@/design-system/icons'
import { Text, color } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { BannerTopRight } from './BannerTopRight'
import { LiveStatusDot } from './LiveStatusDot'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import { formatDistanceCompact, formatGbpCompact } from '@/design-system/utils/formatters'

/**
 * Nearby-by-category card (2026-06-03 v4 — landscape, banner lockup).
 *
 * Browse tier, differentiated from Popular/Trending by SHAPE + STYLE:
 *   - HORIZONTAL rectangle (wider than tall), narrow enough to peek the next card.
 *   - The photo dominates the top. The merchant NAME + RATING sit as a lockup in
 *     the DARK part of a bottom gradient, beside the straddling logo (legible on
 *     any photo).
 *   - The white strip is clean: subcategory + an open/closed status on the right
 *     of the same row (the slot the rating vacated — room for "Closing in 60
 *     min" later), then location (locality first, matching the other cards),
 *     then the hairline + Featured/Popular-style stacked saving (prominent
 *     Mustica-green value with "across N vouchers" connected to it).
 *
 * Deliberately NOT the Featured hero: smaller banner, no descriptor/CTA on the
 * image, landscape.
 */
const BANNER_H = 116
const LOGO = 44
// Logo straddles the seam ~75% in the banner / 25% in the white strip.
const LOGO_OVERHANG = Math.round(LOGO * 0.25)
const LOGO_TOP = BANNER_H - (LOGO - LOGO_OVERHANG)
const NAME_LH = 22
// Lockup vertically centred against the logo's in-banner portion, beside it.
const LOCKUP_TOP = Math.round(LOGO_TOP + (BANNER_H - LOGO_TOP - NAME_LH) / 2)
const LOCKUP_LEFT = 14 + LOGO + 10
const GRADIENT_H = 92

// Wider than the Popular rail card (264) but NOT full-width — leaves a peek of
// the next card so the rail reads as scrollable.
export const NEARBY_CARD_WIDTH = 300

// Perf batch 1 (2026-07-09) — React.memo'd so a scroll-driven parent
// re-render (e.g. HomeScreen's headerCollapsed flip) doesn't recompute every
// rail card; only a change to this card's own props does. Props shape is
// unchanged — only referential stability of the callers' props changes.
export const NearbyCard = React.memo(function NearbyCard({
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
  const hasProx = Boolean(distance || locality)
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
      {/* Banner — photo dominant; name + rating lockup in the dark gradient. */}
      <View style={styles.banner}>
        {branch.merchant.bannerUrl ? (
          <Image
            testID="nearby-card-banner"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImg}
            contentFit="cover"
            transition={180}
            recyclingKey={branch.id}
          />
        ) : (
          <LinearGradient
            testID="nearby-card-banner-fallback"
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImg}
          />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.9)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bottomScrim}
          pointerEvents="none"
        />

        {/* Rating chip + favourite, shared treatment (strong dark-glass). */}
        <BannerTopRight branch={branch} testIDPrefix="nearby-card" />

        {/* Name — full width now the rating moved up top — in the dark gradient
            beside the logo. */}
        <Text testID="nearby-card-name" style={styles.name} numberOfLines={1}>
          {branch.merchant.businessName}
        </Text>
      </View>

      {/* Logo straddles the seam, pushed up into the banner. */}
      <View style={styles.logoWrap}>
        {branch.merchant.logoUrl ? (
          <Image
            testID="nearby-card-logo"
            source={{ uri: branch.merchant.logoUrl }}
            style={styles.logo}
            contentFit="cover"
            transition={180}
            recyclingKey={`${branch.id}-logo`}
          />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoInitial}>{branch.merchant.businessName.charAt(0)}</Text>
          </View>
        )}
      </View>

      {/* White strip. */}
      <View style={styles.content}>
        {/* Subcategory (under the logo) + open/closed on the right (the slot the
            rating vacated; room for "Closing in 60 min" — descriptor truncates). */}
        <View style={styles.topRow}>
          {descriptor ? <Text style={styles.descriptor} numberOfLines={1}>{descriptor}</Text> : <View style={{ flex: 1 }} />}
          <View style={styles.status} testID="nearby-card-open">
            <LiveStatusDot open={branch.isOpenNow} />
            <Text style={[styles.statusLabel, { color: branch.isOpenNow ? color.success : color.text.tertiary }]}>
              {branch.isOpenNow ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        {/* Location — locality FIRST, then distance (consistent with all cards);
            only the locality flexShrinks, distance stays pinned. */}
        {hasProx ? (
          <View style={styles.locationRow}>
            <MapPin size={13} color={color.text.tertiary} strokeWidth={2} />
            {locality ? <Text style={styles.locality} numberOfLines={1}>{locality}</Text> : null}
            {locality && distance ? <Text style={styles.locSep}>·</Text> : null}
            {distance ? <Text style={styles.distance}>{distance}</Text> : null}
          </View>
        ) : null}

        <View style={styles.divider} />

        {/* Saving — Featured/Popular stacked treatment: small label, prominent
            Mustica-green value, "across N vouchers" connected to it. */}
        {(showSave || count > 0) && (
          <View style={styles.saving} testID="nearby-card-value">
            {/* "Save" (not "Save up to"): totalEstimatedSaving across the
                merchant's vouchers; "across N vouchers" below makes it explicit.
                "Save up to £X" is reserved for a single voucher's max
                (BranchTile / Search). Owner-locked 2026-06-04. */}
            {showSave ? <Text style={styles.savingLabel}>Save</Text> : null}
            <View style={styles.savingValueRow}>
              {showSave ? <Text style={styles.savingAmount}>{formatGbpCompact(save) ?? ''}</Text> : null}
              {count > 0 ? (
                <Text style={styles.savingContext}>{showSave ? `across ${countLabel}` : `${countLabel} available`}</Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </PressableScale>
  )
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDE4D7',
    shadowColor: '#010C35',
    shadowOpacity: 0.09,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  banner: { height: BANNER_H, position: 'relative', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  bannerImg: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: GRADIENT_H },
  // Name, full width, in the dark gradient beside the logo.
  name: {
    position: 'absolute', top: LOCKUP_TOP, left: LOCKUP_LEFT, right: 14,
    fontSize: 17, lineHeight: NAME_LH, fontFamily: 'Lato-Bold', color: '#FFFFFF', letterSpacing: -0.2,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  logoWrap: { position: 'absolute', top: LOGO_TOP, left: 14, zIndex: 2 },
  logo: {
    width: LOGO, height: LOGO, borderRadius: 12, borderWidth: 3, borderColor: '#FFFFFF',
    backgroundColor: '#FFF6EE',
    shadowColor: '#010C35', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  logoFallback: { backgroundColor: color.navy, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Lato-Bold' },
  // Gaps tightened (logo→subcategory, subcategory→location) to shave height
  // while staying airy.
  content: { paddingHorizontal: 14, paddingTop: LOGO_OVERHANG + 5, paddingBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  descriptor: { flex: 1, fontSize: 14, lineHeight: 18, fontFamily: 'Lato-Medium', color: color.text.secondary },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  statusLabel: { fontSize: 13, fontFamily: 'Lato-SemiBold', letterSpacing: 0.1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  locality: { fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Regular', color: color.text.tertiary, flexShrink: 1 },
  locSep: { fontSize: 13, lineHeight: 18, color: color.text.tertiary },
  distance: { fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Regular', color: color.text.tertiary, flexShrink: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EDE4D7', marginTop: 10 },
  saving: { gap: 1, marginTop: 9 },
  savingLabel: { fontSize: 13, lineHeight: 17, fontFamily: 'Lato-Medium', color: color.text.secondary },
  savingValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 9, rowGap: 1 },
  savingAmount: { fontSize: 20, lineHeight: 24, fontFamily: 'MusticaPro-Semibold', color: '#15803D', letterSpacing: -0.1 },
  savingContext: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.text.primary },
})
