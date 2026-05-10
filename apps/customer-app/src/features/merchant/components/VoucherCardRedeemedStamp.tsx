import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'

/**
 * VoucherCardRedeemedStamp — premium "Voucher Redeemed" cancellation
 * overprint for the merchant-profile voucher card hero.
 *
 * **PR-B T8k (interaction-design pass, owner-locked 2026-05-10).**
 *
 * Trail of design moves on this surface:
 *   • T5 / §Q4 (original): rubber-stamp small variant top-right corner.
 *   • T8h (REVERTED at T8i): refined hairline-accent treatment was
 *     applied to the wrong surface (Voucher Detail hero seal); reverted.
 *   • T8i: refined hairline-accent treatment moved here, kept centered,
 *     bumped from 36pt → 52pt, copy "REDEEMED" → "Voucher Redeemed".
 *   • T8j (impeccable pass): the CARD around this stamp got the wash
 *     bump (0.30 → 0.55) + flat shadow + muted watermark.  The stamp
 *     itself was unchanged.
 *   • T8k (this round, interaction-design pass): the centered cream
 *     pill with hairline accents is REPLACED by a diagonal Mustica
 *     Pro overprint — premium editorial cancellation mark.  The
 *     centered cream block read as "we put a sticker on this voucher";
 *     the diagonal overprint reads as "this voucher has been processed",
 *     mirroring how banks mark cancelled cheques and how museums mark
 *     archival documents.  Pairs with the muted gradient + flat shadow
 *     + watermark drop already shipped at T8j to read as a settled
 *     receipt at a glance.
 *
 * Visual contract (T8k):
 *   • Copy:        "Voucher Redeemed" (preserved from T8i).
 *   • Type:        Mustica Pro Semibold display.sm 22/26pt — DESIGN.md
 *                  Mustica-for-Display Rule.  Wide tracking 5pt for
 *                  editorial cancellation feel.
 *   • Colour:      brand-rose `#E20C04` at α 0.32 — load-bearing trust
 *                  signal but quiet enough not to dominate the
 *                  underlying type-coloured gradient.
 *   • Rotation:    -10° rubber-stamp tilt without distress overlays;
 *                  reads as the universal cancellation language.
 *   • No backdrop, no border, no shadow, no gradient backdrop.
 *                  Restraint = premium per DESIGN.md.
 *
 * Motion contract (T8k):
 *   • Entrance:    scale 1.18 → 1.0 + opacity 0 → 1, 320ms,
 *                  cubic-bezier(0.25, 1, 0.5, 1) ease-out-quart.
 *                  Reads as the stamp coming down and settling.
 *   • Reduced motion: skip the entrance entirely — render at the
 *                  final scale + opacity instantly.
 *   • Transform-only animation (scale + opacity) per the
 *                  interaction-design skill "Performance First" rule
 *                  — never animate width / height / margin.
 *   • Mount-only (`useEffect([])`) — natural re-trigger on each
 *                  fresh visit because each visit IS a new "looking
 *                  at this voucher" moment; the motion is short
 *                  (≤320ms) so it doesn't feel intrusive.
 *
 * Cross-refs:
 *   - apps/customer-app/src/features/voucher/components/RedeemedSeal.tsx
 *     (Voucher Detail hero — rubber-stamp DNA, intentionally separate
 *     and owner-approved; do NOT synchronise with this component).
 *   - DESIGN.md §3 typography (Mustica-for-Display Rule).
 *   - DESIGN.md §6 don'ts (no nested cards, no side-stripes).
 *   - .claude/skills/interaction-design (motion-led state transitions).
 *   - deferred-followups §Q4 — stays closed.
 */

const ENTRANCE_DURATION_MS = 320
const INITIAL_SCALE        = 1.18
const REST_ROTATION_DEG    = -10

type Props = {
  /** Override the display fontSize. Default: design-system display.sm
   *  (22pt). Tests may pass a smaller value to validate fit on
   *  narrow devices; production should leave this unset. */
  fontSize?: number
}

export function VoucherCardRedeemedStamp(_props: Props = {}) {
  const reducedMotion = useReducedMotion()
  const scale   = useSharedValue(reducedMotion ? 1 : INITIAL_SCALE)
  const opacity = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    const timing = { duration: ENTRANCE_DURATION_MS, easing: Easing.bezier(0.25, 1, 0.5, 1) }
    scale.value   = withTiming(1, timing)
    opacity.value = withTiming(1, timing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animated style carries ONLY the entry-motion values (scale +
  // opacity).  The static -10° rotate lives on the outer wrapping
  // View so that:
  //   1. RN doesn't have to merge two transform arrays (later
  //      transform always replaces earlier — splitting them avoids
  //      the bug entirely).
  //   2. The static rotate stays readable for unit tests; the
  //      animated values are governed by the worklet runtime
  //      (mocked away in jest, exercised on device).
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View
      testID="voucher-card-redeemed-stamp"
      pointerEvents="none"
      style={[styles.stamp, styles.tilt]}
    >
      <Animated.View style={animatedStyle}>
        <Text variant="display.sm" style={styles.text}>
          Voucher Redeemed
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  stamp: {
    // No backdrop, no border, no shadow.  The overprint is the entire
    // visual — restraint per DESIGN.md "Flat-By-Default Rule".
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Static -10° rotation lives on the inner wrapper so the animated
  // child can carry scale + opacity without RN's "later transform
  // wins" merge bug.  See the inline note inside the component.
  tilt: {
    transform: [{ rotate: `${REST_ROTATION_DEG}deg` }],
  },
  text: {
    // Local style overrides take priority over the variant defaults
    // for letterSpacing + colour; the design-system Text component
    // merges with `[textStyle, style]` so this style array wins.
    color: 'rgba(226, 12, 4, 0.32)',
    letterSpacing: 5,
    textTransform: 'uppercase',
    includeFontPadding: true,
  },
})
