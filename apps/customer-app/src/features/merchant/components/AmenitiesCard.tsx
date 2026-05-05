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
        <CheckCircle size={18} color={color.brandRose} />
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
  // Round 5 §5 (impeccable polish):
  //   • borderRadius 16 → 18 (system consistency).
  //   • Title 15pt 800 → 16pt 700.
  //   • Item bg `#FFF9F5` (warm cream from the prior cream-page
  //     era) → `#FAFAF7` (neutral pale). Round 4 §8 made the body
  //     pure white; the warm-cream tint clashed with that. Item
  //     border `#F0EBE6` → `rgba(0,0,0,0.05)` neutral.
  //   • Item paddingVertical 8 → 10 — slight breathing room bump.
  //   • Label fontSize 11 → 12, fontWeight 600 → 600 (kept) for
  //     improved readability while staying secondary to titles.
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '47%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FAFAF7',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(226,12,4,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Round 5 §19: 12 → 13pt with letterSpacing -0.1 for refinement.
  // "Wi-Fi" / "Outdoor Seating" / etc. read more clearly.
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#010C35',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
})
