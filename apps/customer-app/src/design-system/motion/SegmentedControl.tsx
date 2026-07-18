import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { Text } from '../Text'
import { color } from '../tokens'
import { useMotionScale } from '../useMotionScale'

/**
 * Map W2b round 2 — the ONE shared segmented control used by both the Map
 * list sheet's sort selector and the FilterSheet's Sort By section (owner
 * direction: a single component, not two drifting copies).
 *
 * Anatomy (round 4): a white track card (warm hairline, very soft shadow)
 * with a sliding BRAND-GRADIENT thumb (red → coral: the primary brand
 * moment on this surface, replacing the round-2 navy); white text on the
 * thumb, navy text off it. The thumb slides with a spring (~250ms feel,
 * damping 20); under reduce-motion it jump-cuts (duration 0).
 *
 * Round 4 DEFECT 2 (owner observed live) — thumb containment. The spring
 * overshoot painted the thumb OUTSIDE the white track on long jumps
 * (Relevance ↔ Best saving). The owner loves the motion, so the spring
 * stays; containment is two-layer:
 *   1. `overflow: 'hidden'` on the track (with its border radius), so an
 *      overshooting thumb can never paint outside the card;
 *   2. movements LANDING on the first or last segment use
 *      `overshootClamping` (there is no track beyond them to bounce into,
 *      so a clamped settle reads as "hitting the end"); interior stops
 *      keep the bounce.
 *
 * Segments are equal-width (track width measured via onLayout). Before
 * the first layout pass (and in jest, where onLayout never fires) the
 * thumb simply doesn't render; selection is still fully communicated via
 * `accessibilityState.selected`, which is what the pinned suites assert.
 */

export type SegmentedControlSegment<K extends string> = {
  key:   K
  /** Visible label. */
  label: string
  /** Canonical a11y label (defaults to the visible label). */
  accessibilityLabel?: string
}

type Props<K extends string> = {
  segments: SegmentedControlSegment<K>[]
  value:    K
  onChange: (key: K) => void
  testID?:  string
}

const TRACK_PADDING = 4

export function SegmentedControl<K extends string>({ segments, value, onChange, testID }: Props<K>) {
  const [trackWidth, setTrackWidth] = useState(0)
  const motionScale = useMotionScale()
  const tx = useSharedValue(0)

  const activeIndex = segments.findIndex((s) => s.key === value)
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / segments.length : 0

  useEffect(() => {
    if (segmentWidth <= 0 || activeIndex < 0) return
    const target = activeIndex * segmentWidth
    // DEFECT 2 — clamp the settle only at the track's ENDS; interior
    // stops keep the springy overshoot the owner likes.
    const landsOnEdge = activeIndex === 0 || activeIndex === segments.length - 1
    // Reduce-motion: jump-cut instead of sliding (unchanged).
    tx.value = motionScale === 0
      ? withTiming(target, { duration: 0 })
      : withSpring(target, { damping: 20, stiffness: 220, overshootClamping: landsOnEdge })
  }, [activeIndex, segmentWidth, motionScale, tx, segments.length])

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))

  function handleLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width)
  }

  return (
    <View
      style={styles.track}
      onLayout={handleLayout}
      testID={testID}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 && activeIndex >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: segmentWidth }, thumbStyle]}
        >
          {/* Round 4 design pass — the active thumb is the brand gradient
              (red → coral), the surface's primary brand moment. */}
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {segments.map((segment) => {
        const active = segment.key === value
        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            accessibilityRole="button"
            accessibilityLabel={segment.accessibilityLabel ?? segment.label}
            accessibilityState={{ selected: active }}
            style={styles.segment}
            hitSlop={4}
          >
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // White track card on the cream sheet ground — hairline navy-tinted
  // border + a very soft diffusion shadow (whisper-quiet warm layering).
  // DEFECT 2 — overflow: 'hidden' (with the pill radius) is containment
  // layer 1: an overshooting thumb can never paint outside the card.
  track: {
    flexDirection:   'row',
    alignItems:      'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius:    999,
    borderWidth:     1,
    borderColor:     'rgba(1,12,53,0.06)',
    padding:         TRACK_PADDING,
    minHeight:       44,
    overflow:        'hidden',
    shadowColor:     '#010C35',
    shadowOpacity:   0.05,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       1,
  },
  thumb: {
    position:     'absolute',
    top:          TRACK_PADDING,
    bottom:       TRACK_PADDING,
    left:         TRACK_PADDING,
    borderRadius: 999,
    // The gradient child fills the thumb; overflow keeps its corners
    // clipped to the pill radius.
    overflow:     'hidden',
  },
  segment: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  label: {
    fontSize:   12.5,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
  labelActive: {
    color: color.onBrand,
  },
})
