import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPin } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { color, radius, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  /** User picked the primary CTA — proceed to the native OS permission prompt. */
  onContinue: () => void
  /** User picked the secondary CTA or dismissed the sheet — rely on saved postcode. */
  onDismiss: () => void
}

/**
 * Pre-permission explainer.
 *
 * Shown BEFORE the native OS GPS prompt fires. Closes the "one-shot
 * brand-less moment with no context" failure mode by giving the user
 * a branded surface that explains WHY we're about to ask for
 * location AND that distance — not raw lat/lng — is what reaches
 * merchants.
 *
 * Copy is locked verbatim by spec; em-dashes intentional.
 */
export function PrePermissionExplainer({ visible, onContinue, onDismiss }: Props) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Show offers near you">
      <View style={styles.root} testID="pre-permission-explainer-sheet">
        <View style={styles.iconWrap} testID="pre-permission-explainer-icon" pointerEvents="none">
          <MapPin size={28} color={color.brandRose} strokeWidth={2.2} />
        </View>

        <Text variant="display.sm" style={styles.title}>Show offers near you</Text>
        <Text variant="body.md" style={styles.body}>
          Redeemo uses your location to surface nearby merchants, vouchers, and offers. We never share your location with merchants — only distance is shown.
        </Text>

        <Pressable
          onPress={() => { lightHaptic(); onContinue() }}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          testID="pre-permission-explainer-continue"
        >
          <Text variant="heading.sm" style={styles.primaryBtnText}>Continue</Text>
        </Pressable>

        <Pressable
          onPress={() => { lightHaptic(); onDismiss() }}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          testID="pre-permission-explainer-dismiss"
        >
          <Text variant="label.lg" style={styles.secondaryBtnText}>Not now</Text>
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
