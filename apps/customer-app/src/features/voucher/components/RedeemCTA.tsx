import React from 'react'
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Tag, Lock, Check, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type CTAState = 'can_redeem' | 'subscribe' | 'already_redeemed' | 'expired' | 'outside_window'

type Props = {
  state: CTAState
  onPress: () => void
  scheduleLabel?: string | null
  loading?: boolean
}

export function RedeemCTA({ state, onPress, scheduleLabel, loading }: Props) {
  if (loading) {
    return (
      <View style={styles.wrapper}>
        <View style={[styles.button, styles.loadingButton]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      </View>
    )
  }
  const isDisabled = state === 'already_redeemed' || state === 'expired' || state === 'outside_window'

  const handlePress = () => {
    if (isDisabled) return
    lightHaptic()
    onPress()
  }

  if (state === 'subscribe') {
    return (
      <View style={styles.wrapper}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to redeem vouchers"
          style={({ pressed }) => [styles.button, styles.subscribeButton, pressed && styles.pressed]}
        >
          <Lock size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Subscribe to Redeem — £6.99/mo</Text>
        </Pressable>
      </View>
    )
  }

  if (state === 'already_redeemed') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.disabledButton]}
        >
          <Check size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Already Redeemed This Cycle</Text>
        </View>
      </View>
    )
  }

  if (state === 'expired') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.disabledButton, { opacity: 0.5 }]}
        >
          <X size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Voucher Has Expired</Text>
        </View>
      </View>
    )
  }

  if (state === 'outside_window') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.outsideWindowButton]}
        >
          <View style={styles.twoLineContent}>
            <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Not Available Right Now</Text>
            {scheduleLabel && (
              <Text variant="label.md" style={styles.scheduleText}>{scheduleLabel}</Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Redeem this voucher"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, styles.gradientButton]}
        >
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Redeem This Voucher</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    paddingTop: spacing[6],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 15,
    borderRadius: radius.lg,
  },
  gradientButton: {
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  subscribeButton: {
    backgroundColor: color.navy,
    shadowColor: color.navy,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  loadingButton: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  outsideWindowButton: {
    backgroundColor: color.navy,
    opacity: 0.85,
    paddingVertical: 12,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  buttonText: { fontWeight: '800', fontSize: 16 },
  twoLineContent: { alignItems: 'center' },
  scheduleText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600', fontSize: 11, marginTop: 2 },
})
