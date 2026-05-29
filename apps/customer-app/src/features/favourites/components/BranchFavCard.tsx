/**
 * Phase 3C.1g M2.5 — `<BranchFavCard>` (Places tab card).
 *
 * Spec §8.1 — card chrome.  Tap → `/(app)/merchant/[id]?branch=<branchId>&from=favourites`.
 * No `<FavouriteHeart>` on the card (swipe-to-remove is the removal path
 * on the Favourites tab; the heart only appears on Discovery surfaces).
 */

import React from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color, elevation, radius, spacing } from '@/design-system/tokens'
import { MapPin } from '@/design-system/icons'
import type { FavouriteBranchItem } from '@/lib/api/favourites'

interface Props {
  row:      FavouriteBranchItem
  onPress:  () => void
  testID?:  string
}

export function BranchFavCard({ row, onPress, testID }: Props): React.ReactElement {
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
})
