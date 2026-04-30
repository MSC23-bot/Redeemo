import React from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text } from '@/design-system/Text'

const TRENDING_TAGS = ['Pizza', 'Brunch', 'Nail salon', 'Barber', 'Gym', 'Coffee']

type Props = {
  onTagPress: (tag: string) => void
}

function BoltIcon({ size = 12, color = '#D97706' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </Svg>
  )
}

export function TrendingSearches({ onTagPress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BoltIcon size={12} color="#D97706" />
        <Text style={styles.headerText}>Trending</Text>
      </View>
      <View style={styles.tagsRow}>
        {TRENDING_TAGS.map((tag, i) => (
          <TouchableOpacity
            key={tag}
            onPress={() => onTagPress(tag)}
            activeOpacity={0.7}
            style={styles.tag}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${tag}`}
          >
            {i === 0 && (
              <BoltIcon size={10} color="#D97706" />
            )}
            <Text style={styles.tagText}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 11,
    fontFamily: 'Lato-Bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Lato-SemiBold',
    color: '#374151',
  },
})
