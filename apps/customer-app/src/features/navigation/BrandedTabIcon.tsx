import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@/design-system/tokens'
import { NavGlyph } from './icons/NavGlyph'
import type { NavIconName } from './icons/navIconPaths'
import { NAV_ICON_SIZE, NAV_INDICATOR_W, NAV_INDICATOR_H } from './navTokens'

type Props = {
  focused: boolean
  /** Stable tab id — also the bespoke icon name + testID suffix, e.g. 'home'. */
  name: NavIconName
}

/**
 * Bottom-nav tab icon on the calm branded shelf — classic outline→filled state,
 * using the bespoke Redeemo icon set (NavGlyph). Both weights are the same
 * metaphor at the same optical size in a fixed slot; only the weight/fill
 * changes when a tab is tapped:
 *   • Inactive → warm-ink OUTLINE glyph. Light, secondary.
 *   • Active   → brand-gradient FILLED glyph + a small gradient indicator
 *                capsule above it. Richer, stronger.
 * The LABEL (active brand-red / inactive warm-ink) is rendered by
 * <BrandedTabButton> (the tab cell), which also handles the press feedback
 * (scale + haptic). This component is just the icon + active indicator.
 */
export function BrandedTabIcon({ focused, name }: Props) {
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
          <NavGlyph name={name} weight="filled" size={NAV_ICON_SIZE} testID={`branded-tab-glyph-${name}`} />
        </>
      ) : (
        <NavGlyph name={name} weight="outline" size={NAV_ICON_SIZE} testID={`branded-tab-outline-${name}`} />
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
