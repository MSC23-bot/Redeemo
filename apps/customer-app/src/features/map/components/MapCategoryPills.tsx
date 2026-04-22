import React from 'react'
import { ScrollView, View, Pressable, StyleSheet } from 'react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  activeId: string | null
  onSelect: (id: string | null) => void
}

function getCategoryColor(category: Category): string {
  return category.pinColour ?? color.brandRose
}

export function MapCategoryPills({ categories, activeId, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      accessibilityRole="tablist"
    >
      {/* All pill */}
      <Pressable
        onPress={() => onSelect(null)}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeId === null }}
        accessibilityLabel="All categories"
        style={[styles.pill, activeId === null && styles.pillActive]}
      >
        <Text
          variant="label.md"
          style={[styles.pillText, activeId === null && styles.pillTextActive]}
        >
          All
        </Text>
      </Pressable>

      {categories.map((cat) => {
        const isActive = activeId === cat.id
        const dotColor = getCategoryColor(cat)
        return (
          <Pressable
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={cat.name}
            style={[styles.pill, isActive && { backgroundColor: dotColor }]}
          >
            {!isActive && (
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
            )}
            <Text
              variant="label.md"
              style={[styles.pillText, isActive && styles.pillTextActive]}
            >
              {cat.name}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    gap: 6,
    ...elevation.sm,
  },
  pillActive: {
    backgroundColor: color.brandRose,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 12,
    color: color.text.primary,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
})
