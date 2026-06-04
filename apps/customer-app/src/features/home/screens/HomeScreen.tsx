import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, RefreshControl, StyleSheet, Alert } from 'react-native'
import Animated, { useSharedValue, useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated' // sticky-header scroll offset + Explore-capsule collapse signal
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { color, spacing } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { useCategories } from '@/hooks/useCategories'
import { useMe } from '@/hooks/useMe'
import { HomeHeader } from '../components/HomeHeader'
import { HomeCollapsedHeader } from '../components/HomeCollapsedHeader'
import { CampaignCarousel } from '../components/CampaignCarousel'
import { FeaturedCarousel } from '../components/FeaturedCarousel'
import { TrendingSection } from '../components/TrendingSection'
import { PopularSection } from '../components/PopularSection'
import { NearbyByCategory } from '../components/NearbyByCategory'
import { NearbyContextBanner } from '../components/NearbyContextBanner'
import { NearbySectionEmpty } from '../components/NearbySectionEmpty'
import { HomeNoLocationBanner } from '../components/HomeNoLocationBanner'
import { SavedAreaHonestyHint } from '../components/SavedAreaHonestyHint'
import { HomeExploreMore } from '../components/HomeExploreMore'
import { HomeCategoryGrid } from '../components/HomeCategoryGrid'
import { useScrollActivity } from '../hooks/useScrollActivity'
import { resolveCategoryRoute } from '@/features/shared/categorySlug'
import { SkeletonTile } from '@/features/shared/SkeletonTile'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { haptics } from '@/design-system/haptics'
// §DF-v2-j Task 9 → Task 13 Round 3 (2026-05-26) — top-of-screen
// location identity is now rendered INSIDE <HomeHeader> via its
// `locationContext` prop (the standalone <LocationStatusLabel>
// import that lived here in Round 1+2 is retired).  D6 coexistence
// preserved: <SavedAreaHonestyHint> still surfaces the caveat +
// Update affordance below the header when source='profile'.

// Bottom tab bar is `position: 'absolute'` with `height: 80` per the (app)
// Tabs layout (see `apps/customer-app/app/(app)/_layout.tsx`). ScrollView
// content must clear that height + the device safe-area inset + a small
// breathing-room margin so the last child (e.g. <NearbySectionEmpty> CTAs
// or <HomeExploreMore> button) is comfortably reachable without iOS
// rubber-band bounce. PR #126 device-QA A — owner direction 2026-05-23.
const TAB_BAR_HEIGHT       = 80
const SCROLL_BOTTOM_GUTTER  = 24

export function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { location } = useUserLocation()
  const { data: me } = useMe()
  const { data: feed, isLoading, refetch } = useHomeFeed(
    location ? { lat: location.lat, lng: location.lng } : {}
  )
  const { data: categoriesData } = useCategories()
  const [refreshing, setRefreshing] = useState(false)
  // Bumped once the first load completes and again on every pull-to-refresh —
  // drives the Explore-capsule intro demo so it replays on each refresh.
  const [demoToken, setDemoToken] = useState(0)
  const playedInitialDemo = useRef(false)
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  // PR A — UI-thread scroll offset drives the collapsed-header fade; fadeEndY
  // is the expanded header height (captured via onLayout) so the compact bar
  // reaches full opacity right as the expanded header scrolls away.
  const scrollY = useScrollViewOffset(scrollViewRef)
  const [headerHeight, setHeaderHeight] = useState(0)
  const fadeEndY = Math.max(headerHeight - 12, 1)
  const exploreCollapse = useSharedValue(0) // bumped on scroll start to collapse any open Explore chip
  // Owns the global scrollActivity flag (pauses looping animations while the
  // feed moves) with a debounced stop + a blur/unmount reset so leaving Home
  // mid-fling can't strand the flag at 1 and freeze animations app-wide.
  const scroll = useScrollActivity()
  const { scrollTop } = useLocalSearchParams<{ scrollTop?: string }>()

  // Device-QA R1 (2026-05-30) — Favourites empty-state CTA + any
  // other surface that wants to "land on Home at the top of the
  // feed" can push `/(app)/?scrollTop=1`.  We honour the marker on
  // mount AND on every focus (e.g. tab-bar switch back), then scrub
  // the param so a later back-nav or refresh doesn't re-trigger.
  // The previous behaviour restored Home's prior scroll position,
  // which left the user landing mid-feed after tapping "Discover
  // merchants" from an empty Favourites tab.
  useFocusEffect(
    React.useCallback(() => {
      if (scrollTop === '1') {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false })
        router.setParams({ scrollTop: undefined })
      }
    }, [scrollTop, router, scrollViewRef])
  )

  // Wave 6.4-C (2026-05-30) — invalidate discovery on focus so the
  // Home rail reconciles whenever the user returns to this tab,
  // closing the flushPending → navigation race for stale Home
  // hearts.
  //
  // Owner-reported symptom: remove all favourites → optimistic empty
  // state renders → tap "Discover merchants" → Home shows the still-
  // favourited heart for the just-removed merchant.  Wave 6.3's
  // flushPending on FavouritesScreen blur fires the DELETE +
  // invalidate BEFORE Home renders, but invalidate's
  // `refetchType: 'active'` default only refetches queries with
  // currently-active observers.  If Home was previously visited but
  // is no longer the active tab, expo-router may keep its queries
  // alive (active) OR may have unmounted them depending on the
  // navigator's lazy/unmountOnBlur settings.  Forcing an invalidate
  // on Home focus is a small, reliable backstop that doesn't
  // increase network calls in the steady state (staleTime is
  // already 60s, so the immediate refetch is just earlier than
  // it would naturally fire).
  // Wave 6.6 (2026-05-31) — owner-reported on Wave 6.5 ship:
  // "minutes" of stale Home rail hearts after favourites mutated
  // elsewhere.  Wave 6.4-C alone fired `invalidateQueries` on focus
  // which marks queries stale + refetches ACTIVE observers — but
  // expo-router Tabs' focus / mount timing can leave the Home
  // query in a transient state where invalidate sees no active
  // observer + no refetch fires.  Then the cache stays stale
  // indefinitely until something else triggers a refetch.
  //
  // Belt-and-braces: also call `refetch()` directly on the Home
  // query.  refetch() always fires regardless of observer state.
  // The invalidate still runs first so sibling discovery queries
  // (Map, Search, Category) also get refreshed.
  const queryClient = useQueryClient()
  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['discovery'] })
      void refetch()
    }, [queryClient, refetch])
  )

  const onRefresh = async () => {
    // Batch 5 §10.5 (F4-c) — medium-impact haptic on the refresh trigger
    // (guarded by the global haptics-enabled flag).
    haptics.touch.medium()
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
    setDemoToken((t) => t + 1) // replay the Explore-capsule intro on each refresh
  }

  // Play the intro once the first load completes; per-refresh replays come from
  // onRefresh above.
  useEffect(() => {
    if (!isLoading && !playedInitialDemo.current) {
      playedInitialDemo.current = true
      setDemoToken((t) => t + 1)
    }
  }, [isLoading])

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

  // v1.9 PR #126 device-QA-6 owner direction 2026-05-23 (Huddersfield finding) —
  // tighten the banner trigger from `.some()` to `.every()`.  Pre-v1.9 the
  // banner fired whenever AT LEAST ONE category rail was pure-cascade
  // (scopeExpanded=true).  In Huddersfield (3 local rails — Food & Drink /
  // Beauty & Wellness / Health & Fitness — plus 1-2 pure-cascade rails
  // like Shopping or Out & About), the banner appeared above the WHOLE
  // section, reading like "we're still growing in Huddersfield" applied
  // to the entire NearbyByCategory zone — even though the visible rails
  // had real local supply.  v1.7's mixed-rail meta + v1.8's per-tile
  // semantic-tinted proximity chip already carry the honesty signal for
  // individual filler tiles inside mixed rails; the global banner is
  // only needed when the WHOLE NBC zone is platform-wide (Manchester,
  // Bristol-like markets).
  //
  // New rule: banner fires only when EVERY visible NBC rail is pure-cascade.
  // Mixed markets (Huddersfield, Brightlingsea — any rail with local supply)
  // suppress the banner; the chip variants + distance chips per tile do the
  // honesty work.  Pure-cascade markets (Manchester, Bristol-light) still
  // get the banner.  `.every()` on an empty array returns true vacuously,
  // but the `hasNearbyRails` gate (length > 0) blocks that path — empty
  // rails route to <NearbySectionEmpty> instead.
  //
  // Mutual exclusion with <NearbySectionEmpty> by construction —
  // showNearbySectionEmpty requires !hasNearbyRails; showNearbyContextBanner
  // requires hasNearbyRails. They can never co-mount.
  const allRailsAreCascaded =
    (feed?.nearbyByCategoryRails ?? []).every(r => r.meta?.scopeExpanded === true)
  const showNearbyContextBanner = hasNearbyRails && allRailsAreCascaded

  // Notifications system isn't built yet (Phase 6) — surface a Coming Soon
  // stub matching the app's SSO / GetHelp convention until it ships.
  const handleNotificationPress = () =>
    Alert.alert('Coming soon', 'Notifications are coming in a future update.')

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        // Pause looping animations while the feed is moving (begin → 1) and
        // resume once it's fully stopped — dozens of per-frame animation updates
        // were starving the scroll of frames. `useScrollActivity` owns the
        // global flag on the UI thread (no re-renders), debounces the stop so
        // loops never resume mid-fling, and resets it on blur/unmount.
        //
        // NOTE: `removeClippedSubviews` was removed here and on the horizontal
        // rails — it mis-clips the new absolutely-positioned / protruding card
        // elements (rail logos straddling the banner seam, category-card 3D
        // illustrations) on Android, and the scroll-pause above is the primary
        // UI-thread saving. Re-add behind device QA if a perf need is proven.
        onScrollBeginDrag={() => { exploreCollapse.value += 1; scroll.onScrollBeginDrag() }}
        onMomentumScrollBegin={scroll.onMomentumScrollBegin}
        onScrollEndDrag={scroll.onScrollEndDrag}
        onMomentumScrollEnd={scroll.onMomentumScrollEnd}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brandRose} />}
        contentContainerStyle={[
          styles.scroll,
          // Safe-area-aware top inset so the greeting clears the Dynamic
          // Island / notch on every device (was a fixed 60).
          { paddingTop: insets.top + spacing[2], paddingBottom: insets.bottom + TAB_BAR_HEIGHT + SCROLL_BOTTOM_GUTTER },
        ]}
      >
        {/* Batch 5 §10.5 (F4-c) — branded RedeemoLoader R-moment while
            refreshing. The native RefreshControl above owns the pull +
            trigger; this is the brand beat at the top of the feed.
            Reduced-motion-safe (RedeemoLoader renders static under
            reduce-motion). Placement vs the system spinner is a device-QA
            tuning item (plan §9). */}
        {refreshing ? (
          <View style={styles.refreshBrand}>
            <RedeemoLoader size="md" />
          </View>
        ) : null}

        {/* Task 13 Round 3 (2026-05-26) — the LocationStatusLabel is
            now rendered INSIDE <HomeHeader> at the same visual rhythm
            as the GPS-on location row (marginTop: spacing[1]=4pt
            below the greeting).  HomeHeader receives the
            `locationContext` prop and decides between (a) the GPS-on
            area/city text row, (b) the LocationStatusLabel, or
            (c) neither.  The previous standalone mount below
            HomeHeader (Round 1 + Round 2 location) is retired —
            owner-locked Round 3 product decision: the label must
            feel like the normal GPS/location line, not a detached
            banner.  <SavedAreaHonestyHint> below remains unchanged
            (D6 coexistence preserved — the hint still surfaces the
            caveat + Update affordance when source='profile'). */}
        <HomeHeader
          firstName={me?.firstName ?? null}
          area={location?.area ?? null}
          city={location?.city ?? null}
          {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
          {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
          onSearchPress={() => router.push('/search' as any)}
          onAvatarPress={() => router.push('/profile' as any)}
          onNotificationPress={handleNotificationPress}
          onHeightChange={setHeaderHeight}
        />

        {/* Spec §8.8 — banner mounts ABOVE campaign carousel when the
            user has no resolvable location.  Dedup invariant guards
            <NearbySectionEmpty> + <HomeExploreMore> against ever
            co-mounting with this banner (see derivation above). */}
        {showNoLocationBanner && <HomeNoLocationBanner />}

        {/* Spec §6.2 — saved-area honesty hint mounts at the top of the
            Home content (flush below safe-area, above Featured rail) when
            the backend resolved Discovery against the user's SAVED_PROFILE
            postcode (vs live GPS).  Hidden when source === 'coordinates' or
            'none'; the component owns its own visibility gating so the
            mount is unconditional here.  Mutually exclusive with the
            no-location banner above by construction (the no-location
            banner requires source === 'none'; the hint requires
            source === 'profile'). */}
        {feed && <SavedAreaHonestyHint locationContext={feed.locationContext} />}

        {isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonTile width={300} />
          </View>
        ) : (
          // Batch 5 §10.1 — campaign carousel fades in (opacity-only) once
          // loaded. Reduced-motion-safe: FadeIn collapses to duration 0 via
          // useMotionScale. (Skeleton→content §10.6 is realised as this
          // content-fade-in; SkeletonToContent's absolute skeleton can't
          // reserve height for Home's loading-conditional rails.)
          <FadeIn duration={200}>
            <CampaignCarousel
              campaigns={feed?.campaigns ?? []}
              onCampaignPress={(_id) => {}}
            />
          </FadeIn>
        )}

        {/* Curated six top-level category cards + Explore-all capsule. */}
        <HomeCategoryGrid
          demoToken={demoToken}
          collapseSignal={exploreCollapse}
          onCategoryPress={(slug) => {
            // Curated cards carry a canonical slug (not a display name), mapped
            // to the backend Category by slug so a rename / casing / localization
            // change can't silently misroute (resolveCategoryRoute is pure +
            // unit-tested). Unresolved (not loaded yet, or no match) intentionally
            // routes to the all-categories list with a dev warning rather than
            // pretending the specific category opened.
            const target = resolveCategoryRoute(slug, categoriesData?.categories)
            if (target.kind === 'category') {
              router.push({ pathname: '/category/[id]', params: { id: target.id } })
              return
            }
            if (target.reason === 'unresolved' && __DEV__) {
              console.warn(`[HomeScreen] category slug "${target.slug}" not resolvable — routing to /categories`)
            }
            router.push('/categories' as any)
          }}
        />

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

        {showNearbyContextBanner && (
          <NearbyContextBanner cityName={feed?.locationContext?.locality?.name ?? null} />
        )}
        {hasNearbyRails && (
          <NearbyByCategory
            rails={feed!.nearbyByCategoryRails!}
            onBranchPress={onNearbyBranchPress}
            onCategoryPress={(id) => router.push(`/category/${id}` as any)}
          />
        )}
        {showNearbySectionEmpty && (
          <NearbySectionEmpty cityName={feed?.locationContext?.locality?.name ?? null} />
        )}

        {/* Spec §8.5 + §8.7 — page-bottom soft CTA mounted under sparse-supply
            conditions.  Mutually exclusive with both <HomeNoLocationBanner>
            (sparseHeuristic guards on source !== 'none') and
            <NearbySectionEmpty> (showExploreMore guards on
            !showNearbySectionEmpty). */}
        {showExploreMore && <HomeExploreMore />}
      </Animated.ScrollView>

      {/* Always-opaque status-bar mask: the expanded greeting/location scroll
          UNDER this, never under the Dynamic Island / time. Above the feed,
          below the collapsed header. */}
      <View pointerEvents="none" style={[styles.statusBarMask, { height: insets.top }]} />

      {/* PR A — pinned compact header; fades in over the expanded header as
          the feed scrolls. Sibling of the ScrollView so it sits above the
          feed content (its own zIndex + absolute top:0). */}
      <HomeCollapsedHeader
        scrollY={scrollY}
        fadeEndY={fadeEndY}
        firstName={me?.firstName ?? null}
        area={location?.area ?? null}
        city={location?.city ?? null}
        {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
        {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
        onSearchPress={() => router.push('/search' as any)}
        onAvatarPress={() => router.push('/profile' as any)}
        onNotificationPress={handleNotificationPress}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    // 2026-06-03 background system — ONE consistent light warm body throughout
    // (close to white, brand red-orange hue family). Sections are highlighted by
    // going DEEPER than this body, not lighter: Featured is the deepest warm
    // zone, Popular/Trending a mid warm-gold zone, Nearby sits on the plain body.
    // White cards float on all of it. See <SectionBand>.
    flex: 1,
    backgroundColor: color.surface.body,
  },
  scroll: {
    gap: spacing[5],
  },
  statusBarMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: color.surface.body,
    zIndex: 19,
  },
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 12,
  },
  refreshBrand: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
})
