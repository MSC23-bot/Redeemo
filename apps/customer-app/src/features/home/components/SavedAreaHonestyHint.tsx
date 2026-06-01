import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Text, color } from '@/design-system'
import { MapPin, ChevronRight } from '@/design-system/icons'
import type { LocationContext } from '@/lib/api/discovery'
import { HomeChromeCard } from './HomeChromeCard'

interface SavedAreaHonestyHintProps {
  locationContext: LocationContext
}

const EXIT_DURATION_MS = 300

/**
 * `<SavedAreaHonestyHint>` — Home-only honesty hint that surfaces when the
 * backend resolved Discovery against the user's SAVED_PROFILE postcode (not
 * live GPS).  Locked spec §6.2 (2026-05-24-postcode-profile-fallback v1.1).
 *
 * Render gates + animation contract are §DF-locked and PRESERVED here:
 *   • Only mounts when `locationContext.source === 'profile'` AND an area
 *     name resolves (locality.name > city); else renders nothing.
 *   • No mount animation; slide-up + fade EXIT on `source` `'profile' →
 *     'coordinates'` (300ms ease-out); reduced-motion = instant hide.
 *   • Whole-row tap routes to `/saved-area`.
 *
 * Batch 3 (2026-06-01) — the inner visual now renders through the shared
 * `<HomeChromeCard variant="hint">` (white surface + brand-rose hairline,
 * so it no longer blurs into the Batch 2 Featured cream band directly below
 * it). The Animated.View exit wrapper, the gate/transition logic, the
 * `saved-area-honesty-hint` / `-title` / `-body` testIDs, the composed a11y
 * label, the brand-rose MapPin + "Update ›" chevron, and the locked "profile
 * location" copy are all preserved.
 */
export function SavedAreaHonestyHint({
  locationContext,
}: SavedAreaHonestyHintProps) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  const areaName = locationContext.locality?.name ?? locationContext.city ?? null
  const eligible = locationContext.source === 'profile' && !!areaName

  const wasEligibleRef = useRef(eligible)
  const [mounted, setMounted] = useState(eligible)

  const opacity   = useSharedValue(eligible ? 1 : 0)
  const translate = useSharedValue(0)

  useEffect(() => {
    // Transition: eligible → not-eligible (source flips 'profile' →
    // 'coordinates' when GPS grants). Reduced-motion: instant unmount.
    if (wasEligibleRef.current && !eligible) {
      if (reducedMotion) {
        setMounted(false)
      } else {
        const handleFinish = () => setMounted(false)
        opacity.value   = withTiming(0,   { duration: EXIT_DURATION_MS, easing: Easing.out(Easing.quad) })
        translate.value = withTiming(-12, { duration: EXIT_DURATION_MS, easing: Easing.out(Easing.quad) }, (finished) => {
          if (finished) runOnJS(handleFinish)()
        })
      }
    }

    // Transition: not-eligible → eligible. No mount animation per the locked
    // contract — set values instantly and remount.
    if (!wasEligibleRef.current && eligible) {
      opacity.value   = 1
      translate.value = 0
      setMounted(true)
    }

    wasEligibleRef.current = eligible
  }, [eligible, reducedMotion, opacity, translate])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translate.value }],
  }))

  if (!mounted) return null

  const displayName = areaName as string

  // §DF Round 5 — status-led label. "profile location" wording is owner-locked.
  const a11yLabel = `Your location is off. Showing offers near ${displayName} from your profile location. Tap to update.`

  return (
    <Animated.View style={animatedStyle}>
      <HomeChromeCard
        variant="hint"
        testID="saved-area-honesty-hint"
        accessibilityLabel={a11yLabel}
        icon={<MapPin size={16} color={color.brandRose} strokeWidth={2.2} />}
        inlineAffordance={{
          label: 'Update',
          onPress: () => router.push('/saved-area' as any),
          icon: <ChevronRight size={16} color={color.brandRose} strokeWidth={2.2} />,
        }}
        body={
          <>
            <Text style={styles.title} testID="saved-area-honesty-hint-title">
              Your location is off
            </Text>
            <Text style={styles.copy} testID="saved-area-honesty-hint-body">
              Showing offers near <Text style={styles.copyEmphasis}>{displayName}</Text> from your profile location.
            </Text>
          </>
        }
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // §DF Round 5 — status title (Lato-SemiBold 16/22 navy) over the body line.
  title: {
    fontSize:   16,
    lineHeight: 22,
    fontFamily: 'Lato-SemiBold',
    color:      color.text.primary,
  },
  copy: {
    fontSize:   14,
    lineHeight: 20,
    fontFamily: 'Lato-Regular',
    color:      color.text.secondary,
  },
  copyEmphasis: {
    fontFamily: 'Lato-SemiBold',
    color:      color.text.primary,
  },
})
