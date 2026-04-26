import React, { useState, useEffect, useRef } from 'react'
import { View, FlatList, StyleSheet, Keyboard, Animated } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { useSearch } from '@/hooks/useSearch'
import { useUserLocation } from '@/hooks/useLocation'
import { SearchBar } from '../components/SearchBar'
import { TrendingSearches } from '../components/TrendingSearches'
import { SearchResultItem } from '../components/SearchResultItem'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, delay])
  return debounced
}

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start()
  }, [opacity])
  return <Animated.View style={[styles.pulsingDot, { opacity }]} />
}

function ResultSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonAvatar} />
      <View style={styles.skeletonLines}>
        <View style={[styles.skeletonLine, { width: 100 }]} />
        <View style={[styles.skeletonLine, { width: 140, marginTop: 6 }]} />
      </View>
      <View style={styles.skeletonPill} />
    </View>
  )
}

export function SearchScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const { location } = useUserLocation()

  const searchEnabled = debouncedQuery.length >= 1
  const { data, isLoading } = useSearch(
    {
      q: debouncedQuery,
      ...(location?.lat !== undefined ? { lat: location.lat } : {}),
      ...(location?.lng !== undefined ? { lng: location.lng } : {}),
      limit: 30,
    },
    searchEnabled
  )

  const handleCancel = () => { Keyboard.dismiss(); router.back() }
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

      {showTrending && <TrendingSearches onTagPress={setQuery} />}

      {(showLoading || showResults) && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsLabel}>
            Results for "{debouncedQuery}"
          </Text>
          {showLoading && (
            <View style={styles.loadingRow}>
              <PulsingDot />
              <Text style={styles.loadingText}>Loading</Text>
            </View>
          )}
        </View>
      )}

      {showLoading && (
        <View style={styles.skeletons}>
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
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
              onPress={(id) => router.push(`/merchant/${id}` as any)}
            />
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No merchants found for "{debouncedQuery}"</Text>
          }
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
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  resultsLabel: {
    fontSize: 11,
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pulsingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E20C04',
  },
  loadingText: {
    fontSize: 10,
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
  },
  skeletons: { gap: 6 },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 12,
    marginHorizontal: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  skeletonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    flexShrink: 0,
  },
  skeletonLines: { flex: 1 },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
  },
  skeletonPill: {
    width: 50,
    height: 18,
    borderRadius: 50,
    backgroundColor: '#E5E7EB',
  },
  listContent: { paddingBottom: 24 },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Lato-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
})
