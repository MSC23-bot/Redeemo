import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Text } from '@/design-system/Text'

// PR #112 fixup-6.4 (2026-05-20) — owner-locked copy refresh.  All states
// use Redeemo-persona language: confident, plain-spoken, British English,
// no em dashes.  Banned wording (regression-pinned in tests):
//   - "Nothing for X..."         — owner direction: avoid `nothing`.
//   - "in the UK"                — implies regional limit / dead end.
//   - "come back soon" / "check back soon" — sounds like a dead end.
//   - em dashes / double dashes.
//
// State machine:
//   reason='none'              → user searched, predicate matched no rows
//   reason='no_uk_supply'      → no platform supply for the query
//   reason='pre_search'        → user hasn't typed yet; render this above
//                                <TrendingSearches> as a discovery prompt
//   reason='no_location'       → Plan 4 M4.6 — no q + no GPS + no saved
//                                area.  Prompts the user to set their
//                                area via PC2; renders the CTA button.
//                                Wired via the optional `onSetArea`
//                                prop so the screen owns the router push.
//   reason='expanded_to_wider' → component renders nothing; the unified
//                                result header carries the locality-aware
//                                "Closest matches for X near Y" copy
//
// Animated illustration slot is reserved here for §CH (deferred — Motion
// + 21st.dev tooling).  The empty <View> above the title is the mount
// slot; when assets land, an <Illustration reason={reason} /> renders
// there.

type EmptyStateReason = 'none' | 'no_uk_supply' | 'expanded_to_wider' | 'pre_search' | 'no_location'

type Props = {
  reason: EmptyStateReason | null | undefined
  query?: string
  /**
   * Plan 4 M4.6 — only consulted when `reason === 'no_location'` AND
   * `savedAreaCity` is null.  Parent screen routes to the Saved Area
   * surface (post-§DF this is `/saved-area`, NOT the PC2-address
   * flow — see §DF ).  Component-side presentation-only.
   */
  onSetArea?: () => void
  /**
   * §DF — profile-aware variant trigger.  When the user
   * has a saved postcode, the `no_location` empty state must swap to
   * the dual-CTA "searching near your saved area" framing instead of
   * the "Set your area" prompt (which is misleading — the user
   * already HAS a saved area).  Pass the resolved area label
   * (`locality.name ?? city`) or `null` if no saved area exists.
   */
  savedAreaCity?: string | null
  /**
   * §DF — fires when the user taps "Use current
   * location" on the profile-aware variant.  Parent screen wires this
   * to `useUserLocation().request()`, which routes through the
   * LocationPermissionProvider explainer + recovery sheets per Task 5.
   */
  onUseCurrentLocation?: () => void
  /**
   * §DF — fires when the user taps "Change saved area"
   * on the profile-aware variant.  Parent screen routes to
   * `/saved-area`.
   */
  onChangeSavedArea?: () => void
}

function trimmed(q?: string): string | null {
  if (!q) return null
  const t = q.trim()
  return t.length > 0 ? t : null
}

export function SearchEmptyState({
  reason,
  query,
  onSetArea,
  savedAreaCity,
  onUseCurrentLocation,
  onChangeSavedArea,
}: Props) {
  if (!reason || reason === 'expanded_to_wider') return null

  const q = trimmed(query)

  // §DF — profile-aware variant of the no_location
  // case.  When the user has a saved postcode, the message + CTAs
  // change to acknowledge the saved area + offer two productive
  // actions (enable GPS / change saved area) instead of the
  // misleading "Set your area" prompt.  Pre-fix the no_location
  // copy hard-coded the prompt that assumes no saved area, which
  // was wrong for users who DID have a saved area but were
  // searching with location off.
  const isNoLocationWithSavedArea =
    reason === 'no_location' && !!savedAreaCity

  const { title, body } = (() => {
    switch (reason) {
      case 'pre_search':
        return {
          title: 'Find your next local saving',
          body:  'Search restaurants, cafés, salons, gyms and more.',
        }
      case 'no_location':
        if (isNoLocationWithSavedArea) {
          return {
            title: `Searching near ${savedAreaCity} from your saved location`,
            body:  'Turn on location for the most accurate nearby offers, or change your saved location.',
          }
        }
        return {
          title: 'Set your area to see offers near you.',
          body:  'We use your area to show offers nearby.',
        }
      case 'no_uk_supply':
        return q
          ? {
              title: `We could not find a match for "${q}"`,
              body:  'Try another search, or explore what is available near you.',
            }
          : {
              title: 'We could not find a match',
              body:  'Try another search, or explore what is available near you.',
            }
      case 'none':
      default:
        return q
          ? {
              title: `No exact matches for "${q}"`,
              body:  'Try a different keyword, or browse nearby categories.',
            }
          : {
              title: 'No exact matches',
              body:  'Try a different keyword, or browse nearby categories.',
            }
    }
  })()

  return (
    <View
      style={reason === 'pre_search' ? styles.containerPreSearch : styles.container}
      testID={`search-empty-${reason}`}
    >
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {body}
      </Text>
      {/*
        §DF — dual CTA stack for the profile-aware
        no_location variant.  "Use current location" routes through
        the LocationPermissionProvider explainer + recovery sheets.
        "Change saved area" routes to /saved-area.
      */}
      {reason === 'no_location' && isNoLocationWithSavedArea && (
        <View style={styles.dualCtaStack}>
          {onUseCurrentLocation && (
            <Pressable
              style={styles.setAreaButton}
              onPress={onUseCurrentLocation}
              accessibilityRole="button"
              accessibilityLabel="Use current location"
              testID="search-empty-no-location-use-current"
            >
              <Text style={styles.setAreaButtonText}>Use current location</Text>
            </Pressable>
          )}
          {onChangeSavedArea && (
            <Pressable
              style={styles.changeSavedAreaButton}
              onPress={onChangeSavedArea}
              accessibilityRole="button"
              accessibilityLabel="Change saved location"
              testID="search-empty-no-location-change-saved"
            >
              <Text style={styles.changeSavedAreaButtonText}>Change saved location</Text>
            </Pressable>
          )}
        </View>
      )}
      {/* No-saved-area variant retains the existing single-CTA path. */}
      {reason === 'no_location' && !isNoLocationWithSavedArea && onSetArea && (
        <Pressable
          style={styles.setAreaButton}
          onPress={onSetArea}
          accessibilityRole="button"
          accessibilityLabel="Set my area"
          testID="search-empty-no-location-cta"
        >
          <Text style={styles.setAreaButtonText}>Set my area</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop:        48,
    paddingBottom:     32,
    alignItems:        'center',
  },
  // Pre-search variant sits above <TrendingSearches>, so it uses tighter
  // top padding (the search bar above already provides breathing room).
  containerPreSearch: {
    paddingHorizontal: 28,
    paddingTop:        24,
    paddingBottom:     16,
    alignItems:        'center',
  },
  title: {
    fontSize:    18,                // heading.md
    fontFamily:  'Lato-SemiBold',
    color:       '#010C35',         // text.primary navy
    lineHeight:  24,
    textAlign:   'center',
    marginBottom: 6,
  },
  body: {
    fontSize:   14,                 // body.sm
    fontFamily: 'Lato-Regular',
    color:      '#4B5563',          // text.secondary
    lineHeight: 20,
    textAlign:  'center',
  },
  // Plan 4 M4.6 — small branded CTA for the no_location prompt.
  setAreaButton: {
    marginTop:       16,
    paddingHorizontal: 18,
    paddingVertical:   10,
    borderRadius:    24,
    backgroundColor: '#010C35',   // navy
  },
  setAreaButtonText: {
    fontSize:    14,               // label.md
    fontFamily:  'Lato-SemiBold',
    color:       '#FFFFFF',
    textAlign:   'center',
  },
  // §DF — dual-CTA stack for the profile-aware
  // no_location variant.  Vertical stack centred under the body
  // copy, modest gap so both buttons feel equally weighted.  The
  // secondary "Change saved area" is a ghost variant so it doesn't
  // compete with the primary navy "Use current location".
  dualCtaStack: {
    marginTop:    16,
    alignItems:   'center',
    gap:          10,
  },
  changeSavedAreaButton: {
    paddingHorizontal: 18,
    paddingVertical:   10,
    borderRadius:    24,
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     '#010C35',
  },
  changeSavedAreaButtonText: {
    fontSize:    14,
    fontFamily:  'Lato-SemiBold',
    color:       '#010C35',
    textAlign:   'center',
  },
})
