import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@/design-system'
import { BrandGradientVector } from '@/design-system/components/BrandGradientGlyph'
import { TAB_GLYPHS_OUTLINE, TAB_GLYPHS_FILLED, TAB_GLYPH_VIEWBOX } from './tabGlyphs'
import { NAV_INK, NAV_ICON_SIZE, NAV_INDICATOR_W, NAV_INDICATOR_H } from './navTokens'

const DEFAULT_VIEWBOX = '0 0 24 24'

type Props = {
  focused: boolean
  /** Stable id for testIDs + glyph lookup, e.g. 'home'. */
  name: string
}

/**
 * Bottom-nav tab icon on the calm branded shelf — classic outline→filled state.
 *
 * Inactive and active use the SAME Material icon in two weights, rendered in a
 * fixed-size slot through the SAME per-icon viewBox, so a tab keeps its metaphor
 * AND its optical size between states — only the weight/fill changes:
 *   • Inactive → Material OUTLINE glyph, warm-ink fill. Light, secondary.
 *   • Active   → Material FILLED glyph, brand-gradient fill + a small gradient
 *                indicator capsule above it. Richer, stronger.
 * The LABEL (active brand-red / inactive warm-ink) is rendered by
 * react-navigation's slot. Static (no motion); press feedback lands in M3.
 */
export function BrandedTabIcon({ focused, name }: Props) {
  const outline = TAB_GLYPHS_OUTLINE[name]
  const filled = TAB_GLYPHS_FILLED[name]
  const viewBox = TAB_GLYPH_VIEWBOX[name] ?? DEFAULT_VIEWBOX

  return (
    <View style={styles.icon} testID={`branded-tab-icon-${name}`}>
      {focused ? (
        filled ? (
          <>
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.indicator}
              testID={`branded-tab-indicator-${name}`}
            />
            <View testID={`branded-tab-glyph-${name}`}>
              <BrandGradientVector path={filled} size={NAV_ICON_SIZE} viewBox={viewBox} />
            </View>
          </>
        ) : null
      ) : outline ? (
        <Svg
          width={NAV_ICON_SIZE}
          height={NAV_ICON_SIZE}
          viewBox={viewBox}
          testID={`branded-tab-outline-${name}`}
        >
          <Path d={outline} fill={NAV_INK} />
        </Svg>
      ) : null}
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
