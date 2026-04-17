import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { PressableScale } from '@/design-system/motion/PressableScale'

type Props = {
  category: string
  area: string | null
  nearbyArea?: { name: string; count: number; distance: string } | null
  onExpandSearch: () => void
  onBrowseCategories: () => void
}

export function NoMerchantsState({ category, area, nearbyArea, onExpandSearch, onBrowseCategories }: Props) {
  return (
    <View style={styles.container}>
      {/* Icon */}
      <MapPin size={40} color={color.text.tertiary} />

      {/* Heading */}
      <Text variant="heading.md" color="primary" align="center">
        No {category} merchants nearby
      </Text>

      {/* Description */}
      <Text variant="body.sm" color="secondary" align="center">
        We don't have any {category} merchants in {area ?? 'your area'} yet, but we're growing fast!
      </Text>

      {/* Nearby area card */}
      {nearbyArea && (
        <View style={styles.nearbyCard}>
          <Text variant="label.lg" color="primary" align="center">
            {nearbyArea.count} merchants in {nearbyArea.name}
          </Text>
          <Text variant="body.sm" color="secondary" align="center">
            {nearbyArea.distance} away
          </Text>
        </View>
      )}

      {/* CTAs */}
      <View style={styles.ctaContainer}>
        <PressableScale
          onPress={onExpandSearch}
          accessibilityRole="button"
          accessibilityLabel="Expand search area"
          style={styles.ctaFullWidth}
        >
          <GradientBrand style={styles.primaryButton}>
            <Text variant="label.lg" color="inverse">
              Expand search area
            </Text>
          </GradientBrand>
        </PressableScale>

        <PressableScale
          onPress={onBrowseCategories}
          accessibilityRole="button"
          accessibilityLabel="Browse other categories"
          style={styles.ctaFullWidth}
        >
          <View style={styles.secondaryButton}>
            <Text variant="label.lg" color="primary">
              Browse other categories
            </Text>
          </View>
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[8],
    gap: spacing[3],
  },
  nearbyCard: {
    backgroundColor: color.surface.neutral,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    alignItems: 'center',
    gap: spacing[1],
    alignSelf: 'stretch',
  },
  ctaContainer: {
    alignSelf: 'stretch',
    gap: spacing[3],
  },
  ctaFullWidth: {
    alignSelf: 'stretch',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    backgroundColor: color.surface.page,
    borderWidth: 1,
    borderColor: color.navy,
  },
})
