/**
 * Phase 3C.1g M2.5 — `<VoucherFavCard>` (Vouchers tab card).
 *
 * Spec §9.1 — voucher state pill rendering driven by `priorityBucket`
 * (server-computed M1.4) + `isUnavailable`.  Tap →
 * `/(app)/voucher/[id]?from=favourites`.
 *
 * Removal: Device-QA R1 Wave 2 (2026-05-30) replaced the swipe-to-
 * remove gesture with a visible Trash icon button (see
 * `<BranchFavCard>` for the matching change + rationale).  On the
 * voucher card the trash sits on a semi-transparent dark circle so it
 * reads against any per-type gradient.
 *
 * State pill mapping (spec §9.3 buckets → display chip):
 *   1 → "Urgent · ends soon"   (TL <60 min remaining)
 *   2 → "Available"            (active + redeemable)
 *   3 → "Cooldown"             (REUSABLE in cooldown)
 *   4 → "Redeemed this cycle"  (non-TL non-REUSABLE)
 *   5 → "Outside window"       (TL outside its window)
 *   6 → "Unavailable"          (merchant/voucher status not active)
 *   7 → "Expired"              (expiryDate ≤ now)
 *
 * Display copy intentionally minimal — VoucherCard's richer pill lives
 * on Discovery/Merchant Profile and reads voucher-specific state we
 * don't carry on the favourites list payload.  The Favourites tab
 * surfaces a "what state is this in" hint only; deep state lives on
 * Voucher Detail.
 */

import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color, elevation, radius, spacing } from '@/design-system/tokens'
import { Trash2 } from '@/design-system/icons'
import type { FavouriteVoucherItem } from '@/lib/api/favourites'

interface Props {
  row:       FavouriteVoucherItem
  onPress:   () => void
  onRemove?: () => void
  testID?:   string
}

type Bucket = 1 | 2 | 3 | 4 | 5 | 6 | 7

const BUCKET_COPY: Record<Bucket, string> = {
  1: 'Urgent · ends soon',
  2: 'Available',
  3: 'Cooldown',
  4: 'Redeemed this cycle',
  5: 'Outside window',
  6: 'Unavailable',
  7: 'Expired',
}

const BUCKET_TONE: Record<Bucket, { bg: string; fg: string }> = {
  1: { bg: '#FFEDD5', fg: '#C2410C' },   // amber-coral
  2: { bg: '#D1FAE5', fg: color.success },
  3: { bg: '#CFFAFE', fg: color.info },
  4: { bg: color.surface.subtle, fg: color.text.secondary },
  5: { bg: color.surface.subtle, fg: color.text.secondary },
  6: { bg: color.surface.subtle, fg: color.text.tertiary },
  7: { bg: color.surface.subtle, fg: color.text.tertiary },
}

const DIMMED_BUCKETS = new Set<Bucket>([3, 4, 5, 6, 7])

export function VoucherFavCard({ row, onPress, onRemove, testID }: Props): React.ReactElement {
  const bucket = row.priorityBucket as Bucket
  const tone   = BUCKET_TONE[bucket] ?? BUCKET_TONE[2]
  const label  = BUCKET_COPY[bucket] ?? BUCKET_COPY[2]
  const isDimmed = DIMMED_BUCKETS.has(bucket) || row.isUnavailable

  const gradient = color.voucher.gradientByType[row.type as keyof typeof color.voucher.gradientByType]
    ?? color.voucher.gradientByType.DISCOUNT_FIXED

  const typeFg = color.voucher.badgeTextByType[row.type as keyof typeof color.voucher.badgeTextByType]
    ?? color.voucher.badgeTextByType.DISCOUNT_FIXED

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isDimmed && styles.cardDim, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${row.merchant.businessName}. ${label}.`}
      testID={testID}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.body}>
          <Text variant="display.sm" numberOfLines={2} style={[styles.title, { color: typeFg }]}>
            {row.title}
          </Text>
          <Text variant="body.sm" numberOfLines={1} style={styles.merchant}>
            {row.merchant.businessName}
          </Text>
          {row.estimatedSaving > 0 && (
            <Text variant="display.md" style={[styles.saving, { color: typeFg }]}>
              {`Save up to £${row.estimatedSaving.toFixed(2)}`}
            </Text>
          )}
        </View>
        <View style={styles.statusRow}>
          <Text variant="label.md" style={[styles.statusPill, { backgroundColor: tone.bg, color: tone.fg }]}>
            {label}
          </Text>
        </View>
      </LinearGradient>
      {onRemove && (
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${row.title} from favourites`}
          testID={testID ? `${testID}-remove` : 'voucher-fav-card-remove'}
          hitSlop={8}
        >
          <Trash2 size={18} color="#FFFFFF" strokeWidth={1.8} />
        </Pressable>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
    marginVertical:   spacing[2],
    borderRadius:     radius.lg,
    overflow:         'hidden',
    ...elevation.sm,
  },
  cardDim: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  gradient: {
    padding: spacing[4],
    gap:     spacing[2],
  },
  body: {
    gap: spacing[1],
  },
  title: {
    letterSpacing: -0.3,
  },
  merchant: {
    color: color.text.secondary,
  },
  saving: {
    marginTop:     spacing[1],
    letterSpacing: -0.5,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop:     spacing[1],
  },
  statusPill: {
    paddingHorizontal: spacing[2],
    paddingVertical:   2,
    borderRadius:      999,
    overflow:          'hidden',
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
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  removeBtnPressed: {
    opacity: 0.6,
  },
})
