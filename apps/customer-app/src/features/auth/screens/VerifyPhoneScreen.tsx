import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { InlineError } from '@/design-system/components/InlineError'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useAuthStore } from '@/stores/auth'
import { usePhoneVerify } from '@/features/auth/hooks/usePhoneVerify'
import { useVerifyPhone } from '@/features/auth/hooks/useVerifyPhone'
import { useMotionScale } from '@/design-system/useMotionScale'
import { maskPhone } from '@/features/auth/utils/maskPhone'
import { scale, ms } from '@/design-system/scale'
import {
  COUNTRIES_FOR_PICKER,
  DEFAULT_COUNTRY,
  type Country,
} from '@/features/auth/utils/countries'

// ─── constants ────────────────────────────────────────────────────────────────

const RESEND_COOLDOWN = 60_000
const OTP_LENGTH = 6
const E164_RE = /^\+[1-9]\d{7,14}$/

// ─── validation ───────────────────────────────────────────────────────────────

function normaliseNational(country: Country, raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (country.stripTrunk && digits.startsWith('0')) return digits.slice(1)
  return digits
}

type Validation = { ok: true; e164: string } | { ok: false; message: string }

function validateNational(country: Country, raw: string): Validation {
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

// ─── icons ────────────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="6" y="2" width="12" height="20" rx="2.5" />
      <Path d="M11 18h2" />
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

function InfoIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </Svg>
  )
}

// ─── OTP boxes ────────────────────────────────────────────────────────────────

type OtpBoxesProps = {
  value: string
  onChange: (v: string) => void
  onComplete: (v: string) => void
  error?: string | null
  disabled?: boolean
}

function OtpBoxes({ value, onChange, onComplete, error, disabled }: OtpBoxesProps) {
  const ref = useRef<TextInput>(null)
  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '')

  return (
    <View>
      <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time code input">
        <View style={styles.otpRow}>
          {cells.map((c, i) => (
            <View
              key={i}
              style={[
                styles.otpCell,
                i === value.length && !error ? styles.otpCellActive : null,
                error ? styles.otpCellError : null,
              ]}
            >
              <Text style={styles.otpDigit}>{c}</Text>
            </View>
          ))}
        </View>
      </Pressable>
      <TextInput
        ref={ref}
        accessibilityLabel="One-time code"
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        value={value}
        onChangeText={(t) => {
          const clean = t.replace(/\D/g, '').slice(0, OTP_LENGTH)
          onChange(clean)
          if (clean.length === OTP_LENGTH) onComplete(clean)
        }}
        style={styles.hiddenInput}
      />
    </View>
  )
}

// ─── onboarding step indicator ───────────────────────────────────────────────
// Shows the user where they are in the registration flow so there's no
// confusion about the missing back button — completed steps are locked.

const ONBOARDING_STEPS = ['Account', 'Email', 'Phone'] as const

function OnboardingSteps({ current }: { current: number }) {
  return (
    <View style={stepStyles.row} accessibilityRole="progressbar" accessibilityLabel={`Step ${current + 1} of ${ONBOARDING_STEPS.length}: ${ONBOARDING_STEPS[current]}`}>
      {ONBOARDING_STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <React.Fragment key={label}>
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
          </React.Fragment>
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
    marginTop: ms(6),
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

// ─── screen ───────────────────────────────────────────────────────────────────

type Mode = 'otp' | 'change-number'

export function VerifyPhoneScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const [mode, setMode] = useState<Mode>(user?.phone ? 'otp' : 'change-number')
  const [pendingNumber, setPendingNumber] = useState<string | null>(null)

  // Change-number form — always starts empty so existing phone isn't pre-filled.
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  const [nationalNumber, setNationalNumber] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [otpValue, setOtpValue] = useState('')

  const [lastResent, setLastResent] = useState<number | null>(null)
  const [resending, setResending] = useState(false)
  const [nowTick, setNowTick] = useState(Date.now())

  const phoneInputRef = useRef<TextInput>(null)

  const { verify, resend, sendForNumber, clearError, busy, error, shakeKey } = usePhoneVerify()
  useVerifyPhone()
  const motionScale = useMotionScale()

  // Auto-send the OTP on first mount in OTP mode. Registration doesn't send a
  // phone OTP, so without this the user would see "Enter the code we sent you"
  // with nothing in their inbox. Also fires on login-redirected visits.
  useEffect(() => {
    if (mode !== 'otp') return
    handleResend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))

  useEffect(() => {
    if (lastResent === null) return
    const id = setInterval(() => setNowTick(Date.now()), 500)
    return () => clearInterval(id)
  }, [lastResent])

  useEffect(() => {
    if (shakeKey === 0 || motionScale === 0) return
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    )
  }, [shakeKey, motionScale, shakeX])

  useEffect(() => {
    if (shakeKey > 0) setOtpValue('')
  }, [shakeKey])

  const cooldownMs = lastResent === null ? 0 : Math.max(0, RESEND_COOLDOWN - (nowTick - lastResent))
  const cooldownActive = cooldownMs > 0
  const secondsLeft = Math.ceil(cooldownMs / 1000)
  const resendDisabled = resending || cooldownActive || busy

  const displayNumber = pendingNumber ?? user?.phone ?? null
  const maskedNumber = maskPhone(displayNumber)

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return COUNTRIES_FOR_PICKER
    return COUNTRIES_FOR_PICKER.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    )
  }, [searchQuery])

  // ─── actions ──────────────────────────────────────────────────────────────

  async function handleSubmitNumber() {
    const v = validateNational(country, nationalNumber)
    if (!v.ok) { setDraftError(v.message); return }
    setDraftError(null)
    clearError()
    const ok = await sendForNumber(v.e164)
    if (ok) {
      setPendingNumber(v.e164)
      setLastResent(Date.now())
      setOtpValue('')
      setMode('otp')
    }
  }

  async function handleResend() {
    if (resendDisabled) return
    setResending(true)
    if (pendingNumber) await sendForNumber(pendingNumber)
    else await resend()
    setLastResent(Date.now())
    setResending(false)
  }

  function handleChangeNumber() {
    // Do NOT call Keyboard.dismiss() here — let the component tree change
    // handle it naturally. Explicit dismiss + autoFocus fight each other.
    clearError()
    setDraftError(null)
    setNationalNumber('')
    setCountry(DEFAULT_COUNTRY)
    setPickerOpen(false)
    setSearchQuery('')
    setOtpValue('')
    setMode('change-number')
  }

  function handleBack() {
    if (mode === 'change-number') {
      if (user?.phone) {
        // Return to OTP mode for the number already on file.
        clearError(); setDraftError(null); setPickerOpen(false); setSearchQuery(''); setMode('otp')
      } else if (router.canGoBack()) {
        router.back()
      }
      return
    }
    // OTP mode — prefer stack history; if there's none (register flow used
    // router.replace) drop into change-number so the user can update their number
    // without losing email-verification progress.
    if (router.canGoBack()) {
      router.back()
    } else {
      clearError(); setOtpValue(''); setNationalNumber(''); setCountry(DEFAULT_COUNTRY); setMode('change-number')
    }
  }

  async function handleSignOut() {
    await signOut()
    // AuthLayout.resolveRedirect returns null for unauthenticated + group='auth',
    // so the user would be stranded on this screen. Push them to login explicitly.
    router.replace('/(auth)/login')
  }

  function openPicker() {
    // Dismiss phone keyboard so the picker sheet opens cleanly; the sheet's
    // search input brings up a fresh keyboard itself.
    Keyboard.dismiss()
    setSearchQuery('')
    setPickerOpen(true)
  }

  function closePicker() {
    setPickerOpen(false)
    setSearchQuery('')
    // Return focus to phone field after sheet exit animation (~250ms).
    setTimeout(() => phoneInputRef.current?.focus(), 300)
  }

  function handleSelectCountry(c: Country) {
    setCountry(c)
    if (draftError) setDraftError(null)
    if (error) clearError()
    closePicker()
  }

  const resendLabel = resending ? 'Sending…' : cooldownActive ? `Resend code (${secondsLeft}s)` : 'Resend code'

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top bar — fixed outside scroll. backgroundColor prevents content
          showing through on iOS overscroll bounce. */}
      <View style={styles.topBar}>
        {mode === 'change-number' ? (
          // Change-number sub-screen: back arrow returns to OTP.
          <>
            {user?.phone ? (
              <TouchableOpacity
                onPress={handleBack}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <BackIcon />
              </TouchableOpacity>
            ) : (
              <View style={styles.backBtnSpacer} />
            )}
            <Text style={styles.topTitle}>Change number</Text>
          </>
        ) : (
          // OTP mode: no back button — show onboarding progress so the user
          // knows they've already completed the previous steps.
          <View style={styles.stepWrap}>
            <Text style={styles.topTitle}>Verify your phone</Text>
            <OnboardingSteps current={2} />
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* ── hero block ── */}
          <View style={styles.heroBlock}>
            <LinearGradient
              colors={['#E20C04', '#E84A00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroIcon}
            >
              <PhoneIcon />
            </LinearGradient>

            {mode === 'otp' ? (
              <>
                <Text style={styles.heading} accessibilityRole="header">Enter the code</Text>
                <Text style={styles.bodyText}>We sent a 6-digit code to</Text>
                <Text style={styles.maskedNumber}>{maskedNumber || 'your phone'}</Text>
              </>
            ) : (
              <>
                <Text style={styles.heading} accessibilityRole="header">
                  {user?.phone ? 'Enter a new number' : 'Add your mobile number'}
                </Text>
                <Text style={styles.bodyText}>
                  We'll send a 6-digit code to confirm it's yours.
                </Text>
              </>
            )}
          </View>

          {mode === 'otp' ? (
            // ────────────────────────────────────────────────────────────────
            // OTP mode
            // ────────────────────────────────────────────────────────────────
            <>
              {/* Soft contextual strip — explains why the user landed here
                  after login. Neutral amber, not an error; design-system tone. */}
              <View style={styles.infoStrip} accessibilityRole="text">
                <View style={styles.infoStripIcon}>
                  <InfoIcon />
                </View>
                <Text style={styles.infoStripText}>
                  Your account is almost ready — verify your phone number to continue.
                </Text>
              </View>

              <View style={styles.otpWrap}>
                <Animated.View style={shakeStyle}>
                  <OtpBoxes
                    value={otpValue}
                    onChange={setOtpValue}
                    onComplete={verify}
                    error={error}
                    disabled={busy}
                  />
                </Animated.View>
                {error ? <View style={styles.errorWrap}><InlineError message={error} /></View> : null}
              </View>

              <View style={styles.cta}>
                <Text style={styles.resendPrompt}>Didn't receive the code?</Text>
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resendDisabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={resendLabel}
                  accessibilityState={{ disabled: resendDisabled, busy: resending }}
                >
                  <LinearGradient
                    colors={['#E20C04', '#E84A00']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.primaryBtn, resendDisabled ? styles.primaryBtnDisabled : null]}
                  >
                    <Text style={styles.primaryBtnText}>{resendLabel}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleChangeNumber}
                  activeOpacity={0.85}
                  style={styles.secondaryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Change phone number"
                >
                  <Text style={styles.secondaryBtnText}>Change phone number</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSignOut}
                  activeOpacity={0.6}
                  style={styles.signOutBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                >
                  <Text style={styles.signOutText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            // ────────────────────────────────────────────────────────────────
            // Change-number mode
            // ────────────────────────────────────────────────────────────────
            <>
              <View style={styles.phoneFieldWrap}>
                <Text style={styles.fieldLabel}>Mobile number</Text>
                <View style={[
                  styles.phoneRow,
                  (draftError || error) ? styles.phoneRowError : null,
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
                    autoFocus={!pickerOpen}
                    value={nationalNumber}
                    onChangeText={(v) => {
                      setNationalNumber(v.replace(/[^\d\s-]/g, ''))
                      if (draftError) setDraftError(null)
                      if (error) clearError()
                    }}
                    placeholder={country.example ?? '7700 900000'}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    maxLength={country.nationalLength ? country.nationalLength + 4 : 18}
                    style={styles.phoneInput}
                    accessibilityLabel="Mobile number"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmitNumber}
                  />
                </View>
                <Text style={styles.helperText}>
                  Use the number you'll have with you when redeeming.
                </Text>
                {(draftError || error) ? (
                  <View style={styles.errorWrap}>
                    <InlineError message={draftError ?? error ?? ''} />
                  </View>
                ) : null}
              </View>

              <View style={styles.cta}>
                <TouchableOpacity
                  onPress={handleSubmitNumber}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Send code"
                  accessibilityState={{ disabled: busy, busy }}
                >
                  <LinearGradient
                    colors={['#E20C04', '#E84A00']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.primaryBtn, busy ? styles.primaryBtnDisabled : null]}
                  >
                    <Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Send code'}</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {user?.phone ? (
                  <TouchableOpacity
                    onPress={() => {
                      clearError()
                      setDraftError(null)
                      setPickerOpen(false)
                      setSearchQuery('')
                      setMode('otp')
                    }}
                    activeOpacity={0.6}
                    style={styles.linkBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                    hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                  >
                    <Text style={styles.linkText}>Cancel</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={pickerOpen}
        onDismiss={closePicker}
        accessibilityLabel="Select country"
      >
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
              style={[
                styles.pickerRow,
                c.code === country.code ? styles.pickerRowSelected : null,
              ]}
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

  // backgroundColor matches screen so iOS overscroll bounce doesn't expose
  // content behind the top bar.
  topBar: {
    backgroundColor: '#FFF9F5',
    paddingHorizontal: ms(24),
    paddingVertical: ms(8),
    minHeight: 52,
  },

  // OTP mode: title + step indicator stacked vertically, centred.
  stepWrap: {
    alignItems: 'center',
  },

  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  backBtnSpacer: { width: 40, height: 40 },

  topTitle: {
    fontSize: ms(15),
    fontFamily: 'Lato-SemiBold',
    color: '#010C35',
    letterSpacing: -0.1,
    textAlign: 'center',
  },

  content: {
    flex: 1,
    paddingHorizontal: ms(24),
    paddingTop: ms(24),
  },

  heroBlock: {
    alignItems: 'center',
  },

  heroIcon: {
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

  heading: {
    marginTop: ms(14),
    fontSize: ms(24),
    lineHeight: ms(30),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.4,
    textAlign: 'center',
  },

  bodyText: {
    marginTop: ms(8),
    fontSize: ms(15),
    lineHeight: ms(22),
    fontFamily: 'Lato-Regular',
    color: '#4B5563',
    textAlign: 'center',
  },

  maskedNumber: {
    marginTop: ms(4),
    fontSize: ms(16),
    lineHeight: ms(22),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // Soft info strip above the OTP row — subtle amber, not an error.
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    marginTop: ms(20),
    marginHorizontal: 'auto',
    maxWidth: 360,
    alignSelf: 'center',
    paddingVertical: ms(10),
    paddingHorizontal: ms(14),
    borderRadius: ms(12),
    backgroundColor: '#FFF4E4',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.18)',
  },
  infoStripIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoStripText: {
    flex: 1,
    fontSize: ms(12),
    lineHeight: ms(17),
    fontFamily: 'Lato-SemiBold',
    color: '#7A4A00',
    letterSpacing: 0.05,
  },

  otpWrap: {
    marginTop: ms(16),
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },

  otpRow: {
    flexDirection: 'row',
    gap: ms(10),
    justifyContent: 'center',
  },

  otpCell: {
    flex: 1,
    maxWidth: scale(52),
    height: scale(60),
    borderRadius: ms(14),
    borderWidth: 1.5,
    borderColor: 'rgba(1,12,53,0.12)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellActive: {
    borderColor: '#E20C04',
    shadowColor: '#E20C04',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  otpCellError: { borderColor: '#DC2626' },

  otpDigit: {
    fontSize: ms(22),
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    letterSpacing: -0.2,
  },

  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },

  errorWrap: { marginTop: ms(12), width: '100%' },

  // ── CTA section (shared by both modes) ──
  cta: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: ms(32),
  },

  resendPrompt: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: 'Lato-Regular',
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: ms(12),
  },

  primaryBtn: {
    borderRadius: 50,
    paddingVertical: ms(18),
    paddingHorizontal: ms(32),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    shadowColor: '#E20C04',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: {
    fontSize: ms(16),
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  // Secondary — outlined pill for the alternate action (Change phone number).
  secondaryBtn: {
    marginTop: ms(12),
    borderRadius: 50,
    paddingVertical: ms(16),
    paddingHorizontal: ms(32),
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    borderWidth: 1.5,
    borderColor: '#E20C04',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnText: {
    fontSize: ms(15),
    fontFamily: 'Lato-SemiBold',
    color: '#E20C04',
    letterSpacing: -0.1,
  },

  // Tertiary escape (Sign out) — readable but deliberately muted so it
  // isn't tapped by accident on the auth gate.
  signOutBtn: {
    marginTop: ms(24),
    paddingVertical: ms(8),
    alignItems: 'center',
  },
  signOutText: {
    fontSize: ms(14),
    fontFamily: 'Lato-SemiBold',
    color: '#6B7280',
    letterSpacing: -0.1,
    textDecorationLine: 'underline',
    textDecorationColor: '#6B7280',
  },

  // Legacy link styles kept for the change-number mode "Cancel" link.
  linkBtn: {
    marginTop: ms(18),
    paddingVertical: ms(10),
    alignItems: 'center',
  },
  linkText: {
    fontSize: ms(14),
    fontFamily: 'Lato-SemiBold',
    color: '#010C35',
    letterSpacing: -0.1,
    textDecorationLine: 'underline',
    textDecorationColor: '#010C35',
  },

  // ── Phone field ──
  phoneFieldWrap: {
    marginTop: ms(24),
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  fieldLabel: {
    fontSize: ms(13),
    fontFamily: 'Lato-SemiBold',
    color: '#4B5563',
    marginBottom: ms(8),
    letterSpacing: 0.1,
  },
  phoneRow: {
    height: scale(52),
    borderRadius: ms(14),
    borderWidth: 1.5,
    borderColor: 'rgba(1,12,53,0.12)',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: ms(10),
    paddingRight: ms(14),
  },
  phoneRowError: { borderColor: '#DC2626' },

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
    fontSize: ms(16),
    fontFamily: 'Lato-Regular',
    color: '#010C35',
    paddingVertical: 0,
  },

  helperText: {
    marginTop: ms(8),
    fontSize: ms(12),
    lineHeight: ms(16),
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
  },

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
  // Fixed height so the list is always scrollable above the keyboard —
  // bottom sheet shifts itself up by `keyboardHeight`, so this block never
  // gets squeezed.
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
