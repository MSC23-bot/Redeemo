import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@/design-system'
import { BrandGradientVector } from '@/design-system/components/BrandGradientGlyph'
import { TAB_GLYPHS } from './tabGlyphs'
import { NAV_INK, NAV_INDICATOR_W, NAV_INDICATOR_H } from './navTokens'

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type Props = {
  Icon: IconComponent
  focused: boolean
  /** Stable id for testIDs + glyph lookup, e.g. 'home'. */
  name: string
}

/**
 * Bottom-nav tab icon on the calm branded shelf. The LABEL is rendered by
 * react-navigation's slot (active brand-red / inactive warm-ink via the tint
 * colours) so icon ↔ label stay consistent.
 *
 * M2 — the active tab is the ONLY brand moment, kept subtle:
 *   • Active   → red→orange gradient-FILLED glyph (BrandGradientVector) + a
 *                small brand-gradient INDICATOR pill above it.
 *   • Inactive → lucide OUTLINE icon in warm-ink.
 * Static (no motion). Press feedback + crossfade land in M3.
 */
export function BrandedTabIcon({ Icon, focused, name }: Props) {
  const glyph = TAB_GLYPHS[name]
  return (
    <View style={styles.icon} testID={`branded-tab-icon-${name}`}>
      {focused ? (
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.indicator}
          testID={`branded-tab-indicator-${name}`}
        />
      ) : null}

      {focused && glyph ? (
        <View style={styles.glyph} testID={`branded-tab-glyph-${name}`}>
          <BrandGradientVector path={glyph} size={22} />
        </View>
      ) : (
        <Icon size={22} color={NAV_INK} strokeWidth={2} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
  // Small brand-gradient pill above the active icon — richer than a bare dot:
  // closer to the icon (less detached) + a soft brand glow.
  indicator: {
    position: 'absolute',
    top: -5,
    width: NAV_INDICATOR_W,
    height: NAV_INDICATOR_H,
    borderRadius: NAV_INDICATOR_H / 2,
    shadowColor: color.brandRose,
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
})
