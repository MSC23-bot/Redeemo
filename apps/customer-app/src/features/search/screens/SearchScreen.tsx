import React, { useState, useEffect, useRef } from 'react'
import { View, FlatList, StyleSheet, Keyboard } from 'react-native'
import { useRouter } from 'expo-router'
import { useSearch } from '@/hooks/useSearch'
import { useUserLocation } from '@/hooks/useLocation'
import { SkeletonTile } from '@/features/shared/SkeletonTile'
import { SearchBar } from '../components/SearchBar'
import { TrendingSearches } from '../components/TrendingSearches'
import { SearchResultItem } from '../components/SearchResultItem'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebounced(value)
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay])

  return debounced
}

export function SearchScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const { location } = useUserLocation()

  const searchEnabled = debouncedQuery.length >= 1

  const searchParams = {
    q: debouncedQuery,
    ...(location?.lat !== undefined ? { lat: location.lat } : {}),
    ...(location?.lng !== undefined ? { lng: location.lng } : {}),
    limit: 30,
  }
  const { data, isLoading } = useSearch(searchParams, searchEnabled)

  const handleCancel = () => {
    Keyboard.dismiss()
    router.back()
  }

  const handleTagPress = (tag: string) => {
    setQuery(tag)
  }

  const handleMerchantPress = (id: string) => {
    router.push(`/merchant/${id}` as any)
  }

  const merchants: MerchantTileType[] = data?.merchants ?? []
  const showTrending = !searchEnabled
  const showLoading = searchEnabled && isLoading
  const showResults = searchEnabled && !isLoading

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        onCancel={handleCancel}
        autoFocus
        placeholder="Search merchants..."
      />

      {showTrending && (
        <TrendingSearches onTagPress={handleTagPress} />
      )}

      {showLoading && (
        <View style={styles.skeletons}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonTile width={340} />
            </View>
          ))}
        </View>
      )}

      {showResults && (
        <FlatList
          data={merchants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SearchResultItem
              merchant={item}
              query={debouncedQuery}
              onPress={handleMerchantPress}
            />
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F5',
    paddingTop: 60,
  },
  skeletons: {
    paddingTop: 16,
    gap: 12,
  },
  skeletonRow: {
    paddingHorizontal: 18,
  },
  listContent: {
    paddingVertical: 8,
  },
})
