import React from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { NAV_SHELF_BG, NAV_HAIRLINE } from './navTokens'

/**
 * Calm branded shelf surface for the bottom nav (`tabBarBackground`).
 *
 * Option B (owner-locked, warmed per device QA): a NON-floating, full-width warm
 * light-PEACH shelf — NOT glass, NOT a gradient bar, NOT a floating pill. It
 * keeps the existing 80px footprint and sits between the bold red/orange header
 * and the warm cream body as a premium warm shelf — quieter than the header,
 * never red. Brand colour lives only on the active tab.
 *
 * Integration: a very faint brand top-wash (ties it to the header) + a faint
 * warm/brand top hairline + a soft UPWARD lift (iOS shadowOffset y:-3; Android
 * gets a thin top gradient-lift, since its elevation casts downward).
 */
export function BrandedTabShelf() {
  return (
    <View style={styles.shelf} testID="branded-tab-shelf">
      {/* Android upward-lift (iOS uses the real shadow on `shelf`). */}
      {Platform.OS === 'android' ? (
        <LinearGradient
          colors={['rgba(58,11,4,0.06)', 'rgba(58,11,4,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.androidLift}
          pointerEvents="none"
        />
      ) : null}
      {/* Very faint brand top-wash — warm tie to the header, fades out quickly. */}
      <LinearGradient
        colors={['rgba(226,12,4,0.06)', 'rgba(226,12,4,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.5]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
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
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
  },
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
    backgroundColor: NAV_HAIRLINE,
  },
})
