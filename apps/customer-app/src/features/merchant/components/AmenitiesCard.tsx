import React from 'react'
import { View, StyleSheet } from 'react-native'
import { CheckCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import type { Amenity } from '@/lib/api/merchant'

type Props = {
  amenities: Amenity[]
}

export function AmenitiesCard({ amenities }: Props) {
  if (amenities.length === 0) return null

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <CheckCircle size={16} color={color.brandRose} />
        <Text variant="heading.sm" style={styles.title}>Amenities</Text>
      </View>
      <View style={styles.grid}>
        {amenities.map(a => (
          <View key={a.id} style={styles.item}>
            <View style={styles.iconBox}>
              <CheckCircle size={15} color={color.brandRose} />
            </View>
            <Text variant="label.md" style={styles.label}>{a.name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '47%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFF9F5',
    borderWidth: 1,
    borderColor: '#F0EBE6',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(226,12,4,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#010C35',
    flexShrink: 1,
  },
})
