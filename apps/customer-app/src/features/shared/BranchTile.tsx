import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { X, MapPin, Star } from '@/design-system/icons'
import { Text, color, radius } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FavouriteHeart } from '@/features/favourites/components/FavouriteHeart'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'
import type { ProximityBand } from '@/lib/api/discovery'
import { formatDistanceCompact, formatGbpCompact } from '@/design-system/utils/formatters'
import { merchantDisplayName } from '@/lib/merchantDisplayName'
import { composeInfoLine, composeWhereLine } from './infoLine'
import { BranchCarouselCard } from './BranchCarouselCard'

// 2026-06-02 premium card v3 (impeccable + emil-design-eng craft pass).
//
// The card now floats as a white surface on the warm cream-stone Home body
// (soft navy shadow, warm hairline). Three tiers via `size`, each with a FIXED
// content height so cards in a rail match. No pills — four tight rows with the
// right-hand side carrying open / rating / proximity, and a single prominent
// value line (the saving is the data). Confident name, refined weights, calm
// rhythm. NAME size is constant across tiers (owner direction).
// Map Phase 2 S4 Task 2 — 'compact' had ZERO callers pre-S4 (grep-verified),
// so its exact geometry was free to tune without any Search/Category
// blast radius. MapListView (the shared-tile list row) is its first
// consumer: a shorter banner/logo than 'standard' keeps rows scannable in
// a vertical scrolling list while still carrying the full card (banner,
// logo, heart, name, descriptor, rating, open status, value line) — richer
// parity than the old bespoke BranchRow, at the cost of row density.
type CardSize = 'compact' | 'standard' | 'hero'
const BANNER_HEIGHT:  Record<CardSize, number> = { compact: 72, standard: 104, hero: 132 }
const LOGO_SIZE:      Record<CardSize, number> = { compact: 40, standard: 52,  hero: 58 }
const CONTENT_MIN_H:  Record<CardSize, number> = { compact: 96,  standard: 132, hero: 136 }

function formatDistance(metres: number | null): string {
  return formatDistanceCompact(metres) ?? ''
}

// Proximity → compact coloured dot + short label (no pill bg). NEAREST stays
// neutral navy-grey, not brand-rose (One-Voice rule — rose is load-bearing).
const BAND_META: Record<ProximityBand, { label: string; fg: string } | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       { label: 'In your area',  fg: color.success },
  A_LITTLE_FURTHER:   { label: 'Short trip',    fg: color.warning },
  NEAREST_ON_REDEEMO: { label: 'Nearest match', fg: color.text.secondary },
}

// Map Phase 2 S4 — opt-in aggregate-savings variant. Search/Category never
// pass this prop, so their render stays byte-for-byte identical to pre-S4
// (default 'max' takes the ORIGINAL code path below, unchanged). 'aggregate'
// adopts the Home-card language ('Save £X' + 'across N vouchers', stacked,
// Mustica-green amount — see NearbyCard/PopularCard) driven by
// merchant.totalEstimatedSaving instead of merchant.maxEstimatedSaving.
// Only MapBranchTile (the Map carousel) opts in.
type SavingsDisplay = 'max' | 'aggregate'

// Map Phase 2 W2b (F11) — opt-in presentation switch. 'default' is the
// pre-W2b card (Home / Search / Favourites / Category), byte-for-byte
// unchanged. 'mapCarousel' delegates to <BranchCarouselCard> (photo-first
// card with a status pill, bridging logo, and the shared value line). Only
// the Map carousel opts in, so every other surface is unaffected.
type BranchTileVariant = 'default' | 'mapCarousel'

type Props = {
  branch: BranchTileType
  onPress: (id: string) => void
  showFeaturedBadge?: boolean
  showClose?: boolean
  onClose?: () => void
  width?: number
  size?: CardSize
  savingsDisplay?: SavingsDisplay
  variant?: BranchTileVariant
}

export function BranchTile({
  branch,
  onPress,
  showFeaturedBadge,
  showClose,
  onClose,
  width,
  // Default 'standard' (not 'compact'): the only caller that omits size is
  // CategoryResultsScreen, and 'compact' silently shrank its result tiles vs
  // the pre-redesign card. Map passes 'standard' explicitly; Featured passes
  // 'hero'. No caller relies on a 'compact' default.
  size = 'standard',
  // Default 'max' preserves the pre-S4 single-voucher "Save up to £X" line
  // exactly. See the SavingsDisplay comment above.
  savingsDisplay = 'max',
  variant = 'default',
}: Props) {
  // W2b opt-in carousel presentation. Early return keeps the default render
  // path below completely untouched for every other surface.
  if (variant === 'mapCarousel') {
    return (
      <BranchCarouselCard
        branch={branch}
        onPress={onPress}
        {...(width !== undefined ? { width } : {})}
      />
    )
  }

  const isAggregateSavings = savingsDisplay === 'aggregate'
  const bannerHeight = BANNER_HEIGHT[size]
  const logoSize = LOGO_SIZE[size]
  const logoOverhang = Math.round(logoSize * 0.45)
  const logoTop = bannerHeight - (logoSize - logoOverhang)
  const contentPaddingTop = logoOverhang + 8

  const distanceStr = formatDistance(branch.distance)
  const labelText = branch.merchant.descriptor ?? branch.merchant.primaryCategory?.name ?? ''
  const localityStr = branch.branchLocalityName ?? branch.branchPostTown ?? branch.branchCity ?? ''
  const info = composeInfoLine({
    descriptor: labelText,
    locality:   localityStr,
    distance:   distanceStr,
    band:       branch.proximityBand,
  })
  const whereLine = composeWhereLine(info.locality, info.distance)
  const band = branch.proximityBand ? BAND_META[branch.proximityBand] : null

  // Map Phase 2 S4 — 'aggregate' reads totalEstimatedSaving (sum across the
  // merchant's vouchers, matching Home's NearbyCard/PopularCard semantics);
  // 'max' (default) keeps reading maxEstimatedSaving (a single voucher's
  // best value), unchanged from pre-S4.
  const saveAmount = isAggregateSavings
    ? branch.merchant.totalEstimatedSaving
    : branch.merchant.maxEstimatedSaving
  const showSave = saveAmount !== null && saveAmount > 0
  // formatGbpCompact keeps pence for sub-pound savings (£0.40, not a rounded
  // "£0") and drops them for whole pounds (£44). A positive saving below £0.50
  // previously rendered the nonsensical "Save up to £0" via Math.round.
  const saveLabel = showSave ? formatGbpCompact(saveAmount) : null
  const voucherCount = branch.merchant.voucherCount
  const countLabel = voucherCount === 1 ? '1 voucher' : `${voucherCount} vouchers`

  const displayName = merchantDisplayName(branch.merchant)
  const accessibilityLabel = localityStr
    ? `${displayName}, ${labelText}, ${localityStr}`
    : `${displayName}, ${labelText}`

  return (
    <PressableScale
      onPress={() => onPress(branch.id)}
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, width ? { width } : undefined]}
    >
      {/* Banner */}
      <View style={[styles.banner, { height: bannerHeight }]}>
        {branch.merchant.bannerUrl ? (
          <Image
            testID="branch-tile-banner-image"
            source={{ uri: branch.merchant.bannerUrl }}
            style={styles.bannerImage}
            contentFit="cover"
            transition={180}
            recyclingKey={branch.id}
          />
        ) : (
          <LinearGradient
            testID="branch-tile-banner-fallback"
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.topScrim}
          pointerEvents="none"
        />

        {showFeaturedBadge && (
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredBadge}
          >
            <Text style={styles.featuredText}>FEATURED</Text>
          </LinearGradient>
        )}

        <View style={styles.heartButton}>
          <FavouriteHeart
            entity="branch"
            id={branch.id}
            initialIsFavourited={branch.isFavourited}
            tone="on-gradient"
            size={size === 'hero' ? 20 : 18}
            testID={`branch-tile-${branch.id}-heart`}
          />
        </View>

        {showClose && onClose && (
          <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.closeButton}>
            <X size={14} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      <View style={[styles.logoWrapper, { top: logoTop }]}>
        {branch.merchant.logoUrl ? (
          <Image
            testID="branch-tile-logo-image"
            source={{ uri: branch.merchant.logoUrl }}
            style={[styles.logo, { width: logoSize, height: logoSize }]}
            contentFit="cover"
            transition={180}
            recyclingKey={`${branch.id}-logo`}
          />
        ) : (
          <View style={[styles.logo, { width: logoSize, height: logoSize, backgroundColor: color.navy }]}>
            <Text style={{ color: '#FFF', fontSize: Math.round(logoSize * 0.4), fontFamily: 'Lato-Bold' }}>
              {displayName.charAt(0)}
            </Text>
          </View>
        )}
      </View>

      {/* Content — fixed height per tier so cards in a rail match. */}
      <View style={[styles.content, { paddingTop: contentPaddingTop, minHeight: CONTENT_MIN_H[size] }]}>
        {/* Row 1 — name. */}
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>

        {/* Row 2 — descriptor (left) + rating (right). */}
        <View style={styles.metaRow}>
          <Text style={styles.descriptor} numberOfLines={1}>{info.descriptor}</Text>
          {branch.avgRating !== null && (
            <View style={styles.metaRight} testID="branch-tile-rating">
              <Star size={12} color="#F59E0B" fill="#F59E0B" />
              <Text style={styles.ratingValue}>{branch.avgRating.toFixed(1)}</Text>
              {branch.reviewCount > 0 ? <Text style={styles.ratingCount}>({branch.reviewCount})</Text> : null}
            </View>
          )}
        </View>

        {/* Row 3 — where (left) + open status (right). */}
        <View style={styles.metaRow}>
          {whereLine ? (
            <View style={styles.whereWrap}>
              <MapPin size={12} color={color.text.tertiary} strokeWidth={2} />
              <Text style={styles.where} numberOfLines={1}>{whereLine}</Text>
            </View>
          ) : <View style={styles.whereWrap} />}
          <View style={styles.metaRight} testID="branch-tile-open">
            <View style={[styles.dot, { backgroundColor: branch.isOpenNow ? color.savingsGreen : color.text.tertiary }]} />
            <Text style={[styles.statusLabel, { color: branch.isOpenNow ? color.success : color.text.tertiary }]}>
              {branch.isOpenNow ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        {/* Row 4 — value line (left) + proximity (right). Rendered only when
            there is actual content: a no-saving + no-voucher + no-proximity
            tile used to reserve a blank minHeight gap here. */}
        {(showSave || voucherCount > 0 || band) && (
          <View style={styles.valueRow}>
            {isAggregateSavings ? (
              // Map Phase 2 S4 — aggregate variant: Home's stacked
              // treatment ('Save' label over a prominent Mustica-green
              // amount, 'across N vouchers' connected below it). Only
              // reached when a caller explicitly opts in via
              // savingsDisplay="aggregate"; the branch below (the
              // original single-line "Save up to £X · N vouchers") is
              // untouched and still the default path.
              showSave || voucherCount > 0 ? (
                <View style={styles.savingBlock} testID="branch-tile-value">
                  {showSave ? <Text style={styles.savingLabel}>Save</Text> : null}
                  <View style={styles.savingValueRow}>
                    {showSave ? <Text style={styles.savingAmount}>{saveLabel}</Text> : null}
                    {voucherCount > 0 ? (
                      <Text style={styles.savingContext}>
                        {showSave ? `across ${countLabel}` : `${countLabel} available`}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.valueSpacer} />
              )
            ) : showSave || voucherCount > 0 ? (
              <Text style={styles.value} numberOfLines={1} testID="branch-tile-value">
                {saveLabel ? (
                  <>
                    <Text style={styles.valueSave}>Save up to {saveLabel}</Text>
                    {voucherCount > 0 ? <Text style={styles.valueSep}>{'  ·  '}</Text> : null}
                  </>
                ) : null}
                {voucherCount > 0 ? <Text style={styles.valueCount}>{countLabel}</Text> : null}
              </Text>
            ) : (
              // proximity-only row: spacer keeps the chip right-aligned.
              <View style={styles.valueSpacer} />
            )}
            {band && (
              <View style={styles.metaRight} testID="branch-tile-proximity">
                <View style={[styles.dot, { backgroundColor: band.fg }]} />
                <Text style={[styles.proximityLabel, { color: band.fg }]} numberOfLines={1}>{band.label}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  // White card floating on the warm Home body — soft navy shadow + a warm
  // hairline (emil: shadow does the work, the page contrast reads the edge).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDE4D7',
    shadowColor: '#010C35',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  banner: { position: 'relative', overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  bannerImage: { width: '100%', height: '100%', backgroundColor: '#FFF6EE' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 52 },
  featuredBadge: { position: 'absolute', top: 10, left: 10, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 },
  featuredText: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Lato-SemiBold', letterSpacing: 1.4, textTransform: 'uppercase' },
  heartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(1,12,53,0.30)',
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
  logoWrapper: { position: 'absolute', left: 14, zIndex: 2 },
  logo: {
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFF6EE',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#010C35',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  content: { paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 18 },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  name: { fontSize: 17, lineHeight: 22, fontFamily: 'Lato-Bold', color: color.text.primary, letterSpacing: -0.2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 12, fontFamily: 'Lato-SemiBold', letterSpacing: 0.1 },
  descriptor: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Medium', color: color.text.secondary },
  ratingValue: { fontSize: 13, fontFamily: 'Lato-Bold', color: color.text.primary },
  ratingCount: { fontSize: 11, fontFamily: 'Lato-Regular', color: color.text.tertiary },
  whereWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  where: { fontSize: 13, lineHeight: 18, fontFamily: 'Lato-Regular', color: color.text.tertiary, flexShrink: 1 },
  proximityLabel: { fontSize: 12, fontFamily: 'Lato-SemiBold', letterSpacing: 0.1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 3, minHeight: 20 },
  value: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
  valueSave: { color: '#15803D', fontFamily: 'Lato-Bold', fontSize: 15, letterSpacing: -0.1 },
  valueSep: { color: color.text.tertiary, fontFamily: 'Lato-Regular', fontSize: 13 },
  valueCount: { color: color.text.primary, fontFamily: 'Lato-SemiBold', fontSize: 13 },
  valueSpacer: { flex: 1 },
  // Map Phase 2 S4 — aggregate-savings variant, mirrors NearbyCard/
  // PopularCard's stacked "Save" language exactly (same font sizes/
  // families/colour) so the Map carousel card reads identically to Home.
  savingBlock: { flexShrink: 1, gap: 1 },
  savingLabel: { fontSize: 13, lineHeight: 17, fontFamily: 'Lato-Medium', color: color.text.secondary },
  savingValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 9, rowGap: 1 },
  savingAmount: { fontSize: 20, lineHeight: 24, fontFamily: 'MusticaPro-Semibold', color: '#15803D', letterSpacing: -0.1 },
  savingContext: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.text.primary },
})
