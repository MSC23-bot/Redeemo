import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, RefreshControl, StyleSheet, Alert } from 'react-native'
import Animated, { useSharedValue, useAnimatedRef, useScrollViewOffset, useAnimatedStyle, useAnimatedReaction, runOnJS } from 'react-native-reanimated' // sticky-header scroll offset + Explore-capsule collapse signal
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { color, spacing } from '@/design-system'
import { layout } from '@/design-system/tokens'
import { useUserLocation } from '@/hooks/useLocation'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { useCategories } from '@/hooks/useCategories'
import { useMe } from '@/hooks/useMe'
import { HomeHeader } from '../components/HomeHeader'
import { HomeCollapsedHeader, FADE_WINDOW } from '../components/HomeCollapsedHeader'
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
import { HomeRefreshLoader } from '../components/HomeRefreshLoader'
import { useScrollActivity } from '../hooks/useScrollActivity'
import { resolveCategoryRoute } from '@/features/shared/categorySlug'
import { SkeletonTile } from '@/features/shared/SkeletonTile'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { haptics } from '@/design-system/haptics'
// §DF-v2-j Task 9 → Task 13 Round 3 (2026-05-26) — top-of-screen
// location identity is now rendered INSIDE <HomeHeader> via its
// `locationContext` prop (the standalone <LocationStatusLabel>
// import that lived here in Round 1+2 is retired).  D6 coexistence
// preserved: <SavedAreaHonestyHint> still surfaces the caveat +
// Update affordance below the header when source='profile'.

// Bottom tab bar is `position: 'absolute'` with height `layout.bottomNavHeight`
// per the (app) Tabs layout (see `apps/customer-app/app/(app)/_layout.tsx`).
// ScrollView content must clear that height + the device safe-area inset + a
// small breathing-room margin so the last child (e.g. <NearbySectionEmpty> CTAs
// or <HomeExploreMore> button) is comfortably reachable without iOS
// rubber-band bounce. PR #126 device-QA A — owner direction 2026-05-23.
// Sourced from the shared token so it tracks the nav height (was a hardcoded 80).
const TAB_BAR_HEIGHT       = layout.bottomNavHeight
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
  // §HSH.1 — measured header height (reported by <HomeHeader onHeightChange>),
  // used to place the branded refresh loader just BELOW the header. Captured
  // ONCE: the setter is a no-op when the height hasn't meaningfully changed, so a
  // stable re-measure can never trigger an extra HomeScreen re-render mid-scroll
  // (which would reflow the feed and twitch the header). The header height is
  // fixed, so this settles to a single value after the first layout.
  const [headerHeight, setHeaderHeight] = useState(0)
  const handleHeaderHeight = React.useCallback((h: number) => {
    setHeaderHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev))
  }, [])
  // Loader Y: just BELOW the header's bottom edge, on the body surface, so it
  // reads as emerging from beneath the header. It must NOT sit on the red
  // header/wave — the loader's R is brand-red and would be invisible there
  // (and look clipped at the seam). Stays 0 until measured so
  // <HomeRefreshLoader>'s seam-height guard suppresses any pre-layout flash.
  const REFRESH_LOADER_GAP = spacing[3]
  const seamY = headerHeight > 0 ? headerHeight + REFRESH_LOADER_GAP : 0
  // Bumped once the first load completes and again on every pull-to-refresh —
  // drives the Explore-capsule intro demo so it replays on each refresh.
  const [demoToken, setDemoToken] = useState(0)
  const playedInitialDemo = useRef(false)
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  // PR A — UI-thread scroll offset drives the collapsed-header fade.
  const scrollY = useScrollViewOffset(scrollViewRef)
  // Collapse threshold (owner direction 2026-06-05): the compact bar hands over
  // once the header CONTENT has faded (it fades inside <HomeHeader> by
  // ~insets.top+35), NOT after the whole tall header scrolls away — that delay
  // was the dead zone. Tied to insets so it adapts per device.
  const fadeEndY = insets.top + 80
  const exploreCollapse = useSharedValue(0) // bumped on scroll start to collapse any open Explore chip
  // §HSH.1 fix — the expanded header is now an ABSOLUTE overlay (not a scroll
  // child), so it is physically PINNED at the top: during a pull-to-refresh
  // overscroll it cannot move, which removes the twitch. Previously the header
  // was a scroll child kept in place by a `translateY: min(scrollY,0)` worklet
  // that COMPENSATED for the rubber-band — but `useScrollViewOffset` lags the
  // native overscroll by a frame, so the compensation couldn't keep up and the
  // header briefly dropped (the twitch + white flash). As an absolute overlay we
  // only need to SCROLL IT AWAY on downward scroll: translate up by the scroll
  // amount (clamped at >= 0 so overscroll leaves it pinned at translateY 0). The
  // content has a matching paddingTop, so header + content move up in lock-step.
  const headerTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(scrollY.value, 0) }],
  }))
  // Review fix: the pinned collapsed bar overlaps the expanded header's top
  // band, so it must only be touch-live + screen-reader-visible once it is
  // actually shown — otherwise its opacity-0 controls shadow the expanded
  // greeting/search row (tap → wrong route; VoiceOver → duplicate controls).
  // Track that as JS state off the UI-thread scroll offset, flipping at the
  // SAME point the bar starts fading in (`fadeEndY - FADE_WINDOW`) so the gate
  // lines up with the visual. We only setState on the boolean transition, so
  // this stays off the per-frame path.
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  useAnimatedReaction(
    () => scrollY.value >= fadeEndY - FADE_WINDOW,
    (isActive, prev) => {
      if (isActive !== prev) runOnJS(setHeaderCollapsed)(isActive)
    },
    [fadeEndY],
  )
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

  // Tapping the header location (GPS-on row or profile label) opens the Your
  // Location screen so the user can update their postcode or switch to current
  // location. Matches <LocationStatusLabel>'s own /saved-area routing.
  const handleLocationPress = () => router.push('/saved-area' as any)

  return (
    <View style={styles.container}>
      {/* §HSH.1 fix — branded refresh loader, rendered BEFORE the ScrollView so
          it sits BEHIND the feed (the campaign banner / content cover it as they
          scroll over its spot, fixing the overlap). It still shows through the
          transparent gap that opens on pull; the absolute header (zIndex 10)
          hides the top of its travel so it emerges from beneath the header.
          Reveals on pull (UI-thread, tracks the finger), spins while loading,
          retracts when done. */}
      <HomeRefreshLoader scrollY={scrollY} refreshing={refreshing} seamY={seamY} />
      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        // Brand-header redesign: stop iOS from auto-adding the safe-area inset (it
        // double-inset the content, leaving a cream gap below the status bar
        // that's invisible on a cream header but a white break on a red one).
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // §HSH.1 — iOS reads tintColor: 'transparent' hides the native
            // spinner so the branded <HomeRefreshLoader> at the wave seam is the
            // only indicator. Android ignores tintColor and reads colors +
            // progressBackgroundColor → a branded Material circle (brand-rose arc
            // on the WARM body surface, not the default white), so it reads
            // intentional alongside the seam R loader.
            tintColor="transparent"
            colors={[color.brandRose]}
            progressBackgroundColor={color.surface.body}
          />
        }
        contentContainerStyle={[
          styles.scroll,
          // §HSH.1 fix — the expanded header is now an absolute overlay (see the
          // headerTranslateStyle note), so the scroll content reserves its space
          // with a matching paddingTop = measured header height. The header still
          // covers from y=0 (Savings-hero pattern; it bakes in its own
          // paddingTop: insets.top), so there is no cream gap at the top.
          { paddingTop: headerHeight, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + SCROLL_BOTTOM_GUTTER },
        ]}
      >
        {/* §HSH.1 fix — the expanded <HomeHeader> moved OUT of the scroll
            content to an absolute overlay below (so it is physically pinned and
            cannot twitch during a pull-to-refresh overscroll). The scroll
            content reserves its space via contentContainerStyle paddingTop. */}

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

      {/* §HSH.1 fix — expanded header as an ABSOLUTE overlay (was the first
          scroll child). Pinned at the top so a pull-to-refresh overscroll can
          never move it (no transform-lag twitch); it only translates UP to
          scroll away on downward scroll (headerTranslateStyle). Touches are
          gated off once collapsed so it never shadows the feed / collapsed bar. */}
      <Animated.View
        pointerEvents={headerCollapsed ? 'none' : 'box-none'}
        style={[styles.expandedHeader, headerTranslateStyle]}
      >
        <HomeHeader
          firstName={me?.firstName ?? null}
          area={location?.area ?? null}
          city={location?.city ?? null}
          {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
          {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
          onSearchPress={() => router.push('/search' as any)}
          onAvatarPress={() => router.push('/profile' as any)}
          onNotificationPress={handleNotificationPress}
          onLocationPress={handleLocationPress}
          onHeightChange={handleHeaderHeight}
          scrollY={scrollY}
        />
      </Animated.View>

      {/* PR A — pinned compact header; fades in over the expanded header as
          the feed scrolls. Sibling of the ScrollView so it sits above the
          feed content (its own zIndex + absolute top:0). */}
      <HomeCollapsedHeader
        scrollY={scrollY}
        fadeEndY={fadeEndY}
        active={headerCollapsed}
        firstName={me?.firstName ?? null}
        area={location?.area ?? null}
        city={location?.city ?? null}
        {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
        {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
        onSearchPress={() => router.push('/search' as any)}
        onAvatarPress={() => router.push('/profile' as any)}
        onNotificationPress={handleNotificationPress}
        onLocationPress={handleLocationPress}
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
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 12,
  },
  // §HSH.1 fix — the expanded header as an absolute overlay pinned at the top.
  // zIndex 10: above the feed + refresh loader (3), below the collapsed bar (20).
  expandedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
})
