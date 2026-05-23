import React, { useMemo, useState } from 'react'
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { color, spacing } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { useCategories } from '@/hooks/useCategories'
import { useMe } from '@/hooks/useMe'
import { HomeHeader } from '../components/HomeHeader'
import { CampaignCarousel } from '../components/CampaignCarousel'
import { CategoryGrid } from '../components/CategoryGrid'
import { FeaturedCarousel } from '../components/FeaturedCarousel'
import { TrendingSection } from '../components/TrendingSection'
import { PopularSection } from '../components/PopularSection'
import { NearbyByCategory } from '../components/NearbyByCategory'
import { NearbySectionEmpty } from '../components/NearbySectionEmpty'
import { HomeNoLocationBanner } from '../components/HomeNoLocationBanner'
import { HomeExploreMore } from '../components/HomeExploreMore'
import { SkeletonTile } from '@/features/shared/SkeletonTile'

export function HomeScreen() {
  const router = useRouter()
  const { location } = useUserLocation()
  const { data: me } = useMe()
  const { data: feed, isLoading, refetch } = useHomeFeed(
    location ? { lat: location.lat, lng: location.lng } : {}
  )
  const { data: categoriesData } = useCategories()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  // Phase 2.3 — Home tile tap routes carry both the merchant id (route
  // path) AND the branch id (`?branch=` for Merchant Profile attribution)
  // PLUS `from=home` so resolveBackNavigation can return the user to
  // the Home tab on back-press.  Multi-branch merchants fan out to one
  // tile per branch per the locked §M one-pin-per-branch principle.
  //
  // The carousels pass branch.id into onBranchPress directly (Phase 2.5
  // dropped the interim branchToMerchantTile adapter); the per-rail
  // lookup below finds the parent merchant.id for the route path.
  const routeToBranch = (
    branchId: string,
    branches: { id: string; merchant: { id: string } }[],
  ) => {
    const match = branches.find((b) => b.id === branchId)
    if (!match) {
      // Stale tap — branch is no longer in the current feed (e.g. data
      // refetched between render and tap). Match the Map precedent at
      // MapScreen.tsx:391-396 — warn in dev and bail rather than push
      // a broken `/merchant/<branchId>?branch=<branchId>` URL.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[HomeScreen] routeToBranch: branchId not found in feed: ${branchId}`)
      }
      return
    }
    router.push(`/merchant/${match.merchant.id}?branch=${branchId}&from=home` as any)
  }

  // Memoise the flattened NearbyByCategory branch list so tile taps don't
  // rebuild it on every press (closes the code-quality reviewer's Important
  // #5 — `flatMap` allocation per tap).  Rebuilds only when the feed
  // mutates, which is also the only time branch identity could shift.
  //
  // Phase E — reads the new `nearbyByCategoryRails` envelope (server-side
  // scope-filtered) rather than the legacy `nearbyByCategoryBranches`
  // field.  Backend continues emitting both per the Hard Invariant; the
  // customer-app reads the new envelope per the Phase G migration.
  const allNearbyBranches = useMemo(
    () => (feed?.nearbyByCategoryRails ?? []).flatMap((r) => r.branches),
    [feed?.nearbyByCategoryRails],
  )
  const onNearbyBranchPress = (branchId: string) =>
    routeToBranch(branchId, allNearbyBranches)

  // Spec §8.7 + §8.8 — dedup-managed fallback components.
  //
  // Three booleans drive the three fallback components on Home.  Two
  // mutual-exclusion invariants are baked into the derivation chain:
  //   1. banner ⊥ NearbySectionEmpty — `showNearbySectionEmpty` requires
  //      `!showNoLocationBanner`.
  //   2. NearbySectionEmpty ⊥ HomeExploreMore (v1.2) — `showExploreMore`
  //      requires `!showNearbySectionEmpty`.
  // The third invariant (banner ⊥ HomeExploreMore) falls out for free
  // because `sparseHeuristic` requires `source !== 'none'`, which the
  // banner condition excludes.
  //
  // `<NearbyByCategory>` itself renders ONLY when rails exist; the empty
  // card takes the same slot when rails are absent AND location resolved.
  const hasNearbyRails         = (feed?.nearbyByCategoryRails?.length ?? 0) > 0
  const showNoLocationBanner   = feed?.locationContext.source === 'none'
  const showNearbySectionEmpty = !showNoLocationBanner && !hasNearbyRails && !!feed
  const sparseHeuristic =
    !!feed
    && (!feed.featuredRail?.meta || feed.featuredRail.meta.scopeExpanded)
    && !feed.trendingRail?.meta
    && (feed.nearbyByCategoryRails?.length ?? 0) < 2
    && feed.locationContext.source !== 'none'
  const showExploreMore = sparseHeuristic && !showNearbySectionEmpty

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brandRose} />}
        contentContainerStyle={styles.scroll}
      >
        <HomeHeader
          firstName={me?.firstName ?? null}
          area={location?.area ?? null}
          city={location?.city ?? null}
          {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
          onSearchPress={() => router.push('/search' as any)}
          onFilterPress={() => {}}
        />

        {/* Spec §8.8 — banner mounts ABOVE campaign carousel when the
            user has no resolvable location.  Dedup invariant guards
            <NearbySectionEmpty> + <HomeExploreMore> against ever
            co-mounting with this banner (see derivation above). */}
        {showNoLocationBanner && <HomeNoLocationBanner />}

        {isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonTile width={300} />
          </View>
        ) : (
          <CampaignCarousel
            campaigns={feed?.campaigns ?? []}
            onCampaignPress={(_id) => {}}
          />
        )}

        {categoriesData?.categories && (
          <CategoryGrid
            categories={categoriesData.categories}
            onCategoryPress={(id) => router.push(`/category/${id}` as any)}
            onMorePress={() => router.push('/categories' as any)}
          />
        )}

        {isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
        ) : (
          feed?.featuredRail?.meta && (
            <FeaturedCarousel
              rail={feed.featuredRail}
              onBranchPress={(branchId) => routeToBranch(branchId, feed.featuredRail?.branches ?? [])}
            />
          )
        )}

        {/* Task D.4 — Trending ↔ Popular swap.  Mutual-exclusion invariant
            is enforced server-side by `getHomeFeed` (at most one of
            trendingRail.meta / popularRail.meta is non-null when a
            non-no-location effLoc resolves; on no-location the swap also
            holds because trendingRail.meta is forced null). The client just
            follows. */}
        {feed?.trendingRail?.meta && (
          <TrendingSection
            rail={feed.trendingRail}
            onBranchPress={(branchId) => routeToBranch(branchId, feed.trendingRail?.branches ?? [])}
          />
        )}
        {!feed?.trendingRail?.meta && feed?.popularRail?.meta && (
          <PopularSection
            rail={feed.popularRail}
            onBranchPress={(branchId) => routeToBranch(branchId, feed.popularRail?.branches ?? [])}
          />
        )}

        {hasNearbyRails && (
          <NearbyByCategory
            rails={feed!.nearbyByCategoryRails!}
            onBranchPress={onNearbyBranchPress}
            onCategoryPress={(id) => router.push(`/category/${id}` as any)}
          />
        )}
        {showNearbySectionEmpty && <NearbySectionEmpty />}

        {/* Spec §8.5 + §8.7 — page-bottom soft CTA mounted under sparse-supply
            conditions.  Mutually exclusive with both <HomeNoLocationBanner>
            (sparseHeuristic guards on source !== 'none') and
            <NearbySectionEmpty> (showExploreMore guards on
            !showNearbySectionEmpty). */}
        {showExploreMore && <HomeExploreMore />}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  scroll: {
    paddingTop: 60,
    gap: spacing[5],
  },
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 12,
  },
})
