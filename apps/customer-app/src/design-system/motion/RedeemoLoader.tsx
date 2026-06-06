import React, { useEffect, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { SvgXml } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { color } from '../tokens'
import { useMotionScale } from '../useMotionScale'

/**
 * Brand loading indicator — three dots orbit the Redeemo R logo.
 *
 * Source design: Claude Design "Redeemo · Logo Loading Animation"
 * (Logo Animation.html, default loader = "dots" / Dot Orbit). The
 * design owner iterated through six variants (orbit ring, dual arcs,
 * dot orbit, tracing line, soft pulse, conic glow) and locked Dot
 * Orbit in TWEAK_DEFAULTS. Speed default 0.8× → 1600ms × 1.25 =
 * 2000ms cycle here. Linear time, sin/cos pulses for size + opacity.
 *
 * Geometry (from the original design, normalised):
 *   • Logo at 60% of loader size, centred.
 *   • Orbit radius at 44% of loader size from centre.
 *   • Dot radius = max(2, size × 0.05) — design value (2.6 in 100-unit
 *     viewBox = 2.6% of size) is too small at typical app loader
 *     sizes (32–80pt); clamped at 2pt floor for legibility.
 *   • 3 dots staggered by 1/3 of the cycle phase.
 *
 * Reduced motion: the orbit animation never starts; dots render at
 * their static phase=0 positions (offsets 0, 1/3, 2/3 of the cycle —
 * three points at 0°, 120°, 240° around the logo, with opacity and
 * scale per the curve at t=0). Logo + dots remain visible so the
 * user still gets the "something is loading" affordance.
 *
 * `motion/` placement: per the design-system motion README, `withRepeat`
 * is permitted only inside `motion/` for loading/countdown/system-
 * feedback primitives. This loader satisfies that exemption.
 *
 * Sizes (px → small inline / standard centred / full-screen):
 *   • 'sm' = 32  — inline lookup, header loading text
 *   • 'md' = 48  — in-list / centred default
 *   • 'lg' = 80  — full-screen loading state
 *   • numeric    — explicit size override
 */
const SIZES = { sm: 32, md: 48, lg: 80 } as const

const CYCLE_DURATION_MS = 2000

/**
 * R logo SVG, brand-red fill. Path data is the OFFICIAL Iconic
 * Version 3 paths copied from `docs/branding/Logos/Iconic Version 3.svg`
 * — the same source VoucherCard uses with white fills. A future
 * follow-up should extract this into a shared `<RedeemoLogoR>`
 * primitive (parameterised fill) so both consumers reference one
 * source. Tracked: docs/branding is gitignored, so the SVG content
 * has to live in source — duplicated rather than imported.
 */
const REDEEMO_R_SVG_RED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
  <path fill="${color.brandRose}" d="M802.45,452.5c-.44,93.28-48.92,182.68-129,232.74L654.74,674.6c.7-2.78,1.36-5.56,2-8.39a273.15,273.15,0,0,0,6.45-59.33c0-2.21,0-4.41-.09-6.58-1.59-39.37-10.33-77.34-28.7-112.39-18-34.48-43.61-62.42-73.1-87.85a528.72,528.72,0,0,0-63.44-46.67c-5.43-3.48-10.9-6.88-16.47-10.15q-23.1-13.71-47.1-25.91L273.09,226l-11.47-6.84L244.4,208.91l46.75-44A51.25,51.25,0,0,0,336.75,182c27.73-3.62,47.46-28.08,44-54.7a47.11,47.11,0,0,0-17.13-30.59l30.9-29.09,21.68,9.22,8.3,3.54h0c44,21.72,106.7,50.28,142.15,71.12,52.54,30.85,104.41,60.74,149.7,102.63,6.89,6.41,13.51,13.12,19.74,20.14C770.66,313.44,793,363.06,800,414.8A270.54,270.54,0,0,1,802.45,452.5Z"/>
  <polygon fill="${color.brandRose}" points="273.09 225.99 261.39 219.37 261.62 219.15 273.09 225.99"/>
  <path fill="${color.brandRose}" d="M784.92,888.09a50.58,50.58,0,0,0,50.68,50.59v73.68L531.17,841.69,440.8,791.1,245.06,681.4V441.33l9,5.12L627.45,659l25.39,14.48,1.9,1.1,18.67,10.64L835.6,777.55v60A50.63,50.63,0,0,0,784.92,888.09Z"/>
  <polygon fill="${color.brandRose}" points="487.2 818.12 244.4 994.7 245.05 681.39 487.2 818.12"/>
</svg>`

type Size = keyof typeof SIZES | number

type Props = {
  /**
   * Loader size. `'sm'` (32pt) for inline contexts, `'md'` (48pt)
   * for centred default, `'lg'` (80pt) for full-screen. Numeric
   * value bypasses the preset.
   */
  size?: Size
  /**
   * Accessibility label override. Defaults to "Loading". Set to a
   * more specific label in context (e.g. "Loading reviews",
   * "Looking up postcode").
   */
  accessibilityLabel?: string
  /**
   * Whether the orbit animation runs. Defaults to `true`. Set to
   * `false` to render the dots in their STATIC rest positions (no
   * orbiting) — e.g. a pull-to-refresh indicator that should only
   * spin once the refresh actually fires, not while the user is still
   * pulling. Re-enabling restarts the orbit from the rest position.
   * Ignored when `phase` is supplied (the caller drives rotation).
   */
  animating?: boolean
  /**
   * Optional externally-driven orbit phase (0..1 = one full turn; values wrap).
   * When supplied, the caller owns rotation entirely (e.g. a pull-to-refresh
   * indicator whose dots wind with the pull distance, then spin continuously
   * once refreshing) and the internal orbit/`animating` logic is bypassed.
   */
  phase?: SharedValue<number>
}

export function RedeemoLoader({ size = 'md', accessibilityLabel = 'Loading', animating = true, phase: externalPhase }: Props) {
  const motionScale = useMotionScale()

  const px = typeof size === 'number' ? size : SIZES[size]
  const logoSize = px * 0.60
  const orbitRadius = px * 0.44
  const dotRadius = Math.max(2, px * 0.05)

  const internalPhase = useSharedValue(0)
  const phase = externalPhase ?? internalPhase

  useEffect(() => {
    // Caller-driven phase: the internal orbit is bypassed entirely.
    if (externalPhase) return
    // Static rest when reduced motion is on OR the caller paused it: hold the
    // dots at phase 0 (their 0°/120°/240° rest positions), no orbit.
    if (motionScale === 0 || !animating) {
      cancelAnimation(internalPhase)
      internalPhase.value = 0
      return
    }
    internalPhase.value = withRepeat(
      withTiming(1, { duration: CYCLE_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(internalPhase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionScale, animating, externalPhase])

  return (
    <View
      style={[styles.root, { width: px, height: px }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      <View style={[styles.logoBox, { width: logoSize, height: logoSize }]}>
        <SvgXml xml={REDEEMO_R_SVG_RED} width="100%" height="100%" />
      </View>

      <OrbitDot phase={phase} indexOfThree={0} orbitRadius={orbitRadius} dotRadius={dotRadius} />
      <OrbitDot phase={phase} indexOfThree={1} orbitRadius={orbitRadius} dotRadius={dotRadius} />
      <OrbitDot phase={phase} indexOfThree={2} orbitRadius={orbitRadius} dotRadius={dotRadius} />
    </View>
  )
}

type OrbitDotProps = {
  phase: SharedValue<number>
  indexOfThree: 0 | 1 | 2
  orbitRadius: number
  dotRadius: number
}

function OrbitDot({ phase, indexOfThree, orbitRadius, dotRadius }: OrbitDotProps) {
  const offset = indexOfThree / 3

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    const local = (phase.value + offset) % 1
    // angle starts at top (-π/2) and sweeps clockwise
    const angle = local * 2 * Math.PI - Math.PI / 2
    const x = Math.cos(angle) * orbitRadius
    const y = Math.sin(angle) * orbitRadius

    // Size pulse: design uses r = 2.2 + 0.6 × sin(local × 2π).
    // Translated to a scale factor around the base dotRadius:
    //   pulse = (2.2 + 0.6 × sin(2π·local)) / 2.6 ≈ 0.85..1.08
    const pulse = (2.2 + 0.6 * Math.sin(local * 2 * Math.PI)) / 2.6

    // Opacity: design uses 0.5 + 0.5 × sin(local × 2π + π/2)
    //                      = 0.5 + 0.5 × cos(local × 2π)
    const op = 0.5 + 0.5 * Math.cos(local * 2 * Math.PI)

    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: pulse },
      ],
      opacity: op,
    }
  })

  // The dot's static base size + colour. The animated style above
  // only drives transform + opacity (both GPU-accelerated, no
  // layout reflow per frame).
  const dotBaseStyle = useMemo(
    () => ({
      width: dotRadius * 2,
      height: dotRadius * 2,
      borderRadius: dotRadius,
      backgroundColor: color.brandRose,
    }),
    [dotRadius],
  )

  return <Animated.View style={[styles.dot, dotBaseStyle, animatedStyle]} />
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  logoBox: {
    position: 'absolute',
  },
  dot: {
    position: 'absolute',
  },
})
