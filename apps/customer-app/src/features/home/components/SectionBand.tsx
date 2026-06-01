import React from 'react'
import { StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { spacing } from '@/design-system'

/**
 * Batch 2 (2026-06-01) — full-bleed section identity band for Home
 * (Composition B, spec §4). Wraps a rail so its surface treatment reads as
 * a distinct tonal zone against the white page:
 *   - `cream` → Featured "of the brand, curated" identity band (§9.4)
 *   - `warm`  → Popular / Trending "happening now" band (§9.5), with a 1px
 *     brand-coral-tinted hairline top + bottom.
 *
 * Full-bleed: the band spans the full Home ScrollView content width (Home
 * sections self-pad horizontally — RailHeader + the tile rail each carry
 * their own 18pt padding), so the gradient reaches both screen edges while
 * the rail content inside stays aligned.
 *
 * Vertical padding is intentionally modest and tunable in device QA
 * (plan D1) — the inter-section gap on HomeScreen separates the zones.
 */

type Variant = 'cream' | 'warm'

const GRADIENT: Record<Variant, [string, string]> = {
  cream: ['#FFF9F5', '#FCF0E5'],
  warm:  ['#FFFBF6', '#FFF5E6'],
}

type Props = {
  variant: Variant
  children: React.ReactNode
  testID?: string
}

export function SectionBand({ variant, children, testID }: Props) {
  return (
    <LinearGradient
      testID={testID}
      colors={GRADIENT[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.band, variant === 'warm' ? styles.warmHairline : null]}
    >
      {children}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  band: {
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
  },
  // §9.5 — 1px brand-coral-tinted hairline top + bottom marks the
  // "happening now" warm band's edges against the white page.
  warmHairline: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232, 74, 0, 0.18)', // brandCoral #E84A00 @ ~18% alpha
  },
})
