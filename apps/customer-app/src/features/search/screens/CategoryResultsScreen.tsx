import React, { useState } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { useSearch } from '@/hooks/useSearch'
import { useCategories } from '@/hooks/useCategories'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { FilterSheet, FilterState } from '../components/FilterSheet'

export function CategoryResultsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { location } = useUserLocation()
  const { data: categoriesData } = useCategories()

  const category = categoriesData?.categories.find((c) => c.id === id) ?? null
  const categoryName = category?.name ?? 'Category'

  const [filterVisible, setFilterVisible] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    categoryId: id ?? null,
    subcategoryId: null,
    sortBy: 'relevance',
    voucherTypes: [],
    maxDistanceMiles: 10,
    minSaving: 0,
    amenityIds: [],
    openNow: false,
  })

  const searchParams = {
    ...(filters.categoryId !== null ? { categoryId: filters.categoryId } : {}),
    ...(filters.subcategoryId !== null ? { subcategoryId: filters.subcategoryId } : {}),
    ...(filters.sortBy !== 'relevance' ? { sortBy: filters.sortBy } : {}),
    ...(filters.voucherTypes.length > 0 ? { voucherTypes: filters.voucherTypes } : {}),
    ...(filters.maxDistanceMiles !== 10 ? { maxDistanceMiles: filters.maxDistanceMiles } : {}),
    ...(filters.minSaving > 0 ? { minSaving: filters.minSaving } : {}),
    ...(filters.amenityIds.length > 0 ? { amenityIds: filters.amenityIds } : {}),
    ...(filters.openNow ? { openNow: filters.openNow } : {}),
    ...(location ? { lat: location.lat, lng: location.lng } : {}),
    limit: 20,
  }

  const { data } = useSearch(searchParams)
  const merchants = data?.merchants ?? []
  const total = data?.total ?? 0

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
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: color.navy,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 100,
    gap: 12,
  },
})
