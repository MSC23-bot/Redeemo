import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPin, X } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'

type Props = {
  cityName: string
  onDismiss: () => void
}

export function LocationBadge({ cityName, onDismiss }: Props) {
  return (
    <View style={styles.badge}>
      <MapPin size={14} color="#FFFFFF" />
      <Text variant="label.lg" style={styles.text}>
        {cityName}
      </Text>
      <Pressable
        onPress={onDismiss}
        accessibilityLabel={`Remove ${cityName} location filter`}
        hitSlop={8}
      >
        <X size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 2,
    backgroundColor: color.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    alignSelf: 'flex-start',
    ...elevation.sm,
  },
  text: {
    color: '#FFFFFF',
  },
})
