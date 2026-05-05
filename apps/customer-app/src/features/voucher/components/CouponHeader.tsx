import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient, voucherTypeLabel, formatPounds } from '../utils/voucherTheme'

type Props = {
  type: VoucherType
  title: string
  estimatedSaving: number
}

/**
 * Top half of the coupon — type-coloured gradient background, eyebrow
 * "Save up to" copy, hero £value, and the voucher title.
 *
 * Visual language matches VoucherCard: same gradient palette, same
 * "Save up to" eyebrow + £value composition. The Voucher Detail
 * version is taller and centred (vs VoucherCard's left-aligned hero)
 * since the screen has more vertical real estate.
 */
export function CouponHeader({ type, title, estimatedSaving }: Props) {
  const gradient = voucherGradient(type)
  const typeLabel = voucherTypeLabel(type)

  return (
    <View style={styles.root} testID="coupon-header">
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.typeChip}>
        <Text variant="label.md" style={styles.typeChipText}>
          {typeLabel}
        </Text>
      </View>

      <Text variant="label.md" style={styles.eyebrow}>
        Save up to
      </Text>
      <Text variant="display.lg" style={styles.heroValue}>
        {formatPounds(estimatedSaving)}
      </Text>
      <Text variant="heading.md" style={styles.title} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
    </View>
  )
}

const WHITE_TEXT = '#FFFCFA'

const styles = StyleSheet.create({
  root: {
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  typeChip: {
    backgroundColor: 'rgba(1,12,53,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginBottom: 16,
  },
  typeChipText: {
    color: WHITE_TEXT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  eyebrow: {
    color: WHITE_TEXT,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.92,
    marginBottom: 4,
  },
  heroValue: {
    color: WHITE_TEXT,
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 60,
    fontVariant: ['tabular-nums'],
  },
  title: {
    color: WHITE_TEXT,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
})
