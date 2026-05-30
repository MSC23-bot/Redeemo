/**
 * Phase 3C.1g M2.5 — `<BranchFavCard>` (Places tab card).
 *
 * Spec §8.1 — card chrome.  Tap → `/(app)/merchant/[id]?branch=<branchId>&from=favourites`.
 * No `<FavouriteHeart>` on the card (the Discovery-surface heart is the
 * add path; removal lives on the card itself as a visible Trash).
 *
 * Device-QA R1 Wave 3 (2026-05-30) finding #20 — surgical v1 card
 * upgrade.  Layout language matches the richer cards used elsewhere in
 * the app:
 *
 *   ┌────────────────────────────────────────┐
 *   │ [banner image / brand-gradient fallback]│ [Trash]  (88pt)
 *   │  ┌──┐                                   │
 *   │  │PN│ ← logo overlaps banner/body seam  │
 *   │  └──┘                                   │
 *   │  Merchant name                          │
 *   │  Cuisine · Area, Postcode  ⭐ 4.5 (17)  │
 *   │  [Open now] [3 vouchers] [Save up to £25]│
 *   └────────────────────────────────────────┘
 *
 * Scope guard (per owner-locked Wave 3 #20): no new design-system
 * tokens; reuses `color.brandGradient`, `color.voucher.*` palettes
 * elsewhere, and existing typography variants.  Broader Favourites
 * polish stays in the deferred polish bundle.
 */

import React from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color, elevation, radius, spacing } from '@/design-system/tokens'
import { Star, Trash2 } from '@/design-system/icons'
import { haversineMetres } from '@/design-system/utils/haversine'
import { formatDistance } from '@/design-system/utils/formatters'
import { useUserLocation } from '@/hooks/useLocation'
import type { FavouriteBranchItem } from '@/lib/api/favourites'

interface Props {
  row:       FavouriteBranchItem
  onPress:   () => void
  onRemove?: () => void
  testID?:   string
}

const BANNER_HEIGHT = 88
const LOGO_SIZE     = 56
// Logo overlaps the banner/body seam by roughly half its height so the
// banner reads as identity chrome and the body content has clean
// breathing room.
const LOGO_OVERLAP  = 22

export function BranchFavCard({ row, onPress, onRemove, testID }: Props): React.ReactElement {
  const {
    merchant,
    name,
    city,
    postcode,
    addressLine1,
    latitude,
    longitude,
    isOpen,
    isUnavailable,
    voucherCount,
    maxEstimatedSaving,
    totalEstimatedSaving,
    avgRating,
    reviewCount,
  } = row

  // Wave 4 #4 (2026-05-30) — client-side distance using the existing
  // `useUserLocation` + the lat/lng on the favourites payload.  No
  // backend change required; lat/lng is already redacted on
  // POSTCODE_CENTROID branches so `haversineMetres` returns null and
  // the distance pill is suppressed automatically.
  const { location } = useUserLocation()
  const distanceMetres = haversineMetres(
    location?.lat,
    location?.lng,
    latitude,
    longitude,
  )
  const distanceLabel = formatDistance(distanceMetres)

  const statusLabel = isUnavailable
    ? 'Unavailable'
    : isOpen
      ? 'Open now'
      : 'Closed'

  const statusStyle = isUnavailable
    ? styles.statusUnavailable
    : isOpen
      ? styles.statusOpen
      : styles.statusClosed

  // Use the explicit branch line ("Covelum — Brightlingsea") when it
  // differs from the merchant name, falling back to the address line
  // for single-branch merchants.
  const branchSubtitle = name !== merchant.businessName
    ? name
    : (addressLine1 ?? null)

  const cuisineOrCategory = merchant.primaryCategory?.name ?? null
  const areaLine = [city, postcode].filter(Boolean).join(', ')

  // Wave 4 #3 (locked 2026-05-30) — Save semantics aligned with
  // Search/BranchTile: copy is "Save £X across N vouchers" using
  // `totalEstimatedSaving` (sum of all active voucher savings).
  // `maxEstimatedSaving` is preserved on the payload but no longer
  // drives the visible chip — it was misleading on multi-voucher
  // merchants (Covelum's 6 vouchers totaled £38.50 but the chip
  // showed only £8.50).  Smart £ format — whole pounds drop the
  // trailing .00.
  const savingEffective = totalEstimatedSaving > 0 ? totalEstimatedSaving : maxEstimatedSaving
  const savingFormatted = savingEffective > 0
    ? `£${Number.isInteger(savingEffective) ? savingEffective : savingEffective.toFixed(2)}`
    : null
  const savingLabel = savingFormatted !== null
    ? voucherCount > 1
      ? `Save ${savingFormatted} across ${voucherCount} vouchers`
      : `Save ${savingFormatted}`
    : null

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isUnavailable && styles.cardDim, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${merchant.businessName}${branchSubtitle ? `, ${branchSubtitle}` : ''}. ${statusLabel}. ${voucherCount} vouchers.`}
      testID={testID}
    >
      {/* Banner image OR brand-gradient fallback */}
      <View style={styles.bannerWrap}>
        {merchant.bannerUrl ? (
          <Image
            source={{ uri: merchant.bannerUrl }}
            style={styles.bannerImage}
            accessibilityLabel=""
            testID={testID ? `${testID}-banner-image` : 'branch-fav-card-banner-image'}
          />
        ) : (
          <LinearGradient
            colors={color.brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
            testID={testID ? `${testID}-banner-gradient` : 'branch-fav-card-banner-gradient'}
          />
        )}
        {onRemove && (
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${merchant.businessName} from favourites`}
            testID={testID ? `${testID}-remove` : 'branch-fav-card-remove'}
            hitSlop={8}
          >
            <Trash2 size={18} color="#FFFFFF" strokeWidth={1.8} />
          </Pressable>
        )}
      </View>

      {/* Logo — absolute, overlapping the banner/body seam */}
      <View style={styles.logoWrap}>
        {merchant.logoUrl ? (
          <Image source={{ uri: merchant.logoUrl }} style={styles.logo} accessibilityLabel="" />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text variant="heading.md" style={styles.logoFallbackText}>
              {merchant.businessName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Body — name, meta row, pills */}
      <View style={styles.body}>
        <Text variant="heading.md" numberOfLines={1} style={styles.merchantName}>
          {merchant.businessName}
        </Text>
        {(cuisineOrCategory || areaLine || (avgRating && reviewCount > 0)) && (
          <View style={styles.metaRow}>
            {cuisineOrCategory && (
              <Text variant="body.sm" style={styles.metaText} numberOfLines={1}>
                {cuisineOrCategory}
              </Text>
            )}
            {areaLine && (
              <Text variant="body.sm" style={styles.metaText} numberOfLines={1}>
                {cuisineOrCategory ? ' · ' : ''}{areaLine}
              </Text>
            )}
            {avgRating !== null && reviewCount > 0 && (
              <View style={styles.ratingChip}>
                <Star size={12} color={color.warning} fill={color.warning} strokeWidth={0} />
                <Text variant="label.md" style={styles.ratingText}>
                  {avgRating.toFixed(1)} ({reviewCount})
                </Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.pillsRow}>
          <Text variant="label.md" style={[styles.statusPill, statusStyle]}>
            {statusLabel}
          </Text>
          {/* Wave 4 #4 — distance pill (client-computed via haversine).
              Suppressed when lat/lng are missing on either side OR when
              the branch's position was redacted upstream
              (POSTCODE_CENTROID etc.). */}
          {distanceLabel && (
            <Text
              variant="label.md"
              style={[styles.statusPill, styles.distancePill]}
              testID={testID ? `${testID}-distance-pill` : 'branch-fav-card-distance-pill'}
            >
              {distanceLabel}
            </Text>
          )}
          {voucherCount > 0 && (
            <Text variant="label.md" style={[styles.statusPill, styles.voucherCountPill]}>
              {voucherCount} {voucherCount === 1 ? 'voucher' : 'vouchers'}
            </Text>
          )}
          {savingLabel && (
            <Text
              variant="label.md"
              style={[styles.statusPill, styles.savingPill]}
              testID={testID ? `${testID}-saving-pill` : 'branch-fav-card-saving-pill'}
            >
              {savingLabel}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
    marginVertical:   spacing[2],
    borderRadius:     radius.lg,
    backgroundColor:  color.surface.raised,
    overflow:         'hidden',
    ...elevation.sm,
  },
  cardDim: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.92,
  },
  bannerWrap: {
    position: 'relative',
    width:    '100%',
    height:   BANNER_HEIGHT,
  },
  bannerImage: {
    width:           '100%',
    height:          '100%',
    backgroundColor: color.surface.subtle,
  },
  removeBtn: {
    position:        'absolute',
    top:             spacing[2],
    right:           spacing[2],
    width:           36,
    height:          36,
    borderRadius:    18,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0, 0, 0, 0.40)',
  },
  removeBtnPressed: {
    opacity: 0.6,
  },
  logoWrap: {
    position:  'absolute',
    top:       BANNER_HEIGHT - LOGO_OVERLAP,
    left:      spacing[4],
    width:     LOGO_SIZE,
    height:    LOGO_SIZE,
    borderRadius: radius.md,
    backgroundColor: color.surface.raised,
    // White ring around the logo so it reads cleanly against the
    // banner image below.
    padding:   2,
    ...elevation.sm,
  },
  logo: {
    width:           LOGO_SIZE - 4,
    height:          LOGO_SIZE - 4,
    borderRadius:    radius.md - 2,
    backgroundColor: color.surface.subtle,
  },
  logoFallback: {
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: color.surface.tint,
  },
  logoFallbackText: {
    color: color.brandRose,
  },
  body: {
    // Top padding clears the overlapping logo (LOGO_SIZE - LOGO_OVERLAP
    // is the visible-below-banner portion; add a little breathing
    // room).
    paddingTop:    (LOGO_SIZE - LOGO_OVERLAP) + spacing[2],
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[4],
    gap:           spacing[2],
  },
  merchantName: {
    color: color.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           spacing[1],
  },
  metaText: {
    color: color.text.secondary,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginLeft:    spacing[1],
  },
  ratingText: {
    color: color.text.secondary,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    alignItems:    'center',
    gap:           spacing[1],
    marginTop:     spacing[1],
  },
  statusPill: {
    paddingHorizontal: spacing[2],
    paddingVertical:   2,
    borderRadius:      999,
    overflow:          'hidden',
  },
  statusOpen: {
    backgroundColor: '#D1FAE5',
    color:           color.success,
  },
  statusClosed: {
    backgroundColor: color.surface.subtle,
    color:           color.text.secondary,
  },
  statusUnavailable: {
    backgroundColor: color.surface.subtle,
    color:           color.text.tertiary,
  },
  voucherCountPill: {
    backgroundColor: color.surface.tint,
    color:           color.brandRose,
  },
  savingPill: {
    backgroundColor: '#DCFCE7',
    color:           color.savingsGreen,
  },
  distancePill: {
    backgroundColor: color.surface.subtle,
    color:           color.text.secondary,
  },
})
