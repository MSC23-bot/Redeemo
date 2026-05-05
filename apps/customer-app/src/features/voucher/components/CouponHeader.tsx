import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Tag, Gift, Percent, Clock, Package, RefreshCw, Coins } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import type { VoucherType } from '@/lib/api/voucher'
import { voucherGradient, voucherTypeLabel, formatPounds } from '../utils/voucherTheme'

type Props = {
  type: VoucherType
  title: string
  description: string | null
  estimatedSaving: number
  /**
   * Top safe-area inset (status bar height + notch). The header's
   * paddingTop and the save badge's `top` derive from this so the
   * type badge / title / save badge always sit BELOW the parent
   * screen's frosted nav row instead of underneath it. Without this,
   * the type badge and back button collide on iPhones with notches.
   */
  insetTop: number
}

const typeIcon = (type: VoucherType) => {
  switch (type) {
    case 'BOGO':             return Gift
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT': return Percent
    case 'FREEBIE':          return Gift
    case 'SPEND_AND_SAVE':   return Coins
    case 'PACKAGE_DEAL':     return Package
    case 'TIME_LIMITED':     return Clock
    case 'REUSABLE':         return RefreshCw
    default:                 return Tag
  }
}

const WHITE        = '#FFFFFF'
const WHITE_92     = 'rgba(255,255,255,0.92)'
const WHITE_80     = 'rgba(255,255,255,0.80)'

// Vertical room reserved for the parent screen's NavRow (38pt button +
// 8pt top offset + ~12pt breathing room). Keep in sync with
// VoucherDetailScreen.NavRow positioning.
const NAV_ROOM = 58

/**
 * Top of the coupon — type-coloured gradient background with a frosted
 * dashed "Save £X" badge in the top-right corner. Layout matches v4
 * mockup §coupon-header: left-aligned type badge + title + description
 * with the save circle floating top-right, sitting BELOW the nav row.
 *
 * Visual depth: type-coloured gradient (light → dark, top-left → bottom-
 * right) plus two overlay layers: a vertical vignette (slight darkening
 * at top + bottom) and a pair of radial highlights for subtle texture.
 */
export function CouponHeader({ type, title, description, estimatedSaving, insetTop }: Props) {
  const gradient  = voucherGradient(type)
  const typeLabel = voucherTypeLabel(type)
  const Icon      = typeIcon(type)

  // paddingTop = status-bar + nav button room + breathing. saveBadge
  // top aligns roughly with the title — sits below the nav buttons.
  const paddingTop = insetTop + NAV_ROOM
  const saveTop    = paddingTop

  return (
    <View style={[styles.root, { paddingTop }]} testID="coupon-header">
      {/* Base type gradient */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Vertical vignette — slight darken at top + bottom for depth */}
      <LinearGradient
        colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Radial-style highlights — approximated with a gentle diagonal
          gradient since RN doesn't do radial natively. Subtle enough
          that on-device it still reads as a texture, not a gradient. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0.8 }}
        end={{ x: 0.8, y: 0.2 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <View style={styles.typeBadge}>
          <Icon size={14} color={WHITE_92} strokeWidth={2} />
          <Text variant="label.md" style={styles.typeBadgeText}>
            {typeLabel}
          </Text>
        </View>

        <Text variant="heading.lg" style={styles.title} numberOfLines={3} ellipsizeMode="tail">
          {title}
        </Text>

        {description ? (
          <Text variant="body.sm" style={styles.description} numberOfLines={3} ellipsizeMode="tail">
            {description}
          </Text>
        ) : null}
      </View>

      {/* Save badge — top-right circular dashed badge */}
      <View
        style={[styles.saveBadge, { top: saveTop }]}
        accessible
        accessibilityLabel={`Save ${formatPounds(estimatedSaving)}`}
      >
        <Text variant="label.md" style={styles.saveLabel}>SAVE</Text>
        <Text variant="heading.sm" style={styles.saveAmount}>
          {formatPounds(estimatedSaving)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    minHeight: 260,
    paddingBottom: 30,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '70%',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  typeBadgeText: {
    color: WHITE_92,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    color: WHITE,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  description: {
    color: WHITE_80,
    fontSize: 13,
    lineHeight: 19,
  },
  saveBadge: {
    position: 'absolute',
    right: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  saveLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: WHITE_80,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  saveAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.4,
    marginTop: 1,
  },
})
