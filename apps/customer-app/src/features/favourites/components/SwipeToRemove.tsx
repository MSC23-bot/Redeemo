/**
 * Phase 3C.1g M2.5 — `<SwipeToRemove>` wrapper.
 *
 * Spec §8.3 swipe-to-remove pattern.  Wraps a card; user swipes the
 * card LEFT to reveal a Remove affordance.  Tapping Remove invokes
 * `onRemove()` (the parent then drives the optimistic splice +
 * UndoToast via `useRemoveFavourite`).
 *
 * Minimal implementation using React Native's built-in PanResponder
 * (no gesture-handler dep needed).  Threshold = 80pt slide.
 */

import React, { useRef } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { Text } from '@/design-system/Text'
import { color, radius, spacing } from '@/design-system/tokens'
import { Trash2 } from '@/design-system/icons'

interface Props {
  onRemove: () => void
  testID?:  string
  children: React.ReactNode
}

const SWIPE_THRESHOLD  = -80
const REMOVE_AFFORDANCE_WIDTH = 96

export function SwipeToRemove({ onRemove, testID, children }: Props): React.ReactElement {
  const translateX = useRef(new Animated.Value(0)).current
  const isOpen     = useRef(false)

  const reset = (toOpen = false): void => {
    isOpen.current = toOpen
    Animated.spring(translateX, {
      toValue:        toOpen ? -REMOVE_AFFORDANCE_WIDTH : 0,
      useNativeDriver: true,
      bounciness:     4,
    }).start()
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dy) < 12,
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.max(Math.min(gesture.dx + (isOpen.current ? -REMOVE_AFFORDANCE_WIDTH : 0), 0), -REMOVE_AFFORDANCE_WIDTH)
        translateX.setValue(next)
      },
      onPanResponderRelease: (_evt, gesture) => {
        const settled = gesture.dx + (isOpen.current ? -REMOVE_AFFORDANCE_WIDTH : 0)
        reset(settled <= SWIPE_THRESHOLD)
      },
    }),
  ).current

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.removeAffordance}>
        <Pressable
          onPress={() => { reset(false); onRemove() }}
          style={styles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel="Remove from favourites"
          testID={testID ? `${testID}-remove` : 'swipe-remove-btn'}
        >
          <Trash2 size={18} color="#FFFFFF" />
          <Text variant="body.sm" style={styles.removeLabel}>Remove</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  removeAffordance: {
    position:        'absolute',
    top:             spacing[2],
    bottom:          spacing[2],
    right:           spacing[4],
    width:           REMOVE_AFFORDANCE_WIDTH,
    backgroundColor: color.danger,
    borderRadius:    radius.lg,
    alignItems:      'center',
    justifyContent:  'center',
  },
  removeBtn: {
    flex:           1,
    alignSelf:      'stretch',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
  },
  removeLabel: {
    color: '#FFFFFF',
  },
  card: {
    // Animated.View wrapper takes the card's natural width.  The card
    // itself owns marginHorizontal in its own styles.
  },
})
