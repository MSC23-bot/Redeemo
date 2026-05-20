import React, { useState } from 'react'
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
import { NearbyByCategory } from '../components/NearbyByCategory'
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
  // The carousels pass branch.id into onBranchPress via the
  // branchToMerchantTile adapter's `id: branch.id` swap; the per-rail
  // lookup below finds the parent merchant.id for the route path.
  const routeToBranch = (
    branchId: string,
    branches: { id: string; merchant: { id: string } }[],
  ) => {
    const match = branches.find((b) => b.id === branchId)
    const merchantId = match?.merchant.id ?? branchId
    router.push(`/merchant/${merchantId}?branch=${branchId}&from=home` as never)
  }

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
          <FeaturedCarousel
            branches={feed?.featuredBranches ?? []}
            onBranchPress={(branchId) => routeToBranch(branchId, feed?.featuredBranches ?? [])}
            onSeeAll={() => {}}
          />
        )}

        <TrendingSection
          branches={feed?.trendingBranches ?? []}
          onBranchPress={(branchId) => routeToBranch(branchId, feed?.trendingBranches ?? [])}
        />

        <NearbyByCategory
          sections={(feed?.nearbyByCategoryBranches ?? []).map((s) => ({
            category: s.category,
            branches: s.branches,
          }))}
          onBranchPress={(branchId) => {
            // Find the branch across all category sections for merchant id resolution.
            const all = (feed?.nearbyByCategoryBranches ?? []).flatMap((s) => s.branches)
            routeToBranch(branchId, all)
          }}
          onCategoryPress={(id) => router.push(`/category/${id}` as any)}
        />
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
