import React, { useState, useRef, useCallback, useEffect } from 'react'
import { View, TextInput, StyleSheet, Pressable } from 'react-native'
import { Image } from 'expo-image'
import Animated, { useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Tag, AlertTriangle, XCircle, Lock } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, motion } from '@/design-system/tokens'
import { lightHaptic, errorHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import { PinBox } from './PinBox'

type Props = {
  visible: boolean
  onDismiss: () => void
  onSubmit: (pin: string) => void
  merchantName: string
  merchantLogo: string | null
  branchName: string
  isLoading: boolean
  error: { code: string; attemptsRemaining?: number } | null
  lockoutSeconds: number
}

function formatLockoutTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PinEntrySheet({
  visible, onDismiss, onSubmit,
  merchantName, merchantLogo, branchName,
  isLoading, error, lockoutSeconds,
}: Props) {
  const [digits, setDigits] = useState<string[]>([])
  const inputRef = useRef<TextInput>(null)
  const shakeX = useSharedValue(0)
  const motionScale = useMotionScale()
  const [lockoutRemaining, setLockoutRemaining] = useState(lockoutSeconds)

  const isLocked = lockoutRemaining > 0
  const isError = !!error && error.code === 'INVALID_PIN'
  const allFilled = digits.length === 4

  useEffect(() => {
    setLockoutRemaining(lockoutSeconds)
  }, [lockoutSeconds])

  useEffect(() => {
    if (lockoutRemaining <= 0) return
    const id = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [lockoutRemaining])

  useEffect(() => {
    if (isError && motionScale > 0) {
      errorHaptic()
      shakeX.value = withSequence(
        withTiming(6, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(3, { duration: 50 }),
        withTiming(-3, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      )
      const timeout = setTimeout(() => setDigits([]), 400)
      return () => clearTimeout(timeout)
    }
  }, [isError, shakeX, motionScale])

  useEffect(() => {
    if (visible && !isLocked) {
      setTimeout(() => inputRef.current?.focus(), 500)
    }
  }, [visible, isLocked])

  const handleChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4)
    setDigits(cleaned.split(''))
  }, [])

  const handleSubmit = useCallback(() => {
    if (digits.length !== 4 || isLoading || isLocked) return
    lightHaptic()
    onSubmit(digits.join(''))
  }, [digits, isLoading, isLocked, onSubmit])

  if (isLocked) {
    return (
      <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="PIN entry locked">
        <View style={styles.lockoutCard}>
          <View style={styles.lockIcon}>
            <Lock size={22} color="#FFF" />
          </View>
          <Text variant="label.lg" style={styles.lockoutTitle}>Too Many Attempts</Text>
          <Text variant="body.sm" style={styles.lockoutText}>
            You've entered the wrong PIN too many times. Please wait before trying again.
          </Text>
          <Text variant="heading.md" style={styles.lockoutTimer}>{formatLockoutTime(lockoutRemaining)}</Text>
          <Text variant="label.md" style={styles.lockoutSubtext}>minutes remaining</Text>
        </View>
        <View style={[styles.submitButton, { opacity: 0.3, backgroundColor: '#9CA3AF' }]}>
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.submitText}>Redeem Voucher</Text>
        </View>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Enter branch PIN to redeem voucher">
      {/* Merchant row */}
      <View style={styles.merchantRow}>
        <View style={styles.merchantLogo}>
          {merchantLogo ? (
            <Image source={{ uri: merchantLogo }} style={styles.logoImg} contentFit="cover" />
          ) : (
            <View style={[styles.logoImg, { backgroundColor: color.surface.subtle }]} />
          )}
        </View>
        <View style={styles.merchantInfo}>
          <Text variant="label.lg" color="primary" style={{ fontWeight: '800', fontSize: 13 }}>{merchantName}</Text>
          <View style={styles.branchRow}>
            <MapPin size={11} color={color.brandRose} />
            <Text variant="label.md" color="secondary">{branchName}</Text>
          </View>
        </View>
      </View>

      {/* Title */}
      <Text variant="heading.md" color={isError ? 'danger' : 'primary'} style={styles.title}>
        {isError ? 'Incorrect PIN' : 'Enter Branch PIN'}
      </Text>
      <Text variant="body.sm" color="secondary" style={styles.subtitle}>
        {isError
          ? "That PIN doesn't match. Please ask the staff member to confirm the branch PIN and try again."
          : <>Ask a staff member at <Text variant="body.sm" color="primary" style={{ fontWeight: '700' }}>{merchantName}</Text> for the 4-digit branch PIN to redeem your voucher.</>
        }
      </Text>

      {/* PIN boxes */}
      <View style={styles.pinRow}>
        {[0, 1, 2, 3].map(i => (
          <PinBox
            key={i}
            index={i}
            digit={digits[i] ?? null}
            isActive={digits.length === i}
            isError={isError}
            shakeX={shakeX}
          />
        ))}
      </View>

      {/* Hidden text input for native keyboard */}
      <TextInput
        ref={inputRef}
        value={digits.join('')}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.hiddenInput}
        autoFocus={false}
        caretHidden
      />

      {/* Error message */}
      {isError && error.attemptsRemaining !== undefined && (
        <View style={styles.errorBar}>
          <XCircle size={12} color="#B91C1C" />
          <Text variant="label.md" style={styles.errorText}>
            Wrong PIN · {error.attemptsRemaining} attempts remaining
          </Text>
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <AlertTriangle size={14} color="#D97706" />
        <Text variant="label.md" style={styles.disclaimerText}>
          Entering the correct PIN will immediately redeem this voucher. It will not be available again during your current monthly cycle.
        </Text>
      </View>

      {/* Submit button */}
      <Pressable
        onPress={handleSubmit}
        disabled={!allFilled || isLoading}
        accessibilityRole="button"
        accessibilityState={{ disabled: !allFilled || isLoading }}
      >
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.submitButton, (!allFilled || isLoading) && { opacity: 0.4 }]}
        >
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.submitText}>Redeem Voucher</Text>
        </LinearGradient>
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
    marginBottom: spacing[4],
  },
  merchantLogo: { marginRight: spacing[3] },
  logoImg: { width: 40, height: 40, borderRadius: radius.md },
  merchantInfo: { flex: 1 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  title: { fontWeight: '800', marginBottom: spacing[1] },
  subtitle: { marginBottom: spacing[5], fontSize: 12 },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.sm + 2,
    padding: spacing[2],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  errorText: { color: '#B91C1C', fontWeight: '600', fontSize: 11 },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  disclaimerText: { flex: 1, color: '#92400E', fontSize: 10 },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 15,
    borderRadius: radius.lg,
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  submitText: { fontWeight: '800', fontSize: 16 },
  lockoutCard: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.lg,
    padding: spacing[4] + 2,
    marginBottom: spacing[5],
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#B91C1C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  lockoutTitle: { fontWeight: '800', fontSize: 14, color: '#B91C1C', marginBottom: spacing[2] },
  lockoutText: { color: '#92400E', fontSize: 11, lineHeight: 16.5, textAlign: 'center', marginBottom: spacing[4] },
  lockoutTimer: { fontWeight: '800', fontSize: 18, color: '#B91C1C', fontVariant: ['tabular-nums'] },
  lockoutSubtext: { color: '#92400E', fontSize: 10, marginTop: 4 },
})
