import React from 'react'
import { View, StyleSheet } from 'react-native'

type Props = {
  /**
   * Background colour of the page behind the coupon. The circular
   * cutouts are filled with this colour so they appear "punched"
   * out of the coupon's edges. Defaults to the cream page bg.
   */
  pageBg?: string
  /**
   * Variant — `outer` is the perforation between the type-coloured
   * header and the white top-card (taller cutouts, cream fill so the
   * perforation reads as a stripe between the header and card).
   * `inner` sits between the white top-card and the white body
   * (smaller cutouts, transparent fill so the white shows through)
   * per v4 §coupon-perf.
   */
  variant?: 'outer' | 'inner'
}

/**
 * Coupon tear-line — the visual signature of the screen. v4 mockup
 * spec:
 *   - outer: 24pt height, 28×28 cream cutouts CENTRED on the boundary
 *     between the coloured header and the cream stripe (so the top
 *     half of each cutout "bites" into the header's bottom edge); a
 *     dashed line of small dots runs across the middle.
 *   - inner: 20pt height, 24×24 cutouts CENTRED on the boundary
 *     between the white top-card and white body card; same dashed
 *     dot row.
 *
 * Implementation notes for RN:
 *   - We render the perforation as a `row` with `overflow: visible`
 *     so the cutouts can extend ABOVE the row into the parent above
 *     (the colored header for outer; the top-card for inner).
 *   - Cutouts are absolute-positioned `top: -cutout / 2` so HALF
 *     sits above the row and HALF within. The half above sits on
 *     top of the parent's coloured surface, creating the bite-out
 *     effect. The half within sits on top of the row's bg (cream
 *     for outer; white for inner via parent), blending invisibly.
 *   - The dashed line is rendered as an actual ROW OF SMALL DOTS
 *     instead of a `borderStyle: 'dashed'` border because RN's
 *     dashed borders render inconsistently on iOS (often appear
 *     solid for thin borders).
 */
export function PerforationLine({ pageBg = '#F5F0EB', variant = 'outer' }: Props) {
  // Round-7: bigger cutouts again for clearer voucher silhouette.
  // Outer 36→42, inner 30→36. Heights bumped slightly to make the
  // perforation stripe more visually present against the hero.
  const isOuter = variant === 'outer'
  const height  = isOuter ? 28 : 22
  const cutout  = isOuter ? 42 : 36
  const dashCount = isOuter ? 22 : 22
  const dashColor = isOuter ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.16)'
  const offset    = -cutout / 2

  return (
    <View
      style={[
        styles.row,
        { height, backgroundColor: isOuter ? pageBg : 'transparent' },
      ]}
      testID={`perforation-${variant}`}
    >
      {/* Left cutout — half-circle biting into parent above */}
      <View
        pointerEvents="none"
        style={[
          styles.cutout,
          {
            width: cutout,
            height: cutout,
            borderRadius: cutout / 2,
            left: offset,
            top: -cutout / 2,
            backgroundColor: pageBg,
          },
        ]}
      />

      {/* Dashed line — row of small dots */}
      <View style={styles.dashesWrap} pointerEvents="none">
        {Array.from({ length: dashCount }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dash,
              { backgroundColor: dashColor },
            ]}
          />
        ))}
      </View>

      {/* Right cutout — mirror */}
      <View
        pointerEvents="none"
        style={[
          styles.cutout,
          {
            width: cutout,
            height: cutout,
            borderRadius: cutout / 2,
            right: offset,
            top: -cutout / 2,
            backgroundColor: pageBg,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    overflow: 'visible',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutout: {
    position: 'absolute',
    zIndex: 2,
  },
  dashesWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  dash: {
    width: 4,
    height: 2,
    borderRadius: 1,
  },
})
