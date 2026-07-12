import React from 'react'
import { ScrollView, View, Pressable, StyleSheet } from 'react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  activeId: string | null
  onSelect: (id: string | null) => void
}

function getCategoryColor(category: Category): string {
  return category.pinColour ?? color.brandRose
}

/**
 * Map Phase 2 S5a (GRILL Q4) — category pills gain a tap-to-reveal
 * subcategory drill-down. Tapping a top-level pill both selects it
 * (unchanged behaviour — `onSelect(cat.id)`, MapScreen's existing
 * tap-same-clears / tap-different-promotes toggle in `handleSelectCategory`
 * is untouched) AND, when that category has children, reveals a lighter
 * second row beneath: its subcategories plus an "All <Parent>" pill to
 * widen back out. The row collapses on its own the moment `activeId`
 * stops resolving to that top-level — no separate expand/collapse state
 * needed, since selection already IS the reveal trigger (map stays clean
 * at rest per the design brief: nothing selected → no second row).
 *
 * `activeId` can be either a top-level id OR a subcategory id (the same
 * FilterState.categoryId contract FilterSheet uses) — the top-level
 * ancestor is resolved by walking `parentId` so a subcategory picked
 * here OR inside FilterSheet keeps both surfaces' pill highlighting in
 * sync (verifies the drill writes through the same `filters.categoryId`
 * state FilterSheet's own amenity eligibility already keys off).
 */
export function MapCategoryPills({ categories, activeId, onSelect }: Props) {
  // Top-levels only for the primary row — `useCategories()` returns
  // top-levels + subcategories flattened. Mirrors CategoryGrid's
  // `categories.filter((c) => c.parentId === null)`.
  const topLevel = categories.filter((c) => c.parentId === null)

  const activeCategory  = activeId ? categories.find((c) => c.id === activeId) ?? null : null
  const activeTopLevelId = activeCategory ? (activeCategory.parentId ?? activeCategory.id) : null
  const expandedTopLevel = activeTopLevelId
    ? topLevel.find((c) => c.id === activeTopLevelId) ?? null
    : null
  const children = expandedTopLevel
    ? categories.filter((c) => c.parentId === expandedTopLevel.id)
    : []

  return (
    <View>
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

        {topLevel.map((cat) => {
          // Reads "active" when THIS top-level OR one of its own children
          // is selected — otherwise drilling into "Italian" would leave
          // the "Food & Drink" pill looking unselected while its child
          // row sits open beneath it.
          const isActive = activeTopLevelId === cat.id
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

      {/* Subcategory drill-down — lighter row (outlined pills, no
          elevation) so it reads as a secondary, narrower refinement of
          the primary row above rather than a second peer row. */}
      {expandedTopLevel && children.length > 0 && (
        <FadeInDown duration={160}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subContainer}
            accessibilityRole="tablist"
          >
            <Pressable
              onPress={() => onSelect(expandedTopLevel!.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeId === expandedTopLevel.id }}
              accessibilityLabel={`All ${expandedTopLevel.name}`}
              style={[styles.subPill, activeId === expandedTopLevel.id && styles.subPillActive]}
            >
              <Text
                variant="label.md"
                style={[styles.subPillText, activeId === expandedTopLevel.id && styles.subPillTextActive]}
              >
                {`All ${expandedTopLevel.name}`}
              </Text>
            </Pressable>

            {children.map((sub) => {
              const isActive = activeId === sub.id
              return (
                <Pressable
                  key={sub.id}
                  onPress={() => onSelect(sub.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={sub.name}
                  style={[styles.subPill, isActive && styles.subPillActive]}
                >
                  <Text
                    variant="label.md"
                    style={[styles.subPillText, isActive && styles.subPillTextActive]}
                  >
                    {sub.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </FadeInDown>
      )}
    </View>
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
  subContainer: {
    flexDirection:     'row',
    paddingHorizontal: spacing[4],
    paddingBottom:     spacing[2],
    gap:               spacing[1] + 2,
    alignItems:        'center',
  },
  subPill: {
    backgroundColor:   'rgba(255,255,255,0.72)',
    borderRadius:      radius.pill,
    borderWidth:       1,
    borderColor:       color.border.default,
    paddingHorizontal: spacing[3],
    paddingVertical:   spacing[1],
  },
  subPillActive: {
    backgroundColor: color.navy,
    borderColor:     color.navy,
  },
  subPillText: {
    fontFamily: 'Lato-Medium',
    fontSize:   11,
    color:      color.text.secondary,
  },
  subPillTextActive: {
    color: '#FFFFFF',
  },
})
