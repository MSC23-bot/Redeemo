import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'

// Task F.1 — Spec §8.6 + §11.3.
//
// `<HomeNoLocationBanner>` is the top-of-Home banner mounted when
// `feed.locationContext.source === 'none'`.  HomeScreen wiring is Task
// F.3 — this component does not check the location source itself.
//
// Copy locked from §8.2 phrase library:
//   L4:  "Set your area to see nearby offers" (headline)
//   L8:  "Allow location or set your saved area so we can show you
//         what's nearby." (body)
//   L9:  "Allow location" (primary CTA → useUserLocation().requestPermission)
//   L10: "Set my area"    (secondary CTA → PC2 address screen)
//
// Visual baseline per §11.3:
//   - Prominent warm-tinted card surface (color.surface.tint)
//   - 1px hairline border (color.border.subtle)
//   - Larger padding than <NearbySectionEmpty> (this banner is the
//     primary nudge for the no-location state)
//   - Full-width
//   - NOT sticky in v1 (sticky deferred to §DA)

export function HomeNoLocationBanner() {
  const router = useRouter()
  const { requestPermission } = useUserLocation()
  return (
    <View style={styles.card} testID="home-no-location-banner">
      <Text style={styles.title}>Set your area to see nearby offers</Text>
      <Text style={styles.body}>
        Allow location or set your saved area so we can show you what&apos;s nearby.
      </Text>
      <View style={styles.row}>
        <Pressable
          style={styles.primary}
          onPress={() => {
            requestPermission()
          }}
          accessibilityRole="button"
          accessibilityLabel="Allow location"
        >
          <Text style={styles.primaryLabel}>Allow location</Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          onPress={() => router.push('/(auth)/profile-completion/address' as any)}
          accessibilityRole="button"
          accessibilityLabel="Set my area"
        >
          <Text style={styles.secondaryLabel}>Set my area</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal:  18,
    marginVertical:    spacing[3],
    paddingVertical:   spacing[6],
    paddingHorizontal: spacing[5],
    backgroundColor:   color.surface.tint,
    borderRadius:      radius.lg,
    borderWidth:       1,
    borderColor:       color.border.subtle,
  },
  title: {
    fontSize:     20,
    fontFamily:   'MusticaPro-Semibold',
    color:        color.navy,
    marginBottom: spacing[2],
  },
  body: {
    fontSize:     14,
    fontFamily:   'Lato-Regular',
    color:        color.text.secondary,
    lineHeight:   20,
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
