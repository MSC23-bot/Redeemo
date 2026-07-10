import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import MapView, { Region } from 'react-native-maps'
import { List, Locate, SlidersHorizontal } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius, elevation, layer, useMotionScale } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useMe } from '@/hooks/useMe'
import { useCategories } from '@/hooks/useCategories'
import { useSearch } from '@/hooks/useSearch'
import { useInAreaBranches, type BoundingBox } from '../hooks/useInAreaBranches'
import { quantizeBbox } from '../utils/bboxQuantize'
import { useAccumulatedBranches } from '../hooks/useAccumulatedBranches'
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
import { mapDataView } from '../utils/mapDataView'
// §DF-v2-j Task 11 — chip-variant location identity affordance.  Mounted
// at the TOP of the safe-area band (spec §8.3) ABOVE the SearchBar.
// Visually + semantically distinct from <ViewportLocalityBadge> per D10
// lock: chip = user-context identity (stays put as the map pans);
// badge = viewport locality (updates with pan).
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'

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

// PR-3 fixup-1 (2026-05-20) — `onMerchantPress` prop removed (YAGNI).
// Grep confirmed zero callers in customer-app/src; the prop existed only
// as a Phase A interim hook. Map navigation now always routes via
// `router.push` from `handleBranchNavigate`. Any future external host
// (Storybook, demo screen) can mock `expo-router` if it needs to
// intercept navigation.
type Props = Record<string, never>

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
export function MapScreen(_props: Props) {
  const router = useRouter()
  const mapRef = useRef<MapView>(null)
  const locationState = useUserLocation()
  // §DF — Map locate-me fallback reads the user's saved
  // profile so the camera can centre on the saved postcode coords when
  // GPS is unavailable, instead of jumping to LONDON_REGION regardless
  // of where the user actually lives.
  const me = useMe()
  const { data: categoriesData } = useCategories()

  // ─── Bbox state ────────────────────────────────────────────────────────────
  // `region` is the live camera (offshore detection reads this — no debounce).
  // `queryBbox` is what either hook actually queries against — debounced via
  // `pendingBboxRef` + `debounceRef` on pan.
  //
  // §DF device-QA Round 4 — `queryBbox` now seeds as `null` so the
  // hook's `enabled: bbox !== null` gate defers the initial fetch
  // until the cascade resolves.  Pre-fix the initial fetch fired with
  // LONDON_REGION's bbox, returned London merchants, and then the
  // cascade (GPS/profile) shifted the bbox to e.g. Huddersfield.  With
  // `placeholderData: keepPreviousData` the London merchants stayed
  // visible while the Huddersfield refetch was in flight, and the
  // `animateToRegion` 400ms tween fired `onRegionChangeComplete`
  // mid-animation, each call rewriting `queryBbox` to a slightly
  // different floating-point bbox.  Net result: pins didn't reliably
  // land for the saved-profile centre until the user manually panned.
  //
  // With `queryBbox: null` at mount, NO fetch fires until the cascade
  // effect lands the correct bbox once.  Trade-off: a brief
  // "no-pins-yet" state during the cascade resolution — covered by the
  // existing §BH first-fetch loader (`isFetching && branches.length === 0`).
  const [region, setRegion] = useState<Region>(LONDON_REGION)
  const [queryBbox, setQueryBbox] = useState<BoundingBox | null>(null)
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
  // through the carousel) has been dropped — Phase 2.5 then dropped
  // the interim adapter too, and the carousel now renders <BranchTile>
  // natively.
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

  // Map Phase 2 S2 Task 3 — focus lifecycle. Map's queries pause while the
  // Map tab isn't focused (e.g. the user is on Home/Search/Savings/
  // Profile): both hooks already take an `enabled` boolean, so gating is
  // a pure AND against the existing scope/bbox conditions below — no
  // change to either hook's signature. The MapView itself stays mounted
  // (out of scope per the brief); `keepPreviousData` + the region-
  // accumulation cache (Task 1) mean returning to the tab does not blank
  // — React Query keeps serving the last-cached data for a disabled
  // query, it just stops REFETCHING it while unfocused.
  const isFocused = useIsFocused()

  // ─── Both queries always invoked (rules of hooks); `enabled` selects ──────
  const inAreaQuery = useInAreaBranches(
    queryBbox,
    {
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(locationState.location
        ? { lat: locationState.location.lat, lng: locationState.location.lng }
        : {}),
    },
    !hasNonScopeFilters && isFocused,
  )

  // Map Phase 2 S0 — quantize BEFORE building the /search params, mirroring
  // `useInAreaBranches` (bboxQuantize.ts). Pre-fix this branch sent the RAW
  // continuous camera bbox into `useSearch`'s query key: panning back to an
  // already-seen filtered viewport always missed the cache (fresh key every
  // render) even though the unfiltered in-area path hit it. Quantizing here
  // brings the filtered path to parity with the unfiltered one.
  const quantizedQueryBbox = queryBbox !== null ? quantizeBbox(queryBbox) : null

  const searchResultQuery = useSearch(
    {
      ...(quantizedQueryBbox
        ? {
            minLat: quantizedQueryBbox.minLat,
            maxLat: quantizedQueryBbox.maxLat,
            minLng: quantizedQueryBbox.minLng,
            maxLng: quantizedQueryBbox.maxLng,
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
    // Restack reconciliation (S0 x S2, 2026-07-10): keeps BOTH sides.
    // S2's isFocused gate ANDs into enabled; S0's keepPreviousData +
    // 120s staleTime per-call overrides ride in the options object.
    hasNonScopeFilters && queryBbox !== null && isFocused,
    {
      // §AY — pan/zoom anti-flicker for the filtered Map-bbox-mode path.
      // useInAreaBranches already applies the same behaviour at the hook
      // level. Opt-in here so other useSearch consumers (Search /
      // Category screens) keep their default clear-on-key-change semantics.
      keepPreviousData: true,
      // Map Phase 2 S0 — raised from the hook's 30s default to 120s,
      // matching `useInAreaBranches`'s staleTime. Viewport voucher-type/
      // amenity/sort supply does not change minute-to-minute; combined
      // with the quantization above, a pan-away-and-back within the
      // window is now a cache hit on the filtered path too, instead of
      // only on the unfiltered one. Search/Category screens are
      // unaffected — this is a per-call override, not a hook default
      // change (see useSearch.ts).
      staleTime: 120 * 1000,
    },
  )

  const data      = hasNonScopeFilters ? searchResultQuery.data      : inAreaQuery.data
  const isLoading = hasNonScopeFilters ? searchResultQuery.isLoading : inAreaQuery.isLoading
  // §BH — `isFetching` covers both first-load AND refetch, unlike
  // `isLoading` which is true only on the initial fetch with no
  // cached data. Drives the first-fetch loader gate below: we want
  // the loader during any fetch where no pins are on screen yet.
  const isFetching = hasNonScopeFilters ? searchResultQuery.isFetching : inAreaQuery.isFetching
  // PR-3 Phase D — branch-first end-to-end on Map.  All user-visible
  // Map surfaces (pins, carousel, list) consume `branches`, and the
  // empty-state + §BH loader gates are keyed off `branches.length`.
  //
  // PR-3 fixup-1 (2026-05-20) — extracted to `mapDataView()` so the
  // Codex #1 branchMeta ↔ meta fallback can be pinned in isolation
  // (see `tests/features/map/utils/mapDataView.test.ts`).  The helper
  // resolves both arms cleanly: SearchResponse prefers branchMeta /
  // totalBranches; InAreaResponse falls through to meta /
  // branches.length.
  const dataView = mapDataView(data)

  // Map Phase 2 S2 Task 1 — region-accumulation cache (the pan-back fix).
  //
  // `useAccumulatedBranches` unions every remembered tile that intersects
  // the CURRENT raw viewport with the live in-area query's branches, so
  // panning back to a previously-visited area renders its pins instantly
  // from the store while the live query refreshes quietly underneath.
  //
  // Honesty-rule lock: accumulation is scoped to the UNFILTERED in-area
  // path ONLY (`enabled: !hasNonScopeFilters`). When a non-scope filter
  // is active, the hybrid hook has already switched to `/search` and
  // this call is a pure pass-through — `accumulatedBranches` degrades to
  // `dataView.branches` (the live filtered result, unmixed) so a stale
  // pin from a PREVIOUS unfiltered fetch can never render as if it
  // matched the active filters.
  //
  // `inAreaBranches` reads `inAreaQuery.data` directly (not the hybrid
  // `data`/`dataView`) so recording always sees the true in-area result
  // regardless of which arm is currently active.
  const inAreaBranches  = useMemo(() => mapDataView(inAreaQuery.data).branches, [inAreaQuery.data])
  const rawViewportBbox = useMemo(() => regionToBbox(region), [region])
  const accumulatedBranches = useAccumulatedBranches(
    queryBbox,
    rawViewportBbox,
    inAreaBranches,
    !hasNonScopeFilters,
  )

  const branches = hasNonScopeFilters ? dataView.branches : accumulatedBranches
  // `mapDataView`'s `total` already falls back to `branches.length` for
  // the unfiltered in-area arm (it doesn't paginate — see the helper's
  // doc comment), so extending that same formula to the accumulated
  // union keeps the "List (N)" count and empty-state gating consistent
  // with what's actually rendered, remembered pins included.
  const total = hasNonScopeFilters ? dataView.total : accumulatedBranches.length
  const meta  = dataView.meta

  const categories = categoriesData?.categories ?? []

  // Task 13 Round 1 device-QA item 3 (2026-05-26) — a user with a saved
  // profile location (postcode → lat/lng/localityId backfilled per §DF
  // v1) is NOT a true no-location user.  The Map can open directly in
  // their saved-profile bbox (initial-camera cascade at L335 already
  // handles this), so the blocking "Enable Location / Browse without
  // location" overlay is misleading + intrusive.  Gate it on the
  // absence of a complete saved profile too.  Users with NEITHER GPS
  // NOR a complete saved profile still see the overlay.
  //
  // PR #131 pre-merge fix #2 (2026-05-26) — align with §DF-v2-i:
  // mirror backend EXACTLY by requiring localityId + latitude +
  // longitude all three.  Pre-fix the gate read only lat/lng — a
  // user with lat/lng but missing localityId would have been
  // suppressed from the overlay even though backend
  // `resolveLocationContext` returns `source='none'` for them (and
  // discovery rails fall back to UK-wide).  Now Map's overlay gate
  // matches the backend's profile-completeness predicate.
  const hasCompleteSavedProfile =
    me.data?.localityId != null
    && me.data?.latitude  != null
    && me.data?.longitude != null
  const showLocationPermission =
    !locationPermissionDismissed
    && locationState.status === 'idle'
    && !hasCompleteSavedProfile

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

  // Map Phase 2 Slice S3 — cluster tap zooms the camera in ONE step
  // (halves both deltas), centred on the cluster's centroid, splitting
  // it into its member pins/sub-clusters. Reuses the existing
  // `animateAndQuery` helper (same mechanism as `handleCitySelect` /
  // `handleRecentre`) rather than introducing a new camera-animation
  // path.
  const handleClusterPress = useCallback((cluster: { latitude: number; longitude: number; branchIds: string[] }) => {
    animateAndQuery({
      latitude:       cluster.latitude,
      longitude:      cluster.longitude,
      latitudeDelta:  region.latitudeDelta / 2,
      longitudeDelta: region.longitudeDelta / 2,
    })
  }, [animateAndQuery, region.latitudeDelta, region.longitudeDelta])

  const handleEnableLocation = useCallback(async () => {
    setLocationPermissionDismissed(true)
    await locationState.requestPermission()
  }, [locationState])

  const handleSkipLocation = useCallback(() => {
    setLocationPermissionDismissed(true)
    // §DF device-QA Round 4 — `queryBbox` now seeds as null at mount
    // (defer until cascade resolves). When the user dismisses the
    // permission prompt without granting AND has no saved profile
    // coords, fall back to LONDON_REGION so the user sees SOMETHING
    // rather than a blank map.
    setQueryBbox(regionToBbox(LONDON_REGION))
  }, [])

  // §DF device-QA Round 3 finding — initial camera cascade.
  //
  // Pre-fix the Map tab initialised at LONDON_REGION and only updated when
  // the user tapped the locate-me button.  A Huddersfield user with GPS off
  // would see London on the map and have to manually re-centre.  The
  // previous P2 patch only fixed the locate-me BUTTON; the initial mount
  // wasn't cascading.
  //
  // Cascade (mirrors handleRecentre / Discovery behaviour):
  //   1. GPS coords present → animate to live location.
  //   2. No GPS but saved-profile lat/lng → animate to saved-postcode coords.
  //   3. Neither → stay on LONDON_REGION (the prompt UX takes over).
  //
  // `initialCentredRef` latches on FIRST successful animate so subsequent
  // profile updates / GPS state changes don't re-centre while the user is
  // mid-pan.  If neither data source is available at mount, the ref stays
  // false so we still react if data arrives later (e.g. user grants GPS
  // mid-session, or /profile resolves after the cold cache lands).
  //
  // Trade-off: brief LONDON_REGION flash before the effect fires while
  // data loads.  `animateToRegion` runs a 400ms animation so the camera
  // jump feels intentional rather than a layout glitch.
  const initialCentredRef = useRef(false)
  useEffect(() => {
    if (initialCentredRef.current) return

    // 1. GPS first.
    if (
      locationState.status === 'granted' &&
      locationState.location?.lat != null &&
      locationState.location?.lng != null
    ) {
      initialCentredRef.current = true
      animateAndQuery({
        latitude:       locationState.location.lat,
        longitude:      locationState.location.lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
      return
    }

    // 2. Saved-profile fallback.
    const lat = me.data?.latitude
    const lng = me.data?.longitude
    if (lat != null && lng != null) {
      initialCentredRef.current = true
      animateAndQuery({
        latitude:       lat,
        longitude:      lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
      return
    }

    // 3. Neither GPS nor saved profile coords.  §DF device-QA Round 4 —
    //    `queryBbox` now seeds as null at mount, so without this branch
    //    the screen sits in the §BH loader indefinitely.  Once
    //    `me.isLoading === false` (the /profile fetch resolved and the
    //    user genuinely has no saved coords), AND GPS is in a settled
    //    non-granted status (`denied` | `idle`), fall back to
    //    LONDON_REGION so the user sees pins somewhere rather than a
    //    blank map.  The existing LocationPermission sheet still prompts
    //    the user to enable GPS or set a postcode.
    if (
      !me.isLoading &&
      locationState.status !== 'loading' &&
      locationState.status !== 'granted'
    ) {
      initialCentredRef.current = true
      animateAndQuery(LONDON_REGION)
      return
    }
  }, [
    locationState.status,
    locationState.location?.lat,
    locationState.location?.lng,
    me.data?.latitude,
    me.data?.longitude,
    me.isLoading,
    animateAndQuery,
  ])

  // §DF — locate-me fallback cascade.
  //
  //   1. GPS coords present → centre on the live location (existing
  //      behaviour, unchanged).
  //   2. GPS unavailable BUT saved-profile lat/lng present → centre on
  //      the user's saved postcode locality.  Matches the §DF v1
  //      contract: when GPS is off but a saved postcode exists,
  //      Discovery + Map both anchor on saved profile rather than
  //      defaulting to London regardless of where the user lives.
  //   3. No GPS AND no saved-profile coords → do NOT move the camera.
  //      The existing "Location is off" UI on Map (LocationPermission
  //      sheet / empty area state) already prompts the user to enable
  //      location or set a postcode; silently jumping to London here
  //      would mask that prompt and confuse users whose saved area is
  //      elsewhere.  Earlier behaviour fell through to LONDON_REGION
  //      unconditionally — see device-QA R1-1.
  const profileLatLng = (() => {
    const lat = me.data?.latitude
    const lng = me.data?.longitude
    if (lat == null || lng == null) return null
    return { lat, lng }
  })()
  const handleRecentre = useCallback(() => {
    // Offshore fix (owner-reported from Doha, 2026-07-10): when the DEVICE's
    // own GPS is outside the UK extent, re-centring to it is a visible no-op:
    // the camera "moves" to where the user already is, the offshore banner
    // stays, and its "Recentre to UK" CTA appears dead. For a non-UK GPS fix,
    // skip the GPS branch entirely: prefer the saved-profile UK coords, else
    // fall back to LONDON_REGION (the one recentre case where the London
    // fallback is correct: the button's promise is literally "take me to the
    // UK", so unlike the no-location case below, jumping to London cannot
    // mask a prompt or surprise anyone).
    const gps = locationState.location
    const gpsIsOffshore =
      gps !== null &&
      (gps.lat < UK_EXTENT.minLat || gps.lat > UK_EXTENT.maxLat ||
       gps.lng < UK_EXTENT.minLng || gps.lng > UK_EXTENT.maxLng)
    if (gps && !gpsIsOffshore) {
      animateAndQuery({
        latitude:       gps.lat,
        longitude:      gps.lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
    } else if (profileLatLng) {
      animateAndQuery({
        latitude:       profileLatLng.lat,
        longitude:      profileLatLng.lng,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      })
    } else if (gpsIsOffshore) {
      // Non-UK GPS + no saved UK postcode: honour the CTA's promise anyway.
      animateAndQuery(LONDON_REGION)
    }
    // else: no GPS at all and no profile coords: no-action — see comment above.
  }, [locationState.location, profileLatLng, animateAndQuery])

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
  //
  // PR-3 fixup-1 (2026-05-20) — `__DEV__` guard added.  A stale pin tap
  // (e.g. user taps mid-refetch and the branch is already gone from the
  // new array) silently no-ops in production but logs in dev so the
  // race is observable during device QA.
  //
  // Map Phase 2 S2 Task 4 — `lastProgrammaticIndexRef` guards the
  // pin-tap → carousel-autoscroll → onIndexChange feedback loop. A pin
  // tap here sets BOTH `selectedBranchId` and `activeBranchIndex`;
  // `<MapBranchTile>` reacts to the `activeIndex` prop change by
  // scrolling its carousel to that card, and on settle fires
  // `onIndexChange` with the index it landed on. `MapBranchTile`'s own
  // `handleScroll` already no-ops when the computed index equals the
  // `activeIndex` it was given, so this ref is defence-in-depth (not the
  // only guard) — it records the index MapScreen just set
  // programmatically so `handleCarouselIndexChange` can recognise an
  // echo of THIS tap (rather than a genuine user swipe) and skip
  // re-running the select/camera-pan side effects a second time.
  const lastProgrammaticIndexRef = useRef<number | null>(null)

  const handleBranchPress = useCallback(
    (branch: BranchTileType) => {
      setSelectedBranchId(branch.id)
      const idx = branches.findIndex((b) => b.id === branch.id)
      if (idx !== -1) {
        lastProgrammaticIndexRef.current = idx
        setActiveBranchIndex(idx)
      } else if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[MapScreen] handleBranchPress: branch not in current array, activeBranchIndex unchanged', branch.id)
      }
    },
    [branches],
  )

  // Map Phase 2 S2 Task 4 — respects reduce-motion the same way
  // PressableScale/BottomSheet do (`useMotionScale()` is the codebase's
  // established gate: 1 = animate, 0 = skip straight to the end state).
  // `animateToRegion`'s second arg is a duration in ms; 0 makes it an
  // instant jump with no tween, which is the react-native-maps
  // equivalent of "skip the animation".
  const reduceMotionScale = useMotionScale()

  // Centres the camera on a branch's pin, KEEPING the current zoom
  // (only lat/lng move — `region.latitudeDelta`/`longitudeDelta` are
  // carried over unchanged). Redaction-safe: branches with a redacted
  // location (POSTCODE_CENTROID / NEEDS_REVIEW — L3 lock, branchLatitude/
  // branchLongitude are null on the wire for those) simply don't move
  // the camera, matching `<MapPins>`'s own null-coord guard.
  //
  // Intentionally does NOT touch `region`/`queryBbox` state directly —
  // `mapRef.animateToRegion` fires the SAME native
  // `onRegionChangeComplete` callback a manual pan does once the
  // animation settles, so the existing 500ms-debounced fetch pipeline
  // (and the region-accumulation cache's `region`-derived viewport)
  // picks this up for free, with no special-casing needed here.
  const animateCameraToBranch = useCallback(
    (branch: BranchTileType) => {
      const { branchLatitude, branchLongitude } = branch
      if (branchLatitude == null || branchLongitude == null) return
      const duration = reduceMotionScale === 0 ? 0 : 350
      mapRef.current?.animateToRegion(
        {
          latitude:       branchLatitude,
          longitude:      branchLongitude,
          latitudeDelta:  region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        },
        duration,
      )
    },
    [region.latitudeDelta, region.longitudeDelta, reduceMotionScale],
  )

  // Map Phase 2 S2 Task 4 (spec §7.5/§7.6) — two-way carousel sync.
  // Carousel swipe now ALSO updates `selectedBranchId` (so `<MapPins>`
  // highlights the newly-active pin) and pans the camera to centre it.
  // Guarded against the pin-tap → autoscroll → onIndexChange echo via
  // `lastProgrammaticIndexRef` (set in `handleBranchPress` above): when
  // this fires with the SAME index MapScreen just set programmatically,
  // it's the carousel settling from a pin tap, not a user swipe — the
  // selection + camera already match that branch, so this is a no-op
  // beyond clearing the guard and syncing `activeBranchIndex`.
  const handleCarouselIndexChange = useCallback(
    (index: number) => {
      setActiveBranchIndex(index)
      if (lastProgrammaticIndexRef.current === index) {
        lastProgrammaticIndexRef.current = null
        return
      }
      lastProgrammaticIndexRef.current = null
      const branch = branches[index]
      if (!branch) return
      setSelectedBranchId(branch.id)
      animateCameraToBranch(branch)
    },
    [branches, animateCameraToBranch],
  )

  // Swipe-down-to-dismiss (spec §7.6) and the existing X button both
  // route through this single handler.
  const handleCarouselDismiss = useCallback(() => {
    setSelectedBranchId(null)
  }, [])

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
  //
  // PR-3 fixup-1 (2026-05-20) — `__DEV__` guard added for stale taps
  // (production silent; dev surfaces the race).
  const handleBranchNavigate = useCallback(
    (branchId: string) => {
      const branch = branches.find((b) => b.id === branchId)
      if (!branch) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[MapScreen] handleBranchNavigate: branch not found for id', branchId)
        }
        return
      }
      const merchantId = branch.merchant.id
      router.push(
        `/(app)/merchant/${merchantId}?branch=${branchId}&from=map` as any,
      )
    },
    [branches, router],
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
          region={region}
          onClusterPress={handleClusterPress}
          // S3 correction — the pin glyph's top-level category resolves
          // CLIENT-SIDE from this tree (parentId walk), never from a
          // wire field on branch tiles (strict-schema hazard; see
          // categoryPinGlyph.ts). Same useCategories data the pill row
          // below already consumes.
          categories={categories}
        />
      </MapView>

      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        {/* §DF-v2-j Task 11 — chip-variant <LocationStatusLabel> mounted
            at the TOP of the safe-area band per spec §8.3.  Reads the
            unified `data?.locationContext` envelope — both /search and
            /discovery/in-area emit it (Tasks 4 + 5).  Stays put as the
            map pans below (user-context identity, NOT viewport).
            Hidden during onboarding overlay + interactive
            LocationSearch dropdown to avoid visual conflict with the
            primary input states; offshore camera does NOT suppress
            the chip (user identity is still meaningful when the map
            is over water — the chip points the user back to Your
            Location).  D10 lock preserved: <ViewportLocalityBadge>
            stays in its own row below this overlay region. */}
        {!showLocationPermission && !showLocationSearch && (
          <View style={styles.statusLabelRow} pointerEvents="box-none">
            <LocationStatusLabel
              variant="chip"
              locationContext={data?.locationContext}
            />
          </View>
        )}

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
          onClose={handleCarouselDismiss}
          onIndexChange={handleCarouselIndexChange}
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
  // §DF-v2-j Task 11 — chip row sits at the very top of the safe-area
  // band, centered horizontally.  `pointerEvents="box-none"` on the JSX
  // lets map gestures pass through everywhere EXCEPT the chip itself
  // (the chip's own Pressable captures its tap target).
  statusLabelRow: {
    paddingTop:        spacing[1],  // 4pt below safe-area top
    paddingHorizontal: spacing[4],
    alignItems:        'center',
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
