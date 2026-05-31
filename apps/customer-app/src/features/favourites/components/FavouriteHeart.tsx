/**
 * Phase 3C.1g M2.3 — `<FavouriteHeart>` shared component (spec §7.2.1).
 *
 * The canonical heart UI.  Owns the `useFavourite()` hook call,
 * animation, accessibility, and cache invalidation.  Every surface
 * favourite entry point in spec §3 entry points 1-10 renders this
 * component instead of calling `useFavourite()` directly.
 *
 * Locked invariant (spec §7.2.1): `useFavourite()` is called ONLY by
 * this component and by `useRemoveFavourite` (M2.4 swipe-to-remove
 * path on the Favourites tab).  A static-source pin lives in the
 * companion test file.
 */

import React, { useCallback } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Heart } from '@/design-system/icons'
import { color } from '@/design-system/tokens'
import { useFavourite } from '@/hooks/useFavourite'
import { useReduceMotion } from '@/features/profile/hooks/useReduceMotion'

export type FavouriteHeartTone = 'on-light' | 'on-dark' | 'on-gradient'

export interface FavouriteHeartProps {
  /** Which kind of entity this heart toggles. */
  entity:              'branch' | 'voucher'
  /** ID of the entity (branch.id for 'branch', voucher.id for 'voucher'). */
  id:                  string
  /** Server-emitted starting state. */
  initialIsFavourited: boolean
  /** Visual variant — colour scheme + stroke.  Defaults to 'on-light'. */
  tone?:               FavouriteHeartTone
  /** Icon size in pt.  Defaults to 24. */
  size?:               number
  /** Suppresses interactivity + dims.  Used by Voucher Detail redeemed-state hero. */
  disabled?:           boolean
  /** Additional cache key to invalidate alongside the list key. */
  contextualQueryKey?: readonly unknown[]
  /** Optional testID for E2E targeting and per-card identification. */
  testID?:             string
}

/**
 * Visual tone — colour contract (Device-QA R1 Wave 3 finding #17, locked 2026-05-30).
 *
 * Across all surfaces the heart is rendered in the brand-rose colour:
 *   - Unfavourited → brand-rose stroke, no fill.
 *   - Favourited   → brand-rose stroke AND brand-rose fill.
 * The owner-locked product principle is "make heart state visually
 * coherent across surfaces" — so the `tone` prop no longer changes the
 * heart colour.  It still exists in the API for forward compat AND for
 * consumers to declare which surface family they sit on; future
 * iterations may use it to add a subtle inner backdrop circle for
 * extra contrast on saturated gradients without changing call sites.
 *
 * Why no white variants any more (pre-R3 behaviour, retired):
 *   - on-dark used to be `stroke: '#FFFFFF'` + brand-rose active fill.
 *     White outlines on dark/grey circles read as "neutral chrome" not
 *     "tap me to save".  Owner direction: red outline carries the brand
 *     intent + matches the filled-red active state for a clear
 *     unfavourited→favourited transition.
 *   - on-gradient used to be `stroke: '#FFFFFF' + fill: '#FFFFFF'` — a
 *     filled-white heart on a coloured gradient looked decorative, not
 *     stateful.  Filled red is the unambiguous "saved" signal.
 *
 * Container chrome (the circular backdrop visible on Map cards, voucher
 * gradient cards, Merchant Profile hero, etc.) stays the consumer's
 * responsibility — those wrappers already provide contrast against the
 * surface and the new brand-rose glyph sits cleanly inside them.
 */
function toneColours(_tone: FavouriteHeartTone, isFavourited: boolean): { stroke: string; fill: string } {
  return {
    stroke: color.brandRose,
    fill:   isFavourited ? color.brandRose : 'none',
  }
}

// Spec §7.2.1 — 1.0 → 1.15 → 1.0 over 200ms total, ease-out.  Each leg
// is half the total duration; reduce-motion users skip the animation
// entirely (colour-only flip).
const POP_PEAK   = 1.15
const POP_HALF_MS = 100

export function FavouriteHeart({
  entity,
  id,
  initialIsFavourited,
  tone               = 'on-light',
  size               = 24,
  disabled           = false,
  contextualQueryKey,
  testID,
}: FavouriteHeartProps): React.ReactElement {
  const reduceMotion = useReduceMotion()
  const scale = useSharedValue(1)

  // Spread-conditionally so `exactOptionalPropertyTypes: true` doesn't
  // complain about passing `undefined` for an optional-but-not-undefined
  // prop on UseFavouriteOptions.  When the consumer didn't pass a
  // contextual key, omit the property entirely.
  const { isFavourited, toggle, isLoading } = useFavourite({
    type:                entity,
    id,
    initialIsFavourited,
    ...(contextualQueryKey !== undefined ? { contextualQueryKey } : {}),
  })

  const handlePress = useCallback(() => {
    if (disabled || isLoading) return
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(POP_PEAK, { duration: POP_HALF_MS, easing: Easing.out(Easing.quad) }),
        withTiming(1,        { duration: POP_HALF_MS, easing: Easing.out(Easing.quad) }),
      )
    }
    void toggle().catch(() => {
      // useFavourite is optimistic with rollback-on-error (Device-QA R1
      // W4 + W6.7): the hook itself reverts local state AND the cross-
      // surface cache patch when the mutation rejects.  Swallow here so
      // a transient network blip on a heart tap doesn't surface an
      // unhandled promise rejection at the React Native runtime layer.
    })
  }, [disabled, isLoading, reduceMotion, scale, toggle])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const { stroke, fill } = toneColours(tone, isFavourited)

  return (
    <Animated.View style={[animatedStyle, disabled && styles.disabled]}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        accessibilityState={{ disabled }}
        testID={testID}
        style={styles.pressable}
      >
        <View style={styles.iconWrap}>
          <Heart size={size} color={stroke} fill={fill} strokeWidth={2.2} />
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pressable: {
    // Tight wrapper around the icon; consumers compose this inside their
    // own frame (frosted button, voucher card corner, etc.).
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
})
