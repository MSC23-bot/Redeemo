/**
 * Phase 3C.1g M2.5 — `<VoucherFavCard>` (Vouchers tab card).
 *
 * Spec §9.1 — voucher state pill rendering driven by `priorityBucket`
 * (server-computed M1.4) + `isUnavailable`.  Tap →
 * `/(app)/voucher/[id]?from=favourites`.
 *
 * Device-QA R1 Wave 3 (2026-05-30) finding #20 — surgical v1 card
 * upgrade.  Layout now matches the voucher-card visual language used
 * on Merchant Profile / Voucher Detail hero:
 *
 *   ┌─────────────────────────────────┐
 *   │ ▓▓▓ per-type gradient ▓▓▓       │
 *   │ [Type pill]               [Trash]│
 *   │                                 │
 *   │ Voucher title (display.sm)      │
 *   │ Merchant name                   │
 *   │ Save up to £X.XX (display.md)   │
 *   │                                 │
 *   │ [State pill]            [View →]│ ← CTA only for bucket 1/2
 *   └─────────────────────────────────┘
 *
 * Removal: visible Trash button at top-right (Device-QA R1 Wave 2 lock —
 * replaces the deleted swipe-to-remove gesture).
 *
 * State pill mapping (spec §9.3 buckets → display chip):
 *   1 → "Urgent · ends soon"   (TL <60 min remaining)  → CTA "Redeem →"
 *   2 → "Available"            (active + redeemable)    → CTA "Redeem →"
 *   3 → "Cooldown"             (REUSABLE in cooldown)   → CTA "View →"
 *   4 → "Redeemed this cycle"  (non-TL non-REUSABLE)    → CTA "View →"
 *   5 → "Outside window"       (TL outside its window)  → CTA "View →"
 *   6 → "Unavailable"          (merchant/voucher inactive) → no CTA
 *   7 → "Expired"              (expiryDate ≤ now)       → no CTA
 *
 * Scope guard (per owner-locked Wave 3 #20): reuses the existing
 * `color.voucher.gradientByType` + `badgeTextByType` palettes and the
 * canonical `voucherTypeLabel()` helper from `voucher/utils`.  No new
 * design-system tokens.
 */

import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color, radius, elevation, spacing } from '@/design-system/tokens'
import { ArrowRight, Trash2 } from '@/design-system/icons'
import { voucherTypeLabel } from '@/features/voucher/utils/voucherTheme'
import type { VoucherType } from '@/lib/api/voucher'
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

// Buckets 6/7 are terminal (merchant/voucher dead) — no CTA at all.
// Buckets 1/2 fast-path to Redeem; 3/4/5 land on View (Voucher Detail
// surfaces the proper state + any next-action affordance).
const NO_CTA_BUCKETS = new Set<Bucket>([6, 7])

function ctaLabel(bucket: Bucket): string {
  return bucket === 1 || bucket === 2 ? 'Redeem' : 'View'
}

export function VoucherFavCard({ row, onPress, onRemove, testID }: Props): React.ReactElement {
  const bucket = row.priorityBucket as Bucket
  const tone   = BUCKET_TONE[bucket] ?? BUCKET_TONE[2]
  const label  = BUCKET_COPY[bucket] ?? BUCKET_COPY[2]
  const isDimmed = DIMMED_BUCKETS.has(bucket) || row.isUnavailable

  const gradient = color.voucher.gradientByType[row.type as keyof typeof color.voucher.gradientByType]
    ?? color.voucher.gradientByType.DISCOUNT_FIXED

  const typeFg = color.voucher.badgeTextByType[row.type as keyof typeof color.voucher.badgeTextByType]
    ?? color.voucher.badgeTextByType.DISCOUNT_FIXED

  const typeLabelText = voucherTypeLabel(row.type as VoucherType)

  const showCta = !NO_CTA_BUCKETS.has(bucket)

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
        {/* Top row — type pill on the left, Remove trash on the right */}
        <View style={styles.topRow}>
          <View style={styles.typePill} testID={testID ? `${testID}-type-pill` : 'voucher-fav-card-type-pill'}>
            <Text variant="label.md" style={[styles.typePillText, { color: typeFg }]}>
              {typeLabelText}
            </Text>
          </View>
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
        </View>

        {/* Body — title, merchant, saving */}
        <View style={styles.body}>
          <Text variant="display.sm" numberOfLines={2} style={[styles.title, { color: typeFg }]}>
            {row.title}
          </Text>
          <Text variant="body.sm" numberOfLines={1} style={styles.merchant}>
            {row.merchant.businessName}
          </Text>
          {row.estimatedSaving > 0 && (
            <Text variant="display.md" style={[styles.saving, { color: typeFg }]}>
              {`Save up to £${Number.isInteger(row.estimatedSaving) ? row.estimatedSaving : row.estimatedSaving.toFixed(2)}`}
            </Text>
          )}
        </View>

        {/* Bottom row — state pill + CTA */}
        <View style={styles.bottomRow}>
          <Text variant="label.md" style={[styles.statePill, { backgroundColor: tone.bg, color: tone.fg }]}>
            {label}
          </Text>
          {showCta && (
            <View style={styles.ctaPill} testID={testID ? `${testID}-cta` : 'voucher-fav-card-cta'}>
              <Text variant="label.md" style={[styles.ctaText, { color: typeFg }]}>
                {ctaLabel(bucket)}
              </Text>
              <ArrowRight size={14} color={typeFg} strokeWidth={2.2} />
            </View>
          )}
        </View>
      </LinearGradient>
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
    opacity: 0.92,
  },
  gradient: {
    padding: spacing[4],
    gap:     spacing[3],
  },
  topRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },
  typePill: {
    paddingHorizontal: spacing[2],
    paddingVertical:   2,
    backgroundColor:   'rgba(255, 255, 255, 0.78)',
    borderRadius:      999,
    overflow:          'hidden',
  },
  typePillText: {
    fontWeight: '600',
  },
  removeBtn: {
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
  bottomRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing[2],
  },
  statePill: {
    paddingHorizontal: spacing[2],
    paddingVertical:   2,
    borderRadius:      999,
    overflow:          'hidden',
  },
  ctaPill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: spacing[3],
    paddingVertical:   6,
    backgroundColor:   'rgba(255, 255, 255, 0.92)',
    borderRadius:      999,
  },
  ctaText: {
    fontWeight: '700',
  },
})
