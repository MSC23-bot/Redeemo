import React from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { Zap } from 'lucide-react-native'
import { Text, PressableScale, color, spacing, radius } from '@/design-system'

const TRENDING_TAGS = ['Pizza', 'Brunch', 'Nail salon', 'Barber', 'Gym', 'Coffee']

type Props = {
  onTagPress: (tag: string) => void
}

export function TrendingSearches({ onTagPress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Zap size={14} color="#F59E0B" fill="#F59E0B" />
        <Text variant="label.eyebrow" color="secondary">
          Trending
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagsRow}
      >
        {TRENDING_TAGS.map((tag) => (
          <PressableScale key={tag} onPress={() => onTagPress(tag)} hapticStyle="light">
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
    paddingTop: spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: 18,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: 18,
    flexWrap: 'nowrap',
  },
  tag: {
    backgroundColor: color.surface.neutral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  tagText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: color.navy,
  },
})
