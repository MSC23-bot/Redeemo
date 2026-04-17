import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'

type Props = {
  onRecentre: () => void
  onClearFilters: () => void
  hasFilters: boolean
}

export function MapEmptyArea({ onRecentre, onClearFilters, hasFilters }: Props) {
  return (
    <View style={styles.card}>
      <Text variant="heading.sm" style={styles.title}>
        No merchants in this area
      </Text>
      <Text variant="body.sm" style={styles.description}>
        Try moving the map or clearing your filters to find more merchants.
      </Text>

      <View style={styles.buttons}>
        {/* Re-centre button */}
        <Pressable onPress={onRecentre} accessibilityLabel="Re-centre map" style={styles.reCentreWrapper}>
          <GradientBrand style={styles.reCentreCta}>
            <Text variant="label.lg" style={styles.reCentreText}>
              Re-centre
            </Text>
          </GradientBrand>
        </Pressable>

        {/* Clear Filters button */}
        {hasFilters && (
          <Pressable
            onPress={onClearFilters}
            accessibilityLabel="Clear filters"
            style={styles.clearButton}
          >
            <Text variant="label.lg" style={styles.clearText}>
              Clear Filters
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 100,
    left: spacing[4],
    right: spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
    zIndex: layer.sticky,
    ...elevation.md,
  },
  title: {
    color: color.navy,
    textAlign: 'center',
  },
  description: {
    color: color.text.secondary,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
    marginTop: spacing[1],
  },
  reCentreWrapper: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    flex: 1,
  },
  reCentreCta: {
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
  },
  reCentreText: {
    color: '#FFFFFF',
  },
  clearButton: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: color.border.default,
  },
  clearText: {
    color: color.text.secondary,
  },
})
