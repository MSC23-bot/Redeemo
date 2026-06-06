import React from 'react'
import { Pressable, Text, View, StyleSheet } from 'react-native'
import type { AccessibilityState, GestureResponderEvent, StyleProp, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from '@/design-system'
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
 * label with sane padding fits both comfortably in the same 80px footprint.
 *
 * Route/press semantics are preserved — onPress/onLongPress/accessibility are
 * forwarded straight through from react-navigation. (M3 will add press scale +
 * haptics here.)
 */
type Props = {
  /** Tab id — bespoke icon name + testID suffix, e.g. 'home'. */
  name: NavIconName
  /** Visible label text, e.g. 'Home'. */
  label: string
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
  accessibilityState,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
  style,
}: Props) {
  const insets = useSafeAreaInsets()
  const focused = accessibilityState?.selected === true

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      // `style` from react-navigation carries the per-item flex (equal width);
      // styles.pressable then NEUTRALISES its default padding and sets our own,
      // safe-area-aware padding so the cell clears the home indicator.
      style={[style, styles.pressable, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}
    >
      <View style={styles.content}>
        <BrandedTabIcon name={name} focused={focused} />
        <Text
          numberOfLines={1}
          style={[styles.label, { color: focused ? NAV_ACTIVE_INK : NAV_INK }]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    padding: 0,
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
