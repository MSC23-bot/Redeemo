import React, { useState, useEffect } from 'react'
import {
  View,
  Pressable,
  TextInput,
  Text as RNText,
  StyleSheet,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native'
import Animated, {
  FadeInDown,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import DateTimePicker from '@react-native-community/datetimepicker'
import Svg, { Path, Circle, Line } from 'react-native-svg'
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
import { User, Heart, Calendar, Lock } from '@/design-system/icons'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { scale, ms } from '@/design-system/scale'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAuthStore } from '@/stores/auth'

// ─── gender options ───────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: 'female',            label: 'Female',           Icon: FemaleIcon,    accent: color.brandRose },
  { value: 'male',              label: 'Male',             Icon: MaleIcon,      accent: '#3B82F6'       },
  { value: 'non_binary',        label: 'Non-binary',       Icon: NonBinaryIcon, accent: '#7C3AED'       },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', Icon: NeutralPersonIcon, accent: color.text.tertiary },
] as const

// ─── gender SVG icons — all 15×15, viewBox 0 0 24 24, stroke 1.8 ─────────────

function FemaleIcon({ iconColor }: { iconColor: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="9" r="6" stroke={iconColor} strokeWidth={1.8} />
      <Line x1="12" y1="15" x2="12" y2="22" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="9" y1="19" x2="15" y2="19" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function MaleIcon({ iconColor }: { iconColor: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx="10" cy="14" r="6" stroke={iconColor} strokeWidth={1.8} />
      <Path d="M23 1L16 8" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M17 1h6v6" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function NonBinaryIcon({ iconColor }: { iconColor: string }) {
  // ⚧ combines ♂ arrow (up) + ♀ cross (down)
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="11" r="5.5" stroke={iconColor} strokeWidth={1.8} />
      <Line x1="12" y1="1.5" x2="12" y2="5.5" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9.5 4L12 1.5L14.5 4" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="16.5" x2="12" y2="22" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="9" y1="19.5" x2="15" y2="19.5" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function NeutralPersonIcon({ iconColor }: { iconColor: string }) {
  // Simple gender-neutral person silhouette — head + shoulders, no gender symbols
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={iconColor} strokeWidth={1.8} />
      <Path d="M4 20c0-3.7 3.6-7 8-7s8 3.3 8 7" stroke={iconColor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const schema = z.object({
  firstName:   z.string().trim().min(1, 'First name is required').max(50),
  lastName:    z.string().trim().min(1, 'Last name is required').max(50),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select your date of birth'),
  gender:      z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say'], 'Select your gender'),
})
type FormInput = z.infer<typeof schema>

function dobToYMD(iso: string | null): string {
  if (!iso) return ''
  const match = /^\d{4}-\d{2}-\d{2}/.exec(iso)
  return match ? match[0] : ''
}

function normaliseGender(value: string | null): FormInput['gender'] | '' {
  if (!value) return ''
  const opts = GENDER_OPTIONS.map((o) => o.value)
  return (opts as readonly string[]).includes(value) ? (value as FormInput['gender']) : ''
}

function dateToISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDobDisplay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y as number, (m as number) - 1, d as number)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── screen ───────────────────────────────────────────────────────────────────

export function PC1AboutScreen() {
  const { markStepComplete, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const user     = useAuthStore((s) => s.user)
  const signOut  = useAuthStore((s) => s.signOut)
  const insets   = useSafeAreaInsets()

  function handleSignOut() {
    setShowSignOutSheet(true)
  }

  const existingDob = dobToYMD(user?.dateOfBirth ?? null)

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName:   user?.firstName ?? '',
      lastName:    user?.lastName  ?? '',
      dateOfBirth: existingDob,
      // Always start blank — user must actively select gender in this onboarding step
      gender: '' as unknown as FormInput['gender'],
    },
  })

  const dobValue = watch('dateOfBirth')

  const [showSignOutSheet, setShowSignOutSheet] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerDate, setPickerDate] = useState<Date>(() => {
    if (existingDob) {
      const [y, m, d] = existingDob.split('-').map(Number)
      return new Date(y as number, (m as number) - 1, d as number)
    }
    return new Date(2000, 0, 1)
  })

  const [focusedField, setFocusedField] = useState<string | null>(null)

  function dismissDatePicker() {
    setShowDatePicker(false)
  }

  // Close the date picker whenever the keyboard appears (e.g. user taps a text field)
  // — ensures the picker and keyboard are never visible simultaneously
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const sub = Keyboard.addListener(event, () => setShowDatePicker(false))
    return () => sub.remove()
  }, [])

  async function onSave(v: FormInput) {
    try {
      await update.mutateAsync({
        firstName:   v.firstName.trim(),
        lastName:    v.lastName.trim(),
        dateOfBirth: `${v.dateOfBirth}T00:00:00.000Z`,
        gender:      v.gender,
      })
      await markStepComplete('pc1')
    } catch { /* toast handled by global error boundary */ }
  }

  function inputBorderColor(field: string, hasError: boolean) {
    if (hasError) return color.danger
    if (focusedField === field) return color.brandRose
    return color.border.default
  }

  function inputShadow(field: string) {
    return focusedField === field
      ? { shadowColor: color.brandRose, shadowOpacity: 0.14, shadowRadius: scale(6), shadowOffset: { width: 0, height: 0 }, elevation: 2 }
      : {}
  }

  return (
    <View style={[s.screen, { backgroundColor: color.surface.tint }]}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top }]}>
        <View style={s.appBarRow}>
          <View style={{ width: 40 }} />
          <Text variant="heading.md" align="center" style={{ flex: 1 }}>
            About you
          </Text>
          <View style={{ width: 40 }} />
        </View>
        {/* Centred progress bar — wider segments, brand colour, breathing room on both sides */}
        <View style={s.stepBarRow}>
          <StepIndicator
            current={1}
            total={totalSteps}
            activeColor={color.brandRose}
            segmentWidth={52}
            barHeight={5}
          />
          <Text variant="label.md" color="tertiary" meta align="center">
            Step 1 of {totalSteps}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: insets.bottom + spacing[7] },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Dismiss date picker when user begins scrolling
          onScrollBeginDrag={dismissDatePicker}
        >

          {/* Hero */}
          <View style={s.hero}>
            <View style={s.heroIconWrap}>
              <User size={scale(28)} color={color.brandRose} />
              {/* Heart badge overlapping bottom-right of the person icon */}
              <View style={s.heroHeart}>
                <Heart size={scale(14)} color={color.brandRose} fill={color.brandRose} />
              </View>
            </View>
            <View style={s.heroText}>
              <Text variant="display.sm">Tell us a little about you</Text>
              <Text variant="body.sm" color="tertiary" meta style={{ marginTop: spacing[1] }}>
                This helps us personalise your experience on Redeemo.
              </Text>
            </View>
          </View>

          {/* Form card */}
          <Card style={s.card}>

            {/* First name */}
            <Controller
              control={control}
              name="firstName"
              render={({ field, fieldState }) => (
                <View style={s.field}>
                  <Text variant="label.lg" color="secondary">First name</Text>
                  <TextInput
                    accessibilityLabel="First name"
                    value={field.value}
                    onChangeText={field.onChange}
                    onFocus={() => { dismissDatePicker(); setFocusedField('firstName') }}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                    returnKeyType="next"
                    style={[
                      s.input,
                      { borderColor: inputBorderColor('firstName', !!fieldState.error) },
                      inputShadow('firstName'),
                    ]}
                    placeholderTextColor={color.text.tertiary}
                    placeholder="Your first name"
                  />
                  {fieldState.error?.message ? (
                    <InlineError message={fieldState.error.message} />
                  ) : null}
                </View>
              )}
            />

            {/* Last name */}
            <Controller
              control={control}
              name="lastName"
              render={({ field, fieldState }) => (
                <View style={s.field}>
                  <Text variant="label.lg" color="secondary">Last name</Text>
                  <TextInput
                    accessibilityLabel="Last name"
                    value={field.value}
                    onChangeText={field.onChange}
                    onFocus={() => { dismissDatePicker(); setFocusedField('lastName') }}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                    returnKeyType="next"
                    style={[
                      s.input,
                      { borderColor: inputBorderColor('lastName', !!errors.lastName) },
                      inputShadow('lastName'),
                    ]}
                    placeholderTextColor={color.text.tertiary}
                    placeholder="Your last name"
                  />
                  {errors.lastName?.message ? (
                    <InlineError message={errors.lastName.message} />
                  ) : null}
                </View>
              )}
            />

            {/* Date of birth */}
            <View style={s.field}>
              <Text variant="label.lg" color="secondary">Date of birth</Text>
              <Pressable
                accessibilityLabel="Date of birth"
                accessibilityRole="button"
                onPress={() => {
                  if (!showDatePicker) {
                    Keyboard.dismiss()
                    // Pre-seed the form value so the initial picker position (01/01/2000)
                    // counts as selected without requiring the user to scroll
                    if (!dobValue) {
                      setValue('dateOfBirth', dateToISO(pickerDate), { shouldValidate: false })
                    }
                  }
                  setShowDatePicker((v) => !v)
                }}
                style={[
                  s.input,
                  s.dobField,
                  {
                    borderColor: errors.dateOfBirth
                      ? color.danger
                      : showDatePicker
                      ? color.brandRose
                      : color.border.default,
                  },
                  showDatePicker
                    ? { shadowColor: color.brandRose, shadowOpacity: 0.14, shadowRadius: scale(6), shadowOffset: { width: 0, height: 0 }, elevation: 2 }
                    : {},
                ]}
              >
                <Text
                  variant="body.md"
                  color={dobValue ? 'primary' : 'tertiary'}
                  meta={!dobValue}
                >
                  {dobValue ? formatDobDisplay(dobValue) : 'Select your date of birth'}
                </Text>
                <Calendar
                  size={scale(18)}
                  color={showDatePicker ? color.brandRose : color.text.tertiary}
                />
              </Pressable>
              {errors.dateOfBirth?.message ? (
                <InlineError message={errors.dateOfBirth.message} />
              ) : null}

              {/* Inline spinner — stays open so all 3 columns (day/month/year) scroll freely */}
              {showDatePicker && (
                <Animated.View
                  entering={FadeInDown.duration(220).springify()}
                  exiting={FadeOutUp.duration(160)}
                >
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    minimumDate={new Date(1900, 0, 1)}
                    onChange={(_, date) => {
                      if (Platform.OS === 'android') dismissDatePicker()
                      if (date) {
                        setPickerDate(date)
                        setValue('dateOfBirth', dateToISO(date), { shouldValidate: true })
                      }
                    }}
                    style={Platform.OS === 'ios' ? s.spinnerPicker : undefined}
                  />
                </Animated.View>
              )}
            </View>

            {/* Gender */}
            <Controller
              control={control}
              name="gender"
              render={({ field, fieldState }) => (
                <View style={s.field}>
                  <Text variant="label.lg" color="secondary">Gender</Text>

                  {/* Row 1: Female · Male · Non-binary */}
                  <View style={s.genderRow}>
                    {GENDER_OPTIONS.slice(0, 3).map((opt) => (
                      <GenderPill
                        key={opt.value}
                        label={opt.label}
                        Icon={opt.Icon}
                        accent={opt.accent}
                        selected={field.value === opt.value}
                        onPress={() => field.onChange(opt.value)}
                        compact
                        style={{ flex: 1 }}
                      />
                    ))}
                  </View>

                  {/* Row 2: Prefer not to say — full width */}
                  <GenderPill
                    label={GENDER_OPTIONS[3].label}
                    Icon={GENDER_OPTIONS[3].Icon}
                    accent={GENDER_OPTIONS[3].accent}
                    selected={field.value === 'prefer_not_to_say'}
                    onPress={() => field.onChange('prefer_not_to_say')}
                  />

                  {fieldState.error?.message ? (
                    <InlineError message={fieldState.error.message} />
                  ) : null}
                </View>
              )}
            />

          </Card>

          {/* Cream-background gap — Button's style prop applies to inner LinearGradient, not outer layout */}
          <View style={{ height: spacing[5] }} />

          {/* Trust signal — shown before Continue so user sees it before tapping */}
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
            onPress={handleSubmit(onSave)}
          >
            Continue
          </Button>

          {/* Sign out — escape hatch for users who want to switch accounts */}
          <Button
            variant="ghost"
            size="md"
            onPress={handleSignOut}
          >
            Sign out
          </Button>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Branded sign-out confirmation sheet */}
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
            <Button
              variant="danger"
              size="md"
              onPress={() => { setShowSignOutSheet(false); void signOut() }}
            >
              Sign out
            </Button>
            <Button
              variant="ghost"
              size="md"
              onPress={() => setShowSignOutSheet(false)}
            >
              Cancel
            </Button>
          </View>
        </View>
      </BottomSheet>

    </View>
  )
}

// ─── gender pill ──────────────────────────────────────────────────────────────

type GenderPillProps = {
  label: string
  Icon: React.ComponentType<{ iconColor: string }>
  accent: string
  selected: boolean
  onPress: () => void
  compact?: boolean
  style?: object
}

function GenderPill({ label, Icon, accent, selected, onPress, compact = false, style }: GenderPillProps) {
  const scaleAnim = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleAnim.value }] }))

  const textStyle = [
    s.pillLabel,
    compact && s.pillLabelCompact,
    { color: selected ? '#FFFFFF' : color.text.secondary },
  ]
  const innerStyle = [s.pill, { flex: 1 }]

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => { scaleAnim.value = withSpring(0.95, { damping: 20, stiffness: 300 }) }}
      onPressOut={() => { scaleAnim.value = withSpring(1, { damping: 15, stiffness: 250 }) }}
      style={[s.pillPressable, style]}
    >
      <Animated.View style={[{ flex: 1 }, animStyle]}>
        {selected ? (
          <View style={[innerStyle, s.pillSelected]}>
            <Icon iconColor="#FFFFFF" />
            <RNText style={textStyle} numberOfLines={1}>
              {label}
            </RNText>
          </View>
        ) : (
          <View style={[innerStyle, s.pillUnselected]}>
            <Icon iconColor={accent} />
            <RNText style={textStyle} numberOfLines={1}>
              {label}
            </RNText>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Sticky header
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
  stepBarRow: {
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    alignItems: 'center',
  },

  // Scroll area
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
  heroHeart: {
    position: 'absolute',
    // Positioned so the heart overlaps the bottom-right of the person icon
    bottom: scale(2),
    right: scale(2),
  },
  heroText: {
    flex: 1,
  },

  // Card
  card: {
    padding: spacing[5],
    gap: spacing[4],
    borderRadius: radius.xl,
  },
  field: {
    gap: spacing[2],
  },

  // Text inputs
  input: {
    height: scale(48),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: color.border.default,
    paddingHorizontal: ms(14),
    backgroundColor: color.surface.page,
    fontFamily: 'Lato-Regular',
    fontSize: ms(15),
    color: color.text.primary,
  },
  dobField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spinnerPicker: {
    width: '100%',
    marginTop: spacing[1],
  },

  // Gender pills
  genderRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'stretch',
  },
  pillPressable: {
    minHeight: layout.minTouchTarget,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(5),
    borderRadius: radius.pill,
    paddingVertical: ms(11),
    paddingHorizontal: ms(10),
  },
  pillSelected: {
    backgroundColor: color.navy,
  },
  pillUnselected: {
    backgroundColor: color.surface.page,
    borderWidth: 1.5,
    borderColor: color.border.subtle,
  },
  pillLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Lato-Bold',
    fontSize: ms(13),
    lineHeight: ms(18),
  },
  pillLabelCompact: {
    fontSize: ms(12),
    lineHeight: ms(16),
  },

  // Trust signal
  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[5],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[6],
  },

  // Sign-out bottom sheet
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
