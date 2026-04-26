import React, { useState, useEffect } from 'react'
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeInDown,
  FadeOutUp,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Text,
  Button,
  StepIndicator,
  Card,
  layout,
  spacing,
  radius,
  color,
} from '@/design-system'
import { InlineError } from '@/design-system/components/InlineError'
import { MapPin, Lock, Search, ArrowLeft, CheckCircle, Gift, ShieldCheck, Navigation, AlertCircle } from '@/design-system/icons'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { scale, ms } from '@/design-system/scale'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useLocationAssist } from '@/lib/location'
import { useAuthStore } from '@/stores/auth'

// ─── types ────────────────────────────────────────────────────────────────────

type LookupResult = { area: string; region: string; postcode: string }
type GpsLocation  = { display: string; isUK: boolean }

// ─── screen ───────────────────────────────────────────────────────────────────

export function PC2AddressScreen() {
  const { markStepComplete, totalSteps } = useProfileCompletion()
  const update  = useUpdateProfile()
  const assist  = useLocationAssist()
  const user    = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const insets  = useSafeAreaInsets()

  const [postcodeInput,    setPostcodeInput]    = useState(user?.postcode ?? '')
  const [lookupResult,     setLookupResult]     = useState<LookupResult | null>(null)
  const [lookupError,      setLookupError]      = useState<string | null>(null)
  const [isLooking,        setIsLooking]        = useState(false)
  const [isFocused,        setIsFocused]        = useState(false)
  const [gpsLocation,      setGpsLocation]      = useState<GpsLocation | null>(null)
  const [showSignOutSheet, setShowSignOutSheet] = useState(false)

  // Spring scale for the GPS button press
  const gpsScale = useSharedValue(1)
  const gpsAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: gpsScale.value }] }))

  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/profile-completion/about')
  }

  // Edge-swipe gesture: overlays left 30px of screen above the ScrollView.
  // failOffsetY ensures vertical scrolls starting near the edge are released
  // back to ScrollView within 15px of vertical movement.
  const swipeBackGesture = Gesture.Pan()
    .activeOffsetX([20, Infinity])
    .failOffsetY([-15, 15])
    .onFinalize((e, success) => {
      'worklet'
      if (success && e.translationX > 50) runOnJS(handleBack)()
    })

  // ── Debounced postcode → area lookup via postcodes.io ──────────────────────
  useEffect(() => {
    const cleaned = postcodeInput.trim().replace(/\s/g, '')
    setLookupResult(null)
    setLookupError(null)

    // Need at least a partial postcode (5+ chars without spaces: e.g. "SW1A1")
    if (cleaned.length < 5) { setIsLooking(false); return }

    setIsLooking(true)
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`)
        const json = await res.json() as {
          status: number
          result?: { postcode?: string; admin_district?: string; admin_ward?: string; region?: string; country?: string }
        }
        if (json.status === 200 && json.result) {
          const r = json.result
          setLookupResult({
            postcode: r.postcode ?? postcodeInput.trim().toUpperCase(),
            area:     r.admin_district ?? r.admin_ward ?? postcodeInput.trim().toUpperCase(),
            region:   [r.region, r.country].filter(Boolean).join(', '),
          })
        } else {
          setLookupError('Postcode not found. Please check and try again.')
        }
      } catch {
        setLookupError('Unable to look up postcode. Check your connection and try again.')
      } finally {
        setIsLooking(false)
      }
    }, 600)

    return () => { clearTimeout(timer); setIsLooking(false) }
  }, [postcodeInput])

  // ── Clear GPS location card when user starts typing a postcode ────────────
  useEffect(() => {
    if (postcodeInput.trim().length > 0) setGpsLocation(null)
  }, [postcodeInput])

  // ── When GPS resolves, populate correctly based on what we got ─────────────
  useEffect(() => {
    if (!assist.address) return
    if (assist.address.postcode) {
      // UK postcode found — fill the field; the debounced lookup will show the area card
      setPostcodeInput(assist.address.postcode)
      setGpsLocation(null)
    } else if (assist.address.city) {
      // No postcode (outside UK or GPS imprecise) — show location card, leave postcode field alone
      const countryLabel = assist.address.country ?? assist.address.isoCountryCode ?? ''
      const display = countryLabel
        ? `${assist.address.city}, ${countryLabel}`
        : assist.address.city
      const isUK = assist.address.isoCountryCode === 'GB'
      setGpsLocation({ display, isUK })
    }
  }, [assist.address])

  async function onSave() {
    const postcode = (lookupResult?.postcode ?? postcodeInput).trim().toUpperCase()
    if (!postcode) return
    try {
      await update.mutateAsync({ postcode })
      await markStepComplete('pc2')
    } catch { /* toast handled by global error boundary */ }
  }

  const inputBorderColor = lookupError
    ? color.danger
    : isFocused
    ? color.brandRose
    : color.border.default

  const inputShadow = isFocused
    ? { shadowColor: color.brandRose, shadowOpacity: 0.14, shadowRadius: scale(6), shadowOffset: { width: 0, height: 0 }, elevation: 2 }
    : {}

  return (
    <View style={[s.screen, { backgroundColor: color.surface.tint }]}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top }]}>
        <View style={s.appBarRow}>
          <Pressable
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.backBtn}
          >
            <ArrowLeft size={scale(22)} color={color.text.primary} />
          </Pressable>
          <Text variant="heading.md" align="center" style={{ flex: 1 }}>
            Your location
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.stepBarRow}>
          <StepIndicator
            current={2}
            total={totalSteps}
            activeColor={color.brandRose}
            segmentWidth={52}
            barHeight={5}
          />
          <Text variant="label.md" color="tertiary" meta align="center">
            Step 2 of {totalSteps}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + spacing[7] }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <MapPin size={scale(28)} color={color.brandRose} />
            </View>
            <View style={s.heroText}>
              <Text variant="display.sm">Where are you?</Text>
              <Text variant="body.sm" color="tertiary" meta style={{ marginTop: spacing[1] }}>
                So we can show deals and vouchers near you.
              </Text>
            </View>
          </View>

          {/* ── Postcode card ──────────────────────────────────────────────── */}
          <Card style={s.card}>

            {/* Postcode input */}
            <View style={s.field}>
              <Text variant="label.lg" color="secondary">Postcode</Text>
              <View style={s.inputContainer}>
                <TextInput
                  accessibilityLabel="Postcode"
                  value={postcodeInput}
                  onChangeText={(v) => setPostcodeInput(v.toUpperCase())}
                  onFocus={() => { setIsFocused(true); setLookupError(null) }}
                  onBlur={() => setIsFocused(false)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={[s.input, { borderColor: inputBorderColor }, inputShadow]}
                  placeholderTextColor={color.text.tertiary}
                  placeholder="e.g. SW1A 1AA"
                />
                <View style={s.inputIcon} pointerEvents="none">
                  {isLooking
                    ? <ActivityIndicator size="small" color={color.brandRose} />
                    : <Search size={scale(18)} color={isFocused ? color.brandRose : color.text.tertiary} />
                  }
                </View>
              </View>
              {lookupError ? <InlineError message={lookupError} /> : null}
            </View>

            {/* ── Location confirmation banner ───────────────────────────── */}
            {lookupResult ? (
              <Animated.View
                entering={FadeInDown.duration(300).springify()}
                exiting={FadeOutUp.duration(180)}
              >
                <View style={s.foundBanner}>
                  <View style={s.foundCheck}>
                    <CheckCircle size={scale(18)} color="#FFFFFF" fill="#16A34A" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label.lg" color="primary">
                      {lookupResult.area}
                    </Text>
                    {lookupResult.region ? (
                      <Text variant="body.sm" color="tertiary" meta>
                        {lookupResult.region}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* GPS denied feedback */}
            {assist.status === 'denied' ? (
              <Animated.View entering={FadeInDown.duration(200)}>
                <InlineError message="Location access denied. Enter your postcode above." />
              </Animated.View>
            ) : null}

          </Card>

          {/* ── Or divider ─────────────────────────────────────────────────── */}
          <View style={s.orRow}>
            <View style={s.orLine} />
            <Text variant="label.md" color="tertiary" meta>or</Text>
            <View style={s.orLine} />
          </View>

          {/* ── GPS button ────────────────────────────────────────────────── */}
          <Animated.View style={gpsAnimStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              onPress={() => { Keyboard.dismiss(); void assist.request() }}
              onPressIn={() => { gpsScale.value = withSpring(0.97, { damping: 20, stiffness: 300 }) }}
              onPressOut={() => { gpsScale.value = withSpring(1, { damping: 15, stiffness: 250 }) }}
              disabled={assist.loading}
              style={[s.gpsBtn, assist.loading && s.gpsBtnLoading]}
            >
              {assist.loading
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Navigation size={scale(18)} color="#FFFFFF" />
              }
              <Text variant="label.lg" style={s.gpsBtnLabel}>
                {assist.loading ? 'Detecting your location…' : 'Use my current location'}
              </Text>
            </Pressable>
          </Animated.View>

          {/* ── GPS location result card (no postcode — city/non-UK) ───────── */}
          {gpsLocation ? (
            <Animated.View
              entering={FadeInDown.duration(300).springify()}
            >
              <View style={[s.gpsLocationCard, gpsLocation.isUK ? s.gpsLocationCardUK : s.gpsLocationCardOutside]}>
                <View style={[s.gpsLocationIcon, gpsLocation.isUK ? s.gpsLocationIconUK : s.gpsLocationIconOutside]}>
                  {gpsLocation.isUK
                    ? <Navigation size={scale(16)} color="#16A34A" />
                    : <AlertCircle size={scale(16)} color="#D97706" />
                  }
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="label.lg" color="primary">{gpsLocation.display}</Text>
                  {gpsLocation.isUK ? (
                    <Text variant="body.sm" color="tertiary" meta>
                      We detected your area. Enter your postcode above to pinpoint your location.
                    </Text>
                  ) : (
                    <Text variant="body.sm" color="tertiary" meta>
                      It looks like you're outside the UK. Redeemo is currently only available in the UK, but you can still enter a UK postcode to set up your account for when you're back.
                    </Text>
                  )}
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* ── Bottom stack ──────────────────────────────────────────────── */}
          <View style={{ height: spacing[6] }} />

          {/* ── Info cards ────────────────────────────────────────────────── */}
          <View style={s.infoCard}>
            <View style={s.infoRow}>
              <View style={s.infoIconWrap}>
                <Gift size={scale(14)} color={color.brandRose} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label.lg" color="primary">Find deals near you</Text>
                <Text variant="body.sm" color="tertiary" meta>
                  We use your postcode to surface the best offers from local businesses in your area.
                </Text>
              </View>
            </View>
            <View style={s.infoDivider} />
            <View style={s.infoRow}>
              <View style={s.infoIconWrap}>
                <ShieldCheck size={scale(14)} color="#16A34A" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label.lg" color="primary">Your details stay private</Text>
                <Text variant="body.sm" color="tertiary" meta>
                  Only your postcode is used to find nearby deals. Your personal details and full address are never shared with any merchant or third party.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: spacing[5] }} />

          <View style={s.trust}>
            <Lock size={scale(13)} color={color.border.strong} />
            <Text variant="label.md" color="tertiary" meta align="center">
              Your information is secure and will never be shared.
            </Text>
          </View>

          <Button
            variant="primary"
            size="lg"
            loading={update.isPending}
            disabled={postcodeInput.trim().length === 0}
            onPress={onSave}
          >
            Continue
          </Button>

          <Button
            variant="ghost"
            size="md"
            onPress={() => setShowSignOutSheet(true)}
          >
            Sign out
          </Button>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Sign-out sheet ────────────────────────────────────────────────── */}
      <BottomSheet
        visible={showSignOutSheet}
        onDismiss={() => setShowSignOutSheet(false)}
        accessibilityLabel="Sign out confirmation"
      >
        <View style={s.sheetContent}>
          <Text variant="heading.sm" align="center">Sign out?</Text>
          <Text variant="body.sm" color="secondary" align="center" meta style={{ marginTop: spacing[2] }}>
            Your progress is saved. You can sign back in at any time to continue.
          </Text>
          <View style={s.sheetActions}>
            <Button variant="danger" size="md" onPress={() => { setShowSignOutSheet(false); void signOut() }}>
              Sign out
            </Button>
            <Button variant="ghost" size="md" onPress={() => setShowSignOutSheet(false)}>
              Cancel
            </Button>
          </View>
        </View>
      </BottomSheet>

      {/* ── Left-edge swipe-back overlay ─────────────────────────────────────── */}
      {/* Sits above the ScrollView so RNGH captures the gesture before ScrollView.
          failOffsetY releases vertical scrolls back to ScrollView within 15px. */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        <GestureDetector gesture={swipeBackGesture}>
          <View style={s.swipeEdge} />
        </GestureDetector>
      </View>

    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1 },
  swipeEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: scale(30),
  },

  stickyHeader: {
    backgroundColor: color.surface.page,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.appBarHeight,
    paddingHorizontal: spacing[4],
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stepBarRow: {
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    alignItems: 'center',
  },

  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: spacing[4],
  },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(14),
    marginBottom: spacing[4],
  },
  heroIconWrap: {
    width: scale(58),
    height: scale(58),
    borderRadius: scale(29),
    backgroundColor: 'rgba(226,12,4,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },

  // Card
  card: {
    padding: spacing[5],
    gap: spacing[4],
    borderRadius: radius.xl,
  },

  // Postcode field
  field: { gap: spacing[2] },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    height: scale(52),
    borderRadius: scale(14),
    borderWidth: 1.5,
    backgroundColor: color.surface.page,
    paddingLeft: ms(14),
    paddingRight: scale(40),
    fontFamily: 'Lato-Regular',
    fontSize: ms(16),
    color: color.text.primary,
    letterSpacing: ms(1),
  },
  inputIcon: {
    position: 'absolute',
    right: ms(14),
    top: 0,
    bottom: 0,
    width: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location-found confirmation banner
  foundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(12),
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.22)',
    borderRadius: scale(14),
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
  },
  foundCheck: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },


  // Or divider
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginVertical: spacing[4],
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: color.border.subtle,
  },

  // GPS button — navy primary, prominent
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(10),
    borderRadius: radius.pill,
    paddingVertical: ms(16),
    paddingHorizontal: ms(20),
    backgroundColor: color.navy,
    shadowColor: color.navy,
    shadowOpacity: 0.18,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  gpsBtnLoading: {
    backgroundColor: 'rgba(1,12,53,0.78)',
  },
  gpsBtnLabel: {
    color: '#FFFFFF',
    fontFamily: 'Lato-SemiBold',
  },

  // GPS location result card (city / non-UK)
  gpsLocationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(12),
    borderRadius: scale(14),
    borderWidth: 1,
    padding: ms(14),
    marginTop: spacing[3],
  },
  gpsLocationCardUK: {
    backgroundColor: 'rgba(22,163,74,0.06)',
    borderColor: 'rgba(22,163,74,0.18)',
  },
  gpsLocationCardOutside: {
    backgroundColor: 'rgba(217,119,6,0.07)',
    borderColor: 'rgba(217,119,6,0.22)',
  },
  gpsLocationIcon: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  gpsLocationIconUK: {
    backgroundColor: 'rgba(22,163,74,0.12)',
  },
  gpsLocationIconOutside: {
    backgroundColor: 'rgba(217,119,6,0.12)',
  },

  // Info card
  infoCard: {
    backgroundColor: color.surface.page,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.border.subtle,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(12),
  },
  infoIconWrap: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    backgroundColor: color.surface.tint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  infoDivider: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginHorizontal: -spacing[4],
  },

  // Trust
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[6],
  },

  // Sheet
  sheetContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  sheetActions: {
    marginTop: spacing[5],
    gap: spacing[3],
  },
})
