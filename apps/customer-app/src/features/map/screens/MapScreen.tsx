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
import { useInAreaMerchants, type BoundingBox } from '../hooks/useInAreaMerchants'
import { MapCategoryPills } from '../components/MapCategoryPills'
import { LocationPermission } from '../components/LocationPermission'
import { MapEmptyArea, type MapEmptyCase } from '../components/MapEmptyArea'
import { MapPins } from '../components/MapPins'
import { MapMerchantTile } from '../components/MapMerchantTile'
import { LocationSearch } from '../components/LocationSearch'
import { LocationBadge } from '../components/LocationBadge'
import { MapListView } from '../components/MapListView'
import { SearchBar } from '@/features/search/components/SearchBar'
import { FilterSheet, FilterState } from '@/features/search/components/FilterSheet'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

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
 *   - hasNonScopeFilters === false → `useInAreaMerchants` is enabled
 *                                    (intent-aware ranking via the
 *                                    PR-A /discovery/in-area route)
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
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantTileType | null>(null)
  const [locationPermissionDismissed, setLocationPermissionDismissed] = useState(false)
  const [remoteCityName, setRemoteCityName] = useState<string | null>(null)
  const [activeMerchantIndex, setActiveMerchantIndex] = useState(0)

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
  const inAreaQuery = useInAreaMerchants(
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
  )

  const data      = hasNonScopeFilters ? searchResultQuery.data      : inAreaQuery.data
  const isLoading = hasNonScopeFilters ? searchResultQuery.isLoading : inAreaQuery.isLoading
  const merchants = data?.merchants ?? []
  const total     = data?.total     ?? 0
  const meta      = data?.meta

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

  // ─── Merchant tile handlers ───────────────────────────────────────────────
  const handleMerchantPress = useCallback(
    (merchant: MerchantTileType) => {
      setSelectedMerchant(merchant)
      const idx = merchants.findIndex((m) => m.id === merchant.id)
      if (idx !== -1) setActiveMerchantIndex(idx)
    },
    [merchants],
  )

  const handleMerchantNavigate = useCallback(
    (id: string) => {
      if (onMerchantPress) {
        onMerchantPress(id)
      } else {
        router.push(`/merchant/${id}` as any)
      }
    },
    [onMerchantPress, router],
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
    if (merchants.length > 0)    return null
    if (meta?.emptyStateReason === 'no_uk_supply') return 'no_uk_supply'
    return 'viewport_empty'
  }, [showLocationPermission, offshore, isLoading, merchants.length, meta])

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
        showsUserLocation={locationState.status === 'granted'}
        showsMyLocationButton={false}
      >
        <MapPins
          merchants={merchants}
          selectedId={selectedMerchant?.id ?? null}
          onPress={handleMerchantPress}
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
            placeholder="Search city or merchants..."
          />

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

        {showLocationSearch && (
          <LocationSearch
            query={searchQuery}
            onCitySelect={handleCitySelect}
            onCurrentLocation={handleCurrentLocationFromSearch}
          />
        )}

        {categories.length > 0 && !showLocationSearch && (
          <MapCategoryPills
            categories={categories}
            activeId={filters.categoryId}
            onSelect={handleSelectCategory}
          />
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

      {selectedMerchant !== null && merchants.length > 0 && (
        <MapMerchantTile
          merchants={merchants}
          activeIndex={activeMerchantIndex}
          onClose={() => setSelectedMerchant(null)}
          onIndexChange={setActiveMerchantIndex}
          onMerchantPress={handleMerchantNavigate}
        />
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
        merchants={merchants}
        total={total}
        onDismiss={() => setShowListView(false)}
        onMerchantPress={handleMerchantNavigate}
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
