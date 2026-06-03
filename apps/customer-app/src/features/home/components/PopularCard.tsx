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
 * Popular / Trending discovery card (2026-06-03 premium pass).
 *
 * Different ARCHETYPE from the Featured editorial hero — this is a scannable
 * carousel card for "what's hot near you": smaller, photo on top, name BELOW
 * it, logo straddling the seam, no per-card CTA (the whole card taps; the
 * "trending" identity lives in the section band + flame header, not a badge on
 * every card). Shares the design language with Featured (cream context, navy
 * name, Mustica saving, clean hierarchy).
 *
 * Truncation discipline: one idea per line; only SHORT fixed badges (rating,
 * open) sit beside flexible text; the saving is stacked so the voucher count is
 * never cut (the "2 vou…" bug).
 */
const BANNER_H = 118
const LOGO = 48

// Popular + Trending share this rail-card width (consistent with each other).
// Nearby uses its own bespoke <NearbyCard> (name-on-banner). The Featured hero
// is the one larger paid-placement exception.
export const RAIL_TILE_WIDTH = 264

export function PopularCard({
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
  // Total saving across ALL the merchant's vouchers (the sum), not the best
  // single voucher (maxEstimatedSaving). Owner-confirmed 2026-06-03: "Save up
  // to £X" is the combined value of every voucher on offer.
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
            testID="popular-card-banner"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImg}
            contentFit="cover"
            transition={180}
            recyclingKey={branch.id}
          />
        ) : (
          <LinearGradient
            testID="popular-card-banner-fallback"
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImg}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.topScrim}
          pointerEvents="none"
        />
        {/* Rating chip + favourite, shared treatment (strong dark-glass). */}
        <BannerTopRight branch={branch} testIDPrefix="popular-card" />
      </View>

      <View style={styles.logoWrap}>
        {branch.merchant.logoUrl ? (
          <Image
            testID="popular-card-logo"
            source={{ uri: branch.merchant.logoUrl }}
            style={styles.logo}
            contentFit="cover"
            transition={180}
            recyclingKey={`${branch.id}-logo`}
          />
        ) : (
          <View style={[styles.logo, { backgroundColor: color.navy }]}>
            <Text style={styles.logoInitial}>{branch.merchant.businessName.charAt(0)}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Open/closed — top-right of the white section (the seam band, where
            the rating used to sit; owner-marked position). Absolute so the name
            below keeps its full width. */}
        <View style={styles.statusAbs} testID="popular-card-open">
          <LiveStatusDot open={branch.isOpenNow} />
          <Text style={[styles.openLabel, { color: branch.isOpenNow ? color.success : color.text.tertiary }]}>
            {branch.isOpenNow ? 'Open' : 'Closed'}
          </Text>
        </View>

        {/* Identity block — name → subcategory → location. */}
        <Text style={styles.name} numberOfLines={1}>{branch.merchant.businessName}</Text>
        {descriptor ? <Text style={styles.descriptor} numberOfLines={1}>{descriptor}</Text> : null}
        {/* Location — only the LOCALITY flexes/truncates; the distance stays
            pinned (never lost on long localities). */}
        <View style={styles.whereRow}>
          {hasLoc ? <MapPin size={13} color={color.text.tertiary} strokeWidth={2} /> : null}
          {locality ? <Text style={styles.locality} numberOfLines={1}>{locality}</Text> : null}
          {locality && distance ? <Text style={styles.metaSep}>·</Text> : null}
          {distance ? <Text style={styles.distance}>{distance}</Text> : null}
        </View>

        {/* Hairline above the saving (matches Featured). */}
        <View style={styles.divider} />

        {/* Saving — stacked; compact money (drops .00 on whole pounds). */}
        {(showSave || count > 0) && (
          <View style={styles.saving} testID="popular-card-value">
            {showSave ? <Text style={styles.savingLabel}>Save up to</Text> : null}
            <View style={styles.savingValueRow}>
              {showSave ? <Text style={styles.savingAmount}>{formatGbpCompact(save) ?? ''}</Text> : null}
              {count > 0 ? (
                <Text style={styles.savingContext}>
                  {showSave ? `across ${countLabel}` : `${countLabel} available`}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      </View>
    </PressableScale>
  )
}

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
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 48 },
  logoWrap: { position: 'absolute', top: BANNER_H - (LOGO - Math.round(LOGO * 0.45)), left: 14, zIndex: 2 },
  logo: {
    width: LOGO, height: LOGO, borderRadius: 12, borderWidth: 3, borderColor: '#FFFFFF',
    backgroundColor: '#FFF6EE', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#010C35', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  logoInitial: { color: '#FFF', fontSize: 19, fontFamily: 'Lato-Bold' },
  // position relative so open/closed can sit absolute top-right (seam band).
  // Fixed minHeight keeps rail cards equal height.
  content: { position: 'relative', paddingHorizontal: 14, paddingTop: Math.round(LOGO * 0.45) + 8, paddingBottom: 14, minHeight: 168 },
  statusAbs: { position: 'absolute', top: 8, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, zIndex: 2 },
  // Identity block — fonts nudged up a touch for readability; tight inter-line
  // spacing so name / category / location read as one group (owner direction).
  name: { fontSize: 17, lineHeight: 22, fontFamily: 'Lato-Bold', color: color.text.primary, letterSpacing: -0.2 },
  descriptor: { fontSize: 14, lineHeight: 18, fontFamily: 'Lato-Medium', color: color.text.secondary, marginTop: 2 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  // Only the locality flexShrinks; distance stays pinned (never truncated).
  locality: { fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Regular', color: color.text.tertiary, flexShrink: 1 },
  metaSep:  { fontSize: 13, lineHeight: 18, color: color.text.tertiary },
  distance: { fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Regular', color: color.text.tertiary, flexShrink: 0 },
  openLabel: { fontSize: 13, fontFamily: 'Lato-SemiBold', letterSpacing: 0.1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#EDE4D7', marginTop: 10 },
  // Stacked Mustica saving; looser tracking + more room before "across".
  saving: { gap: 1, marginTop: 9 },
  savingLabel: { fontSize: 13, lineHeight: 17, fontFamily: 'Lato-Medium', color: color.text.secondary },
  savingValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 9, rowGap: 1 },
  savingAmount: { fontSize: 20, lineHeight: 24, fontFamily: 'MusticaPro-Semibold', color: '#15803D', letterSpacing: -0.1 },
  savingContext: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.text.primary },
})
