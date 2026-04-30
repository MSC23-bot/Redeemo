import React from 'react'
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'
import { Text, PressableScale, color, spacing, radius } from '@/design-system'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { useCategories } from '@/hooks/useCategories'
import { Category } from '@/lib/api/discovery'

export function AllCategoriesScreen() {
  const router = useRouter()
  const { data, isLoading } = useCategories()

  const topLevelCategories: Category[] = (data?.categories ?? []).filter(
    (c) => c.parentId === null,
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} hapticStyle="light">
          <View style={styles.backButton}>
            <ArrowLeft size={20} color={color.navy} />
          </View>
        </PressableScale>
        <Text variant="heading.md" style={styles.title}>
          All Categories
        </Text>
      </View>

      <FlatList
        data={topLevelCategories}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <FadeIn delay={index * 80}>
            <PressableScale
              onPress={() => router.push(`/category/${item.id}` as any)}
              hapticStyle="light"
            >
              <View style={styles.row}>
                {/* Colored circle with first letter */}
                <View
                  style={[
                    styles.categoryCircle,
                    { backgroundColor: item.pinColour ?? color.brandRose },
                  ]}
                >
                  <Text style={styles.categoryInitial}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Name */}
                <View style={styles.textGroup}>
                  <Text variant="body.sm" style={styles.categoryName}>
                    {item.name}
                  </Text>
                  {/*
                    PR #4 had a "{item.merchantCount} merchants nearby" line
                    here; removed in PR B per owner decision #5 — the field
                    `merchantCount` does not exist on the Plan-1.5 backend
                    response (the schema returns `merchantCountByCity` keyed
                    by city). A proper per-city or roll-up count display can
                    land in a Plan 4 follow-up.
                  */}
                </View>

                <ChevronRight size={18} color={color.text.tertiary} />
              </View>
            </PressableScale>
          </FadeIn>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 18,
    gap: spacing[3],
    paddingBottom: spacing[3],
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: color.navy,
  },
  listContent: {
    paddingBottom: spacing[8],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  categoryCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInitial: {
    fontSize: 18,
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    fontFamily: 'Lato-Bold',
    color: color.navy,
  },
})
