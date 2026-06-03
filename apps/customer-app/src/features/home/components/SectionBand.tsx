import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg'
import { spacing } from '@/design-system'

/**
 * Full-bleed section identity band for Home (2026-06-03 background system).
 *
 * - `warm` → Popular / Trending: a VERY LIGHT warm peach in the brand's coral
 *   family (derived from coral `#E84A00`, not a golden/yellow peach), with the
 *   brand resonance carried by a GLOW rather than a saturated base. The glow is
 *   "radiance" from the TOP edge AND the BOTTOM edge — warm brand coral, fading
 *   toward the centre — for a soft, curved, raised 3D feel. The base is a
 *   reliable `expo-linear-gradient` (renders immediately); the radiance is an SVG
 *   on top. Navy heading = the secondary brand tone, legible on the light base.
 *   Owner exploration 2026-06-03.
 * - `cream` → retained (solid) for forward-compat; Featured sits on the plain body.
 */
type Variant = 'cream' | 'warm'

const CREAM = { bg: '#F6ECE0', border: 'rgba(226, 12, 4, 0.10)' }
// A VERY LIGHT warm peach in the brand's coral family (derived from coral
// #E84A00, not a golden/yellow peach) — kept soft + subtle, with the brand
// resonance carried by the glow rather than a saturated base. Owner direction
// 2026-06-03: "very light peachy warm that resonates with the branding".
const WARM_TOP = '#FEF6F0'
const WARM_BOTTOM = '#FBE2D3'
const WARM_BORDER = 'rgba(232, 74, 0, 0.16)'

type Props = {
  variant: Variant
  children: React.ReactNode
  testID?: string
}

export function SectionBand({ variant, children, testID }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 })

  if (variant === 'warm') {
    return (
      <View
        testID={testID}
        style={[styles.band, styles.warmBand, { borderColor: WARM_BORDER }]}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {/* Base: brand rose→coral gradient, light shades (renders immediately). */}
        <LinearGradient
          testID="section-band-base"
          colors={[WARM_TOP, WARM_BOTTOM]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Brand glow: rose at the centre fading through coral, behind the heading. */}
        {size.w > 0 && size.h > 0 ? (
          <Svg testID="section-band-glow" width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              {/* Radiance from the TOP edge AND the BOTTOM edge, each fading
                  toward the centre — gives the block a soft, curved, raised 3D
                  feel. Warm brand coral, kept subtle so the base stays a light
                  peach. */}
              <RadialGradient id="glowTop" cx="0.5" cy="0" r="0.6">
                <Stop offset="0" stopColor="#E84A00" stopOpacity="0.18" />
                <Stop offset="1" stopColor="#E84A00" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="glowBottom" cx="0.5" cy="1" r="0.6">
                <Stop offset="0" stopColor="#E84A00" stopOpacity="0.16" />
                <Stop offset="1" stopColor="#E84A00" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowTop)" />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowBottom)" />
          </Svg>
        ) : null}
        {children}
      </View>
    )
  }

  return (
    <View testID={testID} style={[styles.band, { backgroundColor: CREAM.bg, borderColor: CREAM.border }]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  band: {
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Flat base = the gradient's top colour, so there's never a flash; overflow
  // clips the absolute gradient + glow layers to the band.
  warmBand: { backgroundColor: WARM_TOP, overflow: 'hidden' },
})
