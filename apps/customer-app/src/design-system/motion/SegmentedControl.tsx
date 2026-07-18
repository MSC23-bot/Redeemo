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
 * Anatomy: a white track card (warm hairline, very soft shadow) with a
 * sliding BRAND-GRADIENT thumb (red → coral, round 4); white text on the
 * thumb, navy text off it.
 *
 * Motion (round 6 — WALL PHYSICS, replaces the round-5 edge choreography):
 * EVERY landing uses the IDENTICAL spring (`THUMB_SPRING`, no
 * overshootClamping, no phases, no edge special-casing). Containment is
 * physical: the animated-style worklet clamps translateX to the track's
 * interior (`clampThumbX`: 0 … (count-1) x segmentWidth). A spring
 * overshoot beyond a wall renders as the thumb pressed AGAINST the edge,
 * and the spring's return oscillation back inside the clamp reads as a
 * natural inward wall-bounce — one motion system, identical energy at all
 * four stops. `overflow: 'hidden'` on the track stays as belt-and-braces.
 * Reduce-motion: single jump, no spring (unchanged).
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

// Round 6 — the ONE spring for every landing (edge and interior alike).
// Exported so the test can pin that no second config / choreography exists.
export const THUMB_SPRING = { damping: 20, stiffness: 220 } as const

/**
 * Round 6 wall physics — clamps the thumb's translateX to the track
 * interior: [0, (segmentCount - 1) x segmentWidth]. Runs inside the
 * animated-style worklet every frame, so spring overshoot presses the
 * thumb against the wall and the return oscillation reads as the bounce.
 * Pure + exported for the bounds test.
 */
export function clampThumbX(x: number, segmentWidth: number, segmentCount: number): number {
  'worklet'
  const max = (segmentCount - 1) * segmentWidth
  if (x < 0) return 0
  if (x > max) return max
  return x
}

export function SegmentedControl<K extends string>({ segments, value, onChange, testID }: Props<K>) {
  const [trackWidth, setTrackWidth] = useState(0)
  const motionScale = useMotionScale()
  const tx = useSharedValue(0)

  const activeIndex = segments.findIndex((s) => s.key === value)
  const segmentCount = segments.length
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / segmentCount : 0

  useEffect(() => {
    if (segmentWidth <= 0 || activeIndex < 0) return
    const target = activeIndex * segmentWidth
    // Reduce-motion: single jump, no spring. Every OTHER landing takes the
    // identical THUMB_SPRING path — containment lives in the worklet clamp,
    // not here (round 6: no edge branch).
    tx.value = motionScale === 0
      ? withTiming(target, { duration: 0 })
      : withSpring(target, THUMB_SPRING)
  }, [activeIndex, segmentWidth, motionScale, tx])

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: clampThumbX(tx.value, segmentWidth, segmentCount) }],
  }))

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
  // border + a very soft diffusion shadow. overflow: 'hidden' (with the
  // pill radius) is the belt-and-braces containment behind the worklet
  // clamp.
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
