import React from 'react'
import { View, StyleSheet } from 'react-native'
import { color } from '@/design-system'
import { NAV_INK } from './navTokens'

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type Props = {
  Icon: IconComponent
  focused: boolean
  /** Stable id for testIDs + (M2) glyph lookup, e.g. 'home'. */
  name: string
}

/**
 * Bottom-nav tab icon on the calm branded shelf. The LABEL is rendered by
 * react-navigation's own slot (active brand-red / inactive warm-ink via the
 * tint colours) so icon ↔ label stay consistent — fixing the old inconsistency.
 *
 * M1 (this version): lucide OUTLINE icon — warm-ink when inactive, brand-red
 * when active. The gradient-filled active glyph + the small brand-gradient
 * active indicator land in M2; press feedback + crossfade motion in M3.
 */
export function BrandedTabIcon({ Icon, focused, name }: Props) {
  const tint = focused ? color.brandRose : NAV_INK
  return (
    <View style={styles.icon} testID={`branded-tab-icon-${name}`}>
      <Icon size={22} color={tint} strokeWidth={focused ? 2.4 : 2} />
    </View>
  )
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
})
