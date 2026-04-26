import React, { useEffect, useState, Fragment } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { InlineError } from '@/design-system/components/InlineError'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useVerifyEmail } from '@/features/auth/hooks/useVerifyEmail'
import { scale, ms } from '@/design-system/scale'

const RESEND_COOLDOWN = 60_000

function MailIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="M22 7l-10 7L2 7" />
    </Svg>
  )
}

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#010C35" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Path d="M12 19l-7-7 7-7" />
    </Svg>
  )
}

// ─── onboarding step indicator ───────────────────────────────────────────────

const ONBOARDING_STEPS = ['Account', 'Email', 'Phone'] as const

function OnboardingSteps({ current }: { current: number }) {
  return (
    <View style={stepStyles.row} accessibilityRole="progressbar" accessibilityLabel={`Step ${current + 1} of ${ONBOARDING_STEPS.length}: ${ONBOARDING_STEPS[current]}`}>
      {ONBOARDING_STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <Fragment key={label}>
            {i > 0 && (
              <View style={[stepStyles.line, done ? stepStyles.lineDone : stepStyles.linePending]} />
            )}
            <View style={stepStyles.step}>
              <View style={[
                stepStyles.dot,
                done ? stepStyles.dotDone : active ? stepStyles.dotActive : stepStyles.dotPending,
              ]}>
                <Text style={done ? stepStyles.dotCheck : stepStyles.dotNum}>
                  {done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <Text style={[
                stepStyles.stepLabel,
                done ? stepStyles.stepLabelDone : active ? stepStyles.stepLabelActive : stepStyles.stepLabelPending,
              ]}>
                {label}
              </Text>
            </View>
          </Fragment>
        )
      })}
    </View>
  )
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: ms(4),
  },
  step: { alignItems: 'center', width: ms(56) },
  line: {
    height: 2,
    flex: 1,
    marginTop: ms(9),
    borderRadius: 1,
  },
  lineDone:    { backgroundColor: '#E20C04' },
  linePending: { backgroundColor: '#E5E7EB' },
  dot: {
    width: ms(20),
    height: ms(20),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ms(4),
  },
  dotDone:    { backgroundColor: '#E20C04' },
  dotActive:  { backgroundColor: '#E20C04' },
  dotPending: { backgroundColor: '#E5E7EB' },
  dotCheck: {
    fontSize: ms(10),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
  },
  dotNum: {
    fontSize: ms(10),
    fontFamily: 'Lato-Bold',
    color: '#9CA3AF',
  },
  stepLabel: {
    fontSize: ms(10),
    fontFamily: 'Lato-Regular',
    letterSpacing: 0.1,
  },
  stepLabelDone:    { color: '#E20C04',   fontFamily: 'Lato-SemiBold' },
  stepLabelActive:  { color: '#010C35',   fontFamily: 'Lato-Bold' },
  stepLabelPending: { color: '#9CA3AF' },
})

function SuccessIcon() {
  const scaleV = useSharedValue(0.6)
  const opacityV = useSharedValue(0)

  useEffect(() => {
    scaleV.value = withSpring(1, { damping: 11, stiffness: 180, mass: 0.8 })
    opacityV.value = withTiming(1, { duration: 220 })
  }, [scaleV, opacityV])

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scaleV.value }],
    opacity: opacityV.value,
  }))

  return (
    <Animated.View style={style}>
      <LinearGradient
        colors={['#E20C04', '#E84A00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.successIcon}
      >
        <MailIcon />
      </LinearGradient>
    </Animated.View>
  )
}

export function VerifyEmailScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ email?: string }>()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const emailForDisplay = (params.email ?? user?.email ?? '').trim()
  const [resending, setResending] = useState(false)
  const [lastResent, setLastResent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useVerifyEmail()

  const cooldownActive = lastResent !== null && Date.now() - lastResent < RESEND_COOLDOWN
  const isDisabled = resending || cooldownActive

  async function handleResend() {
    if (isDisabled) return
    setError(null)
    setResending(true)
    try {
      await authApi.resendEmailVerification()
      setLastResent(Date.now())
    } catch (e) {
      setError(mapError(e).message)
    } finally {
      setResending(false)
    }
  }

  // Back: return to register pre-filled so the user can correct their details.
  // Capture values from the store before sign-out wipes it.
  async function handleGoBack() {
    const prefill = {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
    }
    await signOut()
    router.replace({ pathname: '/(auth)/register', params: prefill })
  }

  // "Use a different account": full reset — go to welcome so they can sign in
  // or register as someone else from scratch.
  async function handleUseDifferentAccount() {
    await signOut()
    router.replace('/(auth)/welcome')
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <BackIcon />
        </TouchableOpacity>
        <View style={styles.stepWrap}>
          <OnboardingSteps current={1} />
        </View>
      </View>
      <View style={[styles.successBody, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.successComposition}>
          <SuccessIcon />

          <Animated.View
            entering={FadeInDown.delay(120).duration(320)}
            style={styles.successHeadingWrap}
          >
            <Text style={styles.successHeading} accessibilityRole="header">Verify your email</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(200).duration(320)}
            style={styles.primaryTextWrap}
          >
            <Text style={styles.primaryBody}>We&apos;ve sent a verification link to</Text>
            <Text style={styles.emailLine}>{emailForDisplay || 'your email'}</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(280).duration(320)}
            style={styles.caveatWrap}
          >
            <Text style={styles.secondaryCaveat}>
              Tap the link in your email to verify your account. Check your spam folder if you don&apos;t see it.
            </Text>
          </Animated.View>

          {error ? (
            <View style={styles.errorWrap}>
              <InlineError message={error} />
            </View>
          ) : null}
        </View>

        <Animated.View
          entering={FadeInDown.delay(360).duration(320)}
          style={styles.successCtaWrap}
        >
          <TouchableOpacity
            onPress={handleResend}
            disabled={isDisabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Resend email"
            accessibilityState={{ disabled: isDisabled, busy: resending }}
          >
            <LinearGradient
              colors={['#E20C04', '#E84A00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.primaryBtn, isDisabled ? styles.primaryBtnDisabled : undefined]}
            >
              <Text style={styles.primaryBtnText}>
                {resending ? 'Sending…' : 'Resend email'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleUseDifferentAccount}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Use a different account"
            style={styles.secondaryBtn}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={styles.secondaryText}>Use a different account</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF9F5' },
  topBar: {
    paddingHorizontal: ms(24),
    paddingTop: ms(4),
    paddingBottom: ms(4),
  },
  stepWrap: {
    alignItems: 'center',
    marginTop: ms(2),
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  successBody: {
    flex: 1,
    paddingHorizontal: ms(24),
    paddingTop: ms(16),
    alignItems: 'center',
  },
  successComposition: {
    alignItems: 'center',
    width: '100%',
  },
  successIcon: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E20C04',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  successHeadingWrap: { marginTop: ms(14) },
  successHeading: {
    fontSize: ms(24),
    lineHeight: ms(30),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  primaryTextWrap: {
    marginTop: ms(6),
    maxWidth: 360,
    alignItems: 'center',
  },
  primaryBody: {
    fontSize: ms(15),
    lineHeight: ms(22),
    fontFamily: 'Lato-Regular',
    color: '#4B5563',
    textAlign: 'center',
  },
  emailLine: {
    marginTop: ms(4),
    fontSize: ms(16),
    lineHeight: ms(22),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    textAlign: 'center',
  },
  caveatWrap: {
    marginTop: ms(18),
    maxWidth: 360,
  },
  secondaryCaveat: {
    fontSize: ms(14),
    lineHeight: ms(22),
    fontFamily: 'Lato-Regular',
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: ms(8),
  },
  errorWrap: {
    marginTop: ms(16),
    maxWidth: 360,
    width: '100%',
  },
  successCtaWrap: {
    width: '100%',
    maxWidth: 360,
    marginTop: ms(36),
  },
  primaryBtn: {
    borderRadius: 50,
    paddingVertical: ms(18),
    alignItems: 'center',
    shadowColor: '#E20C04',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    fontSize: ms(16),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    marginTop: ms(18),
    alignItems: 'center',
    paddingVertical: ms(12),
  },
  secondaryText: {
    fontSize: ms(14),
    fontFamily: 'Lato-SemiBold',
    color: '#010C35',
    letterSpacing: -0.1,
    textDecorationLine: 'underline',
    textDecorationColor: '#010C35',
  },
})
