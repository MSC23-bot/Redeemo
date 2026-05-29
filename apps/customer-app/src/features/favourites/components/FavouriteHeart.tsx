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
 * Visual tone table.
 *
 * - `on-light`    — for surfaces with a light/white background.  Brand-
 *                   rose stroke; brand-rose fill when active.
 * - `on-dark`     — for surfaces with a dark background (merchant hero,
 *                   voucher detail nav row).  White stroke; brand-rose
 *                   fill when active so the active state still pops on
 *                   a dark backdrop.  Container is expected to provide
 *                   any translucent "frosted" backing (Pressable here
 *                   stays transparent so this component composes inside
 *                   existing frosted/glass buttons).
 * - `on-gradient` — for surfaces sitting on the brand gradient (voucher
 *                   cards in Merchant Profile, branch tiles in
 *                   Discovery).  White stroke; white fill when active —
 *                   reads as ink-on-colour without competing with the
 *                   underlying gradient.
 */
function toneColours(tone: FavouriteHeartTone, isFavourited: boolean): { stroke: string; fill: string } {
  switch (tone) {
    case 'on-dark':
      return {
        stroke: '#FFFFFF',
        fill:   isFavourited ? '#E20C04' : 'none',
      }
    case 'on-gradient':
      return {
        stroke: '#FFFFFF',
        fill:   isFavourited ? '#FFFFFF' : 'none',
      }
    case 'on-light':
    default:
      return {
        stroke: '#E20C04',
        fill:   isFavourited ? '#E20C04' : 'none',
      }
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

  const { isFavourited, toggle, isLoading } = useFavourite({
    type:                entity,
    id,
    initialIsFavourited,
    contextualQueryKey,
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
      // useFavourite is pessimistic-with-onSuccess: the rejected
      // mutation never advances state, so there's nothing to roll
      // back.  Swallow the error here so a transient network blip on
      // a heart tap doesn't surface an unhandled promise rejection;
      // the consumer screen can still surface its own toast via the
      // hook's `isLoading` and the next list refetch.
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
