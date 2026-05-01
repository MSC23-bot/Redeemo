import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, Button, spacing, color } from '@/design-system'
import { scale, ms } from '@/design-system/scale'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'
import { RedeemoLogo } from '@/features/auth/components/RedeemoLogo'

// ─── confetti burst ───────────────────────────────────────────────────────────
// One-shot particles that fly outward from the logo centre on first render.

type ConfettiProps = { angle: number; dist: number; col: string; sz: number; delay: number }

const CONFETTI_DATA: Omit<ConfettiProps, 'delay'>[] = [
  { angle: 0,   dist: 90,  col: '#E20C04', sz: 8 },
  { angle: 36,  dist: 75,  col: '#F59E0B', sz: 6 },
  { angle: 72,  dist: 100, col: '#10B981', sz: 7 },
  { angle: 108, dist: 80,  col: '#3B82F6', sz: 9 },
  { angle: 144, dist: 92,  col: '#8B5CF6', sz: 6 },
  { angle: 180, dist: 78,  col: '#E20C04', sz: 7 },
  { angle: 216, dist: 95,  col: '#F59E0B', sz: 8 },
  { angle: 252, dist: 84,  col: '#10B981', sz: 6 },
  { angle: 288, dist: 90,  col: '#3B82F6', sz: 7 },
  { angle: 324, dist: 86,  col: '#8B5CF6', sz: 8 },
]

function ConfettiDot({ angle, dist, col, sz, delay }: ConfettiProps) {
  const progress = useSharedValue(0)
  const rad = (angle * Math.PI) / 180
  const tx  = dist * Math.cos(rad)
  const ty  = dist * Math.sin(rad)

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 750 }))
  }, [])

  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * tx },
      { translateY: progress.value * ty },
      { scale: Math.max(0, 1 - progress.value * 1.2) },
    ],
    opacity: Math.max(0, 1 - progress.value * 1.5),
  }))

  return (
    <Animated.View
      style={[
        { position: 'absolute', width: sz, height: sz, borderRadius: sz / 2, backgroundColor: col },
        dotStyle,
      ]}
    />
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

export function OnboardingSuccessScreen() {
  const refreshUser  = useAuthStore((s) => s.refreshUser)
  const user         = useAuthStore((s) => s.user)
  const inFlightRef  = useRef(false)
  const [busy, setBusy] = useState(false)
  const insets       = useSafeAreaInsets()

  const firstName = user?.firstName ?? 'there'

  // ── Logo: spring entrance with pronounced overshoot ───────────────────────
  const logoScale   = useSharedValue(0.4)
  const logoOpacity = useSharedValue(0)
  const logoStyle   = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity:   logoOpacity.value,
  }))

  // ── Glow disk: slow pulse behind the circle ───────────────────────────────
  const glowOpacity = useSharedValue(0.2)
  const glowScale   = useSharedValue(1)
  const glowStyle   = useAnimatedStyle(() => ({
    opacity:   glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }))

  // ── Ripple rings: 3 staggered expanding border circles ────────────────────
  const r1Scale = useSharedValue(1); const r1Alpha = useSharedValue(0)
  const r2Scale = useSharedValue(1); const r2Alpha = useSharedValue(0)
  const r3Scale = useSharedValue(1); const r3Alpha = useSharedValue(0)
  const ring1Style = useAnimatedStyle(() => ({ transform: [{ scale: r1Scale.value }], opacity: r1Alpha.value }))
  const ring2Style = useAnimatedStyle(() => ({ transform: [{ scale: r2Scale.value }], opacity: r2Alpha.value }))
  const ring3Style = useAnimatedStyle(() => ({ transform: [{ scale: r3Scale.value }], opacity: r3Alpha.value }))

  // ── 8 floating dots ───────────────────────────────────────────────────────
  const d1 = useSharedValue(0); const d2 = useSharedValue(0)
  const d3 = useSharedValue(0); const d4 = useSharedValue(0)
  const d5 = useSharedValue(0); const d6 = useSharedValue(0)
  const d7 = useSharedValue(0); const d8 = useSharedValue(0)
  const ds1 = useAnimatedStyle(() => ({ transform: [{ translateY: d1.value }] }))
  const ds2 = useAnimatedStyle(() => ({ transform: [{ translateY: d2.value }] }))
  const ds3 = useAnimatedStyle(() => ({ transform: [{ translateY: d3.value }] }))
  const ds4 = useAnimatedStyle(() => ({ transform: [{ translateY: d4.value }] }))
  const ds5 = useAnimatedStyle(() => ({ transform: [{ translateY: d5.value }] }))
  const ds6 = useAnimatedStyle(() => ({ transform: [{ translateY: d6.value }] }))
  const ds7 = useAnimatedStyle(() => ({ transform: [{ translateY: d7.value }] }))
  const ds8 = useAnimatedStyle(() => ({ transform: [{ translateY: d8.value }] }))

  useEffect(() => {
    // Logo: fade in quickly, then spring in with visible overshoot
    logoOpacity.value = withTiming(1, { duration: 300 })
    logoScale.value   = withDelay(60, withSpring(1, { damping: 7, stiffness: 150, mass: 0.85 }))

    // Glow: slow breathe starting after logo arrives
    glowScale.value   = withDelay(500, withRepeat(withSequence(withTiming(1.18, { duration: 1200 }), withTiming(1, { duration: 1200 })), -1, true))
    glowOpacity.value = withDelay(500, withRepeat(withSequence(withTiming(0.6, { duration: 1200 }), withTiming(0.18, { duration: 1200 })), -1, true))

    // Ripple rings: each ring expands 1→1.9 over 2.2s then snaps back, staggered by 733ms
    const RDUR = 2200
    const RSTAG = 733
    const startRipple = (sv: typeof r1Scale, av: typeof r1Alpha, delay: number) => {
      sv.value = withDelay(delay, withRepeat(
        withSequence(withTiming(1.9, { duration: RDUR }), withTiming(1, { duration: 0 })),
        -1,
      ))
      av.value = withDelay(delay, withRepeat(
        withSequence(withTiming(0.6, { duration: 180 }), withTiming(0, { duration: RDUR - 180 }), withTiming(0, { duration: 0 })),
        -1,
      ))
    }
    startRipple(r1Scale, r1Alpha, 800)
    startRipple(r2Scale, r2Alpha, 800 + RSTAG)
    startRipple(r3Scale, r3Alpha, 800 + RSTAG * 2)

    // Floating dots: each with a different float amplitude and period
    d1.value = withDelay(350, withRepeat(withTiming(-11, { duration: 1800 }), -1, true))
    d2.value = withDelay(600, withRepeat(withTiming(-8,  { duration: 2200 }), -1, true))
    d3.value = withDelay(450, withRepeat(withTiming(-14, { duration: 1600 }), -1, true))
    d4.value = withDelay(750, withRepeat(withTiming(-9,  { duration: 2000 }), -1, true))
    d5.value = withDelay(150, withRepeat(withTiming(-7,  { duration: 2400 }), -1, true))
    d6.value = withDelay(900, withRepeat(withTiming(-12, { duration: 1900 }), -1, true))
    d7.value = withDelay(300, withRepeat(withTiming(-8,  { duration: 2600 }), -1, true))
    d8.value = withDelay(650, withRepeat(withTiming(-6,  { duration: 1700 }), -1, true))
  }, [])

  async function onExplore() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    try {
      await profileApi.markOnboardingComplete()
      await refreshUser()
      router.replace('/(auth)/subscription-prompt')
    } catch {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  return (
    <LinearGradient
      colors={['#FFD6D3', '#FEF0EE', '#FEF6F5']}
      locations={[0, 0.38, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 0.65 }}
      style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom > 0 ? insets.bottom : spacing[6] }]}
    >

      {/* ── Logo section ─────────────────────────────────────────────────── */}
      <View style={s.logoSection}>

        {/* Confetti burst — one-shot particles on mount */}
        {CONFETTI_DATA.map((p, i) => (
          <ConfettiDot key={i} {...p} delay={220 + i * 28} />
        ))}

        {/* Soft rose glow disk behind the circle */}
        <Animated.View style={[s.glowDisk, glowStyle]} />

        {/* 3 ripple rings */}
        <Animated.View style={[s.ring, ring1Style]} />
        <Animated.View style={[s.ring, ring2Style]} />
        <Animated.View style={[s.ring, ring3Style]} />

        {/* 8 floating dots — scattered positions, multi-colour */}
        <Animated.View style={[s.dot, s.dotA, ds1]} />
        <Animated.View style={[s.dot, s.dotB, ds2]} />
        <Animated.View style={[s.dot, s.dotC, ds3]} />
        <Animated.View style={[s.dot, s.dotD, ds4]} />
        <Animated.View style={[s.dot, s.dotE, ds5]} />
        <Animated.View style={[s.dot, s.dotF, ds6]} />
        <Animated.View style={[s.dot, s.dotG, ds7]} />
        <Animated.View style={[s.dot, s.dotH, ds8]} />

        {/* Logo circle with entrance spring */}
        <Animated.View style={logoStyle}>
          <View style={s.logoCircle}>
            <RedeemoLogo size={scale(80)} />
          </View>
        </Animated.View>

      </View>

      {/* ── Copy ─────────────────────────────────────────────────────────── */}
      <View style={s.copyWrap}>
        <Animated.View entering={FadeInDown.delay(450).duration(380).springify()} style={s.headingWrap}>
          <Text style={s.headingTop}>Welcome to</Text>
          <Text style={s.headingBrand}>Redeemo!</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(360).springify()}>
          <Text style={s.sub1}>
            Your profile is ready,{' '}
            <Text style={s.nameAccent}>{firstName}.</Text>
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(730).duration(320)}>
          <Text style={s.sub2}>
            Start exploring deals from local{'\n'}businesses near you.
          </Text>
        </Animated.View>
      </View>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(900).duration(360).springify()}
        style={s.ctaWrap}
      >
        <Button
          variant="primary"
          size="lg"
          loading={busy}
          disabled={busy}
          onPress={onExplore}
        >
          Explore deals
        </Button>
      </Animated.View>

    </LinearGradient>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = scale(174)

const s = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },

  // ── Logo section ──────────────────────────────────────────────────────
  logoSection: {
    width:           scale(340),
    height:          scale(340),
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing[5],
  },

  glowDisk: {
    position:        'absolute',
    width:           scale(240),
    height:          scale(240),
    borderRadius:    scale(120),
    backgroundColor: 'rgba(226,12,4,0.14)',
  },

  ring: {
    position:     'absolute',
    width:        CIRCLE_SIZE,
    height:       CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth:  2,
    borderColor:  'rgba(226,12,4,0.75)',
  },

  logoCircle: {
    width:           CIRCLE_SIZE,
    height:          CIRCLE_SIZE,
    borderRadius:    CIRCLE_SIZE / 2,
    backgroundColor: 'rgba(226,12,4,0.09)',
    borderWidth:     2,
    borderColor:     'rgba(226,12,4,0.22)',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     '#E20C04',
    shadowOpacity:   0.3,
    shadowRadius:    scale(18),
    shadowOffset:    { width: 0, height: 6 },
    elevation:       8,
  },

  // Floating dots — scattered around the 340×340 container
  dot: { position: 'absolute', borderRadius: 999 },
  dotA: { width: scale(12), height: scale(12), backgroundColor: '#E20C04', opacity: 0.70, top:    scale(20), left:   scale(20) },
  dotB: { width: scale(8),  height: scale(8),  backgroundColor: '#F59E0B', opacity: 0.75, top:    scale(42), right:  scale(12) },
  dotC: { width: scale(15), height: scale(15), backgroundColor: '#E20C04', opacity: 0.22, bottom: scale(22), right:  scale(34) },
  dotD: { width: scale(7),  height: scale(7),  backgroundColor: '#8B5CF6', opacity: 0.75, bottom: scale(55), left:   scale(24) },
  dotE: { width: scale(10), height: scale(10), backgroundColor: '#F59E0B', opacity: 0.55, top:    scale(78), left:   scale(6)  },
  dotF: { width: scale(6),  height: scale(6),  backgroundColor: '#E20C04', opacity: 0.60, top:    scale(26), right:  scale(52) },
  dotG: { width: scale(11), height: scale(11), backgroundColor: '#10B981', opacity: 0.60, bottom: scale(78), right:  scale(10) },
  dotH: { width: scale(9),  height: scale(9),  backgroundColor: '#3B82F6', opacity: 0.55, bottom: scale(28), left:   scale(80) },

  // ── Copy ──────────────────────────────────────────────────────────────
  copyWrap: {
    alignItems:   'center',
    gap:          spacing[3],
    marginBottom: spacing[8],
    paddingHorizontal: spacing[2],
  },
  headingWrap: {
    alignItems: 'center',
    gap:        spacing[1],
  },
  headingTop: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(18),
    color:      color.text.secondary,
    letterSpacing: ms(0.3),
  },
  headingBrand: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize:   ms(42),
    color:      color.brandRose,
    lineHeight: ms(50),
    letterSpacing: ms(-0.5),
  },
  sub1: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(17),
    color:      color.text.secondary,
    textAlign:  'center',
    lineHeight: ms(26),
  },
  nameAccent: {
    fontFamily: 'Lato-SemiBold',
    fontSize:   ms(17),
    color:      color.text.primary,
    lineHeight: ms(26),
  },
  sub2: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(15),
    color:      color.text.tertiary,
    textAlign:  'center',
    lineHeight: ms(22),
  },

  // ── CTA ───────────────────────────────────────────────────────────────
  ctaWrap: {
    width: '100%',
  },
})
