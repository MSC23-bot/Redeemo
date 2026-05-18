import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { X } from '@/design-system/icons'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

// §Savings emil-pass 5/7 2026-05-17 — ViewingChip motion language.
//
// Was: spring(damping:12 stiffness:200) on enter, NO exit animation
// (unmounts cold the moment `month` becomes null).
//
// Two problems:
//   1. Spring bounce on a status chip is too playful — "Viewing
//      April 2026" is informational, not delightful.  Emil's
//      framework: keep bounce 0.1-0.3 IF used at all; avoid bounce
//      in most UI.
//   2. Cold unmount on dismiss feels broken — the chip just vanishes
//      without giving the user a sense of where it went.
//
// New: asymmetric timing-based enter/exit.
//   - Enter: 180ms ease-out scale(0.92→1) + opacity(0→1).  Strong
//     cubic-bezier(0.23, 1, 0.32, 1) for the punchy decel that
//     Emil's framework prescribes over the weaker built-in eases.
//   - Exit: 140ms ease-in.  System responding to a deliberate user
//     action — should be snappy.  Snappier than the enter so the
//     dismiss feels like the system catching up to intent.
//   - Local `data-mounted` pattern: render keeps the chip mounted
//     while the exit animation plays, then drops it via runOnJS
//     callback on the exit timing's completion frame.

const ENTER_DURATION_MS = 180
const EXIT_DURATION_MS  = 140
// Strong ease-out per Emil — equivalent to cubic-bezier(0.23,1,0.32,1).
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
const EASE_IN  = Easing.bezier(0.55, 0,  1,    0.45)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatMonth(yyyymm: string): string {
  const [year = '', mon = '1'] = yyyymm.split('-')
  const monName = MONTH_NAMES[parseInt(mon, 10) - 1] ?? ''
  return `${monName} ${year}`
}

type Props = {
  month: string | null
  onDismiss: () => void
}

export function ViewingChip({ month, onDismiss }: Props) {
  const scale = useSharedValue(0.92)
  const opacity = useSharedValue(0)
  const motionScale = useMotionScale()

  // Local mount state preserves the chip in the tree while the exit
  // animation plays, then drops it.  `rendered` follows `month` on
  // enter (immediately) but lags `month: null` on exit (waits for
  // the timing-completion callback before unmounting).
  const [rendered, setRendered] = useState<string | null>(month)

  useEffect(() => {
    if (month) {
      setRendered(month)
      if (motionScale === 0) {
        scale.value   = 1
        opacity.value = 1
        return
      }
      scale.value   = withTiming(1, { duration: ENTER_DURATION_MS, easing: EASE_OUT })
      opacity.value = withTiming(1, { duration: ENTER_DURATION_MS, easing: EASE_OUT })
      return
    }

    // Exit path: month became null.  Reduce-motion drops immediately.
    if (motionScale === 0) {
      scale.value   = 0.92
      opacity.value = 0
      setRendered(null)
      return
    }

    scale.value   = withTiming(0.92, { duration: EXIT_DURATION_MS, easing: EASE_IN })
    opacity.value = withTiming(
      0,
      { duration: EXIT_DURATION_MS, easing: EASE_IN },
      (finished) => {
        'worklet'
        if (finished) runOnJS(setRendered)(null)
      },
    )
  }, [month, motionScale, opacity, scale])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }))

  // Keep mounted while exiting; otherwise drop.
  if (!rendered) return null

  const monthLabel = formatMonth(rendered)

  return (
    <Animated.View style={[styles.chip, animStyle]} testID="savings-viewing-chip">
      <Text variant="label.md" style={styles.chipText}>
        {`Viewing: ${monthLabel}`}
      </Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Viewing ${monthLabel}. Tap to return to current month`}
        testID="savings-viewing-chip-dismiss"
      >
        <X size={14} color="#010C35" />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // §Savings impeccable 4/6 2026-05-17 — re-palette.
  // Was: amber `#FEF3C7` bg + `#FDE68A` border + `#B45309` text /
  // X-icon — warning-amber palette on an INFORMATIONAL chip implied a
  // caution that isn't there.  DESIGN.md reserves amber for genuine
  // warnings (expires-in-24h, low-remaining).
  // Now: cream `surface.tint #FEF6F5` bg + `border.subtle #E5E7EB`
  // hairline border + navy `text.primary #010C35` text + X.  Reads as
  // a calm savings-flow chip; cream identity tone tied back to the
  // brand's identity zone (no new colour invented).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF6F5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    gap: spacing[2],
  },
  chipText: {
    color: '#010C35',
    fontFamily: 'Lato-SemiBold',
    fontSize: 12,
  },
})
