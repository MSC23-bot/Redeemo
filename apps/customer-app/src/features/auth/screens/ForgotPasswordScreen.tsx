import React, { useEffect, useState } from 'react'
import {
  View, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
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
import { useForgotPassword } from '@/features/auth/hooks/usePasswordReset'
import { scale, ms } from '@/design-system/scale'

function MailIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
        <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </LinearGradient>
    </Animated.View>
  )
}

export function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [focused, setFocused] = useState(false)
  const { submit, submitting, sent, error, clearError } = useForgotPassword()

  const handleChange = (text: string) => {
    setEmail(text)
    if (error) clearError()
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.anchored}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <BackIcon />
          </TouchableOpacity>
        </View>

        {!sent && (
          <View style={styles.headingSection}>
            <Text style={styles.heading}>Reset password</Text>
            <Text style={styles.subheading}>
              Enter your email and we&apos;ll send you a reset link.
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {!sent ? (
          <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
            <View style={[
              styles.inputWrapper,
              focused && !error ? styles.inputFocused : undefined,
              error ? styles.inputError : undefined,
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={handleChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                autoCorrect={false}
              />
              <View style={styles.inputIcon}>
                <MailIcon />
              </View>
            </View>
            {error ? (
              <View style={styles.errorWrap}>
                <InlineError message={error} />
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => submit(email)}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Send reset link"
              style={styles.btnWrapper}
            >
              <LinearGradient
                colors={['#E20C04', '#E84A00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : undefined]}
              >
                <Text style={styles.primaryBtnText}>
                  {submitting ? 'Sending…' : 'Send reset link'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.successBody, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.successComposition}>
              <SuccessIcon />

              <Animated.View
                entering={FadeInDown.delay(120).duration(320)}
                style={styles.successHeadingWrap}
              >
                <Text style={styles.successHeading}>Reset link sent</Text>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(200).duration(320)}
                style={styles.primaryTextWrap}
              >
                <Text style={styles.primaryBody}>We&apos;ve sent a reset link to</Text>
                <Text style={styles.emailLine}>{email}</Text>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(280).duration(320)}
                style={styles.caveatWrap}
              >
                <Text style={styles.secondaryCaveat}>
                  Check your inbox and spam folder. If you don&apos;t see it, the email might not be registered.
                </Text>
              </Animated.View>
            </View>

            <Animated.View
              entering={FadeInDown.delay(360).duration(320)}
              style={styles.successCtaWrap}
            >
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <LinearGradient
                  colors={['#E20C04', '#E84A00']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Back to sign in</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#FFF9F5' },
  anchored: { paddingHorizontal: ms(24) },
  body: { paddingHorizontal: ms(24) },
  topBar: { marginBottom: ms(20) },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headingSection: {
    alignItems: 'flex-start',
    marginBottom: ms(24),
  },
  heading: {
    fontSize: ms(26),
    lineHeight: ms(32),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.5,
    marginBottom: ms(6),
  },
  subheading: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1.5,
    borderColor: '#D6DAE2',
    paddingHorizontal: ms(16),
    height: scale(54),
    shadowColor: '#010C35',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  inputFocused: {
    borderColor: '#E20C04',
    shadowColor: '#E20C04',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  inputError: { borderColor: '#E20C04' },
  errorWrap: { marginTop: ms(10) },
  input: {
    flex: 1,
    fontSize: ms(15),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    height: '100%',
  },
  inputIcon: { marginLeft: ms(8), justifyContent: 'center', alignItems: 'center' },
  btnWrapper: { marginTop: ms(22) },
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
  primaryBtnText: { fontSize: ms(16), fontFamily: 'Lato-Bold', color: '#FFFFFF', letterSpacing: -0.2 },

  // Success state
  successBody: {
    paddingHorizontal: ms(24),
    alignItems: 'center',
    paddingTop: ms(24),
  },
  successComposition: {
    alignItems: 'center',
    width: '100%',
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E20C04',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  successHeadingWrap: { marginTop: ms(20) },
  successHeading: {
    fontSize: ms(24),
    lineHeight: ms(30),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  primaryTextWrap: {
    marginTop: ms(8),
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
    marginTop: ms(16),
    maxWidth: 360,
  },
  secondaryCaveat: {
    fontSize: ms(12),
    lineHeight: ms(18),
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: ms(12),
  },
  successCtaWrap: {
    width: '100%',
    maxWidth: 360,
    marginTop: ms(36),
  },
})
