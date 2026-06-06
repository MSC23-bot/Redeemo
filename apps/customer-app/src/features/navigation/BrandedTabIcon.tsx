import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@/design-system'
import { BrandGradientVector } from '@/design-system/components/BrandGradientGlyph'
import { TAB_GLYPHS } from './tabGlyphs'
import { NAV_INK, NAV_ICON_SIZE, NAV_INDICATOR_W, NAV_INDICATOR_H } from './navTokens'

type Props = {
  focused: boolean
  /** Stable id for testIDs + glyph lookup, e.g. 'home'. */
  name: string
}

/**
 * Bottom-nav tab icon on the calm branded shelf.
 *
 * Both states render the SAME filled glyph at the SAME size (NAV_ICON_SIZE) in a
 * fixed-size slot — only the FILL changes. So a tab can never change shape OR
 * size when tapped (an outline→filled swap can't, because a lucide outline and a
 * filled glyph render at different optical sizes):
 *   • Inactive → warm navy-ink fill.
 *   • Active   → red→orange brand-gradient fill + a small gradient indicator
 *                capsule above it.
 * The LABEL (active brand-red / inactive warm-ink) is rendered by
 * react-navigation's slot. Static (no motion); press feedback lands in M3.
 */
export function BrandedTabIcon({ focused, name }: Props) {
  const glyph = TAB_GLYPHS[name]
  if (!glyph) return <View style={styles.icon} testID={`branded-tab-icon-${name}`} />
  return (
    <View style={styles.icon} testID={`branded-tab-icon-${name}`}>
      {focused ? (
        <>
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.indicator}
            testID={`branded-tab-indicator-${name}`}
          />
          <View testID={`branded-tab-glyph-${name}`}>
            <BrandGradientVector path={glyph} size={NAV_ICON_SIZE} />
          </View>
        </>
      ) : (
        <Svg
          width={NAV_ICON_SIZE}
          height={NAV_ICON_SIZE}
          viewBox="0 0 24 24"
          testID={`branded-tab-ink-${name}`}
        >
          <Path d={glyph} fill={NAV_INK} />
        </Svg>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Fixed slot so the icon occupies the same box in both states.
  icon: {
    width: NAV_ICON_SIZE,
    height: NAV_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Rounded brand-gradient CAPSULE above the active icon — reads as a deliberate
  // active-tab marker, not a stray dash. Fully rounded ends (radius = H/2), a
  // touch wider than tall, soft brand glow so it feels lit. Centred over the
  // (narrower) icon slot via the negative left offset.
  indicator: {
    position: 'absolute',
    top: -6,
    left: (NAV_ICON_SIZE - NAV_INDICATOR_W) / 2,
    width: NAV_INDICATOR_W,
    height: NAV_INDICATOR_H,
    borderRadius: NAV_INDICATOR_H / 2,
    shadowColor: color.brandRose,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
})
