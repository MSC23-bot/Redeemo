/**
 * Phase 3C.1g M2.5 — `<BranchFavCard>` (Places tab card).
 *
 * Spec §8.1 — card chrome.  Tap → `/(app)/merchant/[id]?branch=<branchId>&from=favourites`.
 * No `<FavouriteHeart>` on the card (the Discovery-surface heart is the
 * add path; removal lives on the card itself).
 *
 * Device-QA R1 Wave 2 (2026-05-30) — removal affordance is now a small
 * visible Trash icon button at the top-right corner of the card.  The
 * previous swipe-to-remove gesture was too eager (revealed during
 * vertical scroll) and not discoverable.  Owner-direction: "reliability
 * beats cleverness" — a visible button is both unambiguous and
 * accessible.  When `onRemove` is omitted the button is not rendered
 * (preserves callers that only need a read-only card).
 */

import React from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color, elevation, radius, spacing } from '@/design-system/tokens'
import { MapPin, Trash2 } from '@/design-system/icons'
import type { FavouriteBranchItem } from '@/lib/api/favourites'

interface Props {
  row:       FavouriteBranchItem
  onPress:   () => void
  onRemove?: () => void
  testID?:   string
}

export function BranchFavCard({ row, onPress, onRemove, testID }: Props): React.ReactElement {
  const { merchant, name, city, postcode, isOpen, isUnavailable, voucherCount } = row

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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isUnavailable && styles.cardDim, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${merchant.businessName}, ${name}. ${statusLabel}. ${voucherCount} vouchers.`}
      testID={testID}
    >
      {merchant.logoUrl ? (
        <Image source={{ uri: merchant.logoUrl }} style={styles.logo} accessibilityLabel="" />
      ) : (
        <View style={[styles.logo, styles.logoFallback]}>
          <Text variant="heading.md" style={styles.logoFallbackText}>
            {merchant.businessName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.body}>
        <Text variant="heading.sm" numberOfLines={1} style={styles.merchantName}>
          {merchant.businessName}
        </Text>
        <Text variant="body.sm" numberOfLines={1} style={styles.branchName}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <MapPin size={12} color={color.text.secondary} strokeWidth={2} />
          <Text variant="label.md" numberOfLines={1} style={styles.metaText}>
            {[city, postcode].filter(Boolean).join(', ') || 'Location unavailable'}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text variant="label.md" style={[styles.statusPill, statusStyle]}>
            {statusLabel}
          </Text>
          {voucherCount > 0 && (
            <Text variant="label.md" style={styles.voucherCount}>
              {voucherCount} {voucherCount === 1 ? 'voucher' : 'vouchers'}
            </Text>
          )}
        </View>
      </View>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          // 36x36 hit area, 18pt glyph — matches material/iOS
          // recommended minimum tap target without crowding the card.
          style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${merchant.businessName} from favourites`}
          testID={testID ? `${testID}-remove` : 'branch-fav-card-remove'}
          hitSlop={8}
        >
          <Trash2 size={18} color={color.text.tertiary} strokeWidth={1.8} />
        </Pressable>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection:    'row',
    alignItems:       'center',
    padding:          spacing[3],
    marginHorizontal: spacing[4],
    marginVertical:   spacing[2],
    borderRadius:     radius.lg,
    backgroundColor:  color.surface.raised,
    ...elevation.sm,
  },
  cardDim: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  logo: {
    width:           56,
    height:          56,
    borderRadius:    radius.md,
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
    flex:        1,
    marginLeft:  spacing[3],
    gap:         spacing[1],
  },
  merchantName: {
    color: color.text.primary,
  },
  branchName: {
    color: color.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[1],
  },
  metaText: {
    color: color.text.secondary,
    flex:  1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[2],
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
  voucherCount: {
    color: color.text.secondary,
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
    backgroundColor: color.surface.subtle,
  },
  removeBtnPressed: {
    opacity: 0.6,
  },
})
