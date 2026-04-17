import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Pressable,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MapView, { Region } from 'react-native-maps'
import { List, Locate } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useCategories } from '@/hooks/useCategories'
import { useMapMerchants } from '../hooks/useMapMerchants'
import { MapCategoryPills } from '../components/MapCategoryPills'
import { LocationPermission } from '../components/LocationPermission'
import { MapEmptyArea } from '../components/MapEmptyArea'
import { MapPins } from '../components/MapPins'
import { MapMerchantTile } from '../components/MapMerchantTile'
import { LocationSearch } from '../components/LocationSearch'
import { LocationBadge } from '../components/LocationBadge'
import { MapListView } from '../components/MapListView'
import { SearchBar } from '@/features/search/components/SearchBar'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const LONDON_REGION: Region = {
  latitude: 51.5074,
  longitude: -0.1278,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

type BoundingBox = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

function regionToBbox(region: Region): BoundingBox {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  }
}

type Props = {
  onMerchantPress?: (id: string) => void
}

export function MapScreen({ onMerchantPress }: Props) {
  const router = useRouter()
  const mapRef = useRef<MapView>(null)
  const locationState = useUserLocation()
  const { data: categoriesData } = useCategories()

  const [region, setRegion] = useState<Region>(LONDON_REGION)
  const [bbox, setBbox] = useState<BoundingBox | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showListView, setShowListView] = useState(false)
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantTileType | null>(null)
  const [locationPermissionDismissed, setLocationPermissionDismissed] = useState(false)
  const [remoteCityName, setRemoteCityName] = useState<string | null>(null)
  const [activeMerchantIndex, setActiveMerchantIndex] = useState(0)
  const [showLocationSearch, setShowLocationSearch] = useState(false)

  const { data: searchData } = useMapMerchants(bbox, activeCategoryId)
  const merchants = searchData?.merchants ?? []
  const total = searchData?.total ?? 0

  const categories = categoriesData?.categories ?? []

  const showLocationPermission =
    !locationPermissionDismissed &&
    locationState.status === 'idle'

  const handleRegionChangeComplete = useCallback((newRegion: Region) => {
    setRegion(newRegion)
    setBbox(regionToBbox(newRegion))
  }, [])

  const handleEnableLocation = useCallback(async () => {
    setLocationPermissionDismissed(true)
    await locationState.requestPermission()
  }, [locationState])

  const handleSkipLocation = useCallback(() => {
    setLocationPermissionDismissed(true)
    setBbox(regionToBbox(LONDON_REGION))
  }, [])

  const handleRecentre = useCallback(() => {
    if (locationState.location) {
      const newRegion: Region = {
        latitude: locationState.location.lat,
        longitude: locationState.location.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
      mapRef.current?.animateToRegion(newRegion, 400)
      setBbox(regionToBbox(newRegion))
    } else {
      mapRef.current?.animateToRegion(LONDON_REGION, 400)
      setBbox(regionToBbox(LONDON_REGION))
    }
  }, [locationState.location])

  const handleClearFilters = useCallback(() => {
    setActiveCategoryId(null)
    setSearchQuery('')
  }, [])

  const handleCitySelect = useCallback(
    (cityName: string, coords: { lat: number; lng: number }) => {
      setRemoteCityName(cityName)
      setShowLocationSearch(false)
      setSearchQuery('')
      const newRegion: Region = {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
      mapRef.current?.animateToRegion(newRegion, 400)
      setBbox(regionToBbox(newRegion))
    },
    [],
  )

  const handleCurrentLocationFromSearch = useCallback(async () => {
    setShowLocationSearch(false)
    setRemoteCityName(null)
    await locationState.requestPermission()
  }, [locationState])

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

  const showEmptyArea = !showLocationPermission && bbox !== null && merchants.length === 0
  const hasFilters = activeCategoryId !== null || searchQuery.length > 0

  return (
    <View style={styles.container}>
      {/* Map View */}
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

      {/* Search overlay at top */}
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

          {/* Location badge for remote city */}
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

        {/* Location search dropdown */}
        {showLocationSearch && (
          <LocationSearch
            query={searchQuery}
            onCitySelect={handleCitySelect}
            onCurrentLocation={handleCurrentLocationFromSearch}
          />
        )}

        {/* Category pills below search */}
        {categories.length > 0 && !showLocationSearch && (
          <MapCategoryPills
            categories={categories}
            activeId={activeCategoryId}
            onSelect={setActiveCategoryId}
          />
        )}
      </SafeAreaView>

      {/* Re-centre button (bottom right) */}
      <Pressable
        onPress={handleRecentre}
        accessibilityLabel="Re-centre to my location"
        style={styles.recentreButton}
      >
        <Locate size={22} color={color.navy} />
      </Pressable>

      {/* List toggle button (bottom left, navy pill) */}
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

      {/* Location permission overlay */}
      {showLocationPermission && (
        <LocationPermission
          onEnable={handleEnableLocation}
          onSkip={handleSkipLocation}
        />
      )}

      {/* Floating swipeable merchant tile */}
      {selectedMerchant !== null && merchants.length > 0 && (
        <MapMerchantTile
          merchants={merchants}
          activeIndex={activeMerchantIndex}
          onClose={() => setSelectedMerchant(null)}
          onIndexChange={setActiveMerchantIndex}
          onMerchantPress={handleMerchantNavigate}
        />
      )}

      {/* Empty area card */}
      {showEmptyArea && (
        <MapEmptyArea
          onRecentre={handleRecentre}
          onClearFilters={handleClearFilters}
          hasFilters={hasFilters}
        />
      )}

      {/* Map list view half-sheet */}
      <MapListView
        visible={showListView}
        merchants={merchants}
        total={total}
        onDismiss={() => setShowListView(false)}
        onMerchantPress={handleMerchantNavigate}
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
    top: 0,
    left: 0,
    right: 0,
    zIndex: layer.sticky,
    gap: 0,
  },
  searchContainer: {
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  locationBadgeContainer: {
    paddingHorizontal: spacing[4] + 2,
    paddingTop: spacing[1],
  },
  recentreButton: {
    position: 'absolute',
    bottom: 160,
    right: spacing[4],
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: layer.sticky,
    ...elevation.md,
  },
  listToggleButton: {
    position: 'absolute',
    bottom: 160,
    left: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 2,
    backgroundColor: color.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    zIndex: layer.sticky,
    ...elevation.md,
  },
  listToggleText: {
    color: '#FFFFFF',
  },
})
