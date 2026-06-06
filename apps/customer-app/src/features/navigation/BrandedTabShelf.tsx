import React from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@/design-system'
import { NAV_SHELF_BG } from './navTokens'

/**
 * Calm branded shelf surface for the bottom nav (`tabBarBackground`).
 *
 * Option B (owner-locked 2026-06-06): a NON-floating, full-width warm off-white
 * shelf — NOT glass, NOT a gradient bar, NOT a floating pill. It keeps the
 * existing 80px footprint; brand colour lives ONLY on the active tab. The shelf
 * reads as a premium light surface lifting off the warm body so it balances the
 * red Home header (red top, light bottom) instead of competing with it.
 *
 * Lift: a soft UPWARD shadow on iOS (shadowOffset y:-3) + a top hairline. Android
 * elevation casts downward, so we add a thin top gradient-lift (faint dark →
 * clear) above the surface to fake the same upward depth.
 */
export function BrandedTabShelf() {
  return (
    <View style={styles.shelf} testID="branded-tab-shelf">
      {/* Android upward-lift (iOS uses the real shadow below). */}
      {Platform.OS === 'android' ? (
        <LinearGradient
          colors={['rgba(58,11,4,0.06)', 'rgba(58,11,4,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.androidLift}
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.hairline} pointerEvents="none" />
    </View>
  )
}

const styles = StyleSheet.create({
  shelf: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NAV_SHELF_BG,
    // Warm upward lift (iOS). Not clipped, so it casts above the bar onto the body.
    shadowColor: '#3A0B04',
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: -3 },
  },
  // Sits just ABOVE the shelf top edge — a faint depth gradient for Android.
  androidLift: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    height: 10,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.subtle,
  },
})
