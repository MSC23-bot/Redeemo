import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Pressable, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius } from '@/design-system'
import { MapPin, ChevronRight } from '@/design-system/icons'
import type { LocationContext } from '@/lib/api/discovery'

interface SavedAreaHonestyHintProps {
  locationContext: LocationContext
}

const EXIT_DURATION_MS = 300

/**
 * `<SavedAreaHonestyHint>` — Home-only honesty hint banner that surfaces
 * when the backend resolved Discovery against the user's SAVED_PROFILE
 * postcode (not live GPS).  Locked spec §6.2 (2026-05-24-postcode-
 * profile-fallback-design v1.1).
 *
 * Render gates (locked):
 *   • Only mounts when `locationContext.source === 'profile'`.
 *   • Hidden when `source === 'coordinates'` or `'none'`.
 *   • Hidden when neither `locality.name` nor `city` resolves — the hint
 *     would otherwise read "Showing offers near undefined", which is
 *     worse than no hint at all.
 *
 * Tap target: whole row + chevron route to `/saved-area`.  Task 7
 * (immediately after this task on the same branch) lands that route file;
 * Task 6 just `router.push('/saved-area')` knowing it's coming.
 *
 * Animation contract (locked):
 *   • No mount animation — avoid drawing attention to a fallback state.
 *   • Slide up + fade out on `source` transition `'profile' → 'coordinates'`
 *     (300ms ease-out) when GPS grants.
 *   • Reduced-motion: instant hide.
 *
 * Visual baseline (locked):
 *   • Cream-tinted background (`color.surface.tint`).
 *   • 1px brand-rose hairline border.
 *   • body.sm copy.
 *   • Brand-rose pin + chevron icons.
 *   • No card shadow.
 *   • Sits flush below top safe-area, above Featured rail.
 */
export function SavedAreaHonestyHint({
  locationContext,
}: SavedAreaHonestyHintProps) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  // Resolve the displayed area name with the spec-locked fallback ladder:
  // locality.name first (richer, more specific), then city.  When neither
  // resolves we render nothing — see hidden-when-no-area test pin.
  const areaName = locationContext.locality?.name ?? locationContext.city ?? null

  // Should the hint currently be eligible to appear?  Gate ALL three:
  //   1. source must be 'profile' (the only state that warrants disclosure).
  //   2. areaName must resolve (avoid "Showing offers near undefined").
  const eligible = locationContext.source === 'profile' && !!areaName

  // Track previous eligibility so a 'profile' → 'coordinates' transition
  // can trigger the slide-up exit before unmount.  Initial render trusts
  // `eligible` as the steady state; mounted is true iff eligible OR
  // we're currently animating-out from a previously-eligible mount.
  const wasEligibleRef = useRef(eligible)
  const [mounted, setMounted] = useState(eligible)

  const opacity   = useSharedValue(eligible ? 1 : 0)
  const translate = useSharedValue(0)

  useEffect(() => {
    // Transition: eligible → not-eligible (e.g. source flips 'profile' →
    // 'coordinates' when GPS grants).  Reduced-motion: instant unmount.
    // Otherwise slide up + fade out for EXIT_DURATION_MS then unmount.
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

    // Transition: not-eligible → eligible.  No mount animation per the
    // locked contract — set values instantly and remount.
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

  // areaName is non-null when eligible; the conditional above retains the
  // last-known value during the exit animation window.  Cast narrows the
  // type without a runtime guard.
  const displayName = areaName as string

  // §DF device-QA Round 4 — owner-locked copy refresh.  Round 3
  // shipped "Location is off — showing offers near {city} from your
  // saved location."  Two issues: (1) the em dash violated the
  // DESIGN.md "no em dashes anywhere in UI copy" rule; (2) the
  // construction read as two clauses awkwardly joined.
  //
  // Round 4 locked replacement: "Showing offers near {city} while
  // location is off."  Single sentence, single use of "location",
  // 8 words.  The "while location is off" suffix carries the same
  // disclosure as the previous lead clause without the em dash and
  // without the awkward two-clause structure.
  const a11yLabel = `Showing offers near ${displayName} while location is off. Tap to update.`

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        testID="saved-area-honesty-hint"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={() => router.push('/saved-area' as any)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.iconWrap}>
          <MapPin size={16} color={color.brandRose} strokeWidth={2.2} />
        </View>
        <View style={styles.copyWrap}>
          <Text style={styles.copy}>
            Showing offers near <Text style={styles.copyEmphasis}>{displayName}</Text> while location is off.
          </Text>
        </View>
        <View style={styles.updateWrap}>
          <Text style={styles.updateLabel}>Update</Text>
          <ChevronRight size={16} color={color.brandRose} strokeWidth={2.2} />
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    marginHorizontal:  18,
    marginTop:         spacing[2],
    marginBottom:      spacing[2],
    paddingVertical:   spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor:   color.surface.tint,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       color.brandRose,
    gap:               spacing[2],
  },
  rowPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width:           20,
    height:          20,
    alignItems:      'center',
    justifyContent:  'center',
  },
  copyWrap: {
    flex: 1,
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
  updateWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing[1],
  },
  updateLabel: {
    fontSize:   14,
    fontFamily: 'Lato-SemiBold',
    color:      color.brandRose,
  },
})
