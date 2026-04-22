import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius, layer } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'

type Props = {
  onEnable: () => void
  onSkip: () => void
}

export function LocationPermission({ onEnable, onSkip }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* Icon */}
        <View style={styles.iconWrapper}>
          <MapPin size={48} color={color.brandRose} />
        </View>

        {/* Heading */}
        <Text variant="heading.lg" style={styles.heading}>
          Find merchants near you
        </Text>

        {/* Description */}
        <Text variant="body.sm" style={styles.description}>
          Enable location to discover exclusive voucher offers from local businesses in your area.
        </Text>

        {/* Enable Location CTA */}
        <Pressable onPress={onEnable} accessibilityLabel="Enable Location" style={styles.ctaWrapper}>
          <GradientBrand style={styles.cta}>
            <Text variant="heading.sm" style={styles.ctaText}>
              Enable Location
            </Text>
          </GradientBrand>
        </Pressable>

        {/* Skip link */}
        <Pressable onPress={onSkip} accessibilityLabel="Browse without location" style={styles.skipWrapper}>
          <Text variant="label.lg" style={styles.skipText}>
            Browse without location
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 249, 245, 0.95)',
    zIndex: layer.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: spacing[4],
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FEF6F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  heading: {
    color: color.navy,
    textAlign: 'center',
  },
  description: {
    color: color.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaWrapper: {
    width: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  cta: {
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
  },
  ctaText: {
    color: '#FFFFFF',
  },
  skipWrapper: {
    paddingVertical: spacing[2],
  },
  skipText: {
    color: color.text.secondary,
    textDecorationLine: 'underline',
  },
})
