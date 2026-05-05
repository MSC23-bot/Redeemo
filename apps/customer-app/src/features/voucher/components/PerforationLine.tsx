import React from 'react'
import { View, StyleSheet } from 'react-native'

/**
 * Coupon tear-line — a row of dashes spanning the coupon width with
 * small notches at the left/right edges. Sits between CouponHeader and
 * CouponBody to give the screen a "stacked coupon" silhouette.
 *
 * Implementation: a flexbox row of equal-width grey segments separated
 * by gaps. Cheaper than rendering an actual SVG dashed path; renders
 * identically across platforms.
 */
export function PerforationLine({ color = '#E5E7EB' }: { color?: string }) {
  // 12 dashes is enough density for a typical 320–400pt-wide coupon
  // without looking sparse on smaller devices.
  return (
    <View style={styles.row} testID="perforation-line">
      <View style={[styles.notch, { backgroundColor: '#FFF9F5' }]} />
      <View style={styles.dashes}>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={[styles.dash, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={[styles.notch, { backgroundColor: '#FFF9F5' }]} />
    </View>
  )
}

const NOTCH = 12

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: NOTCH,
  },
  notch: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    // Notches sit visually behind the coupon edges to create the
    // "ticket cut-out" silhouette. The negative margin pulls them
    // half-into the coupon's width.
    marginLeft: -NOTCH / 2,
    marginRight: -NOTCH / 2,
  },
  dashes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  dash: {
    flex: 1,
    height: 1.5,
    marginHorizontal: 2,
    borderRadius: 1,
  },
})
