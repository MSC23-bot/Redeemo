import React, { useState, useMemo } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { useSearch } from '@/hooks/useSearch'
import { useCategories } from '@/hooks/useCategories'
import { useCategoryMerchants } from '@/hooks/useCategoryMerchants'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { ScopePillRow, type Scope } from '@/features/shared/ScopePillRow'
import { EmptyStateMessage } from '@/features/shared/EmptyStateMessage'
import { FilterSheet, FilterState } from '../components/FilterSheet'

/**
 * CategoryResultsScreen — Hybrid hook strategy (PR B Milestone 4, Option A).
 *
 * The backend route `/categories/:id/merchants` (consumed by
 * `useCategoryMerchants`) supports ONLY scope/lat/lng/limit/offset. It does
 * NOT accept sortBy / voucherTypes / amenityIds / openNow. To preserve
 * intent-aware ranking on the default unfiltered view AND let users apply
 * filters without losing functionality, the screen runs BOTH hooks
 * simultaneously and selects the active dataset based on whether non-scope
 * filters are present:
 *
 *   - hasNonScopeFilters === false  → useCategoryMerchants is enabled
 *                                     (intent-aware ranking; LOCAL/MIXED/
 *                                     DESTINATION ladder respected)
 *
 *   - hasNonScopeFilters === true   → useSearch({ categoryId, ...filters })
 *                                     is enabled (full filter capability,
 *                                     defaults to LOCAL intent for free-text
 *                                     so DESTINATION categories lose the
 *                                     quality-aware ranking when filtered)
 *
 * Both hooks always execute (React rules-of-hooks). The `enabled` flag plus
 * a null id controls which actually fetches. Output shapes are compatible:
 * both return `{ merchants, total, meta }` per the Plan-1.5 contract.
 *
 * This is intentional — see the rebaseline plan §B.5.1 ("CategoryResults
 * route migration") and the architectural sanity-check exchange that
 * preceded M4 implementation.
 */
export function CategoryResultsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { location } = useUserLocation()
  const { data: categoriesData } = useCategories()

  const allCategories = categoriesData?.categories ?? []
  const category = allCategories.find((c) => c.id === id) ?? null
  const categoryName = category?.name ?? 'Category'

  // Resolve effective intentType — bubble up to parent if we're on a
  // subcategory page (subcategories carry intentType: null and inherit).
  const effectiveIntent = useMemo(() => {
    if (!category) return null
    if (category.intentType) return category.intentType
    if (category.parentId) {
      const parent = allCategories.find((c) => c.id === category.parentId)
      return parent?.intentType ?? 'LOCAL'
    }
    return 'LOCAL'
  }, [category, allCategories])

  const sortCaption = effectiveIntent === 'DESTINATION'
    ? 'Default: best-rated nearby first'
    : 'Default: nearby first'

  const [scope, setScope] = useState<Scope | undefined>(undefined)
  const [filterVisible, setFilterVisible] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    categoryId:   id ?? null,
    sortBy:       'relevance',
    voucherTypes: [],
    amenityIds:   [],
    openNow:      false,
  })

  // The default view (no non-scope filters) uses useCategoryMerchants for
  // intent-aware ranking. The moment any non-scope filter is applied, we
  // switch to useSearch which supports the full filter set.
  const hasNonScopeFilters =
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.amenityIds.length > 0 ||
    filters.openNow ||
    filters.categoryId !== id   // user picked a different category/subcategory in the sheet

  const effectiveCategoryId = filters.categoryId ?? id

  const categoryQuery = useCategoryMerchants(
    hasNonScopeFilters ? null : effectiveCategoryId,    // null disables this query
    {
      ...(scope ? { scope } : {}),
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      limit: 20,
    },
  )

  const searchQuery = useSearch(
    {
      ...(effectiveCategoryId ? { categoryId: effectiveCategoryId } : {}),
      ...(scope ? { scope } : {}),
      ...(filters.sortBy !== 'relevance' ? { sortBy: filters.sortBy } : {}),
      ...(filters.voucherTypes.length > 0 ? { voucherTypes: filters.voucherTypes } : {}),
      ...(filters.amenityIds.length > 0 ? { amenityIds: filters.amenityIds } : {}),
      ...(filters.openNow ? { openNow: filters.openNow } : {}),
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
      limit: 20,
    },
    hasNonScopeFilters,                                 // enabled flag
  )

  // Pick the active dataset from whichever hook is enabled.
  const data      = hasNonScopeFilters ? searchQuery.data : categoryQuery.data
  const merchants = data?.merchants ?? []
  const total     = data?.total ?? 0
  const meta      = data?.meta

  const counts = meta
    ? { nearby: meta.nearbyCount, city: meta.cityCount, platform: meta.distantCount }
    : undefined

  const expandedBanner = merchants.length > 0 && meta?.emptyStateReason === 'expanded_to_wider'
  const emptyReason    = merchants.length === 0
    ? (meta?.emptyStateReason ?? 'none')
    : null

  function handleApplyFilters(next: FilterState) {
    setFilters(next)
    setFilterVisible(false)
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={color.navy} />
        </Pressable>

        <Text variant="heading.md" style={styles.title} numberOfLines={1}>
          {categoryName}
        </Text>

        <Pressable
          onPress={() => setFilterVisible(true)}
          style={styles.iconButton}
          accessibilityLabel="Open filters"
        >
          <SlidersHorizontal size={20} color={color.navy} />
        </Pressable>
      </View>

      {/* Scope-control pill row (Nearby · Your city · UK-wide) */}
      <ScopePillRow
        selectedScope={scope}
        onScopeChange={setScope}
        {...(counts ? { counts } : {})}
      />

      {/* Intent-aware sort caption (decision #4: don't hide options, annotate
          the default ordering so DESTINATION categories make sense) */}
      <Text style={styles.sortCaption}>{sortCaption}</Text>

      {/* Banner ABOVE the list when scope was widened but results exist */}
      {expandedBanner && <EmptyStateMessage reason="expanded_to_wider" />}

      {/* Results list */}
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <MerchantTile
            merchant={item}
            onPress={(merchantId) => router.push(`/merchant/${merchantId}` as any)}
          />
        )}
        ListEmptyComponent={<EmptyStateMessage reason={emptyReason} />}
      />

      {/* Filter sheet */}
      <FilterSheet
        visible={filterVisible}
        filters={filters}
        resultCount={total}
        onApply={handleApplyFilters}
        onDismiss={() => setFilterVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#FFF9F5',
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingTop:       60,
    paddingHorizontal: 18,
    paddingBottom:    spacing[3],
    gap:              spacing[3],
  },
  iconButton: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: color.surface.neutral,
    alignItems:      'center',
    justifyContent:  'center',
  },
  title: {
    flex:  1,
    color: color.navy,
  },
  sortCaption: {
    paddingHorizontal: 18,
    paddingVertical:   spacing[1],
    fontSize:          11,
    fontFamily:        'Lato-Regular',
    color:             color.text.tertiary,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom:     100,
    gap:               12,
  },
})
