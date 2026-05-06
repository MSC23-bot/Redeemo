import React from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Tag, Lock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  /** Display label — varies by state ("Redeem voucher" / "Subscribe to redeem" / "Already redeemed"). */
  label: string
  /** Disabled CTAs are non-tappable + use a muted style. */
  disabled?: boolean
  /**
   * Visual variant — drives the button's colour/icon. `primary` is the
   * brand red→coral gradient (default). `subscribe` is a navy CTA used
   * for the free-user state (per v4 §vd-cta.subscribe).
   */
  variant?: 'primary' | 'subscribe'
  onPress: () => void
  /** Optional testID override for state-specific tests. */
  testID?: string
}

const NAVY = '#010C35'

/**
 * Sticky bottom CTA — primary action for the screen. Brand red→coral
 * gradient by default (per v4 §vd-cta), navy for the subscribe state.
 * The label + disabled flag are derived in VoucherDetailScreen from
 * the 12-state machine.
 */
export function RedeemCTA({ label, disabled, variant = 'primary', onPress, testID }: Props) {
  const Icon = variant === 'subscribe' ? Lock : Tag

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
        variant === 'subscribe' && !disabled ? styles.shadowNavy : styles.shadowRose,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID ?? 'redeem-cta'}
    >
      {disabled ? (
        <View style={styles.disabledFill}>
          <Text variant="heading.sm" style={[styles.label, styles.labelDisabled]}>{label}</Text>
        </View>
      ) : variant === 'subscribe' ? (
        <View style={[StyleSheet.absoluteFillObject, styles.navyFill]} />
      ) : (
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {disabled ? null : (
        <View style={styles.contentRow}>
          <Icon size={20} color="#FFFFFF" strokeWidth={2.4} />
          <Text variant="heading.sm" style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    height: 62,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 22,
    marginVertical: 8,
  },
  shadowRose: {
    shadowColor: color.brandRose,
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  shadowNavy: {
    shadowColor: NAVY,
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  disabledFill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navyFill: {
    backgroundColor: NAVY,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  labelDisabled: {
    color: '#FFFFFF',
    opacity: 0.88,
    fontSize: 17,
  },
})
