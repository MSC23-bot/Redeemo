import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius } from '@/design-system'

// Task F.2 — Spec §8.5 + §11.5.
//
// `<HomeExploreMore>` is the page-bottom soft CTA mounted when supply
// near the user is sparse.  Visual weight is intentionally LOWER than
// `<NearbySectionEmpty>` (this is a gentle nudge, not a friendly empty
// state).  The sparse-supply heuristic + v1.2 dedup mutual exclusion
// with `<NearbySectionEmpty>` and `<HomeNoLocationBanner>` is enforced
// at the HomeScreen level in Task F.3 — this component does not know
// about dedup.
//
// Copy locked from §8.2 phrase library:
//   L11: "Looking for more? Explore offers across Redeemo." (body)
//   L3:  "Explore more on Redeemo" (single primary pill → Search tab)
//
// Visual baseline per §11.5:
//   - Soft pill-style CTA card
//   - Lower visual weight than <NearbySectionEmpty>
//   - Same warm-tinted surface (color.surface.tint)
//   - Smaller padding
//   - Centred content (body + single pill stacked)

export function HomeExploreMore() {
  const router = useRouter()
  return (
    <View style={styles.card} testID="home-explore-more">
      <Text style={styles.body}>
        Looking for more? Explore offers across Redeemo.
      </Text>
      <Pressable
        style={styles.cta}
        onPress={() => router.push('/(app)/search' as any)}
        accessibilityRole="button"
        accessibilityLabel="Explore more on Redeemo"
      >
        <Text style={styles.ctaLabel}>Explore more on Redeemo</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal:  18,
    marginVertical:    spacing[3],
    paddingVertical:   spacing[4],
    paddingHorizontal: spacing[4],
    backgroundColor:   color.surface.tint,
    borderRadius:      radius.lg,
    borderWidth:       1,
    borderColor:       color.border.subtle,
    alignItems:        'center',
  },
  body: {
    fontSize:     14,
    fontFamily:   'Lato-Regular',
    color:        color.text.secondary,
    lineHeight:   20,
    marginBottom: spacing[3],
    textAlign:    'center',
  },
  cta: {
    paddingVertical:   spacing[2],
    paddingHorizontal: spacing[5],
    backgroundColor:   color.navy,
    borderRadius:      radius.md,
  },
  ctaLabel: {
    fontSize:   14,
    fontFamily: 'Lato-SemiBold',
    color:      '#FFFFFF',
  },
})
