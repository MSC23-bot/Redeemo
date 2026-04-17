import React from 'react'
import { View } from 'react-native'
import { Grid3X3 } from 'lucide-react-native'
import { Text, color, spacing, PressableScale } from '@/design-system'
import { type Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  onCategoryPress: (id: string) => void
  onMorePress: () => void
}

const CIRCLE_SIZE = 56

export function CategoryGrid({ categories, onCategoryPress, onMorePress }: Props) {
  // Filter to top-level categories (no parentId) and take up to 5
  const topLevel = categories.filter((c) => c.parentId === null).slice(0, 5)

  const tiles: Array<
    | { type: 'category'; category: Category }
    | { type: 'more' }
  > = [
    ...topLevel.map((c) => ({ type: 'category' as const, category: c })),
    { type: 'more' },
  ]

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 18,
      }}
    >
      {tiles.map((tile, index) => {
        if (tile.type === 'more') {
          return (
            <PressableScale
              key="more"
              onPress={onMorePress}
              accessibilityLabel="More categories"
              style={{ width: '33.33%', alignItems: 'center', paddingVertical: spacing[3] }}
            >
              <View
                style={{
                  width: CIRCLE_SIZE,
                  height: CIRCLE_SIZE,
                  borderRadius: CIRCLE_SIZE / 2,
                  backgroundColor: color.navy,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: spacing[1],
                }}
              >
                <Grid3X3 size={22} color="#FFFFFF" />
              </View>
              <Text
                variant="body.sm"
                style={{ fontSize: 11, color: color.navy, textAlign: 'center' }}
              >
                More
              </Text>
            </PressableScale>
          )
        }

        const { category } = tile
        const circleColor = category.pinColour ?? color.brandRose
        const letter = category.name.charAt(0).toUpperCase()

        return (
          <PressableScale
            key={category.id}
            onPress={() => onCategoryPress(category.id)}
            accessibilityLabel={`${category.name} category`}
            style={{ width: '33.33%', alignItems: 'center', paddingVertical: spacing[3] }}
          >
            <View
              style={{
                width: CIRCLE_SIZE,
                height: CIRCLE_SIZE,
                borderRadius: CIRCLE_SIZE / 2,
                backgroundColor: circleColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing[1],
              }}
            >
              <Text
                variant="heading.md"
                style={{ color: '#FFFFFF', fontSize: 22 }}
              >
                {letter}
              </Text>
            </View>
            <Text
              variant="body.sm"
              style={{ fontSize: 11, color: color.navy, textAlign: 'center' }}
              numberOfLines={2}
            >
              {category.name}
            </Text>
          </PressableScale>
        )
      })}
    </View>
  )
}
