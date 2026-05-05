import React from 'react'
import { View, StyleSheet } from 'react-native'

type Props = {
  /**
   * Background color of the page behind the coupon. The circular
   * cutouts are filled with this colour so they appear "punched"
   * out of the coupon's edges. Defaults to the cream page bg.
   */
  pageBg?: string
  /**
   * Variant — `outer` is the perforation between the type-coloured
   * header and the white top-card (taller cutouts, default styling).
   * `inner` sits between the white top-card and the white body
   * (subtler dash + smaller cutouts) per v4 §coupon-perf.
   */
  variant?: 'outer' | 'inner'
}

/**
 * Coupon tear-line — dashed border with circular page-coloured cutouts
 * at each edge to create the "ticket cut-out" silhouette. v4 mockup
 * spec: 24px tall outer perforation, 28×28 cutouts at -14px offset;
 * inner perforation is shorter with 24×24 cutouts at -12px offset.
 *
 * Implementation: parent container with overflow:visible. Two
 * absolutely-positioned circles overhang the left/right edges so the
 * cream page background shows through. A horizontal dashed line spans
 * the middle.
 */
export function PerforationLine({ pageBg = '#F5F0EB', variant = 'outer' }: Props) {
  const isOuter = variant === 'outer'
  const height  = isOuter ? 24 : 16
  const cutout  = isOuter ? 28 : 24
  const offset  = -cutout / 2

  return (
    <View style={[styles.row, { height }]} testID={`perforation-${variant}`}>
      <View
        style={[
          styles.cutout,
          { width: cutout, height: cutout, borderRadius: cutout / 2, left: offset, top: -cutout / 2 + height / 2, backgroundColor: pageBg },
        ]}
      />
      <View style={styles.dashesWrap}>
        <View style={[styles.dashedLine, isOuter ? styles.dashedLineOuter : styles.dashedLineInner]} />
      </View>
      <View
        style={[
          styles.cutout,
          { width: cutout, height: cutout, borderRadius: cutout / 2, right: offset, top: -cutout / 2 + height / 2, backgroundColor: pageBg },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
  },
  cutout: {
    position: 'absolute',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  dashesWrap: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  dashedLine: {
    width: '100%',
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  dashedLineOuter: {
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  dashedLineInner: {
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
})
