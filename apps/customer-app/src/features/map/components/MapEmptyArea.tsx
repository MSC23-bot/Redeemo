import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'

/**
 * Three-case Map empty state. Driven by:
 *   1. `viewport_empty`  — viewport has no merchants but UK supply exists
 *                          for the active filter. CTA: pan/recentre.
 *   2. `no_uk_supply`    — backend `meta.emptyStateReason === 'no_uk_supply'`.
 *                          No CTA mentions filters by default; surface clear-
 *                          filters when the user has narrowed the query.
 *   3. `offshore`        — bbox sits outside UK extent (lat 49.8–60.9,
 *                          lng -8.2–1.8). CTA: recentre to UK.
 *
 * MapScreen computes the case before rendering — this component only owns
 * copy + layout. Component is presentational; bbox classification stays
 * in the screen so tests can drive it deterministically.
 */
export type MapEmptyCase = 'viewport_empty' | 'no_uk_supply' | 'offshore'

type Props = {
  variant:         MapEmptyCase
  onRecentre:      () => void
  onClearFilters?: () => void
  hasFilters?:     boolean
}

const COPY: Record<MapEmptyCase, { title: string; body: string; primaryCta: string }> = {
  viewport_empty: {
    title:      'No merchants in this area',
    body:       'Try moving the map or recentring to find more merchants.',
    primaryCta: 'Re-centre',
  },
  no_uk_supply: {
    title:      'No matches in the UK yet',
    body:       'We’re growing daily — try a different category or clear filters.',
    primaryCta: 'Re-centre',
  },
  offshore: {
    title:      'Map is outside the UK',
    body:       'Redeemo is UK-only right now. Recentre to the UK to keep browsing.',
    primaryCta: 'Recentre to UK',
  },
}

export function MapEmptyArea({
  variant,
  onRecentre,
  onClearFilters,
  hasFilters = false,
}: Props) {
  const copy = COPY[variant]
  const showClear = hasFilters && variant !== 'offshore' && onClearFilters !== undefined

  return (
    <View style={styles.card} accessibilityLabel={`Empty state: ${copy.title}`}>
      <Text variant="heading.sm" style={styles.title}>
        {copy.title}
      </Text>
      <Text variant="body.sm" style={styles.description}>
        {copy.body}
      </Text>

      <View style={styles.buttons}>
        <Pressable
          onPress={onRecentre}
          accessibilityLabel={copy.primaryCta}
          style={styles.reCentreWrapper}
        >
          <GradientBrand style={styles.reCentreCta}>
            <Text variant="label.lg" style={styles.reCentreText}>
              {copy.primaryCta}
            </Text>
          </GradientBrand>
        </Pressable>

        {showClear && (
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
    position:        'absolute',
    bottom:          100,
    left:            spacing[4],
    right:           spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius:    radius.lg,
    padding:         spacing[4],
    gap:             spacing[3],
    zIndex:          layer.sticky,
    ...elevation.md,
  },
  title: {
    color:     color.navy,
    textAlign: 'center',
  },
  description: {
    color:     color.text.secondary,
    textAlign: 'center',
  },
  buttons: {
    flexDirection:  'row',
    gap:            spacing[3],
    justifyContent: 'center',
    marginTop:      spacing[1],
  },
  reCentreWrapper: {
    borderRadius: radius.xl,
    overflow:     'hidden',
    flex:         1,
  },
  reCentreCta: {
    paddingVertical: spacing[3],
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    radius.xl,
  },
  reCentreText: {
    color: '#FFFFFF',
  },
  clearButton: {
    flex:            1,
    paddingVertical: spacing[3],
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    radius.xl,
    borderWidth:     1.5,
    borderColor:     color.border.default,
  },
  clearText: {
    color: color.text.secondary,
  },
})
