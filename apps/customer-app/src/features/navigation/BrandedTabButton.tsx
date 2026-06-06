import React from 'react'
import { Pressable, Text, StyleSheet, Platform } from 'react-native'
import type { AccessibilityState, GestureResponderEvent, StyleProp, ViewStyle } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated'
import { spacing, motion } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { lightHaptic } from '@/design-system/haptics'
import { BrandedTabIcon } from './BrandedTabIcon'
import type { NavIconName } from './icons/navIconPaths'
import {
  NAV_INK,
  NAV_ACTIVE_INK,
  NAV_LABEL_FONT_SIZE,
  NAV_LABEL_LINE_HEIGHT,
  NAV_LABEL_TRACKING,
} from './navTokens'

/**
 * Custom bottom-tab cell (react-navigation `tabBarButton`). This is NOT a custom
 * navigator — it's the supported per-tab button override. We render the cell
 * ourselves because react-navigation's default tab item wraps the icon in a
 * FIXED 28px-tall slot (ICON_SIZE_TALL) and adds its own padding; inside an 80px
 * bar that has already given ~34px to the home-indicator inset, that fixed
 * wrapper consumes the entire content area and the label gets 0px of room (it
 * renders but is clipped to nothing). Rendering our own 20px icon + our own
 * label fits both comfortably in the same 80px footprint.
 *
 * Vertical positioning: react-navigation's bar ALREADY reserves the bottom
 * safe-area inset (it applies paddingBottom: insets.bottom to the bar), so the
 * item area is already clear of the home indicator. We must NOT add the inset
 * again here or the content rides up to the top — we just centre the icon +
 * label in the item area (small paddingTop keeps the active indicator capsule,
 * which sits just above the icon, from clipping at the top edge).
 *
 * Focus: react-navigation v7 passes the active flag as `aria-selected`.
 *
 * Motion (M3): a subtle press scale (0.96 in, spring back) + a light haptic on
 * press. The scale is gated on useMotionScale() — reduced motion disables it
 * entirely (press becomes instant); the haptic still fires (it self-guards on
 * the user's haptics-enabled setting, which is separate from motion). No idle
 * animation. Route/press semantics are preserved — onPress/onLongPress are
 * forwarded straight through.
 */
const PRESS_SCALE = 0.96

type Props = {
  /** Tab id — bespoke icon name + testID suffix, e.g. 'home'. */
  name: NavIconName
  /** Visible label text, e.g. 'Home'. */
  label: string
  /**
   * Focus flag. react-navigation v7 passes the active state to a custom
   * `tabBarButton` as `aria-selected` (NOT accessibilityState.selected — reading
   * that left every tab stuck inactive). `accessibilityState` is kept as a
   * defensive fallback in case a future version switches.
   */
  'aria-selected'?: boolean | undefined
  accessibilityState?: AccessibilityState | undefined
  accessibilityLabel?: string | undefined
  testID?: string | undefined
  onPress?: ((e: GestureResponderEvent) => void) | null | undefined
  onLongPress?: ((e: GestureResponderEvent) => void) | null | undefined
  style?: StyleProp<ViewStyle> | undefined
}

export function BrandedTabButton({
  name,
  label,
  'aria-selected': ariaSelected,
  accessibilityState,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
  style,
}: Props) {
  const focused = ariaSelected === true || accessibilityState?.selected === true
  const motionScale = useMotionScale()
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const handlePressIn = () => {
    if (motionScale === 1) {
      scale.value = withTiming(PRESS_SCALE, { duration: motion.duration.xfast })
    }
    lightHaptic()
  }
  const handlePressOut = () => {
    if (motionScale === 1) {
      scale.value = withSpring(1, { damping: 18, stiffness: 260 })
    }
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // Match react-navigation's default tab button: iOS announces "button"
      // (its accessibilityLabel already reads "<label>, tab, N of M"), Android
      // uses the "tab" role for proper tab semantics. Selected state +
      // forwarded accessibilityLabel are preserved below.
      accessibilityRole={Platform.select({ ios: 'button', default: 'tab' })}
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      // `style` from react-navigation carries the per-item flex (equal width);
      // styles.pressable NEUTRALISES its default padding and centres our content
      // in the item area (which is already inset-clear — see the note above).
      style={[style, styles.pressable]}
    >
      <Animated.View style={[styles.content, animatedStyle]}>
        <BrandedTabIcon name={name} focused={focused} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[styles.label, { color: focused ? NAV_ACTIVE_INK : NAV_INK }]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    padding: 0,
    // A touch more top room than the bottom so the active indicator capsule
    // (which sits just above the icon) has clearance from the bar's top edge.
    paddingTop: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontFamily: 'Lato-Medium',
    fontSize: NAV_LABEL_FONT_SIZE,
    lineHeight: NAV_LABEL_LINE_HEIGHT,
    letterSpacing: NAV_LABEL_TRACKING,
  },
})
