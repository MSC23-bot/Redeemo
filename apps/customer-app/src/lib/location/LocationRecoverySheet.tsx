import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPinOff } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { color, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  /**
   * User picked the primary CTA — open phone Settings via
   * `Linking.openSettings`. Provider wires this from the
   * extended `useUserLocation` hook.
   */
  onOpenSettings: () => void
  /** User picked the secondary CTA or dismissed — stay on saved area. */
  onDismiss: () => void
  /**
   * §DF Round 5 — caller-context override for the secondary CTA label.
   * Default copy "Use saved area" is correct in general flows, but
   * surfaces like Search (where the user already has a saved area
   * and just tapped "Use current location") need "Not now" because
   * the user IS already using saved area.  Provider threads this
   * through from `useUserLocation().request({ recoveryLabels: { secondary } })`.
   */
  secondaryLabel?: string
}

/**
 * Recovery sheet.
 *
 * Shown when GPS is denied or off device-wide. Closes the "user
 * denied once, has no idea how to recover" failure mode by giving
 * the user a one-tap path to the OS settings + reassurance that
 * the app keeps working off their saved area until then.
 *
 * Pin-with-slash icon variant (`MapPinOff`) — visual contrast vs
 * the explainer's solid `MapPin`. Same brand-rose colour family
 * for identity consistency.
 *
 * Copy is locked verbatim by spec; em-dashes intentional.
 */
export function LocationRecoverySheet({ visible, onOpenSettings, onDismiss, secondaryLabel }: Props) {
  // §DF Round 5 — default to "Use saved area" when caller hasn't
  // overridden.  Owner-locked variant for Search context is "Not now".
  const secondaryCtaLabel = secondaryLabel ?? 'Use saved area'
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Location is off">
      <View style={styles.root} testID="location-recovery-sheet">
        <View style={styles.iconWrap} testID="location-recovery-icon" pointerEvents="none">
          <MapPinOff size={28} color={color.brandRose} strokeWidth={2.2} />
        </View>

        <Text variant="display.sm" style={styles.title}>Location is off</Text>
        <Text variant="body.md" style={styles.body}>
          Turn on location in your phone settings to see offers near you right now. We&apos;ll keep using your saved area until then.
        </Text>

        <Pressable
          onPress={() => { lightHaptic(); onOpenSettings() }}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          testID="location-recovery-open-settings"
        >
          <Text variant="heading.sm" style={styles.primaryBtnText}>Open settings</Text>
        </Pressable>

        <Pressable
          onPress={() => { lightHaptic(); onDismiss() }}
          accessibilityRole="button"
          accessibilityLabel={secondaryCtaLabel}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          testID="location-recovery-dismiss"
        >
          <Text variant="label.lg" style={styles.secondaryBtnText}>{secondaryCtaLabel}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface.tint,
    marginBottom: spacing[4],
  },
  title: {
    color: color.navy,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  body: {
    color: color.text.secondary,
    textAlign: 'center',
    marginBottom: spacing[5],
    paddingHorizontal: spacing[2],
  },
  primaryBtn: {
    backgroundColor: color.brandRose,
    paddingVertical: spacing[4],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: color.onBrand,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
  },
  secondaryBtnPressed: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    color: color.text.secondary,
  },
})
