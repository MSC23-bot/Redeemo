import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
  interpolateColor,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  /** True when the merchant has more than one branch. Single-branch hides
   *  the brand-red tinted region + branch-line text — there's no branch
   *  context to anchor. The descriptor + meta row still render. */
  isMultiBranch: boolean
  /** The current branch's display label (typically `branchShortName(sb.name)`).
   *  Null on single-branch — band-style hidden. */
  branchLine: string | null
  /** Branch-switch trigger: change to fire the coordinated band motion.
   *  Pass `selectedBranch.id`. */
  switchTrigger?: string | null
  /** Children render inside the band (after the branch line on multi-branch).
   *  Composition: <BranchChip /> + <MerchantDescriptor /> + <MetaRow />. */
  children: React.ReactNode
}

// Visual correction round §1 + §4 (post-PR-#35 QA): BranchContextBand is
// the signature multi-branch element. It wraps the branch line, switcher
// chip, descriptor, and meta row in a brand-red-tinted region that
// visually anchors "you are at THIS branch" — strengthening branch-first
// hierarchy without changing the §6.4 page composition order.
//
// Section §4 motion (Emil-grade single coordinated transition):
//   • Background flash: rgba(226,12,4,0.04) → rgba(226,12,4,0.14) → 0.04
//     over 400ms (200ms in + 200ms out). Strong ease-out custom curve.
//   • Brand-red gradient sweep: 30%-width Animated.View translates
//     translateX -100% → 100% across the band over 480ms with peak
//     opacity 0.20 at 50% — a single visible "the branch box just
//     refreshed" cue.
//   • No subtract/swap/reveal state machine. React Query rerenders the
//     band's text content under cover of the band motion. Branch line
//     text just changes; the surrounding band motion frames the change
//     so the user perceives it as a coherent refresh.
//   • Reduced motion (motionScale === 0): SKIPPED. Branch line text
//     swaps instantly. Band stays at rest tint.
//
// What does NOT animate (preserves "vouchers merchant-wide, redemption
// branch-attributed" semantic):
//   - Hero photo, logo, merchant name, descriptor — merchant-level
//   - Voucher cards — merchant-wide
//   - Tab bar — page chrome
//   - Action row buttons — branch-context targets, but the buttons
//     themselves don't display branch data
export function BranchContextBand({ isMultiBranch, branchLine, switchTrigger, children }: Props) {
  const motionScale = useMotionScale()
  const flashIntensity = useSharedValue(0)
  const sweepProgress = useSharedValue(0)
  const isFirstRender = React.useRef(true)

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (motionScale === 0) return
    if (!isMultiBranch) return

    flashIntensity.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
      withTiming(0, { duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
    )
    sweepProgress.value = 0
    sweepProgress.value = withTiming(1, {
      duration: 480,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
    })
  }, [switchTrigger, motionScale, isMultiBranch, flashIntensity, sweepProgress])

  const bandAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      flashIntensity.value,
      [0, 1],
      ['rgba(226,12,4,0.04)', 'rgba(226,12,4,0.14)'],
    ),
  }))

  const sweepAnimatedStyle = useAnimatedStyle(() => {
    // translateX from -100% (left of band, off-screen) → 100% (right of
    // band, off-screen). At 0.5 progress the sweep is centered over the
    // band. Opacity peaks at 50% then fades out.
    const progress = sweepProgress.value
    const opacity = progress === 0 ? 0 : 1 - Math.abs(progress * 2 - 1)
    return {
      transform: [{ translateX: `${(progress * 200 - 100)}%` }],
      opacity,
    }
  })

  if (!isMultiBranch || !branchLine) {
    return <View style={styles.flat}>{children}</View>
  }

  return (
    <Animated.View style={[styles.band, bandAnimatedStyle]} testID="branch-context-band">
      <Animated.View
        style={[styles.sweepWrap, sweepAnimatedStyle]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgba(226,12,4,0)', 'rgba(226,12,4,0.20)', 'rgba(226,12,4,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <Text
        variant="label.lg"
        style={styles.branchLine}
        numberOfLines={1}
        ellipsizeMode="tail"
        testID="merchant-branch-line"
        accessibilityLiveRegion="polite"
      >
        {branchLine}
      </Text>
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Tinted band — multi-branch merchants only.
  band: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(226,12,4,0.04)',
    gap: 10,
    overflow: 'hidden',  // clip the sweep gradient to band bounds
    position: 'relative',
  },
  // No-band fallback — single-branch merchants.
  flat: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 10,
  },
  branchLine: {
    color: '#E20C04',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: -0.1,
  },
  // Sweep gradient overlay — width 30% of band, slides left → right.
  sweepWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '30%',
  },
})
