import React, { useState, useEffect, useRef } from 'react'
import { View, FlatList, StyleSheet, Keyboard } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { useSearch } from '@/hooks/useSearch'
import { useUserLocation } from '@/hooks/useLocation'
import { SearchBar } from '../components/SearchBar'
import { TrendingSearches } from '../components/TrendingSearches'
import { SearchResultItem } from '../components/SearchResultItem'
import { ScopePillRow, type Scope } from '@/features/shared/ScopePillRow'
import { EmptyStateMessage } from '@/features/shared/EmptyStateMessage'
import { BranchTile } from '@/lib/api/discovery'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { LocalityCaption } from '@/design-system/components/LocalityCaption'

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
  const [scope, setScope] = useState<Scope | undefined>(undefined)
  const debouncedQuery = useDebounce(query, 300)
  const { location } = useUserLocation()

  const searchEnabled = debouncedQuery.length >= 1
  const { data, isLoading } = useSearch(
    {
      q: debouncedQuery,
      ...(location?.lat !== undefined ? { lat: location.lat } : {}),
      ...(location?.lng !== undefined ? { lng: location.lng } : {}),
      ...(scope ? { scope } : {}),
      limit: 30,
    },
    searchEnabled
  )

  const handleCancel = () => { Keyboard.dismiss(); router.back() }
  // Discovery Rebaseline PR-2 (Phase 2.1) — read the additive `branches`
  // arm.  Multi-branch merchants now render as separate rows (Covelum bug
  // fix, Spec §3.3).  The legacy `merchants` arm is still on the wire for
  // surfaces that haven't migrated yet (Home / Category / Map).
  const branches: BranchTile[] = data?.branches ?? []
  const showTrending = !searchEnabled
  const showLoading = searchEnabled && isLoading
  const showResults = searchEnabled && !isLoading

  // Tier counts come from the meta envelope (always reflects UK-wide supply,
  // per the Plan 1.5 invariant). When meta isn't present yet we hide the
  // numbers but keep the pills selectable.
  const meta = data?.meta
  const counts = meta
    ? { nearby: meta.nearbyCount, city: meta.cityCount, platform: meta.distantCount }
    : undefined

  // 'expanded_to_wider' renders ABOVE the list as a banner (results exist).
  // 'none' / 'no_uk_supply' render INSIDE the list as the empty state.
  const expandedBanner = branches.length > 0 && meta?.emptyStateReason === 'expanded_to_wider'
  const emptyReason    = branches.length === 0
    ? (meta?.emptyStateReason ?? 'none')
    : null

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

      {searchEnabled && (
        <ScopePillRow
          selectedScope={scope}
          onScopeChange={setScope}
          {...(counts ? { counts } : {})}
        />
      )}

      {(showLoading || showResults) && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsLabel}>
            Results for "{debouncedQuery}"
          </Text>
          {showLoading && (
            <View style={styles.loadingRow}>
              <RedeemoLoader size={22} accessibilityLabel="Searching" />
            </View>
          )}
        </View>
      )}

      {/* Plan 4 M3b follow-up — secondary metadata answering "near
          where?". Renders null when meta or effectiveLocality is
          absent, so safe to mount unconditionally. */}
      {showResults && (
        <LocalityCaption localityName={meta?.effectiveLocality?.name} />
      )}

      {showResults && expandedBanner && (
        <EmptyStateMessage reason="expanded_to_wider" />
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
          data={branches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SearchResultItem
              tile={item}
              query={debouncedQuery}
              onPress={(branchId, merchantId) =>
                router.push(`/(app)/merchant/${merchantId}?branch=${branchId}` as any)
              }
            />
          )}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyStateMessage reason={emptyReason} />}
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
