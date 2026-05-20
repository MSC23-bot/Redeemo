import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MapView, { Region } from 'react-native-maps'
import { List, Locate, SlidersHorizontal } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useCategories } from '@/hooks/useCategories'
import { useSearch } from '@/hooks/useSearch'
import { useInAreaBranches, type BoundingBox } from '../hooks/useInAreaBranches'
import { MapCategoryPills } from '../components/MapCategoryPills'
import { LocationPermission } from '../components/LocationPermission'
import { MapEmptyArea, type MapEmptyCase } from '../components/MapEmptyArea'
import { MapPins } from '../components/MapPins'
import { MapBranchTile } from '../components/MapBranchTile'
import { LocationSearch, UK_CITIES } from '../components/LocationSearch'
import { LocationBadge } from '../components/LocationBadge'
import { MapListView } from '../components/MapListView'
import { SearchBar } from '@/features/search/components/SearchBar'
import { FilterSheet, FilterState } from '@/features/search/components/FilterSheet'
import { ViewportLocalityBadge } from '@/design-system/components/ViewportLocalityBadge'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'
import { useToast } from '@/design-system'
import { geocodeCity } from '@/lib/geocoding'
import type { BranchTile as BranchTileType } from '@/lib/api/discovery'

const LONDON_REGION: Region = {
  latitude:       51.5074,
  longitude:      -0.1278,
  latitudeDelta:  0.05,
  longitudeDelta: 0.05,
}

// UK bounding box (lat 49.8–60.9, lng -8.2–1.8). The Map shows
// "Map is outside the UK" when the camera centre falls outside this box.
const UK_EXTENT = {
  minLat: 49.8,
  maxLat: 60.9,
  minLng: -8.2,
  maxLng: 1.8,
} as const

// 500ms pan debounce: the camera fires `onRegionChangeComplete` repeatedly
// while a user is settling the map; we don't want to refetch on every
// micro-adjust. Plan locked at 500ms (decision #6).
const PAN_DEBOUNCE_MS = 500

const DEFAULT_FILTERS: FilterState = {
  categoryId:   null,
  sortBy:       'relevance',
  voucherTypes: [],
  amenityIds:   [],
  openNow:      false,
}

function regionToBbox(region: Region): BoundingBox {
  return {
    minLat: region.latitude  - region.latitudeDelta  / 2,
    maxLat: region.latitude  + region.latitudeDelta  / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  }
}

function regionIsOffshore(region: Region): boolean {
  return (
    region.latitude  < UK_EXTENT.minLat ||
    region.latitude  > UK_EXTENT.maxLat ||
    region.longitude < UK_EXTENT.minLng ||
    region.longitude > UK_EXTENT.maxLng
  )
}

type Props = {
  onMerchantPress?: (id: string) => void
}

/**
 * MapScreen — Hybrid hook strategy (PR C M2).
 *
 * State is partitioned into four buckets so the hybrid logic stays
 * readable: bbox / filter / search-text / UI-only. The active query is
 * derived purely from those buckets; both hooks are always invoked
 * (React rules-of-hooks) and `enabled` switches which one fetches:
 *
 *   - hasNonScopeFilters === false → `useInAreaBranches` is enabled
 *                                    (intent-aware ranking via the
 *                                    /discovery/in-area route)
 *
 *   - hasNonScopeFilters === true  → `useSearch` is enabled with a bbox
 *                                    (full filter set: sortBy, voucher-
 *                                    Types, amenityIds, openNow)
 *
 * `categoryId` is NOT a non-scope filter — both routes accept it, so
 * setting/changing the category on its own does NOT flip to /search.
 *
 * The category pill row and FilterSheet share `filters.categoryId` as
 * the single source of truth: pill-tap → setFilters({ categoryId, … });
 * FilterSheet onApply → setFilters(next).
 */
export function MapScreen({ onMerchantPress }: Props) {
  const router = useRouter()
  const mapRef = useRef<MapView>(null)
  const locationState = useUserLocation()
  const { data: categoriesData } = useCategories()

  // ─── Bbox state ────────────────────────────────────────────────────────────
  // `region` is the live camera (offshore detection reads this — no debounce).
  // `queryBbox` is what either hook actually queries against — debounced via
  // `pendingBboxRef` + `debounceRef` on pan, seeded at mount so the initial
  // fetch fires before the first user interaction.
  const [region, setRegion] = useState<Region>(LONDON_REGION)
  const [queryBbox, setQueryBbox] = useState<BoundingBox | null>(
    regionToBbox(LONDON_REGION),
  )
  const pendingBboxRef = useRef<BoundingBox | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Filter state ──────────────────────────────────────────────────────────
  // Single source of truth shared between the FilterSheet and the category
  // pill row. `categoryId` here is the active filter — both surfaces write
  // through `setFilters`.
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [filterVisible, setFilterVisible] = useState(false)

  // ─── Search-text state (separate from filters) ─────────────────────────────
  // Drives the LocationSearch dropdown only. Currently NOT wired into the
  // search query — text search on Map is deferred (locked: no q on Map).
  const [searchQuery, setSearchQuery] = useState('')
  const [showLocationSearch, setShowLocationSearch] = useState(false)

  // ─── UI-only state ─────────────────────────────────────────────────────────
  const [showListView, setShowListView] = useState(false)
  // PR-3 Phase C — carousel + list are now branch-keyed end-to-end.
  // `selectedBranchId` gates the carousel mount AND drives `<MapPins>`
  // visual selection state.  Phase B's interim `selectedMerchant`
  // (which existed to feed the merchant-keyed shared `<MerchantTile>`
  // through the carousel) has been dropped — the carousel now adapts
  // each BranchTile internally via `branchToMerchantTile`.
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [locationPermissionDismissed, setLocationPermissionDismissed] = useState(false)
  const [remoteCityName, setRemoteCityName] = useState<string | null>(null)
  // PR-3 Phase C — indexes into `branches[]` (carousel is branch-keyed).
  const [activeBranchIndex, setActiveBranchIndex] = useState(0)

  // ─── Derived: hybrid-hook router ──────────────────────────────────────────
  // categoryId is intentionally NOT in this list — both /discovery/in-area
  // and /search accept it. Only filters that the in-area route does NOT
  // accept count as "non-scope".
  const hasNonScopeFilters =
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.amenityIds.length > 0 ||
    filters.openNow

  // Use the live region for offshore detection so the UI reacts instantly.
  const offshore = regionIsOffshore(region)

  // ─── Both queries always invoked (rules of hooks); `enabled` selects ──────
  const inAreaQuery = useInAreaBranches(
    queryBbox,
    {
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(locationState.location
        ? { lat: locationState.location.lat, lng: locationState.location.lng }
        : {}),
    },
    !hasNonScopeFilters,
  )

  const searchResultQuery = useSearch(
    {
      ...(queryBbox
        ? {
            minLat: queryBbox.minLat,
            maxLat: queryBbox.maxLat,
            minLng: queryBbox.minLng,
            maxLng: queryBbox.maxLng,
          }
        : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.sortBy !== 'relevance' ? { sortBy: filters.sortBy } : {}),
      ...(filters.voucherTypes.length > 0 ? { voucherTypes: filters.voucherTypes } : {}),
      ...(filters.amenityIds.length > 0 ? { amenityIds: filters.amenityIds } : {}),
      ...(filters.openNow ? { openNow: filters.openNow } : {}),
      ...(locationState.location
        ? { lat: locationState.location.lat, lng: locationState.location.lng }
        : {}),
    },
    hasNonScopeFilters && queryBbox !== null,
    // §AY — pan/zoom anti-flicker for the filtered Map-bbox-mode path.
    // useInAreaBranches already applies the same behaviour at the hook
    // level. Opt-in here so other useSearch consumers (Search /
    // Category screens) keep their default clear-on-key-change semantics.
    { keepPreviousData: true },
  )

  const data      = hasNonScopeFilters ? searchResultQuery.data      : inAreaQuery.data
  const isLoading = hasNonScopeFilters ? searchResultQuery.isLoading : inAreaQuery.isLoading
  // §BH — `isFetching` covers both first-load AND refetch, unlike
  // `isLoading` which is true only on the initial fetch with no
  // cached data. Drives the first-fetch loader gate below: we want
  // the loader during any fetch where no pins are on screen yet.
  const isFetching = hasNonScopeFilters ? searchResultQuery.isFetching : inAreaQuery.isFetching
  // PR-3 Phase D — branch-first end-to-end on Map.  The legacy
  // `merchants` variable (kept through Phase C for backward-compat
  // with existing test fixtures) is gone — all user-visible Map
  // surfaces (pins, carousel, list) consume `branches`, and the
  // empty-state + §BH loader gates are now keyed off `branches.length`
  // too (audit-driven flip, plan §3 + owner direction 2026-05-20).
  // In production the two arrays are coherent (same SQL, same MC
  // gate), so the flip changes no observable behaviour but removes
  // the silent legacy dependency.
  const branches = (data as { branches?: BranchTileType[] } | undefined)?.branches ?? []
  // `total` drives the MapListView count badge — semantically "how
  // many rows in the list" — so it follows `branches.length` (what
  // the list actually renders).  The backend in-area endpoint does
  // not emit a separate `totalBranches`, so reading `branches.length`
  // is the right source.
  const total    = branches.length
  const meta     = data?.meta

  const categories = categoriesData?.categories ?? []

  const showLocationPermission =
    !locationPermissionDismissed && locationState.status === 'idle'

  // ─── Bbox handlers ─────────────────────────────────────────────────────────
  const handleRegionChangeComplete = useCallback((newRegion: Region) => {
    setRegion(newRegion)
    pendingBboxRef.current = regionToBbox(newRegion)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (pendingBboxRef.current) setQueryBbox(pendingBboxRef.current)
    }, PAN_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const animateAndQuery = useCallback((nextRegion: Region) => {
    mapRef.current?.animateToRegion(nextRegion, 400)
    setRegion(nextRegion)
    setQueryBbox(regionToBbox(nextRegion))
  }, [])

  const handleEnableLocation = useCallback(async () => {
    setLocationPermissionDismissed(true)
    await locationState.requestPermission()
  }, [locationState])

  const handleSkipLocation = useCallback(() => {
    setLocationPermissionDismissed(true)
    // queryBbox is already seeded to LONDON_REGION at mount; this just
    // keeps API parity with cefaf45 in case the seed is removed.
    setQueryBbox(regionToBbox(LONDON_REGION))
  }, [])

  const handleRecentre = useCallback(() => {
    if (locationState.location) {
      animateAndQuery({
        latitude:       locationState.location.lat,
        longitude:      locationState.location.lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
    } else {
      animateAndQuery(LONDON_REGION)
    }
  }, [locationState.location, animateAndQuery])

  const handleCitySelect = useCallback(
    (cityName: string, coords: { lat: number; lng: number }) => {
      setRemoteCityName(cityName)
      setShowLocationSearch(false)
      setSearchQuery('')
      animateAndQuery({
        latitude:       coords.lat,
        longitude:      coords.lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
    },
    [animateAndQuery],
  )

  const handleCurrentLocationFromSearch = useCallback(async () => {
    setShowLocationSearch(false)
    setRemoteCityName(null)
    await locationState.requestPermission()
  }, [locationState])

  // §BE 2026-05-17 — keyboard search/return resolves the typed query.
  //
  // Cascade:
  //   1. In-list match (substring against UK_CITIES, same filter
  //      LocationSearch uses). Picks the canonical spelling so the
  //      backend / native geocoder gets a clean name rather than
  //      the user's typing.
  //   2. Out-of-list fallback: geocode the typed string directly via
  //      Expo's `Location.geocodeAsync` wrapper. Lets owners reach
  //      towns / postcodes that aren't yet in the hardcoded list
  //      without waiting on the larger gazetteer work (see §BA /
  //      Plan 4 deferred follow-ups).
  //   3. Failed geocode → non-blocking toast. Pre-§BE the keyboard
  //      return key was unwired, so a missing match silently did
  //      nothing.
  const toast = useToast()
  const handleSearchSubmit = useCallback(async () => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    const inListMatch = UK_CITIES.find((c) => c.toLowerCase().includes(lower))
    const lookupTerm  = inListMatch ?? trimmed
    const coords      = await geocodeCity(lookupTerm)
    if (coords) {
      handleCitySelect(lookupTerm, coords)
      return
    }
    toast.show("Couldn't find that place. Try a different city name.")
  }, [searchQuery, handleCitySelect, toast])

  // ─── Filter handlers ──────────────────────────────────────────────────────
  const handleSelectCategory = useCallback((id: string | null) => {
    // Match FilterSheet's selectTopLevel rule: tap-same → clear; tap-other
    // → switch + clear amenities (eligibility differs per category).
    setFilters((prev) => ({
      ...prev,
      categoryId: prev.categoryId === id ? null : id,
      amenityIds: [],
    }))
  }, [])

  const handleApplyFilters = useCallback((next: FilterState) => {
    setFilters(next)
    setFilterVisible(false)
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setSearchQuery('')
  }, [])

  // ─── Branch tile handlers ─────────────────────────────────────────────────
  // PR-3 Phase C — both the pin layer and the carousel/list layer are
  // now branch-keyed.  Phase B's `handleMerchantPress` (orphaned after
  // <MapPins> flipped to BranchTile) was dropped.  Phase B's
  // `handleBranchPress` simplifies — no merchant lookup needed since
  // the carousel + list consume branches directly.
  const handleBranchPress = useCallback(
    (branch: BranchTileType) => {
      setSelectedBranchId(branch.id)
      const idx = branches.findIndex((b) => b.id === branch.id)
      if (idx !== -1) setActiveBranchIndex(idx)
    },
    [branches],
  )

  // Tap from carousel card or list row → navigate to Merchant Profile.
  // PR-3 Phase D — locked URL contract:
  //   `/(app)/merchant/${merchantId}?branch=${branchId}&from=map`
  // - `?branch=…` lands the Merchant Profile pre-selected to the
  //   tapped branch (existing branch-aware contract from PR #33).
  // - `&from=map` lets `MerchantProfileScreen.onBack` route back to
  //   `/(app)/map` instead of falling through to `router.back()`
  //   (which under expo-router Tabs lands on the previously-active
  //   tab — the owner-flagged bug class Phase 2.1 Search closed for
  //   `from=search`, applied here to Map).
  // The route path is keyed on merchant.id today, so we still resolve
  // branch.id → branch.merchant.id.  The route group prefix
  // `/(app)/…` mirrors Phase 2.1 Search (`SearchScreen.tsx:247`).
  const handleBranchNavigate = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId)
      if (!branch) return
      const merchantId = branch.merchant.id
      if (onMerchantPress) {
        onMerchantPress(merchantId)
      } else {
        router.push(
          `/(app)/merchant/${merchantId}?branch=${branchId}&from=map` as any,
        )
      }
    },
    [branches, onMerchantPress, router],
  )

  // ─── Empty-state classification ───────────────────────────────────────────
  // 1. offshore         — bbox sits outside UK (live region, not debounced)
  // 2. no_uk_supply     — backend says no UK merchants for this filter
  // 3. viewport_empty   — viewport empty but UK has supply
  // Don't render during in-flight refetch (avoids the cold-mount + filter-
  // handoff flash bug — same fix the Category screen ships).
  const emptyVariant: MapEmptyCase | null = useMemo(() => {
    if (showLocationPermission) return null
    if (offshore)                return 'offshore'
    if (isLoading)               return null
    if (branches.length > 0)     return null
    if (meta?.emptyStateReason === 'no_uk_supply') return 'no_uk_supply'
    return 'viewport_empty'
  }, [showLocationPermission, offshore, isLoading, branches.length, meta])

  const hasFilters =
    filters.categoryId !== null ||
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.amenityIds.length > 0 ||
    filters.openNow ||
    searchQuery.length > 0

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={LONDON_REGION}
        onRegionChangeComplete={handleRegionChangeComplete}
        // Fold 3 (PR-3 Phase D) — suppress the blue user-location dot
        // whenever the user is browsing a remote city via
        // <LocationSearch>.  Without this, the dot stays anchored at
        // the user's real GPS while the camera has moved to e.g.
        // Manchester — making it look like the user has teleported.
        // Re-enables on dismiss of <LocationBadge> (or "Use current
        // location") because `remoteCityName` returns to null there.
        showsUserLocation={locationState.status === 'granted' && remoteCityName === null}
        showsMyLocationButton={false}
      >
        <MapPins
          branches={branches}
          selectedId={selectedBranchId}
          onPress={handleBranchPress}
        />
      </MapView>

      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.searchContainer} pointerEvents="box-none">
          <SearchBar
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text)
              setShowLocationSearch(text.length > 0)
            }}
            onCancel={() => {
              setSearchQuery('')
              setShowLocationSearch(false)
            }}
            onSubmitEditing={handleSearchSubmit}
            placeholder="Search city or merchants..."
          />

          {/* §BE follow-up 2026-05-17 — LocationSearch lives INSIDE
              searchContainer in normal flow now, so it always
              renders directly below the SearchBar regardless of the
              device's safe-area-top inset. The previous absolute-
              positioned + `top: 80` approach measured from the
              SafeAreaView's outer frame on real devices, landing the
              dropdown ON TOP of the SearchBar on Dynamic Island
              phones. Normal flow + the SearchBar's own marginBottom
              gives a stable visual gap on every device. */}
          {showLocationSearch && (
            <LocationSearch
              query={searchQuery}
              onCitySelect={handleCitySelect}
              onCurrentLocation={handleCurrentLocationFromSearch}
            />
          )}

          {remoteCityName !== null && !showLocationSearch && (
            <View style={styles.locationBadgeContainer} pointerEvents="box-none">
              <LocationBadge
                cityName={remoteCityName}
                onDismiss={() => {
                  setRemoteCityName(null)
                  handleRecentre()
                }}
              />
            </View>
          )}
        </View>

        {categories.length > 0 && !showLocationSearch && (
          <MapCategoryPills
            categories={categories}
            activeId={filters.categoryId}
            onSelect={handleSelectCategory}
          />
        )}

        {/* Plan 4 M3b follow-up — viewport locality badge. Renders
            null when meta.effectiveLocality is absent. Suppressed
            when the camera is offshore (the offshore message in
            MapEmptyArea already covers that case) or while the
            permission overlay is up (page is in onboarding mode). */}
        {!offshore && !showLocationPermission && !showLocationSearch && (
          <View style={styles.viewportLocalityRow} pointerEvents="box-none">
            <ViewportLocalityBadge localityName={meta?.effectiveLocality?.name} />
          </View>
        )}
      </SafeAreaView>

      {/* Filter button (above recentre, with active-dot indicator) */}
      <Pressable
        onPress={() => setFilterVisible(true)}
        accessibilityLabel="Open filters"
        style={styles.filterButton}
      >
        <SlidersHorizontal size={22} color={color.navy} />
        {hasNonScopeFilters && <View testID="filter-active-dot" style={styles.filterActiveDot} />}
      </Pressable>

      <Pressable
        onPress={handleRecentre}
        accessibilityLabel="Re-centre to my location"
        style={styles.recentreButton}
      >
        <Locate size={22} color={color.navy} />
      </Pressable>

      <Pressable
        onPress={() => setShowListView(true)}
        accessibilityLabel="Show merchant list"
        style={styles.listToggleButton}
      >
        <List size={18} color="#FFFFFF" />
        <Text variant="label.lg" style={styles.listToggleText}>
          List ({total})
        </Text>
      </Pressable>

      {showLocationPermission && (
        <LocationPermission
          onEnable={handleEnableLocation}
          onSkip={handleSkipLocation}
        />
      )}

      {selectedBranchId !== null && branches.length > 0 && (
        <MapBranchTile
          branches={branches}
          activeIndex={activeBranchIndex}
          onClose={() => setSelectedBranchId(null)}
          onIndexChange={setActiveBranchIndex}
          onBranchPress={handleBranchNavigate}
        />
      )}

      {/* §BH — first-data fetch loader. Small RedeemoLoader centered
          on the map (NOT full-screen, NOT a blocking spinner). Visible
          ONLY when the screen has no pins to show AND a fetch is in
          flight. `pointerEvents="none"` so map gestures pass through
          unhindered. PR-3 Phase D gate flip: was `merchants.length === 0`,
          now `branches.length === 0` (the user-visible "nothing on
          screen" source). Gates:
          - branches.length === 0 — no pins on screen (§AY already
            keeps previous pins visible during refetch, so the loader
            only shows when there's truly nothing to display).
          - isFetching === true — covers both initial-load and refetch
            cases (e.g. zoom into a new bbox with no cached data).
          - !showLocationPermission — onboarding overlay takes
            precedence.
          - emptyVariant === null — MapEmptyArea / offshore /
            no_uk_supply take precedence. */}
      {branches.length === 0
        && isFetching
        && !showLocationPermission
        && emptyVariant === null && (
        <View style={styles.firstFetchLoader} pointerEvents="none">
          <RedeemoLoader size="md" accessibilityLabel="Loading nearby merchants" />
        </View>
      )}

      {emptyVariant !== null && (
        <MapEmptyArea
          variant={emptyVariant}
          onRecentre={handleRecentre}
          onClearFilters={handleClearFilters}
          hasFilters={hasFilters}
        />
      )}

      <MapListView
        visible={showListView}
        branches={branches}
        total={total}
        onDismiss={() => setShowListView(false)}
        onBranchPress={handleBranchNavigate}
      />

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
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    top:      0,
    left:     0,
    right:    0,
    zIndex:   layer.sticky,
    gap:      0,
  },
  searchContainer: {
    paddingTop:    spacing[2],
    paddingBottom: spacing[2],
  },
  locationBadgeContainer: {
    paddingHorizontal: spacing[4] + 2,
    paddingTop:        spacing[1],
  },
  viewportLocalityRow: {
    paddingHorizontal: spacing[4] + 2,
    paddingTop:        spacing[1],
  },
  // §BH — centered loader overlay during first-data fetch. Absolute
  // fill so the loader is centered on the visible map area (not
  // anchored to a corner). `pointerEvents="none"` on the JSX prop so
  // gestures pass through. `layer.sticky` places the loader above
  // the MapView base but below the floating control buttons (which
  // also use layer.sticky in their own absolute positioning — the
  // loader's centered position doesn't conflict).
  firstFetchLoader: {
    position:       'absolute',
    top:            0,
    bottom:         0,
    left:           0,
    right:          0,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         layer.sticky,
  },
  recentreButton: {
    position:        'absolute',
    bottom:          160,
    right:           spacing[4],
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          layer.sticky,
    ...elevation.md,
  },
  filterButton: {
    position:        'absolute',
    bottom:          160 + 48 + spacing[2],   // sit just above the recentre button
    right:           spacing[4],
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: '#FFFFFF',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          layer.sticky,
    ...elevation.md,
  },
  filterActiveDot: {
    position:        'absolute',
    top:             8,
    right:           8,
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: color.brandRose,
    borderWidth:     1.5,
    borderColor:     '#FFFFFF',
  },
  listToggleButton: {
    position:          'absolute',
    bottom:            160,
    left:              spacing[4],
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[1] + 2,
    backgroundColor:   color.navy,
    borderRadius:      radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical:   spacing[2] + 2,
    zIndex:            layer.sticky,
    ...elevation.md,
  },
  listToggleText: {
    color: '#FFFFFF',
  },
})
