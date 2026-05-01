import React, { useEffect, useState } from 'react'
import {
  View, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  TextInput, KeyboardAvoidingView, Keyboard, Platform, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { InlineError } from '@/design-system/components/InlineError'
import { useLoginFlow } from '@/features/auth/hooks/useLoginFlow'
import { useMotionScale } from '@/design-system/useMotionScale'
import { scale, ms } from '@/design-system/scale'

function AppleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="white">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

function GoogleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </Svg>
  )
}

function MailIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="4" width="20" height="16" rx="2" />
      <Path d="M22 7l-10 7L2 7" />
    </Svg>
  )
}

function EyeIcon({ visible, active }: { visible: boolean; active: boolean }) {
  const stroke = visible ? '#E20C04' : active ? '#010C35' : '#9CA3AF'
  if (visible) {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <Circle cx="12" cy="12" r="3" />
      </Svg>
    )
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <Path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <Line x1="1" y1="1" x2="23" y2="23" />
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

export function LoginScreen() {
  const insets = useSafeAreaInsets()
  const motionScale = useMotionScale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  const { submit, submitting, fieldErrors, formError, clearFormError } = useLoginFlow()

  // Header collapse — driven by keyboard show/hide. 0 = expanded, 1 = collapsed.
  // iOS uses `willShow`/`willHide` so the animation rides with the keyboard
  // slide; Android uses `didShow`/`didHide` since `will` events aren't emitted.
  const collapse = useSharedValue(0)
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const duration = motionScale === 0 ? 0 : 220
    const showSub = Keyboard.addListener(showEvt, () => {
      collapse.value = withTiming(1, { duration })
    })
    const hideSub = Keyboard.addListener(hideEvt, () => {
      collapse.value = withTiming(0, { duration })
    })
    return () => { showSub.remove(); hideSub.remove() }
  }, [collapse, motionScale])

  // Pre-compute all ms() values outside the worklets — ms() is a plain JS
  // function and cannot be called on the UI thread inside useAnimatedStyle.
  const FS_EXPANDED = ms(26), FS_COLLAPSED = ms(16)
  const LH_EXPANDED = ms(32), LH_COLLAPSED = ms(20)
  const SH_MAX = ms(20)
  const SEC_MB_EXP = ms(24), SEC_MB_COL = ms(20)
  // topBar marginBottom collapses to 4 so "Welcome back" sits closer to the arrow.
  const TB_MB_EXP = ms(20), TB_MB_COL = ms(4)
  const INLINE_MAX_W = ms(260)

  const headingAnim = useAnimatedStyle(() => ({
    fontSize: interpolate(collapse.value, [0, 1], [FS_EXPANDED, FS_COLLAPSED]),
    lineHeight: interpolate(collapse.value, [0, 1], [LH_EXPANDED, LH_COLLAPSED]),
  }))
  // Stacked subtitle fades out and collapses height as keyboard opens.
  const subtitleAnim = useAnimatedStyle(() => ({
    opacity: interpolate(collapse.value, [0, 1], [1, 0]),
    maxHeight: interpolate(collapse.value, [0, 1], [SH_MAX, 0]),
  }))
  const headingSectionAnim = useAnimatedStyle(() => ({
    marginBottom: interpolate(collapse.value, [0, 1], [SEC_MB_EXP, SEC_MB_COL]),
  }))
  const topBarAnim = useAnimatedStyle(() => ({
    marginBottom: interpolate(collapse.value, [0, 1], [TB_MB_EXP, TB_MB_COL]),
  }))
  // Inline subtitle slides in alongside "Welcome back" when keyboard is open.
  // maxWidth: 0 → 260 clips the text to nothing when expanded so it takes no
  // layout space; overflow:hidden on the wrapper does the clipping.
  const inlineSubtitleAnim = useAnimatedStyle(() => ({
    maxWidth: interpolate(collapse.value, [0, 1], [0, INLINE_MAX_W]),
    opacity: interpolate(collapse.value, [0, 1], [0, 1]),
  }))

  const handleEmailChange = (v: string) => { setEmail(v); if (formError) clearFormError() }
  const handlePasswordChange = (v: string) => { setPassword(v); if (formError) clearFormError() }

  const handleSocialAuth = () =>
    Alert.alert('Coming soon', 'Social sign-in will be available in a future update.')

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Anchored header region — never moves with keyboard. Opaque background
          + raised z-index so the ScrollView below cannot bleed through it. */}
      <View style={styles.anchored}>
        {/* Top bar */}
        <Animated.View style={[styles.topBar, topBarAnim]}>
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <BackIcon />
          </TouchableOpacity>
        </Animated.View>

        {/* Heading — collapses when keyboard is open to reclaim vertical space.
            When collapsed: heading shrinks and the subtitle slides in inline
            (same row, lighter style). When expanded: subtitle stacks below. */}
        <Animated.View style={[styles.headingSection, headingSectionAnim]}>
          {/* Row holds heading + inline subtitle side-by-side when collapsed. */}
          <View style={styles.headingRow}>
            <Animated.Text style={[styles.heading, headingAnim]} maxFontSizeMultiplier={1.4}>Welcome back</Animated.Text>
            {/* Inline subtitle — overflow:hidden container clips to width 0
                when expanded so it occupies no layout space. */}
            <Animated.View style={[styles.inlineSubtitleWrap, inlineSubtitleAnim]}>
              <Text style={styles.inlineSubtitle} numberOfLines={1}>
                {' · Pick up where you left off'}
              </Text>
            </Animated.View>
          </View>
          {/* Stacked subtitle — visible when keyboard is closed, fades + collapses away. */}
          <Animated.Text style={[styles.subheading, subtitleAnim]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            Pick up where you left off
          </Animated.Text>
        </Animated.View>
      </View>

      {/* Keyboard-avoiding region — shifts form up as keyboard opens.
          No ScrollView needed: everything fits in view even with keyboard up.
          The register link at the bottom is intentionally hidden while typing. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.formContent, { paddingBottom: insets.bottom + 24 }]}>
          {/* Social buttons */}
          <View style={styles.socialRow}>
            <TouchableOpacity onPress={handleSocialAuth} activeOpacity={0.85} style={styles.appleBtn}>
              <AppleIcon />
              <Text style={styles.appleBtnText}>Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSocialAuth} activeOpacity={0.85} style={styles.googleBtn}>
              <GoogleIcon />
              <Text style={styles.googleBtnText}>Google</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Form */}
          <View style={styles.form}>
          {/* Email */}
          <View style={[
            styles.inputWrapper,
            focusedField === 'email' && !fieldErrors.email ? styles.inputFocused : undefined,
            fieldErrors.email ? styles.inputError : undefined,
          ]}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={handleEmailChange}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
            <View style={styles.inputIcon}>
              <MailIcon />
            </View>
          </View>
          {fieldErrors.email ? <InlineError message={fieldErrors.email} /> : null}

          {/* Password */}
          <View style={[
            styles.inputWrapper,
            focusedField === 'password' && !fieldErrors.password ? styles.inputFocused : undefined,
            fieldErrors.password ? styles.inputError : undefined,
          ]}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={handlePasswordChange}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!showPassword}
              textContentType="password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              style={styles.inputIcon}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon visible={showPassword} active={password.length > 0} />
            </TouchableOpacity>
          </View>
          {fieldErrors.password ? <InlineError message={fieldErrors.password} /> : null}

          {/* Form-level error (invalid credentials, account locked, network, rate limit) */}
          {formError ? <InlineError message={formError} /> : null}

          {/* Forgot password */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotRow}
            accessibilityRole="button"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        {/* Sign in button */}
        <TouchableOpacity
          onPress={() => submit({ email, password })}
          disabled={submitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={styles.btnWrapper}
        >
          <LinearGradient
            colors={['#E20C04', '#E84A00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : undefined]}
          >
            <Text style={styles.primaryBtnText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Register link */}
        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          accessibilityRole="button"
          style={styles.registerRow}
        >
          <Text style={styles.registerPrompt}>New to Redeemo? </Text>
          <Text style={styles.registerLink}>Create account</Text>
        </TouchableOpacity>
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#FFF9F5' },
  // Opaque + raised z-index so scrolled form content is masked by the header
  // instead of bleeding through it.
  anchored: {
    paddingHorizontal: ms(24),
    backgroundColor: '#FFF9F5',
    zIndex: 10,
    elevation: 10, // Android z-axis stacking
  },
  formContent: { flex: 1, paddingHorizontal: ms(24) },
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
  // Row so heading + inline subtitle sit on the same baseline when collapsed.
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heading: {
    fontSize: ms(26),
    lineHeight: ms(32),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.5,
    marginBottom: ms(2),
  },
  subheading: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
    overflow: 'hidden',
  },
  // Container animated from maxWidth 0 → 260 so it clips to nothing when
  // expanded and takes no layout space.
  inlineSubtitleWrap: {
    overflow: 'hidden',
  },
  inlineSubtitle: {
    fontSize: ms(13),
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
    letterSpacing: -0.1,
  },
  socialRow: {
    flexDirection: 'row',
    gap: ms(10),
    marginBottom: ms(20),
  },
  appleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(7),
    paddingVertical: ms(14),
    borderRadius: 50,
    backgroundColor: '#010C35',
  },
  appleBtnText: { fontSize: ms(14), fontFamily: 'Lato-Bold', color: '#FFFFFF' },
  googleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(7),
    paddingVertical: ms(14),
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  googleBtnText: { fontSize: ms(14), fontFamily: 'Lato-Bold', color: '#010C35' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    marginBottom: ms(20),
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: ms(13), fontFamily: 'Lato-Regular', color: '#9CA3AF' },
  form: { gap: ms(16), marginBottom: ms(8) },
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
  input: {
    flex: 1,
    fontSize: ms(15),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    height: '100%',
  },
  inputIcon: { marginLeft: ms(8), justifyContent: 'center', alignItems: 'center' },
  forgotRow: { alignSelf: 'flex-end' },
  forgotText: { fontSize: ms(13), fontFamily: 'Lato-Bold', color: '#E20C04' },
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
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: ms(20),
  },
  registerPrompt: { fontSize: ms(14), color: '#9CA3AF', fontFamily: 'Lato-Regular' },
  registerLink: { fontSize: ms(14), color: '#E20C04', fontFamily: 'Lato-Bold' },
})
