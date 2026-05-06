import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { AlertTriangle, Lock, Tag } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { Text } from '@/design-system/Text'
import { color, opacity, radius, spacing } from '@/design-system/tokens'
import { errorHaptic, lightHaptic } from '@/design-system/haptics'
import { useRedemptionLockout } from '../hooks/useRedemptionLockout'
import type { UseRedeemError } from '../hooks/useRedeem'

const PIN_LENGTH = 4

type Props = {
  visible: boolean
  onDismiss: () => void
  /** Fires when 4 digits entered. Caller invokes useRedeem.mutate. */
  onSubmit: (pin: string) => void
  merchantName: string
  branchName: string | null
  /** From useRedeem.isPending — disables submit + clears between attempts. */
  isLoading: boolean
  /** Latest typed RedemptionError or NULL_BRANCH; null when idle. */
  error: UseRedeemError | null
}

/**
 * Branch PIN entry sheet — Voucher Detail M2.
 *
 * Visual contract: v4 mockup §PIN entry.
 *   • Bottom sheet, 4×54×60 PIN boxes with 12px gap.
 *   • Active box: rose border + soft ring; filled: rose border + white bg.
 *   • Wrong PIN: shake (±6 / ±3 px, 400ms ease-in-out) + clear digits +
 *     "Wrong PIN · X attempts remaining" inline error bar.
 *   • Lockout: countdown card with mm:ss; submit deeply disabled.
 *   • Disclaimer banner above submit. Brand-gradient submit button.
 *
 * Abuse-prevention contract:
 *   • PIN never logged (no console.log of pin / digits / error.details).
 *   • PIN cleared on app background (AppState listener) and on dismiss.
 *   • Auto-submits on 4th digit ONCE per digit-set (submittedRef guard).
 *   • Submit deeply disabled while loading or locked out.
 */
export function PinEntrySheet({
  visible,
  onDismiss,
  onSubmit,
  merchantName,
  branchName,
  isLoading,
  error,
}: Props) {
  const [digits, setDigits] = useState('')
  const inputRef = useRef<TextInput>(null)
  const submittedRef = useRef(false)

  // Lockout countdown — driven only when error is PIN_RATE_LIMIT_EXCEEDED.
  // Re-keying the hook (via component remount of the lockout-only branch)
  // happens implicitly because `retryAfter` is read once on first PIN_RATE
  // error; the hook treats the deadline as immutable for its lifetime.
  const lockoutSeconds =
    error && error.code === 'PIN_RATE_LIMIT_EXCEEDED' ? error.retryAfter : null
  const lockout = useRedemptionLockout(lockoutSeconds)
  const isLocked = lockout.isLocked

  // Defensive read: at runtime `error` MIGHT NOT match the static type
  // (e.g. backend predates PR #43 and didn't send `remainingAttempts`,
  // or `redemptionApi`'s Zod parse failed and re-threw the raw
  // ApiClientError which has `.code === 'INVALID_PIN'` but no
  // `.remainingAttempts`). Treat anything that isn't a finite number
  // as "missing" → render fallback copy instead of an empty counter.
  const rawAttempts =
    error && (error as { code: string }).code === 'INVALID_PIN'
      ? (error as { remainingAttempts?: unknown }).remainingAttempts
      : null
  const remainingAttempts =
    typeof rawAttempts === 'number' && Number.isFinite(rawAttempts)
      ? rawAttempts
      : null
  const showInvalidPinBar =
    (error as { code?: string } | null)?.code === 'INVALID_PIN' && !isLocked

  // PR #44 review fix #3 — surface the other 6 backend error codes the
  // backend can return. Without this, the user types a PIN, hits an
  // ineligibility error (e.g. PIN_NOT_CONFIGURED), and the sheet just
  // sits there with no feedback. Each code gets a distinct UX message
  // so the user knows why the request was rejected and what to do next.
  type BackendErrorBanner = { title: string; body: string }
  function backendErrorBanner(): BackendErrorBanner | null {
    if (!error) return null
    switch (error.code) {
      case 'PIN_NOT_CONFIGURED':
        return {
          title: 'Branch PIN not set up',
          body:
            "This branch hasn't configured its Redeemo PIN yet. Ask the merchant or branch manager to set it in their merchant portal — or contact Redeemo support if it's already set.",
        }
      case 'BRANCH_UNAVAILABLE':
        return {
          title: 'Branch unavailable',
          body:
            'This branch is no longer available for redemption. Try a different branch or check back later.',
        }
      case 'BRANCH_MERCHANT_MISMATCH':
        return {
          title: 'Branch mismatch',
          body:
            "This branch doesn't belong to this voucher's merchant. Please reopen the branch picker and try again.",
        }
      case 'PHONE_NOT_VERIFIED':
        return {
          title: 'Verify your phone',
          body:
            'Your phone number must be verified before you can redeem vouchers. Open the Profile tab to verify.',
        }
      case 'SUBSCRIPTION_REQUIRED':
        return {
          title: 'Subscription required',
          body:
            'You need an active subscription to redeem vouchers. Tap "Maybe later" and re-open the voucher to subscribe.',
        }
      case 'VOUCHER_NOT_FOUND':
        return {
          title: 'Voucher unavailable',
          body:
            "This voucher isn't available for redemption right now — it may have expired or been removed by the merchant.",
        }
      default:
        return null
    }
  }
  const errorBanner = backendErrorBanner()

  // ── Shake animation on wrong PIN ────────────────────────────────────
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }))

  useEffect(() => {
    if (error?.code === 'INVALID_PIN') {
      errorHaptic()
      shake.value = withSequence(
        withTiming(6, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withTiming(-6, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withTiming(3, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withTiming(-3, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withTiming(0, { duration: 50, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
      )
      // Clear digits AFTER the shake is in flight so the user sees their
      // wrong digits briefly. submittedRef released so a fresh 4th digit
      // can re-fire onSubmit.
      setDigits('')
      submittedRef.current = false
    }
  }, [error, shake])

  // ── Reset on visibility change + AppState background ─────────────────
  useEffect(() => {
    if (!visible) {
      setDigits('')
      submittedRef.current = false
    } else {
      // Focus the hidden input so the keypad opens.
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [visible])

  // PIN must NEVER persist across app-background. Clear on background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') {
        setDigits('')
        submittedRef.current = false
      }
    })
    return () => sub.remove()
  }, [])

  // ── Auto-submit on 4th digit ────────────────────────────────────────
  const handleChange = useCallback(
    (raw: string) => {
      if (isLoading || isLocked) return
      // Strip non-digits + cap at 4. iOS / Android keypads sometimes deliver
      // extra characters; defensive normalization.
      const cleaned = raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
      setDigits(cleaned)
      if (cleaned.length === PIN_LENGTH && !submittedRef.current) {
        submittedRef.current = true
        lightHaptic()
        onSubmit(cleaned)
      }
    },
    [isLoading, isLocked, onSubmit],
  )

  const handleManualSubmit = useCallback(() => {
    if (isLoading || isLocked) return
    if (digits.length !== PIN_LENGTH) return
    if (submittedRef.current) return
    submittedRef.current = true
    lightHaptic()
    onSubmit(digits)
  }, [digits, isLoading, isLocked, onSubmit])

  const submitDisabled =
    digits.length !== PIN_LENGTH || isLoading || isLocked

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Enter Branch PIN"
    >
      <View testID="pin-entry-sheet">
        {/* Merchant + branch line — anchors what the user is redeeming */}
        <View style={styles.headerRow}>
          <Text variant="label.md" style={styles.merchantLine}>
            {merchantName}
          </Text>
          {branchName ? (
            <Text variant="label.md" style={styles.branchLine}>
              {branchName}
            </Text>
          ) : null}
        </View>

        {/* Title */}
        <Text variant="heading.sm" style={styles.title}>
          Enter Branch PIN
        </Text>
        <Text variant="body.sm" style={styles.subtitle}>
          Ask staff at {merchantName} for the 4-digit PIN to confirm
          this redemption.
        </Text>

        {/* Locked-out card replaces the PIN input */}
        {isLocked ? (
          <View style={styles.lockoutCard} testID="pin-lockout-card">
            <View style={styles.lockoutIconWrap}>
              <Lock size={22} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <Text variant="label.md" style={styles.lockoutTitle}>
              Too Many Attempts
            </Text>
            <Text variant="body.sm" style={styles.lockoutBody}>
              You've entered the wrong PIN too many times. Try again
              after the timer below.
            </Text>
            <Text
              variant="heading.sm"
              style={styles.lockoutTimer}
              testID="pin-lockout-timer"
            >
              {lockout.mmss}
            </Text>
            <Text variant="label.md" style={styles.lockoutLabel}>
              minutes remaining
            </Text>
          </View>
        ) : (
          <Animated.View style={[styles.pinRow, shakeStyle]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < digits.length
              const active = i === digits.length
              return (
                <View
                  key={i}
                  style={[
                    styles.pinBox,
                    filled && styles.pinBoxFilled,
                    active && styles.pinBoxActive,
                    error?.code === 'INVALID_PIN' && styles.pinBoxError,
                  ]}
                  testID={`pin-box-${i}`}
                >
                  <Text variant="heading.md" style={styles.pinDigit}>
                    {digits[i] ?? ''}
                  </Text>
                </View>
              )
            })}
            {/* Hidden input drives the keypad. Pin display is read-only
                visual layer above. */}
            <TextInput
              ref={inputRef}
              testID="pin-input-hidden"
              value={digits}
              onChangeText={handleChange}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              autoFocus={visible}
              caretHidden
              importantForAutofill="no"
              autoComplete="off"
              // PR #44 review fix #5: NOT `oneTimeCode` — that hint
              // makes iOS surface "From Messages" autofill suggestions
              // for SMS-delivered codes. The branch PIN is staff-supplied
              // verbally; SMS autofill is wrong + confusing here.
              textContentType="none"
              style={styles.hiddenInput}
              editable={!isLoading && !isLocked}
            />
          </Animated.View>
        )}

        {/* Inline error bar — only when INVALID_PIN, not while locked.
            If `remainingAttempts` is missing (older backend, dropped
            payload, etc.) fall back to "Wrong PIN. Try again." rather
            than rendering a blank counter. */}
        {showInvalidPinBar ? (
          <View style={styles.errorBar} testID="pin-error-bar">
            <Text variant="label.md" style={styles.errorBarText}>
              {remainingAttempts !== null
                ? `Wrong PIN · ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining`
                : 'Wrong PIN. Try again.'}
            </Text>
          </View>
        ) : null}

        {/* Generic backend-error banner — covers the 6 non-PIN error codes
            (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, BRANCH_MERCHANT_MISMATCH,
            PHONE_NOT_VERIFIED, SUBSCRIPTION_REQUIRED, VOUCHER_NOT_FOUND).
            Distinct from the INVALID_PIN bar above (no attempts counter,
            different framing — these aren't the user's fault). */}
        {errorBanner && !isLocked ? (
          <View style={styles.backendErrorBanner} testID="pin-backend-error-banner">
            <Text variant="label.md" style={styles.backendErrorTitle}>
              {errorBanner.title}
            </Text>
            <Text variant="body.sm" style={styles.backendErrorBody}>
              {errorBanner.body}
            </Text>
          </View>
        ) : null}

        {/* Disclaimer */}
        {!isLocked ? (
          <View style={styles.disclaimer}>
            <AlertTriangle size={14} color="#D97706" strokeWidth={2.4} />
            <Text variant="label.md" style={styles.disclaimerText}>
              Entering the correct PIN immediately redeems this voucher.
              It will not be available again until your next monthly cycle.
            </Text>
          </View>
        ) : null}

        {/* Submit */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Redeem voucher"
          accessibilityState={{ disabled: submitDisabled }}
          testID="pin-submit"
          disabled={submitDisabled}
          onPress={handleManualSubmit}
          style={({ pressed }) => [
            styles.submit,
            submitDisabled && styles.submitDisabled,
            pressed && !submitDisabled && styles.submitPressed,
          ]}
        >
          <LinearGradient
            colors={color.brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Tag size={18} color={color.onBrand} strokeWidth={2.4} />
          <Text variant="label.md" style={styles.submitText}>
            Redeem Voucher
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
    marginBottom: spacing[4],
  },
  merchantLine: {
    fontSize: 13,
    fontWeight: '800',
    color: color.text.primary,
  },
  branchLine: {
    marginTop: 2,
    fontSize: 11,
    color: color.text.secondary,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing[2],
    fontSize: 12,
    lineHeight: 18,
    color: color.text.secondary,
    textAlign: 'center',
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    marginVertical: spacing[5],
  },
  pinBox: {
    width: 54,
    height: 60,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: '#E8E2DC',
    backgroundColor: color.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxFilled: {
    borderColor: color.brandRose,
    backgroundColor: color.surface.raised,
  },
  pinBoxActive: {
    borderColor: color.brandRose,
    backgroundColor: color.surface.raised,
  },
  pinBoxError: {
    borderColor: color.danger,
    backgroundColor: '#FEF2F2',
  },
  pinDigit: {
    fontSize: 26,
    fontWeight: '800',
    color: color.text.primary,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorBar: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
    alignItems: 'center',
  },
  errorBarText: {
    fontSize: 11,
    fontWeight: '600',
    color: color.danger,
  },
  // Generic backend-error banner — for the 6 non-PIN codes the backend
  // can return (PIN_NOT_CONFIGURED, BRANCH_UNAVAILABLE, etc.). Distinct
  // from the INVALID_PIN bar — slightly larger, two-line layout, less
  // alarming colour (these aren't user-fault errors).
  backendErrorBanner: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  backendErrorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  backendErrorBody: {
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  disclaimerText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: '#92400E',
  },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
  },
  submitDisabled: {
    opacity: opacity.disabled,
  },
  submitPressed: {
    transform: [{ scale: 0.97 }],
  },
  submitText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.onBrand,
  },
  // ── Lockout card ──
  lockoutCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[5],
    alignItems: 'center',
    marginVertical: spacing[5],
  },
  lockoutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  lockoutTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: color.danger,
    marginBottom: spacing[2],
  },
  lockoutBody: {
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  lockoutTimer: {
    fontSize: 18,
    fontWeight: '800',
    color: color.danger,
    fontVariant: ['tabular-nums'],
  },
  lockoutLabel: {
    marginTop: 2,
    fontSize: 10,
    color: '#92400E',
  },
})
