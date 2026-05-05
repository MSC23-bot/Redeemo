import React from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  /** When non-null, the toast is visible. Round 3 §B6: copy now reads
   *  `Now viewing {merchantName}, {branchName} branch` so the
   *  confirmation includes WHO the branch belongs to (helpful when the
   *  user came from search/discovery and the merchant name isn't on
   *  screen). Auto-dismisses after 2.4s. */
  branchName: string | null
  merchantName: string
  onDismiss: () => void
}

// Visual correction round §4 (post-PR-#35 QA): a simple confirmation
// toast that fires only when the user switches branch from an Other
// Locations card (which is below the sticky tab bar — they may have
// scrolled past the BranchContextBand and missed its motion).
//
// Owner direction enforced:
//   - Simple confirmation only (no Undo link, no state machine).
//   - Auto-dismiss after 2.4s.
//   - Other Locations source ONLY (the screen tracks source explicitly).
//   - Suppressed for chip-picker source (chip + band are on-screen there).
//   - Reduced motion: instant show/hide, no slide.
//
// Implementation: a single Reanimated shared value drives translateY +
// opacity. No new infrastructure, no portal, no global state — just a
// per-screen positioned absolute element. Exits faster than enter
// (Emil framework: exit 60–70% of enter duration).
const SHOW_DURATION_MS = 2400
const ENTER_MS         = 280
const EXIT_MS          = 200

export function BranchSwitchToast({ branchName, merchantName, onDismiss }: Props) {
  const motionScale = useMotionScale()
  const offset = useSharedValue(120)   // start off-screen below
  const opacity = useSharedValue(0)
  const visibleNameRef = React.useRef<string | null>(null)
  const dismissTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [renderName, setRenderName] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Show on branchName transitioning from null → string. Critical: we
    // schedule the auto-dismiss timer on a ref so it survives the
    // setRenderName rerender that immediately follows. The timer cleared
    // only on unmount or on a subsequent show (where it gets replaced).
    if (branchName && visibleNameRef.current !== branchName) {
      visibleNameRef.current = branchName
      setRenderName(branchName)

      if (motionScale === 0) {
        offset.value = 0
        opacity.value = 1
      } else {
        offset.value = withTiming(0, {
          duration: ENTER_MS,
          easing: Easing.bezier(0.32, 0.72, 0, 1),  // drawer curve
        })
        opacity.value = withTiming(1, {
          duration: ENTER_MS,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        })
      }

      // Replace any in-flight timer with a fresh 2.4s countdown.
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        onDismiss()
        dismissTimerRef.current = null
      }, SHOW_DURATION_MS)
      return  // no per-effect cleanup; timer cleanup happens on unmount
    }

    // Hide on branchName transitioning from string → null
    if (!branchName && visibleNameRef.current !== null) {
      visibleNameRef.current = null
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = null
      }

      if (motionScale === 0) {
        offset.value = 120
        opacity.value = 0
        setRenderName(null)
      } else {
        offset.value = withTiming(120, {
          duration: EXIT_MS,
          easing: Easing.bezier(0.55, 0, 1, 0.45),  // ease-in for exit
        })
        opacity.value = withTiming(0, {
          duration: EXIT_MS,
          easing: Easing.bezier(0.55, 0, 1, 0.45),
        }, () => {
          // After exit completes, clear the rendered name so the
          // toast container fully unmounts (helps a11y not announce
          // a hidden region).
          runOnJS(setRenderName)(null)
        })
      }
    }
  }, [branchName, motionScale, offset, opacity, onDismiss])

  // Unmount cleanup — clear any in-flight dismiss timer.
  React.useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = null
      }
    }
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: opacity.value,
  }))

  if (renderName === null) return null

  return (
    <Animated.View
      style={[styles.toast, animatedStyle]}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="branch-switch-toast"
    >
      <Animated.View style={styles.dot} />
      <Text variant="label.md" style={styles.label}>
        Now viewing {merchantName}, {renderName} branch
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    marginHorizontal: 32,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0F0E1F',  // navy-near-black warm-shifted
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.20,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E20C04',
  },
  label: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    flex: 1,
  },
})
