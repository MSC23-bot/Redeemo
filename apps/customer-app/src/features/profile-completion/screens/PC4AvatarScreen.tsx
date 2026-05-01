import React, { useState } from 'react'
import { Alert, View, Pressable, Switch, StyleSheet, ScrollView } from 'react-native'
import Animated, {
  FadeInDown,
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
import { ArrowLeft, User, Camera, Lock } from '@/design-system/icons'
import { scale, ms } from '@/design-system/scale'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useAvatarPicker } from '@/features/profile-completion/hooks/useAvatarPicker'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAuthStore } from '@/stores/auth'
import { Image } from '@/design-system'

// ─── screen ───────────────────────────────────────────────────────────────────

export function PC4AvatarScreen() {
  const { markStepComplete, totalSteps, isNavigating } = useProfileCompletion()
  const updateAvatar  = useUpdateAvatar()
  const updateProfile = useUpdateProfile()
  const picker        = useAvatarPicker()
  const user          = useAuthStore((s) => s.user)
  const insets        = useSafeAreaInsets()

  const [newsletterConsent, setNewsletterConsent] = useState(false)

  const isPending = updateAvatar.isPending || updateProfile.isPending || isNavigating

  // Spring scale on avatar when a photo is chosen
  const avatarScale = useSharedValue(1)
  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: avatarScale.value }] }))

  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/profile-completion/interests')
  }

  function bounceAvatar() {
    avatarScale.value = withSpring(1.08, { damping: 12, stiffness: 220 })
    avatarScale.value = withSpring(1,    { damping: 14, stiffness: 200 })
  }

  async function handlePickPhoto() {
    await picker.pick()
    bounceAvatar()
  }

  async function handleCapturePhoto() {
    await picker.capture()
    bounceAvatar()
  }

  function handlePhotoOptions() {
    Alert.alert(
      'Profile photo',
      undefined,
      [
        { text: 'Take a photo',        onPress: () => { void handleCapturePhoto() } },
        { text: 'Choose from gallery', onPress: () => { void handlePickPhoto() } },
        { text: 'Cancel',              style: 'cancel' },
      ],
      { cancelable: true },
    )
  }

  async function onSave() {
    try {
      if (picker.dataUrl) {
        await updateAvatar.mutateAsync(picker.dataUrl)
      }
      await updateProfile.mutateAsync({ newsletterConsent })
      await markStepComplete('pc4')
    } catch { /* toast handled by global error boundary */ }
  }

  // Initials from auth store for the placeholder
  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0]!.toUpperCase())
    .join('')

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
            Your profile
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.stepBarRow}>
          <StepIndicator
            current={4}
            total={totalSteps}
            activeColor={color.brandRose}
            segmentWidth={52}
            barHeight={5}
          />
          <Text variant="label.md" color="tertiary" meta align="center">
            Step 4 of {totalSteps}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: insets.bottom + spacing[7] },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(0).duration(300).springify()} style={s.hero}>
          <View style={s.heroIconWrap}>
            <User size={scale(26)} color={color.brandRose} />
            <View style={s.heroBadge}>
              <Camera size={scale(11)} color={color.brandRose} />
            </View>
          </View>
          <View style={s.heroText}>
            <Text variant="display.sm">Add a photo</Text>
            <Text variant="body.sm" color="tertiary" meta style={{ marginTop: spacing[1] }}>
              Put a face to your name. It&apos;s entirely optional.
            </Text>
          </View>
        </Animated.View>

        {/* Avatar card */}
        <Animated.View entering={FadeInDown.delay(80).duration(300).springify()}>
          <Card style={s.card}>
            {/* Avatar circle */}
            <Animated.View style={[s.avatarWrap, avatarStyle]}>
              {picker.uri ? (
                <Image
                  source={{ uri: picker.uri }}
                  width={scale(100)}
                  height={scale(100)}
                  rounded="pill"
                  style={s.avatarImage}
                />
              ) : (
                <View style={s.avatarPlaceholder}>
                  {initials ? (
                    <Text variant="display.md" style={s.initialsText}>{initials}</Text>
                  ) : (
                    <User size={scale(38)} color={color.brandRose} />
                  )}
                </View>
              )}
            </Animated.View>

            {/* Upload / change button — shows action sheet (camera or gallery) */}
            <Pressable
              onPress={handlePhotoOptions}
              accessibilityRole="button"
              accessibilityLabel={picker.uri ? 'Change photo' : 'Upload photo'}
              style={s.uploadBtn}
            >
              <Camera size={scale(15)} color="#FFFFFF" />
              <Text variant="label.lg" style={s.uploadBtnLabel}>
                {picker.uri ? 'Change photo' : 'Upload photo'}
              </Text>
            </Pressable>

            {picker.error ? (
              <Text variant="label.md" color="danger" accessibilityLiveRegion="polite" align="center">
                {picker.error}
              </Text>
            ) : null}
          </Card>
        </Animated.View>

        {/* Newsletter toggle */}
        <Animated.View
          entering={FadeInDown.delay(160).duration(300).springify()}
          style={s.newsletterRow}
        >
          <Switch
            value={newsletterConsent}
            onValueChange={setNewsletterConsent}
            trackColor={{ false: color.border.default, true: color.brandRose }}
            thumbColor={color.surface.page}
            accessibilityLabel="Sign me up for Redeemo news and offers"
          />
          <Text variant="body.sm" color="secondary" style={{ flex: 1 }}>
            Sign me up for Redeemo news and offers
          </Text>
        </Animated.View>

        {/* Trust signal */}
        <Animated.View
          entering={FadeInDown.delay(220).duration(300).springify()}
          style={s.trust}
        >
          <Lock size={scale(13)} color={color.border.strong} />
          <Text variant="label.md" color="tertiary" meta align="center">
            Your photo is stored securely on Redeemo.
          </Text>
        </Animated.View>

        {/* CTAs */}
        <Animated.View
          entering={FadeInDown.delay(280).duration(300).springify()}
          style={s.ctas}
        >
          <Button
            variant="primary"
            size="lg"
            loading={isPending}
            disabled={isPending}
            onPress={onSave}
          >
            Done, let&apos;s go!
          </Button>

          <Pressable
            onPress={() => markStepComplete('pc4')}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
            disabled={isPending}
            style={[s.skipBtn, isPending && { opacity: 0.4 }]}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          >
            <Text variant="label.md" style={s.skipLabel}>
              Skip for now
            </Text>
          </Pressable>
        </Animated.View>

      </ScrollView>
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
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
  heroBadge: {
    position: 'absolute',
    bottom: scale(2),
    right: scale(2),
  },
  heroText: {
    flex: 1,
  },

  card: {
    padding: spacing[5],
    borderRadius: radius.xl,
    alignItems: 'center',
    gap: spacing[4],
    borderWidth: 1,
    borderColor: color.border.subtle,
    shadowOpacity: 0.04,
  },

  avatarWrap: {
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: scale(100),
    height: scale(100),
    borderRadius: scale(50),
    backgroundColor: 'rgba(226,12,4,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(226,12,4,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: scale(100),
    height: scale(100),
    borderRadius: scale(50),
  },
  initialsText: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: ms(32),
    color: color.brandRose,
    lineHeight: ms(38),
  },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(7),
    borderRadius: radius.pill,
    backgroundColor: color.navy,
    paddingVertical: ms(13),
    paddingHorizontal: ms(22),
    shadowColor: color.navy,
    shadowOpacity: 0.18,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  uploadBtnLabel: {
    fontFamily: 'Lato-SemiBold',
    fontSize: ms(14),
    color: '#FFFFFF',
  },

  newsletterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    paddingHorizontal: spacing[1],
  },

  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[5],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[6],
  },

  ctas: {
    gap: 0,
    marginTop: spacing[3],
  },

  skipBtn: {
    alignSelf: 'center',
    marginTop: spacing[4],
    paddingVertical: spacing[2],
  },
  skipLabel: {
    fontFamily: 'Lato-Regular',
    fontSize: ms(13),
    color: color.text.tertiary,
  },
})
