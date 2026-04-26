import React, { useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { Text } from '@/design-system/Text'
import { InlineError } from '@/design-system/components/InlineError'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { RedeemoLogo } from '../components/RedeemoLogo'
import { useRegisterFlow, type FieldError } from '@/features/auth/hooks/useRegisterFlow'
import { scale, ms } from '@/design-system/scale'
import {
  COUNTRIES_FOR_PICKER,
  DEFAULT_COUNTRY,
  type Country,
} from '@/features/auth/utils/countries'

// ─── header constants ────────────────────────────────────────────────────────
// Static inline header: logo + two-line title side-by-side. Logo is sized so
// its height roughly spans both text lines, balancing the visual weight.
const LOGO_SIZE = scale(40)
const LOGO_TEXT_GAP = ms(14)

// ─── phone validation (mirrors VerifyPhoneScreen) ─────────────────────────────

const E164_RE = /^\+[1-9]\d{7,14}$/

function normaliseNational(country: Country, raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (country.stripTrunk && digits.startsWith('0')) return digits.slice(1)
  return digits
}

type PhoneValidation = { ok: true; e164: string } | { ok: false; message: string }

function validateNational(country: Country, raw: string): PhoneValidation {
  const digits = normaliseNational(country, raw)
  if (digits.length === 0) return { ok: false, message: 'Enter your mobile number.' }
  if (country.nationalLength !== undefined) {
    if (digits.length < country.nationalLength)
      return { ok: false, message: `Too short — ${country.name} numbers have ${country.nationalLength} digits.` }
    if (digits.length > country.nationalLength)
      return { ok: false, message: `Too long — ${country.name} numbers have ${country.nationalLength} digits.` }
  }
  const e164 = `${country.dial}${digits}`
  if (!E164_RE.test(e164)) return { ok: false, message: 'Enter a valid mobile number.' }
  return { ok: true, e164 }
}

// ─── password strength ────────────────────────────────────────────────────────

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '#E5E7EB' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const colors = ['#E5E7EB', '#EF4444', '#F59E0B', '#22C55E', '#10B981']
  return { score, label: labels[score] ?? '', color: colors[score] ?? '#E5E7EB' }
}

// ─── local validation helpers ─────────────────────────────────────────────────
// Per-field validators return null when valid, or a FieldError when not. They
// are reused by both onBlur (validates that one field) and onSubmit (validates
// the whole form). Password rule mirrors the backend (8+ chars, upper, lower,
// number, special) — keep these in sync.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const local = (message: string): FieldError => ({ code: 'LOCAL', message })

function validateFirstName(v: string): FieldError | null {
  if (!v.trim()) return local('First name is required.')
  return null
}

function validateLastName(v: string): FieldError | null {
  if (!v.trim()) return local('Last name is required.')
  return null
}

function validateEmail(v: string): FieldError | null {
  if (!EMAIL_RE.test(v.trim())) return local('Enter a valid email address.')
  return null
}

function validatePassword(pw: string): FieldError | null {
  const ok =
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  if (!ok) {
    return local('Password must include uppercase, lowercase, a number, and a special character.')
  }
  return null
}

function validatePhone(country: Country, raw: string): FieldError | null {
  const r = validateNational(country, raw)
  return r.ok ? null : local(r.message)
}

// Parse an e164 number back into a Country + national number so the form can
// be pre-filled when the user returns from verify-email. Tries longest dial
// codes first to avoid prefix conflicts (e.g. +1 vs +1268).
function parseE164(e164: string): { country: Country; nationalNumber: string } | null {
  if (!e164.startsWith('+')) return null
  const sorted = [...COUNTRIES_FOR_PICKER].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of sorted) {
    if (e164.startsWith(c.dial)) {
      return { country: c, nationalNumber: e164.slice(c.dial.length) }
    }
  }
  return null
}

// ─── icons ────────────────────────────────────────────────────────────────────

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

function ChevronIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#010C35" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  )
}

function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 21l-4.3-4.3" />
      <Path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z" />
    </Svg>
  )
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  if (checked) {
    return (
      <Svg width={scale(20)} height={scale(20)} viewBox="0 0 24 24" fill="none">
        <Rect x="2" y="2" width="20" height="20" rx="5" fill="#E20C04" />
        <Path d="M7 12l4 4 6-7" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }
  return (
    <Svg width={scale(20)} height={scale(20)} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="2" width="20" height="20" rx="5" stroke="#E5E7EB" strokeWidth={1.5} fill="white" />
    </Svg>
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

type FocusedField = 'firstName' | 'lastName' | 'email' | 'password' | 'phone' | null

export function RegisterScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
  }>()

  // Pre-fill from params when returning from verify-email (back button).
  const prefillPhone = params.phone ? parseE164(params.phone) : null

  // Form state
  const [firstName, setFirstName] = useState(params.firstName ?? '')
  const [lastName, setLastName] = useState(params.lastName ?? '')
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [focusedField, setFocusedField] = useState<FocusedField>(null)

  // Phone field — same country-picker pattern as VerifyPhoneScreen
  const [country, setCountry] = useState<Country>(prefillPhone?.country ?? DEFAULT_COUNTRY)
  const [nationalNumber, setNationalNumber] = useState(prefillPhone?.nationalNumber ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Refs for autofocusing the first invalid field on submit failure.
  const firstNameRef = useRef<TextInput>(null)
  const lastNameRef = useRef<TextInput>(null)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const phoneInputRef = useRef<TextInput>(null)

  const { submit, submitting, fieldErrors, setFieldErrors, setFieldError, clearFieldError } = useRegisterFlow()
  const strength = getPasswordStrength(password)

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return COUNTRIES_FOR_PICKER
    return COUNTRIES_FOR_PICKER.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    )
  }, [searchQuery])

  // ─── actions ────────────────────────────────────────────────────────────────

  function openPicker() {
    Keyboard.dismiss()
    setSearchQuery('')
    setPickerOpen(true)
  }

  function closePicker() {
    setPickerOpen(false)
    setSearchQuery('')
    setTimeout(() => phoneInputRef.current?.focus(), 300)
  }

  function handleSelectCountry(c: Country) {
    setCountry(c)
    if (fieldErrors.phone) clearFieldError('phone')
    closePicker()
  }

  // Field-order list for autofocusing the first invalid field on submit.
  const FIELD_ORDER: ReadonlyArray<keyof typeof fieldRefs> = [
    'firstName', 'lastName', 'email', 'password', 'phone',
  ] as const
  const fieldRefs = {
    firstName: firstNameRef,
    lastName: lastNameRef,
    email: emailRef,
    password: passwordRef,
    phone: phoneInputRef,
  }

  function focusFirstInvalid(errors: Record<string, FieldError>) {
    for (const f of FIELD_ORDER) {
      if (errors[f]) {
        fieldRefs[f].current?.focus()
        return
      }
    }
  }

  async function handleSubmit() {
    // Prevent double-submits while a request is in flight.
    if (submitting) return
    Keyboard.dismiss()

    // ── Local validation — runs BEFORE the API call ───────────────────────────
    const errors: Record<string, FieldError> = {}
    const fnErr = validateFirstName(firstName)
    const lnErr = validateLastName(lastName)
    const emErr = validateEmail(email)
    const pwErr = validatePassword(password)
    const phErr = validatePhone(country, nationalNumber)
    if (fnErr) errors.firstName = fnErr
    if (lnErr) errors.lastName = lnErr
    if (emErr) errors.email = emErr
    if (pwErr) errors.password = pwErr
    if (phErr) errors.phone = phErr

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      focusFirstInvalid(errors)
      return
    }

    // All local checks passed — re-resolve the e164 phone for the payload.
    const phone = validateNational(country, nationalNumber)
    if (!phone.ok) return // (type-narrow guard, unreachable after checks above)
    await submit({ firstName, lastName, email, password, phone: phone.e164 })
  }

  const handleSocialAuth = () =>
    Alert.alert('Coming soon', 'Social sign-in will be available in a future update.')

  const handleTermsPress = () =>
    Alert.alert('Terms of Service', 'Full terms will be available at launch.')

  const handlePrivacyPress = () =>
    Alert.alert('Privacy Policy', 'Full privacy policy will be available at launch.')

  // ─── render ─────────────────────────────────────────────────────────────────
  // ScrollView keeps the form usable when multiple inline errors stack and
  // grow the content past the screen height. iOS uses
  // automaticallyAdjustKeyboardInsets so a focused field is always above the
  // keyboard; Android relies on softwareKeyboardLayoutMode='pan'
  // (app.config.ts).

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: ms(4),
            paddingBottom: insets.bottom + ms(24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
          {/* Top bar — back button */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <BackIcon />
            </TouchableOpacity>
          </View>

          {/* Heading — logo + title inline */}
          <View style={styles.headingSection}>
            <RedeemoLogo size={LOGO_SIZE} />
            <View style={styles.textBlock}>
              <Text style={styles.heading} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                Create your account
              </Text>
              <Text style={styles.subheading} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                Join thousands saving with Redeemo
              </Text>
            </View>
          </View>

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

            {/* Name row */}
            <View style={styles.nameRow}>
              <View style={[
                styles.inputWrapper,
                styles.halfInput,
                focusedField === 'firstName' && !fieldErrors.firstName ? styles.inputFocused : undefined,
                fieldErrors.firstName ? styles.inputError : undefined,
              ]}>
                <TextInput
                  ref={firstNameRef}
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor="#9CA3AF"
                  value={firstName}
                  onChangeText={(v) => {
                    setFirstName(v)
                    if (fieldErrors.firstName) clearFieldError('firstName')
                  }}
                  onFocus={() => setFocusedField('firstName')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                  textContentType="givenName"
                  maxFontSizeMultiplier={1.4}
                  returnKeyType="next"
                />
              </View>
              <View style={[
                styles.inputWrapper,
                styles.halfInput,
                focusedField === 'lastName' && !fieldErrors.lastName ? styles.inputFocused : undefined,
                fieldErrors.lastName ? styles.inputError : undefined,
              ]}>
                <TextInput
                  ref={lastNameRef}
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor="#9CA3AF"
                  value={lastName}
                  onChangeText={(v) => {
                    setLastName(v)
                    if (fieldErrors.lastName) clearFieldError('lastName')
                  }}
                  onFocus={() => setFocusedField('lastName')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                  textContentType="familyName"
                  maxFontSizeMultiplier={1.4}
                  returnKeyType="next"
                />
              </View>
            </View>
            {fieldErrors.firstName ? <InlineError message={fieldErrors.firstName.message} /> : null}
            {!fieldErrors.firstName && fieldErrors.lastName ? (
              <InlineError message={fieldErrors.lastName.message} />
            ) : null}

            {/* Email */}
            <View style={[
              styles.inputWrapper,
              focusedField === 'email' && !fieldErrors.email ? styles.inputFocused : undefined,
              fieldErrors.email ? styles.inputError : undefined,
            ]}>
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={(v) => {
                  setEmail(v)
                  if (fieldErrors.email) clearFieldError('email')
                }}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                maxFontSizeMultiplier={1.4}
                returnKeyType="next"
              />
              <View style={styles.inputIcon}><MailIcon /></View>
            </View>
            {fieldErrors.email?.code === 'EMAIL_ALREADY_EXISTS' ? (
              <View style={styles.specialError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={styles.specialErrorText}>
                  This email is already registered.
                </Text>
                <TouchableOpacity
                  onPress={() => router.replace('/(auth)/login')}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in instead"
                  activeOpacity={0.75}
                  style={styles.specialErrorBtn}
                >
                  <Text style={styles.specialErrorBtnText}>Sign in instead →</Text>
                </TouchableOpacity>
              </View>
            ) : fieldErrors.email ? (
              <InlineError message={fieldErrors.email.message} />
            ) : null}

            {/* Password */}
            <View style={[
              styles.inputWrapper,
              focusedField === 'password' && !fieldErrors.password ? styles.inputFocused : undefined,
              fieldErrors.password ? styles.inputError : undefined,
            ]}>
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={(v) => {
                  setPassword(v)
                  if (fieldErrors.password) clearFieldError('password')
                }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => {
                  setFocusedField(null)
                  setFieldError('password', validatePassword(password))
                }}
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                maxFontSizeMultiplier={1.4}
                returnKeyType="next"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={styles.inputIcon}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <EyeIcon visible={showPassword} active={password.length > 0} />
              </TouchableOpacity>
            </View>
            {password.length > 0 && (
              <View style={styles.strengthRow}>
                {[1, 2, 3, 4].map(i => (
                  <View
                    key={i}
                    style={[styles.strengthSegment, { backgroundColor: i <= strength.score ? strength.color : '#E5E7EB' }]}
                  />
                ))}
                {strength.label ? (
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                ) : null}
              </View>
            )}
            {fieldErrors.password ? <InlineError message={fieldErrors.password.message} /> : null}

            {/* Phone — same flag + dial + number pattern as VerifyPhoneScreen */}
            <View>
              <Text style={styles.fieldLabel}>Mobile number</Text>
              <View style={[
                styles.phoneRow,
                focusedField === 'phone' && !fieldErrors.phone ? styles.inputFocused : undefined,
                fieldErrors.phone ? styles.inputError : undefined,
              ]}>
                <TouchableOpacity
                  onPress={openPicker}
                  style={styles.countryBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Country: ${country.name} ${country.dial}. Tap to change.`}
                >
                  <Text style={styles.countryFlag}>{country.flag}</Text>
                  <Text style={styles.countryDial}>{country.dial}</Text>
                  <ChevronIcon />
                </TouchableOpacity>
                <View style={styles.phoneDivider} />
                <TextInput
                  ref={phoneInputRef}
                  style={styles.phoneInput}
                  placeholder={country.example ?? '7700 900000'}
                  placeholderTextColor="#9CA3AF"
                  value={nationalNumber}
                  onChangeText={(v) => {
                    setNationalNumber(v.replace(/[^\d\s-]/g, ''))
                    if (fieldErrors.phone) clearFieldError('phone')
                  }}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => {
                    setFocusedField(null)
                    setFieldError('phone', validatePhone(country, nationalNumber))
                  }}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  maxLength={country.nationalLength ? country.nationalLength + 4 : 18}
                  maxFontSizeMultiplier={1.4}
                  returnKeyType="done"
                />
              </View>
              {fieldErrors.phone ? <InlineError message={fieldErrors.phone.message} /> : null}
            </View>

            {/* Marketing consent */}
            <TouchableOpacity
              onPress={() => setMarketingConsent(v => !v)}
              style={styles.checkboxRow}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marketingConsent }}
            >
              <CheckboxIcon checked={marketingConsent} />
              <Text style={styles.checkboxLabel}>
                Send me deals, updates and member-only offers from Redeemo
              </Text>
            </TouchableOpacity>

          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
            style={styles.btnWrapper}
          >
            <LinearGradient
              colors={['#E20C04', '#E84A00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : undefined]}
            >
              <Text style={styles.primaryBtnText}>{submitting ? 'Creating account…' : 'Create account'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Terms */}
          <Text style={styles.terms}>
            By creating an account you agree to our{' '}
            <Text style={styles.termsLink} onPress={handleTermsPress}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={handlePrivacyPress}>Privacy Policy</Text>
            .
          </Text>

          {/* Sign in link */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            accessibilityRole="button"
            style={styles.loginRow}
          >
            <Text style={styles.loginPrompt}>Already a member? </Text>
            <Text style={styles.loginLink}>Sign in</Text>
          </TouchableOpacity>

      </ScrollView>

      {/* Country picker */}
      <BottomSheet visible={pickerOpen} onDismiss={closePicker} accessibilityLabel="Select country">
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} accessibilityRole="header">Select country</Text>
        </View>
        <View style={styles.pickerSearchRow}>
          <SearchIcon />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search country or code"
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            style={styles.pickerSearchInput}
            accessibilityLabel="Search countries"
            returnKeyType="search"
          />
        </View>
        <FlatList
          data={filteredCountries}
          keyExtractor={(c) => c.code}
          style={styles.pickerList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              onPress={() => handleSelectCountry(c)}
              style={[styles.pickerRow, c.code === country.code ? styles.pickerRowSelected : null]}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} ${c.dial}`}
            >
              <Text style={styles.pickerFlag}>{c.flag}</Text>
              <Text style={styles.pickerName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.pickerDial}>{c.dial}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.pickerEmpty}>No countries match "{searchQuery}"</Text>
          }
        />
      </BottomSheet>
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  screen: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },

  topBar: {
    marginBottom: ms(8),
  },

  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },

  // Inline header. Logo sits centred against the two-line text block.
  // marginBottom gives breathing room before the social buttons.
  headingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: LOGO_TEXT_GAP,
    marginBottom: ms(28),
  },
  textBlock: { flex: 1 },

  heading: {
    fontFamily: 'Lato-Bold',
    fontSize: ms(24),
    lineHeight: ms(30),
    color: '#010C35',
    letterSpacing: -0.5,
    marginBottom: ms(2),
  },
  subheading: {
    fontFamily: 'Lato-Regular',
    fontSize: ms(13),
    lineHeight: ms(18),
    color: '#9CA3AF',
  },

  scrollContent: {
    paddingHorizontal: ms(24),
    // paddingTop set inline = insets.top + ms(4)
  },

  // ── Social ──
  socialRow: {
    flexDirection: 'row',
    gap: ms(10),
    marginBottom: ms(18),
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

  // ── Divider ──
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    marginBottom: ms(18),
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: ms(13), fontFamily: 'Lato-Regular', color: '#9CA3AF' },

  // ── Form ──
  form: { gap: ms(14), marginBottom: ms(8) },

  nameRow: { flexDirection: 'row', gap: ms(10) },
  halfInput: { flex: 1 },

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

  // EMAIL_ALREADY_EXISTS error card: red message + a clearly distinct dark
  // action button so "Sign in instead" reads as a button, not more error text.
  specialError: {
    backgroundColor: 'rgba(226, 12, 4, 0.07)',
    borderRadius: scale(12),
    paddingHorizontal: ms(12),
    paddingTop: ms(10),
    paddingBottom: ms(8),
  },
  specialErrorText: {
    fontSize: ms(13),
    lineHeight: ms(18),
    fontFamily: 'Lato-Regular',
    color: '#E20C04',
  },
  specialErrorBtn: {
    marginTop: ms(8),
    alignSelf: 'flex-start',
    backgroundColor: '#010C35',
    borderRadius: 50,
    paddingHorizontal: ms(14),
    paddingVertical: ms(7),
  },
  specialErrorBtnText: {
    fontSize: ms(12),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  input: {
    flex: 1,
    fontSize: ms(15),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    height: '100%',
  },
  inputIcon: { marginLeft: ms(8), justifyContent: 'center', alignItems: 'center' },

  // ── Password strength ──
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(4),
    marginTop: -ms(6),
  },
  strengthSegment: {
    flex: 1,
    height: ms(3),
    borderRadius: ms(2),
  },
  strengthLabel: {
    fontSize: ms(11),
    fontFamily: 'Lato-Bold',
    marginLeft: ms(4),
    minWidth: ms(40),
  },

  // ── Phone field ──
  fieldLabel: {
    fontSize: ms(13),
    fontFamily: 'Lato-SemiBold',
    color: '#4B5563',
    marginBottom: ms(8),
    letterSpacing: 0.1,
  },
  phoneRow: {
    height: scale(54),
    borderRadius: scale(16),
    borderWidth: 1.5,
    borderColor: '#D6DAE2',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: ms(10),
    paddingRight: ms(14),
    shadowColor: '#010C35',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingVertical: ms(8),
    paddingRight: ms(8),
  },
  countryFlag: { fontSize: ms(18) },
  countryDial: {
    fontSize: ms(15),
    fontFamily: 'Lato-SemiBold',
    color: '#010C35',
  },
  phoneDivider: {
    width: 1,
    height: '55%',
    backgroundColor: 'rgba(1,12,53,0.14)',
    marginHorizontal: ms(8),
  },
  phoneInput: {
    flex: 1,
    fontSize: ms(15),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    paddingVertical: 0,
  },

  // ── Marketing consent ──
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(10),
    paddingVertical: ms(4),
  },
  checkboxLabel: {
    flex: 1,
    fontSize: ms(13),
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
    lineHeight: ms(19),
    paddingTop: ms(1),
  },

  // ── CTA ──
  btnWrapper: { marginTop: ms(20) },
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

  // ── Terms ──
  terms: {
    fontSize: ms(12),
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: ms(18),
    marginTop: ms(14),
    paddingHorizontal: ms(8),
  },
  termsLink: {
    fontSize: ms(12),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
  },

  // ── Sign in link ──
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: ms(16),
    marginBottom: ms(4),
  },
  loginPrompt: { fontSize: ms(14), color: '#9CA3AF', fontFamily: 'Lato-Regular' },
  loginLink: { fontSize: ms(14), color: '#E20C04', fontFamily: 'Lato-Bold' },

  // ── Country picker bottom sheet ──
  sheetHeader: {
    paddingBottom: ms(12),
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: ms(16),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingHorizontal: ms(12),
    paddingVertical: ms(12),
    borderRadius: ms(12),
    backgroundColor: '#F3F4F6',
    marginBottom: ms(8),
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: ms(15),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    paddingVertical: 0,
  },
  pickerList: { height: 360 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: ms(12),
    paddingHorizontal: ms(4),
    gap: ms(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(1,12,53,0.06)',
  },
  pickerRowSelected: { backgroundColor: 'rgba(226,12,4,0.05)' },
  pickerFlag: { fontSize: ms(20) },
  pickerName: {
    flex: 1,
    fontSize: ms(14),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
  },
  pickerDial: {
    fontSize: ms(14),
    fontFamily: 'Lato-SemiBold',
    color: '#4B5563',
  },
  pickerEmpty: {
    fontSize: ms(14),
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: ms(24),
  },
})
