/**
 * Phase 3C.1g M2.5 — `<UndoToast>` for the Favourites tab swipe-to-
 * remove path.
 *
 * Spec §8.3 — slide-up from bottom + countdown + Undo button.  4s
 * window is owned by the parent's `useRemoveFavourite` hook (M2.4);
 * this component is purely presentational and surfaces `visible`,
 * `message`, `onUndo`.  The countdown bar runs as a 4s linear
 * animation; reduce-motion users get no animation but the Undo
 * button stays active for the same 4s (driven by the parent timer).
 */

import React, { useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { Text } from '@/design-system/Text'
import { color, layer, radius, spacing } from '@/design-system/tokens'
import { useReduceMotion } from '@/features/profile/hooks/useReduceMotion'

interface Props {
  visible:   boolean
  message:   string
  onUndo:    () => void
  /** Duration in ms — must equal the parent's undo window (4000ms). */
  duration?: number
  testID?:   string
}

const DEFAULT_DURATION_MS = 4_000

export function UndoToast({
  visible,
  message,
  onUndo,
  duration = DEFAULT_DURATION_MS,
  testID,
}: Props): React.ReactElement | null {
  const reduceMotion = useReduceMotion()
  const ty           = useRef(new Animated.Value(60)).current
  const progress     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.timing(ty, {
        toValue:         0,
        duration:        reduceMotion ? 0 : 180,
        useNativeDriver: true,
      }).start()
      progress.setValue(0)
      Animated.timing(progress, {
        toValue:         1,
        duration:        reduceMotion ? 0 : duration,
        easing:          Easing.linear,
        useNativeDriver: false,
      }).start()
    } else {
      Animated.timing(ty, {
        toValue:         60,
        duration:        reduceMotion ? 0 : 180,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, duration, reduceMotion, ty, progress])

  if (!visible) return null

  const widthInterp = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: ty }] }]}
      pointerEvents="box-none"
      testID={testID ?? 'undo-toast'}
    >
      <View style={styles.toast}>
        <Text variant="body.sm" style={styles.message}>{message}</Text>
        <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel="Undo" testID="undo-toast-undo">
          <Text variant="heading.sm" style={styles.undoLabel}>Undo</Text>
        </Pressable>
      </View>
      <View style={styles.countdownTrack}>
        <Animated.View style={[styles.countdownFill, { width: widthInterp }]} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position:  'absolute',
    bottom:    spacing[5],
    left:      spacing[4],
    right:     spacing[4],
    zIndex:    layer.overlay,
  },
  toast: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    backgroundColor:  color.navy,
    paddingVertical:  spacing[3],
    paddingHorizontal:spacing[4],
    borderRadius:     radius.md,
  },
  message: {
    color: '#FFFFFF',
    flex:  1,
  },
  undoLabel: {
    color:        '#FFFFFF',
    marginLeft:   spacing[3],
  },
  countdownTrack: {
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow:        'hidden',
    borderBottomLeftRadius:  radius.md,
    borderBottomRightRadius: radius.md,
  },
  countdownFill: {
    height:          '100%',
    backgroundColor: color.brandRose,
  },
})
