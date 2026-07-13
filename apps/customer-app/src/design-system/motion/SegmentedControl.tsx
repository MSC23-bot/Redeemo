import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
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
 * sliding solid-NAVY thumb; white text on the thumb, navy text off it.
 * The thumb slides with a spring (~250ms feel, damping 20); under
 * reduce-motion it jump-cuts (duration 0) — same convention as every
 * design-system motion component.
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
    // Reduce-motion: jump-cut instead of sliding.
    tx.value = motionScale === 0
      ? withTiming(target, { duration: 0 })
      : withSpring(target, { damping: 20, stiffness: 220 })
  }, [activeIndex, segmentWidth, motionScale, tx])

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
        />
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
  track: {
    flexDirection:   'row',
    alignItems:      'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius:    999,
    borderWidth:     1,
    borderColor:     'rgba(1,12,53,0.06)',
    padding:         TRACK_PADDING,
    minHeight:       44,
    shadowColor:     '#010C35',
    shadowOpacity:   0.05,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       1,
  },
  thumb: {
    position:        'absolute',
    top:             TRACK_PADDING,
    bottom:          TRACK_PADDING,
    left:            TRACK_PADDING,
    borderRadius:    999,
    backgroundColor: color.navy,
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
