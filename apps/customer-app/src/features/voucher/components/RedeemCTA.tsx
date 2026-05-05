import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  /** Display label — varies by state ("Redeem voucher" / "Subscribe to redeem" / "Already redeemed"). */
  label: string
  /** Disabled CTAs are non-tappable + use a muted style. */
  disabled?: boolean
  onPress: () => void
  /** Optional testID override for state-specific tests. */
  testID?: string
}

/**
 * Sticky bottom CTA — primary action for the screen. Brand-red gradient
 * matches the app's primary action language. The label + disabled flag
 * are derived in VoucherDetailScreen from the 12-state machine.
 *
 * M1: tapping fires `onPress` which the orchestrator routes to either
 * the M2 PIN-entry sheet (when implemented), the SubscribePromptScreen
 * (free-user state), or a stub Alert during M1 development.
 */
export function RedeemCTA({ label, disabled, onPress, testID }: Props) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return
        lightHaptic()
        onPress()
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.root,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID ?? 'redeem-cta'}
    >
      {disabled ? (
        // Disabled state: flat muted background, no gradient.
        <Text variant="heading.sm" style={[styles.label, styles.labelDisabled]}>{label}</Text>
      ) : (
        <>
          <LinearGradient
            colors={[color.brandRose, '#B91C1C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Text variant="heading.sm" style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  labelDisabled: {
    color: '#9CA3AF',
  },
})
