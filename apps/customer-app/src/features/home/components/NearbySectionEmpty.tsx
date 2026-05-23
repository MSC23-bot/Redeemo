import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius } from '@/design-system'

// Task E.2 — Spec §8.4 + §11.4.
//
// `<NearbySectionEmpty>` is the section-level friendly empty card mounted
// when `feed.nearbyByCategoryRails.length === 0` AND
// `feed.locationContext.source !== 'none'`.  (The no-location state is
// handled at the top of Home by `<HomeNoLocationBanner>` in Phase F — this
// component does not render on no-location calls.)
//
// Copy locked from §8.2 phrase library:
//   L1: "We're still growing near you"
//   L5: "We're still growing in {City}. Try browsing categories or
//        searching to find offers across the UK."
//        (locality-aware — PR #126 device-QA B.1, owner direction
//         2026-05-23.  Defensive fallback drops the locality clause
//         when cityName is null — only fires defensively because the
//         component is gated on source !== 'none' at the call site.)
//   L6: "Browse all categories" (primary CTA → Categories tab)
//   L7: "Open search"           (secondary CTA → Search tab)
//
// Visual baseline per §11.4:
//   - Cream-tinted card surface (color.surface.tint)
//   - 1px hairline border (color.border.subtle)
//   - No card shadow
//   - Generous internal padding
//   - Two pills side-by-side; the plan accepts vertical stacking on
//     narrow viewports as a later polish.

interface NearbySectionEmptyProps {
  cityName?: string | null
}

export function NearbySectionEmpty({ cityName }: NearbySectionEmptyProps = {}) {
  const router = useRouter()
  const bodyText = cityName
    ? `We're still growing in ${cityName}. Try browsing categories or searching to find offers across the UK.`
    : `Try browsing categories or searching to find offers across the UK.`
  return (
    <View style={styles.card} testID="home-nearby-section-empty">
      <Text style={styles.title}>We&apos;re still growing near you</Text>
      <Text style={styles.body}>{bodyText}</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.primary}
          onPress={() => router.push('/(app)/categories' as any)}
          accessibilityRole="button"
          accessibilityLabel="Browse all categories"
        >
          <Text style={styles.primaryLabel}>Browse all categories</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => router.push('/(app)/search' as any)}
          accessibilityRole="button"
          accessibilityLabel="Open search"
        >
          <Text style={styles.secondaryLabel}>Open search</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal:  18,
    marginVertical:    spacing[3],
    paddingVertical:   spacing[5],
    paddingHorizontal: spacing[5],
    backgroundColor:   color.surface.tint,
    borderRadius:      radius.lg,
    borderWidth:       1,
    borderColor:       color.border.subtle,
  },
  title: {
    fontSize:   18,
    fontFamily: 'MusticaPro-Semibold',
    color:      color.navy,
    marginBottom: spacing[2],
  },
  body: {
    fontSize:   14,
    fontFamily: 'Lato-Regular',
    color:      color.text.secondary,
    lineHeight: 20,
    marginBottom: spacing[4],
  },
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing[2],
  },
  primary: {
    paddingVertical:   spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor:   color.navy,
    borderRadius:      radius.md,
  },
  primaryLabel: {
    fontSize:   14,
    fontFamily: 'Lato-SemiBold',
    color:      '#FFFFFF',
  },
  secondary: {
    paddingVertical:   spacing[2],
    paddingHorizontal: spacing[4],
    backgroundColor:   'transparent',
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       color.navy,
  },
  secondaryLabel: {
    fontSize:   14,
    fontFamily: 'Lato-SemiBold',
    color:      color.navy,
  },
})
