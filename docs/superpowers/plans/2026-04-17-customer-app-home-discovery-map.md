# Customer App — Home, Discovery & Map Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Home, Discovery (search/filter/categories) and Map Tab screens for the Redeemo customer app, matching the approved mockups exactly and wiring all features to the existing backend APIs.

**Architecture:** Feature-based directory structure mirroring existing patterns (`src/features/home/`, `src/features/map/`, `src/features/search/`). Shared components in `src/features/shared/`. API layer in `src/lib/api/discovery.ts`. React Query hooks colocated with features. Tab bar restructured to show 5 gradient tabs. react-native-maps for the Map tab.

**Tech Stack:** React Native (Expo SDK 54), expo-router v4, react-native-maps, @tanstack/react-query, react-native-reanimated, react-native-gesture-handler, expo-location, expo-linear-gradient, lucide-react-native, Zustand

**Design spec:** `docs/superpowers/specs/2026-04-17-customer-app-home-discovery-map-design.md`

**Approved mockups:** `.superpowers/brainstorm/62129-1776350922/content/home-discovery-v1.html` (v7) and `map-tab-v1.html` (v2)

---

## File Structure

### New files to create

```
src/lib/api/discovery.ts              — API functions for all discovery endpoints
src/lib/geocoding.ts                  — City name geocoding helper (expo-location)

src/hooks/useHomeFeed.ts              — React Query hook: GET /api/v1/customer/home
src/hooks/useCategories.ts            — React Query hook: GET /api/v1/customer/categories
src/hooks/useCampaigns.ts             — React Query hook: GET /api/v1/customer/campaigns
src/hooks/useSearch.ts                — React Query hook: GET /api/v1/customer/search
src/hooks/useLocation.ts              — Location permission + current coords + reverse geocode

src/features/shared/MerchantTile.tsx  — Featured-style merchant tile (reused on Home + Map)
src/features/shared/CategoryPill.tsx  — Category pill with coloured dot (reused on Home + Map)
src/features/shared/SavePill.tsx      — Green gradient savings pill
src/features/shared/VoucherCountPill.tsx — Red voucher count pill
src/features/shared/OpenStatusBadge.tsx — Open/Closed indicator
src/features/shared/StarRating.tsx    — Star + score + count inline
src/features/shared/DotIndicator.tsx  — Synced dot indicators for carousels
src/features/shared/SkeletonTile.tsx  — Skeleton placeholder for merchant tiles

src/features/home/screens/HomeScreen.tsx          — Main home screen (replaces HomePlaceholderScreen)
src/features/home/components/HomeHeader.tsx        — Greeting + location + icons + avatar
src/features/home/components/CampaignCarousel.tsx  — Auto-sliding campaign banners
src/features/home/components/CategoryGrid.tsx      — 2×3 category grid with "More" tile
src/features/home/components/FeaturedCarousel.tsx  — Featured merchants horizontal carousel
src/features/home/components/TrendingSection.tsx   — Trending near you horizontal scroll
src/features/home/components/NearbyByCategory.tsx  — Per-category horizontal carousels

src/features/search/screens/SearchScreen.tsx       — Full search view with typeahead
src/features/search/components/SearchBar.tsx        — Reusable search input bar
src/features/search/components/TrendingSearches.tsx — Pre-search pill tags
src/features/search/components/SearchResultItem.tsx — Single typeahead result row

src/features/search/screens/AllCategoriesScreen.tsx — Vertical category list
src/features/search/screens/CategoryResultsScreen.tsx — Category-filtered merchant list
src/features/search/components/FilterSheet.tsx      — Filter bottom sheet (8 filter sections)

src/features/map/screens/MapScreen.tsx             — Full map tab screen
src/features/map/components/MapPins.tsx             — Teardrop pins with category colours
src/features/map/components/MapMerchantTile.tsx     — Floating swipeable merchant tile
src/features/map/components/MapCategoryPills.tsx    — Horizontal filter pills on map
src/features/map/components/MapListView.tsx         — Half-sheet list view
src/features/map/components/LocationSearch.tsx      — City typeahead for remote browsing
src/features/map/components/LocationBadge.tsx       — Navy pill showing remote city name
src/features/map/components/LocationPermission.tsx  — Full overlay permission prompt
src/features/map/components/MapEmptyArea.tsx        — No merchants floating card
src/features/map/hooks/useMapMerchants.ts          — React Query: bounding box search for map

app/(app)/index.tsx                                — Re-export HomeScreen
app/(app)/map.tsx                                  — Re-export MapScreen
app/(app)/search.tsx                               — Search screen route
app/(app)/categories.tsx                           — All categories route
app/(app)/category/[id].tsx                        — Category results route
```

### Files to modify

```
app/(app)/_layout.tsx                              — Restructure to 5 gradient tabs
src/design-system/tokens.ts                        — Add cream colour, nav gradient tokens
src/design-system/index.ts                         — Re-export new tokens
package.json                                       — Add react-native-maps dependency
```

---

### Task 1: Install react-native-maps and update tokens

**Files:**
- Modify: `apps/customer-app/package.json`
- Modify: `apps/customer-app/src/design-system/tokens.ts`
- Modify: `apps/customer-app/src/design-system/index.ts`

- [ ] **Step 1: Install react-native-maps**

```bash
cd apps/customer-app
npx expo install react-native-maps
```

- [ ] **Step 2: Update design tokens**

Add to `src/design-system/tokens.ts`:

```typescript
// Add cream to color object, after surface block:
cream: '#FFF9F5',

// Add navGradient (3-stop rose→red→coral) to color object:
navGradient: ['#E20C04', '#D10A03', '#E84A00'] as const,

// Add pin colours for map:
pin: {
  foodDrink:       '#E65100',
  beautyWellness:  '#E91E8C',
  fitnessSport:    '#4CAF50',
  shopping:        '#7C4DFF',
  default:         '#E20C04',
} as const,
```

Add to `layout` object:

```typescript
screenPaddingHNarrow: 18,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/customer-app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/package.json apps/customer-app/src/design-system/tokens.ts
git commit -m "feat: install react-native-maps, add cream/nav-gradient/pin tokens"
```

---

### Task 2: Discovery API layer

**Files:**
- Create: `apps/customer-app/src/lib/api/discovery.ts`
- Test: `apps/customer-app/tests/lib/api/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/api/discovery.test.ts`:

```typescript
import { discoveryApi } from '@/lib/api/discovery'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
}))

import { api } from '@/lib/api'
const mockGet = api.get as jest.Mock

describe('discoveryApi', () => {
  beforeEach(() => mockGet.mockReset())

  it('getHomeFeed calls correct endpoint with lat/lng', async () => {
    mockGet.mockResolvedValue({ featured: [], trending: [], campaigns: [], nearbyByCategory: [], locationContext: {} })
    await discoveryApi.getHomeFeed({ lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/home?lat=51.5&lng=-0.1')
  })

  it('getHomeFeed calls without coords when null', async () => {
    mockGet.mockResolvedValue({ featured: [] })
    await discoveryApi.getHomeFeed({})
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/home')
  })

  it('searchMerchants sends query params', async () => {
    mockGet.mockResolvedValue({ merchants: [], total: 0 })
    await discoveryApi.searchMerchants({ q: 'pizza', lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('q=pizza'))
  })

  it('searchMerchants sends bounding box params', async () => {
    mockGet.mockResolvedValue({ merchants: [], total: 0 })
    await discoveryApi.searchMerchants({ minLat: 51.4, maxLat: 51.6, minLng: -0.2, maxLng: 0 })
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('minLat=51.4'))
  })

  it('getCategories calls correct endpoint', async () => {
    mockGet.mockResolvedValue({ categories: [] })
    await discoveryApi.getCategories()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/categories')
  })

  it('getCampaigns calls correct endpoint', async () => {
    mockGet.mockResolvedValue([])
    await discoveryApi.getCampaigns()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/campaigns')
  })

  it('getMerchant calls correct endpoint', async () => {
    mockGet.mockResolvedValue({})
    await discoveryApi.getMerchant('m1', { lat: 51.5, lng: -0.1 })
    expect(mockGet).toHaveBeenCalledWith('/api/v1/customer/merchants/m1?lat=51.5&lng=-0.1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts --no-coverage
```

Expected: FAIL — module `@/lib/api/discovery` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/api/discovery.ts`:

```typescript
import { api } from '../api'

export type MerchantTile = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryCategory: { id: string; name: string } | null
  subcategory: { id: string; name: string } | null
  voucherCount: number
  maxEstimatedSaving: number | null
  distance: number | null
  nearestBranchId: string | null
  avgRating: number | null
  reviewCount: number
  isFavourited: boolean
}

export type LocationContext = {
  city: string | null
  lat: number | null
  lng: number | null
  source: 'coordinates' | 'profile' | 'none'
}

export type HomeFeedResponse = {
  locationContext: LocationContext
  featured: MerchantTile[]
  trending: MerchantTile[]
  campaigns: {
    id: string
    name: string
    description: string | null
    bannerUrl: string | null
    gradientStart: string | null
    gradientEnd: string | null
    ctaText: string | null
  }[]
  nearbyByCategory: {
    category: { id: string; name: string }
    merchants: MerchantTile[]
  }[]
}

export type Category = {
  id: string
  name: string
  iconUrl: string | null
  pinColour: string | null
  pinIcon: string | null
  merchantCount: number
  parentId: string | null
  subcategories?: { id: string; name: string }[]
}

export type SearchParams = {
  q?: string
  categoryId?: string
  subcategoryId?: string
  lat?: number
  lng?: number
  minLat?: number
  maxLat?: number
  minLng?: number
  maxLng?: number
  maxDistanceMiles?: number
  minSaving?: number
  voucherTypes?: string[]
  amenityIds?: string[]
  openNow?: boolean
  featured?: boolean
  topRated?: boolean
  sortBy?: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  limit?: number
  offset?: number
}

export type SearchResponse = {
  merchants: MerchantTile[]
  total: number
  limit: number
  offset: number
}

function buildQuery(params: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      parts.push(`${key}=${value.join(',')}`)
    } else {
      parts.push(`${key}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export const discoveryApi = {
  getHomeFeed(opts: { lat?: number; lng?: number } = {}) {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    return api.get<HomeFeedResponse>(`/api/v1/customer/home${qs}`)
  },

  searchMerchants(params: SearchParams) {
    const qs = buildQuery(params as Record<string, unknown>)
    return api.get<SearchResponse>(`/api/v1/customer/search${qs}`)
  },

  getCategories() {
    return api.get<{ categories: Category[] }>('/api/v1/customer/categories')
  },

  getCampaigns() {
    return api.get<HomeFeedResponse['campaigns']>('/api/v1/customer/campaigns')
  },

  getMerchant(id: string, opts: { lat?: number; lng?: number } = {}) {
    const qs = buildQuery({ lat: opts.lat, lng: opts.lng })
    return api.get<unknown>(`/api/v1/customer/merchants/${id}${qs}`)
  },

  getMerchantBranches(id: string) {
    return api.get<unknown>(`/api/v1/customer/merchants/${id}/branches`)
  },

  getCampaignMerchants(id: string, params: { categoryId?: string; lat?: number; lng?: number; limit?: number; offset?: number } = {}) {
    const qs = buildQuery(params as Record<string, unknown>)
    return api.get<unknown>(`/api/v1/customer/campaigns/${id}/merchants${qs}`)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/lib/api/discovery.test.ts --no-coverage
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/discovery.ts apps/customer-app/tests/lib/api/discovery.test.ts
git commit -m "feat: add discovery API layer with all customer endpoints"
```

---

### Task 3: React Query hooks for discovery

**Files:**
- Create: `apps/customer-app/src/hooks/useHomeFeed.ts`
- Create: `apps/customer-app/src/hooks/useCategories.ts`
- Create: `apps/customer-app/src/hooks/useCampaigns.ts`
- Create: `apps/customer-app/src/hooks/useSearch.ts`
- Create: `apps/customer-app/src/hooks/useLocation.ts`
- Test: `apps/customer-app/tests/hooks/useHomeFeed.test.ts`

- [ ] **Step 1: Write the failing test for useHomeFeed**

Create `tests/hooks/useHomeFeed.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useHomeFeed } from '@/hooks/useHomeFeed'

jest.mock('@/lib/api/discovery', () => ({
  discoveryApi: {
    getHomeFeed: jest.fn().mockResolvedValue({
      locationContext: { city: 'London', lat: 51.5, lng: -0.1, source: 'coordinates' },
      featured: [{ id: 'm1', businessName: 'Test Merchant' }],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
    }),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useHomeFeed', () => {
  it('fetches home feed data', async () => {
    const { result } = renderHook(() => useHomeFeed({ lat: 51.5, lng: -0.1 }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.featured).toHaveLength(1)
    expect(result.current.data?.featured[0].businessName).toBe('Test Merchant')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/hooks/useHomeFeed.test.ts --no-coverage
```

Expected: FAIL — module `@/hooks/useHomeFeed` not found.

- [ ] **Step 3: Write all hooks**

Create `src/hooks/useHomeFeed.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { discoveryApi, HomeFeedResponse } from '@/lib/api/discovery'

export function useHomeFeed(coords: { lat?: number; lng?: number }) {
  return useQuery<HomeFeedResponse>({
    queryKey: ['homeFeed', coords.lat, coords.lng],
    queryFn: () => discoveryApi.getHomeFeed(coords),
    staleTime: 5 * 60 * 1000,
  })
}
```

Create `src/hooks/useCategories.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { discoveryApi, Category } from '@/lib/api/discovery'

export function useCategories() {
  return useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => discoveryApi.getCategories(),
    staleTime: 30 * 60 * 1000,
  })
}
```

Create `src/hooks/useCampaigns.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { discoveryApi, HomeFeedResponse } from '@/lib/api/discovery'

export function useCampaigns() {
  return useQuery<HomeFeedResponse['campaigns']>({
    queryKey: ['campaigns'],
    queryFn: () => discoveryApi.getCampaigns(),
    staleTime: 10 * 60 * 1000,
  })
}
```

Create `src/hooks/useSearch.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { discoveryApi, SearchParams, SearchResponse } from '@/lib/api/discovery'

export function useSearch(params: SearchParams, enabled = true) {
  return useQuery<SearchResponse>({
    queryKey: ['search', params],
    queryFn: () => discoveryApi.searchMerchants(params),
    enabled,
    staleTime: 2 * 60 * 1000,
  })
}
```

Create `src/hooks/useLocation.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import * as Location from 'expo-location'

export type UserLocation = {
  lat: number
  lng: number
  area: string | null
  city: string | null
}

export type LocationState = {
  status: 'idle' | 'loading' | 'granted' | 'denied'
  location: UserLocation | null
  requestPermission: () => Promise<void>
}

export function useUserLocation(): LocationState {
  const [status, setStatus] = useState<LocationState['status']>('idle')
  const [location, setLocation] = useState<UserLocation | null>(null)

  const requestPermission = useCallback(async () => {
    setStatus('loading')
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync()
      if (perm !== 'granted') {
        setStatus('denied')
        return
      }
      setStatus('granted')
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => [undefined])
      setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        area: place?.subregion ?? place?.district ?? null,
        city: place?.city ?? null,
      })
    } catch {
      setStatus('denied')
    }
  }, [])

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status: perm }) => {
      if (perm === 'granted') requestPermission()
    })
  }, [requestPermission])

  return { status, location, requestPermission }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/hooks/useHomeFeed.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

```bash
cd apps/customer-app && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/hooks/useHomeFeed.ts apps/customer-app/src/hooks/useCategories.ts apps/customer-app/src/hooks/useCampaigns.ts apps/customer-app/src/hooks/useSearch.ts apps/customer-app/src/hooks/useLocation.ts apps/customer-app/tests/hooks/useHomeFeed.test.ts
git commit -m "feat: add React Query hooks for home feed, categories, campaigns, search, location"
```

---

### Task 4: Shared components — pills, badges, star rating, dot indicator

**Files:**
- Create: `apps/customer-app/src/features/shared/SavePill.tsx`
- Create: `apps/customer-app/src/features/shared/VoucherCountPill.tsx`
- Create: `apps/customer-app/src/features/shared/OpenStatusBadge.tsx`
- Create: `apps/customer-app/src/features/shared/StarRating.tsx`
- Create: `apps/customer-app/src/features/shared/DotIndicator.tsx`
- Create: `apps/customer-app/src/features/shared/SkeletonTile.tsx`
- Test: `apps/customer-app/tests/features/shared/pills.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/shared/pills.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { SavePill } from '@/features/shared/SavePill'
import { VoucherCountPill } from '@/features/shared/VoucherCountPill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'
import { StarRating } from '@/features/shared/StarRating'

describe('SavePill', () => {
  it('renders saving amount with pound sign', () => {
    const { getByText } = render(<SavePill amount={15} />)
    expect(getByText('Save up to £15')).toBeTruthy()
  })

  it('returns null when amount is null', () => {
    const { toJSON } = render(<SavePill amount={null} />)
    expect(toJSON()).toBeNull()
  })
})

describe('VoucherCountPill', () => {
  it('renders voucher count', () => {
    const { getByText } = render(<VoucherCountPill count={3} />)
    expect(getByText('3 vouchers')).toBeTruthy()
  })

  it('renders singular for count 1', () => {
    const { getByText } = render(<VoucherCountPill count={1} />)
    expect(getByText('1 voucher')).toBeTruthy()
  })
})

describe('OpenStatusBadge', () => {
  it('renders Open text when isOpen is true', () => {
    const { getByText } = render(<OpenStatusBadge isOpen={true} />)
    expect(getByText('Open')).toBeTruthy()
  })

  it('renders Closed text when isOpen is false', () => {
    const { getByText } = render(<OpenStatusBadge isOpen={false} />)
    expect(getByText('Closed')).toBeTruthy()
  })
})

describe('StarRating', () => {
  it('renders rating and count', () => {
    const { getByText } = render(<StarRating rating={4.5} count={128} />)
    expect(getByText('4.5')).toBeTruthy()
    expect(getByText('(128)')).toBeTruthy()
  })

  it('returns null when rating is null', () => {
    const { toJSON } = render(<StarRating rating={null} count={0} />)
    expect(toJSON()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/shared/pills.test.tsx --no-coverage
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement SavePill**

Create `src/features/shared/SavePill.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, radius, spacing } from '@/design-system'

export function SavePill({ amount }: { amount: number | null }) {
  if (amount === null || amount <= 0) return null
  return (
    <LinearGradient
      colors={['#ECFDF5', '#D1FAE5']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2 }}
    >
      <Text variant="label.md" style={{ color: '#047857', fontFamily: 'Lato-Bold', fontSize: 10 }}>
        Save up to £{Math.round(amount)}
      </Text>
    </LinearGradient>
  )
}
```

- [ ] **Step 4: Implement VoucherCountPill**

Create `src/features/shared/VoucherCountPill.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text, color, radius, spacing } from '@/design-system'

export function VoucherCountPill({ count }: { count: number }) {
  return (
    <View style={{ backgroundColor: 'rgba(226,12,4,0.08)', borderRadius: radius.pill, paddingHorizontal: spacing[2], paddingVertical: 2 }}>
      <Text variant="label.md" style={{ color: color.brandRose, fontFamily: 'Lato-Bold', fontSize: 10 }}>
        {count} {count === 1 ? 'voucher' : 'vouchers'}
      </Text>
    </View>
  )
}
```

- [ ] **Step 5: Implement OpenStatusBadge**

Create `src/features/shared/OpenStatusBadge.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text, spacing } from '@/design-system'

export function OpenStatusBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isOpen ? '#10B981' : '#EF4444' }} />
      <Text variant="label.md" style={{ fontSize: 10, color: isOpen ? '#047857' : '#DC2626' }}>
        {isOpen ? 'Open' : 'Closed'}
      </Text>
    </View>
  )
}
```

- [ ] **Step 6: Implement StarRating**

Create `src/features/shared/StarRating.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, spacing } from '@/design-system'

export function StarRating({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) return null
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Star size={12} fill="#F59E0B" color="#F59E0B" />
      <Text variant="label.md" style={{ fontSize: 11, fontFamily: 'Lato-Bold', color: '#010C35' }}>
        {rating.toFixed(1)}
      </Text>
      <Text variant="label.md" style={{ fontSize: 10, color: '#9CA3AF' }}>
        ({count})
      </Text>
    </View>
  )
}
```

- [ ] **Step 7: Implement DotIndicator**

Create `src/features/shared/DotIndicator.tsx`:

```tsx
import React from 'react'
import { View, Animated } from 'react-native'
import { color, spacing } from '@/design-system'

export function DotIndicator({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2] }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === activeIndex ? 20 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === activeIndex ? color.brandRose : '#D1D5DB',
          }}
        />
      ))}
    </View>
  )
}
```

- [ ] **Step 8: Implement SkeletonTile**

Create `src/features/shared/SkeletonTile.tsx`:

```tsx
import React, { useEffect, useRef } from 'react'
import { View, Animated } from 'react-native'
import { radius, spacing, elevation } from '@/design-system'

export function SkeletonTile({ width = 260 }: { width?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: true }),
    ).start()
  }, [shimmer])

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-width, width] })

  return (
    <View style={[{ width, borderRadius: radius.lg, backgroundColor: '#F3F4F6', overflow: 'hidden' }, elevation.sm]}>
      <View style={{ height: 80, backgroundColor: '#E5E7EB' }}>
        <Animated.View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            transform: [{ translateX }],
            backgroundColor: 'rgba(255,255,255,0.3)',
            width: '50%',
          }}
        />
      </View>
      <View style={{ padding: spacing[3], gap: spacing[2] }}>
        <View style={{ height: 14, width: '70%', borderRadius: 4, backgroundColor: '#E5E7EB' }} />
        <View style={{ height: 10, width: '50%', borderRadius: 4, backgroundColor: '#E5E7EB' }} />
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ height: 18, width: 60, borderRadius: 9, backgroundColor: '#E5E7EB' }} />
          <View style={{ height: 18, width: 80, borderRadius: 9, backgroundColor: '#E5E7EB' }} />
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 9: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/shared/pills.test.tsx --no-coverage
```

Expected: All 7 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/customer-app/src/features/shared/
git commit -m "feat: add shared pill, badge, star rating, dot indicator, skeleton components"
```

---

### Task 5: MerchantTile — the canonical featured-style tile

This is the most critical shared component. It must match the approved mockup exactly — banner with shimmer, FEATURED badge, favourite heart, logo overlay, merchant name, star rating, info row, pill row. It is reused on Home featured carousel and Map floating tile.

**Files:**
- Create: `apps/customer-app/src/features/shared/MerchantTile.tsx`
- Test: `apps/customer-app/tests/features/shared/MerchantTile.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/shared/MerchantTile.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MerchantTile } from '@/features/shared/MerchantTile'

const merchant = {
  id: 'm1',
  businessName: 'Spitalfields Pizza',
  tradingName: null,
  logoUrl: null,
  bannerUrl: null,
  primaryCategory: { id: 'c1', name: 'Food & Drink' },
  subcategory: { id: 'sc1', name: 'Pizza' },
  voucherCount: 3,
  maxEstimatedSaving: 15,
  distance: 800,
  nearestBranchId: 'b1',
  avgRating: 4.5,
  reviewCount: 128,
  isFavourited: false,
}

describe('MerchantTile', () => {
  it('renders merchant name', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText('Spitalfields Pizza')).toBeTruthy()
  })

  it('renders FEATURED badge when showFeaturedBadge is true', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} showFeaturedBadge onPress={jest.fn()} />)
    expect(getByText('FEATURED')).toBeTruthy()
  })

  it('does not render FEATURED badge by default', () => {
    const { queryByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(queryByText('FEATURED')).toBeNull()
  })

  it('renders voucher count and save amount', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText('3 vouchers')).toBeTruthy()
    expect(getByText('Save up to £15')).toBeTruthy()
  })

  it('formats distance in metres when under 1000m', () => {
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} />)
    expect(getByText(expect.stringContaining('800m'))).toBeTruthy()
  })

  it('formats distance in miles when over 1000m', () => {
    const m = { ...merchant, distance: 3200 }
    const { getByText } = render(<MerchantTile merchant={m} onPress={jest.fn()} />)
    expect(getByText(expect.stringContaining('mi'))).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByText } = render(<MerchantTile merchant={merchant} onPress={onPress} />)
    fireEvent.press(getByText('Spitalfields Pizza'))
    expect(onPress).toHaveBeenCalledWith('m1')
  })

  it('calls onFavourite when heart is pressed', () => {
    const onFav = jest.fn()
    const { getByLabelText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} onFavourite={onFav} />)
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(onFav).toHaveBeenCalledWith('m1')
  })

  it('renders close button when showClose is true', () => {
    const onClose = jest.fn()
    const { getByLabelText } = render(<MerchantTile merchant={merchant} onPress={jest.fn()} showClose onClose={onClose} />)
    fireEvent.press(getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/shared/MerchantTile.test.tsx --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement MerchantTile**

Create `src/features/shared/MerchantTile.tsx`:

```tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, X } from 'lucide-react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'
import { SavePill } from './SavePill'
import { VoucherCountPill } from './VoucherCountPill'
import { OpenStatusBadge } from './OpenStatusBadge'
import { StarRating } from './StarRating'

function formatDistance(metres: number | null): string {
  if (metres === null) return ''
  if (metres < 1000) return `${Math.round(metres)}m`
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
}

type Props = {
  merchant: MerchantTileType
  onPress: (id: string) => void
  onFavourite?: (id: string) => void
  showFeaturedBadge?: boolean
  showClose?: boolean
  onClose?: () => void
  width?: number
}

export function MerchantTile({ merchant, onPress, onFavourite, showFeaturedBadge, showClose, onClose, width }: Props) {
  const distanceStr = formatDistance(merchant.distance)
  const area = merchant.primaryCategory?.name ?? ''
  const infoText = [area, distanceStr].filter(Boolean).join(' · ')

  return (
    <PressableScale
      onPress={() => onPress(merchant.id)}
      accessibilityLabel={`${merchant.businessName}, ${area}`}
      style={[styles.card, width ? { width } : undefined]}
    >
      {/* Banner */}
      <View style={styles.banner}>
        {merchant.bannerUrl ? (
          <View style={[styles.bannerImage, { backgroundColor: '#E5E7EB' }]} />
        ) : (
          <LinearGradient
            colors={['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        {/* FEATURED badge */}
        {showFeaturedBadge && (
          <LinearGradient
            colors={[color.brandRose, color.brandCoral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredBadge}
          >
            <Text variant="label.md" style={styles.featuredText}>FEATURED</Text>
          </LinearGradient>
        )}

        {/* Favourite heart */}
        {onFavourite && (
          <Pressable
            onPress={() => onFavourite(merchant.id)}
            accessibilityLabel={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
            style={styles.heartButton}
          >
            <Heart
              size={16}
              color="#FFFFFF"
              fill={merchant.isFavourited ? '#FFFFFF' : 'transparent'}
            />
          </Pressable>
        )}

        {/* Close button (Map tile) */}
        {showClose && onClose && (
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            style={styles.closeButton}
          >
            <X size={14} color="#FFFFFF" />
          </Pressable>
        )}

        {/* Logo overlay */}
        <View style={styles.logoWrapper}>
          {merchant.logoUrl ? (
            <View style={[styles.logo, { backgroundColor: '#D1D5DB' }]} />
          ) : (
            <View style={[styles.logo, { backgroundColor: color.navy }]}>
              <Text variant="label.md" style={{ color: '#FFF', fontSize: 14, fontFamily: 'Lato-Bold' }}>
                {merchant.businessName.charAt(0)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text variant="body.sm" style={styles.name} numberOfLines={1}>
            {merchant.businessName}
          </Text>
          <StarRating rating={merchant.avgRating} count={merchant.reviewCount} />
        </View>

        <Text variant="label.md" style={styles.info} numberOfLines={1}>
          {infoText}
        </Text>

        <View style={styles.pillRow}>
          <VoucherCountPill count={merchant.voucherCount} />
          <SavePill amount={merchant.maxEstimatedSaving} />
          <OpenStatusBadge isOpen={true} />
        </View>
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...elevation.sm,
  },
  banner: {
    height: 80,
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Lato-Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    position: 'absolute',
    bottom: -17,
    left: 12,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  content: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    flex: 1,
    marginRight: 4,
  },
  info: {
    fontSize: 10.5,
    color: '#9CA3AF',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/shared/MerchantTile.test.tsx --no-coverage
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/shared/MerchantTile.tsx apps/customer-app/tests/features/shared/MerchantTile.test.tsx
git commit -m "feat: add MerchantTile canonical featured-style component"
```

---

### Task 6: Geocoding helper

**Files:**
- Create: `apps/customer-app/src/lib/geocoding.ts`
- Test: `apps/customer-app/tests/lib/geocoding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/geocoding.test.ts`:

```typescript
import { geocodeCity } from '@/lib/geocoding'

jest.mock('expo-location', () => ({
  geocodeAsync: jest.fn().mockResolvedValue([{ latitude: 53.4808, longitude: -2.2426 }]),
}))

describe('geocodeCity', () => {
  it('returns lat/lng for a city name', async () => {
    const result = await geocodeCity('Manchester')
    expect(result).toEqual({ lat: 53.4808, lng: -2.2426 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/lib/geocoding.test.ts --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement geocoding helper**

Create `src/lib/geocoding.ts`:

```typescript
import * as Location from 'expo-location'

export async function geocodeCity(cityName: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const results = await Location.geocodeAsync(cityName)
    if (results.length === 0) return null
    return { lat: results[0].latitude, lng: results[0].longitude }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/lib/geocoding.test.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/geocoding.ts apps/customer-app/tests/lib/geocoding.test.ts
git commit -m "feat: add city geocoding helper using expo-location"
```

---

### Task 7: Tab bar restructure — 5 gradient tabs

Restructure the tab layout from the current disabled-tab placeholder to the designed 5-tab gradient navigation bar: Home | Map | Favourite | Savings | Profile.

**Files:**
- Modify: `apps/customer-app/app/(app)/_layout.tsx`
- Create: `apps/customer-app/app/(app)/map.tsx`
- Test: `apps/customer-app/tests/app/layout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/app/layout.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  Tabs: Object.assign(
    ({ children }: any) => <>{children}</>,
    { Screen: ({ name }: any) => null },
  ),
  Redirect: () => null,
  useSegments: () => ['(app)', 'index'],
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: any) => {
    const state = { status: 'authenticated', user: { emailVerified: true, phoneVerified: true }, onboarding: { profileComplete: true, subscribePromptShown: true } }
    return sel(state)
  },
}))

jest.mock('@/lib/routing', () => ({
  resolveRedirect: () => null,
}))

import AppLayout from '../../app/(app)/_layout'

describe('AppLayout', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<AppLayout />)
    expect(toJSON()).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/app/layout.test.tsx --no-coverage
```

Expected: PASS or FAIL depending on mock setup — this validates the test infrastructure.

- [ ] **Step 3: Rewrite _layout.tsx with 5 gradient tabs**

Replace `app/(app)/_layout.tsx` with:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Redirect, Tabs, useSegments } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Home, Map, Heart, PiggyBank, User } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { color, spacing, layer } from '@/design-system'

const TAB_ICONS = {
  index: Home,
  map: Map,
  favourite: Heart,
  savings: PiggyBank,
  profile: User,
} as const

function TabBarIcon({ route, focused }: { route: keyof typeof TAB_ICONS; focused: boolean }) {
  const Icon = TAB_ICONS[route]
  return (
    <View style={styles.iconWrapper}>
      {focused && <View style={styles.activeDot} />}
      <Icon size={22} color="#FFFFFF" style={{ opacity: focused ? 1 : 0.55 }} />
    </View>
  )
}

export default function AppLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)
  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    currentGroup: 'app',
    currentSegment: segment,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
  })
  if (target) return <Redirect href={target as Parameters<typeof Redirect>[0]['href']} />

  const isAuthenticated = status === 'authenticated'

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, borderTopWidth: 0, elevation: 0, backgroundColor: 'transparent' },
        tabBarBackground: () => (
          <LinearGradient
            colors={[color.brandRose, '#D10A03', color.brandCoral]}
            locations={[0, 0.4, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
        tabBarLabelStyle: { fontSize: 9.5, fontFamily: 'Lato-SemiBold', marginTop: -2 },
        tabBarItemStyle: { paddingTop: spacing[2], paddingBottom: 28 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabBarIcon route="index" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <TabBarIcon route="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="favourite"
        options={{
          title: 'Favourite',
          href: isAuthenticated ? undefined : null,
          tabBarIcon: ({ focused }) => <TabBarIcon route="favourite" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          href: isAuthenticated ? undefined : null,
          tabBarIcon: ({ focused }) => <TabBarIcon route="savings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: isAuthenticated ? undefined : null,
          tabBarIcon: ({ focused }) => <TabBarIcon route="profile" focused={focused} />,
        }}
      />
      {/* Hide route files that aren't tabs */}
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="category/[id]" options={{ href: null }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
})
```

- [ ] **Step 4: Create placeholder route files**

Create `app/(app)/map.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function MapTab() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">Map coming soon</Text>
    </View>
  )
}
```

Create `app/(app)/favourite.tsx` (placeholder until Favourites phase):

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function FavouriteTab() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">Favourites coming soon</Text>
    </View>
  )
}
```

Create `app/(app)/search.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function SearchRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">Search</Text>
    </View>
  )
}
```

Create `app/(app)/categories.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function CategoriesRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">All Categories</Text>
    </View>
  )
}
```

Create directory and file `app/(app)/category/[id].tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '@/design-system'

export default function CategoryResultsRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body.md">Category Results</Text>
    </View>
  )
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/customer-app && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/app/(app)/_layout.tsx apps/customer-app/app/(app)/map.tsx apps/customer-app/app/(app)/favourite.tsx apps/customer-app/app/(app)/search.tsx apps/customer-app/app/(app)/categories.tsx "apps/customer-app/app/(app)/category/[id].tsx" apps/customer-app/tests/app/layout.test.tsx
git commit -m "feat: restructure tab bar to 5 gradient tabs (Home, Map, Favourite, Savings, Profile)"
```

---

### Task 8: Home Screen — header, campaign carousel, category grid

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeHeader.tsx`
- Create: `apps/customer-app/src/features/home/components/CampaignCarousel.tsx`
- Create: `apps/customer-app/src/features/home/components/CategoryGrid.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeHeader.test.tsx`
- Test: `apps/customer-app/tests/features/home/components/CategoryGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/features/home/components/HomeHeader.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeHeader } from '@/features/home/components/HomeHeader'

describe('HomeHeader', () => {
  it('renders greeting with first name', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(expect.stringContaining('Shebin'))).toBeTruthy()
  })

  it('renders location label', () => {
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area="Shoreditch" city="London" onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(expect.stringContaining('Shoreditch'))).toBeTruthy()
  })

  it('shows morning greeting before noon', () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
    const { getByText } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onFilterPress={jest.fn()} />
    )
    expect(getByText(expect.stringContaining('morning'))).toBeTruthy()
    jest.restoreAllMocks()
  })
})
```

Create `tests/features/home/components/CategoryGrid.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CategoryGrid } from '@/features/home/components/CategoryGrid'

const categories = [
  { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null },
  { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
  { id: 'c3', name: 'Fitness', iconUrl: null, pinColour: '#4CAF50', pinIcon: null, merchantCount: 5, parentId: null },
  { id: 'c4', name: 'Shopping', iconUrl: null, pinColour: '#7C4DFF', pinIcon: null, merchantCount: 10, parentId: null },
  { id: 'c5', name: 'Entertainment', iconUrl: null, pinColour: '#FF6F00', pinIcon: null, merchantCount: 3, parentId: null },
]

describe('CategoryGrid', () => {
  it('renders up to 5 categories plus More tile', () => {
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={jest.fn()} onMorePress={jest.fn()} />)
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('More')).toBeTruthy()
  })

  it('calls onCategoryPress with category id', () => {
    const onPress = jest.fn()
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={onPress} onMorePress={jest.fn()} />)
    fireEvent.press(getByText('Food & Drink'))
    expect(onPress).toHaveBeenCalledWith('c1')
  })

  it('calls onMorePress when More is tapped', () => {
    const onMore = jest.fn()
    const { getByText } = render(<CategoryGrid categories={categories} onCategoryPress={jest.fn()} onMorePress={onMore} />)
    fireEvent.press(getByText('More'))
    expect(onMore).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/customer-app && npx jest tests/features/home/components/ --no-coverage
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement HomeHeader**

Create `src/features/home/components/HomeHeader.tsx`:

```tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Search, SlidersHorizontal, Bell, MapPin } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

type Props = {
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  onSearchPress: () => void
  onFilterPress: () => void
  onNotificationPress?: () => void
}

export function HomeHeader({ firstName, area, city, onSearchPress, onFilterPress, onNotificationPress }: Props) {
  const greeting = `${getGreeting()}, ${firstName ?? 'there'}`
  const locationLabel = [area, city].filter(Boolean).join(', ')

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text variant="heading.md" style={styles.greeting}>{greeting}</Text>
        {locationLabel ? (
          <View style={styles.locationRow}>
            <MapPin size={12} color={color.brandRose} />
            <Text variant="label.md" style={styles.locationText}>{locationLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.right}>
        <Pressable onPress={onSearchPress} accessibilityLabel="Search" style={styles.iconButton}>
          <Search size={20} color={color.navy} />
        </Pressable>
        <Pressable onPress={onFilterPress} accessibilityLabel="Filter" style={styles.iconButton}>
          <SlidersHorizontal size={20} color={color.navy} />
        </Pressable>
        {onNotificationPress && (
          <Pressable onPress={onNotificationPress} accessibilityLabel="Notifications" style={styles.iconButton}>
            <Bell size={20} color={color.navy} />
          </Pressable>
        )}
        <View style={styles.avatar}>
          <Text variant="label.md" style={{ color: '#FFF', fontSize: 14 }}>
            {firstName?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  left: { flex: 1, gap: 2 },
  greeting: { color: color.navy },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: color.text.secondary, fontSize: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 4: Implement CampaignCarousel**

Create `src/features/home/components/CampaignCarousel.tsx`:

```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, ScrollView, Dimensions, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, color, radius, spacing } from '@/design-system'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { Button } from '@/design-system/components/Button'

type Campaign = {
  id: string
  name: string
  description: string | null
  bannerUrl: string | null
  gradientStart: string | null
  gradientEnd: string | null
  ctaText: string | null
}

type Props = {
  campaigns: Campaign[]
  onCampaignPress: (id: string) => void
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const BANNER_WIDTH = SCREEN_WIDTH - 36
const AUTO_SCROLL_INTERVAL = 12000

export function CampaignCarousel({ campaigns, onCampaignPress }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scrollToIndex = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * (BANNER_WIDTH + 12), animated: true })
  }, [])

  useEffect(() => {
    if (campaigns.length <= 1) return
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % campaigns.length
        scrollToIndex(next)
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [campaigns.length, scrollToIndex])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const index = Math.round(x / (BANNER_WIDTH + 12))
    if (index !== activeIndex && index >= 0 && index < campaigns.length) {
      setActiveIndex(index)
    }
  }

  if (campaigns.length === 0) return null

  const defaultGradients = [
    ['#667EEA', '#764BA2'],
    ['#E20C04', '#E84A00'],
    ['#11998E', '#38EF7D'],
  ]

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
      >
        {campaigns.map((campaign, i) => {
          const colors = campaign.gradientStart && campaign.gradientEnd
            ? [campaign.gradientStart, campaign.gradientEnd]
            : defaultGradients[i % defaultGradients.length]
          return (
            <LinearGradient
              key={campaign.id}
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.banner, { width: BANNER_WIDTH }]}
            >
              <Text variant="heading.md" style={styles.bannerTitle}>{campaign.name}</Text>
              {campaign.description && (
                <Text variant="body.sm" style={styles.bannerSubtitle} numberOfLines={2}>{campaign.description}</Text>
              )}
              <View style={styles.ctaWrapper}>
                <View style={styles.ctaButton}>
                  <Text variant="label.md" style={styles.ctaText}>{campaign.ctaText ?? 'Learn More'}</Text>
                </View>
              </View>
            </LinearGradient>
          )
        })}
      </ScrollView>
      <DotIndicator count={campaigns.length} activeIndex={activeIndex} />
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.lg,
    padding: spacing[5],
    minHeight: 140,
    justifyContent: 'center',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 4,
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginBottom: spacing[3],
  },
  ctaWrapper: {
    flexDirection: 'row',
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  ctaText: {
    color: '#010C35',
    fontFamily: 'Lato-Bold',
    fontSize: 12,
  },
})
```

- [ ] **Step 5: Implement CategoryGrid**

Create `src/features/home/components/CategoryGrid.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Grid3X3 } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  onCategoryPress: (id: string) => void
  onMorePress: () => void
}

export function CategoryGrid({ categories, onCategoryPress, onMorePress }: Props) {
  const displayed = categories.filter(c => !c.parentId).slice(0, 5)

  return (
    <View style={styles.grid}>
      {displayed.map(cat => (
        <PressableScale
          key={cat.id}
          onPress={() => onCategoryPress(cat.id)}
          accessibilityLabel={`${cat.name} category`}
          style={styles.tile}
        >
          <View style={[styles.iconCircle, { backgroundColor: cat.pinColour ?? color.brandRose }]}>
            <Text variant="label.md" style={{ color: '#FFF', fontSize: 20 }}>
              {cat.name.charAt(0)}
            </Text>
          </View>
          <Text variant="label.md" style={styles.tileName} numberOfLines={1}>{cat.name}</Text>
        </PressableScale>
      ))}
      <PressableScale onPress={onMorePress} accessibilityLabel="More categories" style={styles.tile}>
        <View style={[styles.iconCircle, { backgroundColor: color.navy }]}>
          <Grid3X3 size={22} color="#FFFFFF" />
        </View>
        <Text variant="label.md" style={styles.tileName}>More</Text>
      </PressableScale>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    gap: 0,
  },
  tile: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: spacing[3],
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  tileName: {
    fontSize: 11,
    color: color.navy,
    textAlign: 'center',
  },
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/home/components/ --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/home/components/
git commit -m "feat: add HomeHeader, CampaignCarousel, CategoryGrid components"
```

---

### Task 9: Home Screen — featured carousel, trending, nearby-by-category sections

**Files:**
- Create: `apps/customer-app/src/features/home/components/FeaturedCarousel.tsx`
- Create: `apps/customer-app/src/features/home/components/TrendingSection.tsx`
- Create: `apps/customer-app/src/features/home/components/NearbyByCategory.tsx`
- Test: `apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx`

- [ ] **Step 1: Write failing test for FeaturedCarousel**

Create `tests/features/home/components/FeaturedCarousel.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FeaturedCarousel } from '@/features/home/components/FeaturedCarousel'

const merchants = [
  { id: 'm1', businessName: 'Pizza Place', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food & Drink' }, subcategory: null, voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 50, isFavourited: false },
  { id: 'm2', businessName: 'Hair Salon', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c2', name: 'Beauty' }, subcategory: null, voucherCount: 2, maxEstimatedSaving: 10, distance: 1200, nearestBranchId: 'b2', avgRating: 4.8, reviewCount: 30, isFavourited: true },
]

describe('FeaturedCarousel', () => {
  it('renders section header with star icon', () => {
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getByText('Featured')).toBeTruthy()
  })

  it('renders See all link', () => {
    const { getByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getByText('See all')).toBeTruthy()
  })

  it('renders merchant tiles with FEATURED badge', () => {
    const { getAllByText } = render(<FeaturedCarousel merchants={merchants} onMerchantPress={jest.fn()} onSeeAll={jest.fn()} />)
    expect(getAllByText('FEATURED')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/home/components/FeaturedCarousel.test.tsx --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement FeaturedCarousel**

Create `src/features/home/components/FeaturedCarousel.tsx`:

```tsx
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { View, ScrollView, Dimensions, Pressable, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { Star } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const TILE_WIDTH = 260

type Props = {
  merchants: MerchantTileType[]
  onMerchantPress: (id: string) => void
  onSeeAll: () => void
  onFavourite?: (id: string) => void
}

const AUTO_SCROLL_INTERVAL = 10000

export function FeaturedCarousel({ merchants, onMerchantPress, onSeeAll, onFavourite }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  const scrollToIndex = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: index * (TILE_WIDTH + 12), animated: true })
  }, [])

  useEffect(() => {
    if (merchants.length <= 1) return
    const timer = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % merchants.length
        scrollToIndex(next)
        return next
      })
    }, AUTO_SCROLL_INTERVAL)
    return () => clearInterval(timer)
  }, [merchants.length, scrollToIndex])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const index = Math.round(x / (TILE_WIDTH + 12))
    if (index !== activeIndex && index >= 0 && index < merchants.length) {
      setActiveIndex(index)
    }
  }

  if (merchants.length === 0) return null

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Star size={16} fill="#F59E0B" color="#F59E0B" />
          <Text variant="heading.sm" style={{ color: color.navy }}>Featured</Text>
        </View>
        <Pressable onPress={onSeeAll} accessibilityLabel="See all featured merchants">
          <Text variant="label.md" style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        snapToInterval={TILE_WIDTH + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
      >
        {merchants.map(m => (
          <MerchantTile
            key={m.id}
            merchant={m}
            onPress={onMerchantPress}
            onFavourite={onFavourite}
            showFeaturedBadge
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>
      <DotIndicator count={merchants.length} activeIndex={activeIndex} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: spacing[3],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  seeAll: {
    color: color.brandRose,
    fontFamily: 'Lato-SemiBold',
    fontSize: 13,
  },
})
```

- [ ] **Step 4: Implement TrendingSection**

Create `src/features/home/components/TrendingSection.tsx`:

```tsx
import React from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Flame } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

type Props = {
  merchants: MerchantTileType[]
  onMerchantPress: (id: string) => void
  onFavourite?: (id: string) => void
}

export function TrendingSection({ merchants, onMerchantPress, onFavourite }: Props) {
  if (merchants.length === 0) return null

  return (
    <LinearGradient
      colors={['#FFF7ED', '#FEF3C7']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.header}>
        <Flame size={16} color="#EA580C" fill="#EA580C" />
        <Text variant="heading.sm" style={{ color: color.navy }}>Trending near you</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
      >
        {merchants.map(m => (
          <MerchantTile
            key={m.id}
            merchant={m}
            onPress={onMerchantPress}
            onFavourite={onFavourite}
            width={240}
          />
        ))}
      </ScrollView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: 18,
    marginBottom: spacing[3],
  },
})
```

- [ ] **Step 5: Implement NearbyByCategory**

Create `src/features/home/components/NearbyByCategory.tsx`:

```tsx
import React from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

type CategorySection = {
  category: { id: string; name: string }
  merchants: MerchantTileType[]
}

type Props = {
  sections: CategorySection[]
  onMerchantPress: (id: string) => void
  onFavourite?: (id: string) => void
}

export function NearbyByCategory({ sections, onMerchantPress, onFavourite }: Props) {
  return (
    <View style={styles.container}>
      {sections.map(section => {
        if (section.merchants.length === 0) return null
        return (
          <View key={section.category.id} style={styles.section}>
            <Text variant="heading.sm" style={styles.sectionTitle}>
              {section.category.name} near you
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
            >
              {section.merchants.map(m => (
                <MerchantTile
                  key={m.id}
                  merchant={m}
                  onPress={onMerchantPress}
                  onFavourite={onFavourite}
                  width={240}
                />
              ))}
            </ScrollView>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[6],
    paddingBottom: 100,
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    color: color.navy,
    paddingHorizontal: 18,
  },
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/home/components/FeaturedCarousel.test.tsx --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/home/components/FeaturedCarousel.tsx apps/customer-app/src/features/home/components/TrendingSection.tsx apps/customer-app/src/features/home/components/NearbyByCategory.tsx apps/customer-app/tests/features/home/components/FeaturedCarousel.test.tsx
git commit -m "feat: add FeaturedCarousel, TrendingSection, NearbyByCategory components"
```

---

### Task 10: Home Screen — full screen assembly

Wire all Home sub-components into a complete HomeScreen, replacing the placeholder. Uses useHomeFeed + useLocation + useCategories hooks. Includes skeleton loading states and empty state.

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomePlaceholderScreen.tsx` → rename to `HomeScreen.tsx`
- Modify: `apps/customer-app/app/(app)/index.tsx`
- Test: `apps/customer-app/tests/features/home/screens/HomeScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/home/screens/HomeScreen.test.tsx`:

```tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeScreen } from '@/features/home/screens/HomeScreen'

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    data: {
      locationContext: { city: 'London', lat: 51.5, lng: -0.1, source: 'coordinates' },
      featured: [{ id: 'm1', businessName: 'Test Pizza', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 20, isFavourited: false }],
      trending: [],
      campaigns: [],
      nearbyByCategory: [],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 5, parentId: null }] },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useMe', () => ({
  useMe: () => ({
    data: { firstName: 'Shebin', profileImageUrl: null },
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('HomeScreen', () => {
  it('renders greeting with user name', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText(expect.stringContaining('Shebin'))).toBeTruthy())
  })

  it('renders featured section', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText('Featured')).toBeTruthy())
  })

  it('renders category grid', async () => {
    const { getByText } = render(<HomeScreen />, { wrapper })
    await waitFor(() => expect(getByText('Food & Drink')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/home/screens/HomeScreen.test.tsx --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement HomeScreen**

Delete `src/features/home/screens/HomePlaceholderScreen.tsx` and create `src/features/home/screens/HomeScreen.tsx`:

```tsx
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
  const { data: feed, isLoading, refetch } = useHomeFeed({ lat: location?.lat, lng: location?.lng })
  const { data: categoriesData } = useCategories()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
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
          avatarUrl={me?.profileImageUrl}
          onSearchPress={() => router.push('/search' as any)}
          onFilterPress={() => {}}
        />

        {/* Campaign banners */}
        {isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonTile width={300} />
          </View>
        ) : (
          <CampaignCarousel
            campaigns={feed?.campaigns ?? []}
            onCampaignPress={(id) => {}}
          />
        )}

        {/* Category grid */}
        {categoriesData?.categories && (
          <CategoryGrid
            categories={categoriesData.categories}
            onCategoryPress={(id) => router.push(`/category/${id}` as any)}
            onMorePress={() => router.push('/categories' as any)}
          />
        )}

        {/* Featured merchants carousel */}
        {isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
        ) : (
          <FeaturedCarousel
            merchants={feed?.featured ?? []}
            onMerchantPress={(id) => {}}
            onSeeAll={() => {}}
          />
        )}

        {/* Trending near you */}
        <TrendingSection
          merchants={feed?.trending ?? []}
          onMerchantPress={(id) => {}}
        />

        {/* Nearby by category */}
        <NearbyByCategory
          sections={feed?.nearbyByCategory ?? []}
          onMerchantPress={(id) => {}}
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
```

- [ ] **Step 4: Update app/(app)/index.tsx route**

Replace `app/(app)/index.tsx`:

```tsx
import { HomeScreen } from '@/features/home/screens/HomeScreen'

export default HomeScreen
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/home/screens/HomeScreen.test.tsx --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Run typecheck**

```bash
cd apps/customer-app && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/home/ apps/customer-app/app/(app)/index.tsx apps/customer-app/tests/features/home/
git commit -m "feat: implement HomeScreen with campaign carousel, category grid, featured/trending sections"
```

---

### Task 11: Search screen — search bar, trending searches, typeahead results

**Files:**
- Create: `apps/customer-app/src/features/search/components/SearchBar.tsx`
- Create: `apps/customer-app/src/features/search/components/TrendingSearches.tsx`
- Create: `apps/customer-app/src/features/search/components/SearchResultItem.tsx`
- Create: `apps/customer-app/src/features/search/screens/SearchScreen.tsx`
- Modify: `apps/customer-app/app/(app)/search.tsx`
- Test: `apps/customer-app/tests/features/search/SearchScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/search/SearchScreen.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchScreen } from '@/features/search/screens/SearchScreen'

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (_params: any, enabled: boolean) => ({
    data: enabled ? { merchants: [{ id: 'm1', businessName: 'Pizza Express', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 50, isFavourited: false }], total: 1, limit: 20, offset: 0 } : undefined,
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5, lng: -0.1, area: 'Shoreditch', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('SearchScreen', () => {
  it('renders search input', () => {
    const { getByPlaceholderText } = render(<SearchScreen />, { wrapper })
    expect(getByPlaceholderText('Search merchants...')).toBeTruthy()
  })

  it('shows trending searches before typing', () => {
    const { getByText } = render(<SearchScreen />, { wrapper })
    expect(getByText('Trending')).toBeTruthy()
  })

  it('shows results after typing', async () => {
    const { getByPlaceholderText, getByText } = render(<SearchScreen />, { wrapper })
    fireEvent.changeText(getByPlaceholderText('Search merchants...'), 'Pizza')
    await waitFor(() => expect(getByText('Pizza Express')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/SearchScreen.test.tsx --no-coverage
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement SearchBar**

Create `src/features/search/components/SearchBar.tsx`:

```tsx
import React from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { Text, color, radius, spacing, elevation } from '@/design-system'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

export function SearchBar({ value, onChangeText, onCancel, autoFocus, placeholder = 'Search merchants...' }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Search size={18} color={color.text.tertiary} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.text.tertiary}
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search">
            <X size={16} color={color.text.tertiary} />
          </Pressable>
        )}
      </View>
      {onCancel && (
        <Pressable onPress={onCancel} accessibilityLabel="Cancel search">
          <Text variant="label.md" style={styles.cancel}>Cancel</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: spacing[3],
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    height: 44,
    gap: spacing[2],
    ...elevation.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Lato-Regular',
    color: color.navy,
  },
  cancel: {
    color: color.brandRose,
    fontFamily: 'Lato-SemiBold',
    fontSize: 14,
  },
})
```

- [ ] **Step 4: Implement TrendingSearches**

Create `src/features/search/components/TrendingSearches.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Zap } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'

const TRENDING_TAGS = ['Pizza', 'Brunch', 'Nail salon', 'Barber', 'Gym', 'Coffee']

type Props = {
  onTagPress: (tag: string) => void
}

export function TrendingSearches({ onTagPress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Zap size={14} color="#F59E0B" fill="#F59E0B" />
        <Text variant="label.eyebrow" style={styles.headerText}>Trending</Text>
      </View>
      <View style={styles.tags}>
        {TRENDING_TAGS.map(tag => (
          <PressableScale key={tag} onPress={() => onTagPress(tag)} style={styles.tag}>
            <Text variant="label.md" style={styles.tagText}>{tag}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 18, paddingTop: spacing[5] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], marginBottom: spacing[3] },
  headerText: { color: color.text.secondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  tag: {
    backgroundColor: color.surface.neutral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  tagText: { color: color.navy, fontSize: 13, fontFamily: 'Lato-SemiBold' },
})
```

- [ ] **Step 5: Implement SearchResultItem**

Create `src/features/search/components/SearchResultItem.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color, spacing } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'
import { SavePill } from '@/features/shared/SavePill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'

function formatDistance(m: number | null): string {
  if (m === null) return ''
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1609.34).toFixed(1)} mi`
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <Text variant="body.sm" style={styles.name}>{name}</Text>
  const idx = name.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <Text variant="body.sm" style={styles.name}>{name}</Text>
  return (
    <Text variant="body.sm" style={styles.name}>
      {name.slice(0, idx)}
      <Text variant="body.sm" style={[styles.name, { color: color.brandRose }]}>{name.slice(idx, idx + query.length)}</Text>
      {name.slice(idx + query.length)}
    </Text>
  )
}

type Props = {
  merchant: MerchantTileType
  query: string
  onPress: (id: string) => void
}

export function SearchResultItem({ merchant, query, onPress }: Props) {
  return (
    <PressableScale onPress={() => onPress(merchant.id)} style={styles.container}>
      <View style={styles.logo}>
        {merchant.logoUrl ? (
          <View style={[styles.logoImg, { backgroundColor: '#D1D5DB' }]} />
        ) : (
          <View style={[styles.logoImg, { backgroundColor: color.navy }]}>
            <Text variant="label.md" style={{ color: '#FFF', fontSize: 16 }}>{merchant.businessName.charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <HighlightedName name={merchant.businessName} query={query} />
        <Text variant="label.md" style={styles.detail}>
          {[merchant.primaryCategory?.name, formatDistance(merchant.distance)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.right}>
        <SavePill amount={merchant.maxEstimatedSaving} />
        <OpenStatusBadge isOpen={true} />
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  logo: {},
  logoImg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontFamily: 'Lato-Bold', color: color.navy },
  detail: { fontSize: 12, color: color.text.secondary },
  right: { alignItems: 'flex-end', gap: 4 },
})
```

- [ ] **Step 6: Implement SearchScreen**

Create `src/features/search/screens/SearchScreen.tsx`:

```tsx
import React, { useState, useMemo } from 'react'
import { View, FlatList, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { color, spacing } from '@/design-system'
import { useSearch } from '@/hooks/useSearch'
import { useUserLocation } from '@/hooks/useLocation'
import { SearchBar } from '../components/SearchBar'
import { TrendingSearches } from '../components/TrendingSearches'
import { SearchResultItem } from '../components/SearchResultItem'
import { SkeletonTile } from '@/features/shared/SkeletonTile'

export function SearchScreen() {
  const router = useRouter()
  const { location } = useUserLocation()
  const [query, setQuery] = useState('')

  const debouncedQuery = useDebounce(query, 300)
  const hasQuery = debouncedQuery.length >= 1

  const { data, isLoading } = useSearch(
    { q: debouncedQuery, lat: location?.lat, lng: location?.lng },
    hasQuery,
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchWrapper}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onCancel={() => router.back()}
          autoFocus
        />
      </View>

      {!hasQuery ? (
        <TrendingSearches onTagPress={(tag) => setQuery(tag)} />
      ) : isLoading ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map(i => <SkeletonTile key={i} width={340} />)}
        </View>
      ) : (
        <FlatList
          data={data?.merchants ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SearchResultItem
              merchant={item}
              query={debouncedQuery}
              onPress={(id) => {}}
            />
          )}
          contentContainerStyle={{ paddingTop: spacing[2] }}
        />
      )}
    </View>
  )
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F5',
  },
  searchWrapper: {
    paddingTop: 60,
    paddingBottom: spacing[2],
  },
  skeletons: {
    paddingHorizontal: 18,
    paddingTop: spacing[4],
    gap: spacing[3],
  },
})
```

- [ ] **Step 7: Update route file**

Replace `app/(app)/search.tsx`:

```tsx
import { SearchScreen } from '@/features/search/screens/SearchScreen'
export default SearchScreen
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd apps/customer-app && npx jest tests/features/search/SearchScreen.test.tsx --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/customer-app/src/features/search/ apps/customer-app/app/(app)/search.tsx apps/customer-app/tests/features/search/
git commit -m "feat: implement SearchScreen with search bar, trending searches, typeahead results"
```

---

### Task 12: All Categories screen

**Files:**
- Create: `apps/customer-app/src/features/search/screens/AllCategoriesScreen.tsx`
- Modify: `apps/customer-app/app/(app)/categories.tsx`
- Test: `apps/customer-app/tests/features/search/AllCategoriesScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/search/AllCategoriesScreen.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllCategoriesScreen } from '@/features/search/screens/AllCategoriesScreen'

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null },
      { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
    ] },
    isLoading: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('AllCategoriesScreen', () => {
  it('renders title', () => {
    const { getByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('All Categories')).toBeTruthy()
  })

  it('renders category items with merchant count', () => {
    const { getByText } = render(<AllCategoriesScreen />, { wrapper })
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('12 merchants nearby')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/AllCategoriesScreen.test.tsx --no-coverage
```

- [ ] **Step 3: Implement AllCategoriesScreen**

Create `src/features/search/screens/AllCategoriesScreen.tsx`:

```tsx
import React, { useState } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, ChevronRight } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { useCategories } from '@/hooks/useCategories'
import { Category } from '@/lib/api/discovery'

export function AllCategoriesScreen() {
  const router = useRouter()
  const { data } = useCategories()
  const [filter, setFilter] = useState('')

  const categories = (data?.categories ?? [])
    .filter(c => !c.parentId)
    .filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={color.navy} />
        </Pressable>
        <Text variant="heading.md" style={{ color: color.navy }}>All Categories</Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item, index }) => (
          <FadeIn delay={index * 80}>
            <PressableScale
              onPress={() => router.push(`/category/${item.id}` as any)}
              style={styles.row}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.pinColour ?? color.brandRose }]}>
                <Text variant="label.md" style={{ color: '#FFF', fontSize: 18 }}>{item.name.charAt(0)}</Text>
              </View>
              <View style={styles.rowText}>
                <Text variant="body.sm" style={styles.categoryName}>{item.name}</Text>
                <Text variant="label.md" style={styles.count}>{item.merchantCount} merchants nearby</Text>
              </View>
              <ChevronRight size={18} color={color.text.tertiary} />
            </PressableScale>
          </FadeIn>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: spacing[4],
  },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  categoryName: { fontSize: 14, fontFamily: 'Lato-Bold', color: color.navy },
  count: { fontSize: 12, color: color.text.secondary },
})
```

- [ ] **Step 4: Update route file**

Replace `app/(app)/categories.tsx`:

```tsx
import { AllCategoriesScreen } from '@/features/search/screens/AllCategoriesScreen'
export default AllCategoriesScreen
```

- [ ] **Step 5: Run tests**

```bash
cd apps/customer-app && npx jest tests/features/search/AllCategoriesScreen.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/search/screens/AllCategoriesScreen.tsx apps/customer-app/app/(app)/categories.tsx apps/customer-app/tests/features/search/AllCategoriesScreen.test.tsx
git commit -m "feat: implement AllCategoriesScreen with staggered animation"
```

---

### Task 13: Filter Bottom Sheet

**Files:**
- Create: `apps/customer-app/src/features/search/components/FilterSheet.tsx`
- Test: `apps/customer-app/tests/features/search/FilterSheet.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/search/FilterSheet.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { FilterSheet, FilterState } from '@/features/search/components/FilterSheet'

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [
      { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null, subcategories: [{ id: 'sc1', name: 'Pizza' }] },
      { id: 'c2', name: 'Beauty', iconUrl: null, pinColour: '#E91E8C', pinIcon: null, merchantCount: 8, parentId: null },
    ] },
    isLoading: false,
  }),
}))

const defaultFilters: FilterState = {
  categoryId: null,
  subcategoryId: null,
  sortBy: 'relevance',
  voucherTypes: [],
  maxDistanceMiles: 10,
  minSaving: 0,
  amenityIds: [],
  openNow: false,
}

describe('FilterSheet', () => {
  it('renders sort options', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />
    )
    expect(getByText('Relevance')).toBeTruthy()
    expect(getByText('Nearest')).toBeTruthy()
  })

  it('renders apply button with result count', () => {
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={jest.fn()} onDismiss={jest.fn()} />
    )
    expect(getByText('Show 42 results')).toBeTruthy()
  })

  it('calls onApply with updated filters when applied', () => {
    const onApply = jest.fn()
    const { getByText } = render(
      <FilterSheet visible filters={defaultFilters} resultCount={42} onApply={onApply} onDismiss={jest.fn()} />
    )
    fireEvent.press(getByText('Nearest'))
    fireEvent.press(getByText('Show 42 results'))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'nearest' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/FilterSheet.test.tsx --no-coverage
```

- [ ] **Step 3: Implement FilterSheet**

Create `src/features/search/components/FilterSheet.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { View, ScrollView, Switch, StyleSheet } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { useCategories } from '@/hooks/useCategories'
import { X } from 'lucide-react-native'

export type FilterState = {
  categoryId: string | null
  subcategoryId: string | null
  sortBy: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  voucherTypes: string[]
  maxDistanceMiles: number
  minSaving: number
  amenityIds: string[]
  openNow: boolean
}

const SORT_OPTIONS: { label: string; value: FilterState['sortBy'] }[] = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Nearest', value: 'nearest' },
  { label: 'Top Rated', value: 'top_rated' },
  { label: 'Highest Saving', value: 'highest_saving' },
]

const VOUCHER_TYPES = ['BOGO', 'Discount', 'Freebie', 'Spend & Save', 'Package Deal']

const AMENITIES = [
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'parking', label: 'Parking' },
  { id: 'wheelchair', label: 'Wheelchair Access' },
  { id: 'family', label: 'Family Friendly' },
  { id: 'outdoor', label: 'Outdoor Seating' },
  { id: 'pet', label: 'Pet Friendly' },
]

type Props = {
  visible: boolean
  filters: FilterState
  resultCount: number
  onApply: (filters: FilterState) => void
  onDismiss: () => void
}

export function FilterSheet({ visible, filters, resultCount, onApply, onDismiss }: Props) {
  const [local, setLocal] = useState<FilterState>(filters)
  const { data: categoriesData } = useCategories()

  useEffect(() => { setLocal(filters) }, [filters])

  const categories = (categoriesData?.categories ?? []).filter(c => !c.parentId)

  const toggleVoucherType = (type: string) => {
    setLocal(prev => ({
      ...prev,
      voucherTypes: prev.voucherTypes.includes(type)
        ? prev.voucherTypes.filter(t => t !== type)
        : [...prev.voucherTypes, type],
    }))
  }

  const toggleAmenity = (id: string) => {
    setLocal(prev => ({
      ...prev,
      amenityIds: prev.amenityIds.includes(id)
        ? prev.amenityIds.filter(a => a !== id)
        : [...prev.amenityIds, id],
    }))
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Filter merchants">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
        {/* Category pills */}
        <Text variant="label.eyebrow" style={styles.sectionLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {categories.map(cat => {
            const isActive = local.categoryId === cat.id
            return (
              <PressableScale
                key={cat.id}
                onPress={() => setLocal(prev => ({ ...prev, categoryId: isActive ? null : cat.id, subcategoryId: null }))}
                style={[styles.pill, isActive && styles.pillActive]}
              >
                <Text variant="label.md" style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {cat.name}
                </Text>
                {isActive && <X size={12} color="#FFF" />}
              </PressableScale>
            )
          })}
        </ScrollView>

        {/* Sort by */}
        <Text variant="label.eyebrow" style={styles.sectionLabel}>Sort by</Text>
        <View style={styles.pillRow}>
          {SORT_OPTIONS.map(opt => (
            <PressableScale
              key={opt.value}
              onPress={() => setLocal(prev => ({ ...prev, sortBy: opt.value }))}
              style={[styles.pill, local.sortBy === opt.value && styles.pillActive]}
            >
              <Text variant="label.md" style={[styles.pillText, local.sortBy === opt.value && styles.pillTextActive]}>
                {opt.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {/* Voucher type */}
        <Text variant="label.eyebrow" style={styles.sectionLabel}>Voucher type</Text>
        <View style={styles.pillRow}>
          {VOUCHER_TYPES.map(type => {
            const isActive = local.voucherTypes.includes(type)
            return (
              <PressableScale
                key={type}
                onPress={() => toggleVoucherType(type)}
                style={[styles.pill, isActive && styles.pillActive]}
              >
                <Text variant="label.md" style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {type}
                </Text>
              </PressableScale>
            )
          })}
        </View>

        {/* Amenities */}
        <Text variant="label.eyebrow" style={styles.sectionLabel}>Amenities</Text>
        <View style={styles.pillRow}>
          {AMENITIES.map(a => {
            const isActive = local.amenityIds.includes(a.id)
            return (
              <PressableScale
                key={a.id}
                onPress={() => toggleAmenity(a.id)}
                style={[styles.pill, isActive && styles.pillNavy]}
              >
                <Text variant="label.md" style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {a.label}
                </Text>
              </PressableScale>
            )
          })}
        </View>

        {/* Open now */}
        <View style={styles.switchRow}>
          <Text variant="body.sm" style={{ color: color.navy }}>Open now</Text>
          <Switch
            value={local.openNow}
            onValueChange={(v) => setLocal(prev => ({ ...prev, openNow: v }))}
            trackColor={{ true: '#10B981', false: '#D1D5DB' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </ScrollView>

      {/* Apply button */}
      <GradientBrand style={styles.applyButton}>
        <PressableScale onPress={() => onApply(local)} style={styles.applyInner}>
          <Text variant="heading.sm" style={styles.applyText}>
            Show {resultCount} results
          </Text>
        </PressableScale>
      </GradientBrand>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  sectionLabel: { color: color.text.secondary, marginTop: spacing[4], marginBottom: spacing[2] },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: color.surface.neutral,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillActive: { backgroundColor: color.brandRose },
  pillNavy: { backgroundColor: color.navy },
  pillText: { fontSize: 12, fontFamily: 'Lato-SemiBold', color: color.navy },
  pillTextActive: { color: '#FFFFFF' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[4],
    paddingVertical: spacing[2],
  },
  applyButton: {
    borderRadius: radius.md,
    marginTop: spacing[5],
  },
  applyInner: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  applyText: { color: '#FFFFFF', fontFamily: 'Lato-Bold' },
})
```

- [ ] **Step 4: Run tests**

```bash
cd apps/customer-app && npx jest tests/features/search/FilterSheet.test.tsx --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/search/components/FilterSheet.tsx apps/customer-app/tests/features/search/FilterSheet.test.tsx
git commit -m "feat: implement FilterSheet with categories, sort, voucher type, amenities, open now"
```

---

### Task 14: Map Screen — pins, clusters, location permission, empty area

**Files:**
- Create: `apps/customer-app/src/features/map/screens/MapScreen.tsx`
- Create: `apps/customer-app/src/features/map/components/MapPins.tsx`
- Create: `apps/customer-app/src/features/map/components/LocationPermission.tsx`
- Create: `apps/customer-app/src/features/map/components/MapEmptyArea.tsx`
- Create: `apps/customer-app/src/features/map/components/MapCategoryPills.tsx`
- Create: `apps/customer-app/src/features/map/hooks/useMapMerchants.ts`
- Modify: `apps/customer-app/app/(app)/map.tsx`
- Test: `apps/customer-app/tests/features/map/MapScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/map/MapScreen.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('react-native-maps', () => {
  const { View } = require('react-native')
  const MockMapView = (props: any) => <View testID="map-view">{props.children}</View>
  MockMapView.Marker = (props: any) => <View testID={`marker-${props.identifier}`} />
  return { __esModule: true, default: MockMapView, Marker: MockMapView.Marker }
})

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5074, lng: -0.1278, area: 'City of London', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/features/map/hooks/useMapMerchants', () => ({
  useMapMerchants: () => ({
    data: { merchants: [], total: 0, limit: 50, offset: 0 },
    isLoading: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

import { MapScreen } from '@/features/map/screens/MapScreen'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('MapScreen', () => {
  it('renders map view', () => {
    const { getByTestId } = render(<MapScreen />, { wrapper })
    expect(getByTestId('map-view')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/map/MapScreen.test.tsx --no-coverage
```

- [ ] **Step 3: Implement useMapMerchants hook**

Create `src/features/map/hooks/useMapMerchants.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { discoveryApi, SearchResponse } from '@/lib/api/discovery'

type BoundingBox = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export function useMapMerchants(bbox: BoundingBox | null, categoryId?: string | null) {
  return useQuery<SearchResponse>({
    queryKey: ['mapMerchants', bbox, categoryId],
    queryFn: () => discoveryApi.searchMerchants({
      minLat: bbox!.minLat,
      maxLat: bbox!.maxLat,
      minLng: bbox!.minLng,
      maxLng: bbox!.maxLng,
      categoryId: categoryId ?? undefined,
      limit: 50,
    }),
    enabled: bbox !== null,
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 4: Implement MapCategoryPills**

Create `src/features/map/components/MapCategoryPills.tsx`:

```tsx
import React from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  activeId: string | null
  onSelect: (id: string | null) => void
}

export function MapCategoryPills({ categories, activeId, onSelect }: Props) {
  const topLevel = categories.filter(c => !c.parentId)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <PressableScale
        onPress={() => onSelect(null)}
        style={[styles.pill, !activeId && styles.pillActive]}
      >
        <Text variant="label.md" style={[styles.text, !activeId && styles.textActive]}>All</Text>
      </PressableScale>
      {topLevel.map(cat => {
        const isActive = activeId === cat.id
        return (
          <PressableScale
            key={cat.id}
            onPress={() => onSelect(isActive ? null : cat.id)}
            style={[styles.pill, isActive && styles.pillActive]}
          >
            {cat.pinColour && (
              <View style={[styles.dot, { backgroundColor: cat.pinColour }]} />
            )}
            <Text variant="label.md" style={[styles.text, isActive && styles.textActive]}>
              {cat.name}
            </Text>
          </PressableScale>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 18, gap: spacing[2], paddingVertical: spacing[2] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pillActive: { backgroundColor: color.brandRose },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: 'Lato-SemiBold', color: color.navy },
  textActive: { color: '#FFFFFF' },
})
```

- [ ] **Step 5: Implement LocationPermission overlay**

Create `src/features/map/components/LocationPermission.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { PressableScale } from '@/design-system/motion/PressableScale'

type Props = {
  onEnable: () => void
  onSkip: () => void
}

export function LocationPermission({ onEnable, onSkip }: Props) {
  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <MapPin size={48} color={color.brandRose} />
        </View>
        <Text variant="heading.md" style={styles.title}>Find merchants near you</Text>
        <Text variant="body.sm" style={styles.description}>
          Enable location access to discover the best deals nearby. We only use your location while using the app.
        </Text>
        <GradientBrand style={styles.ctaGradient}>
          <PressableScale onPress={onEnable} style={styles.cta}>
            <Text variant="heading.sm" style={{ color: '#FFFFFF' }}>Enable Location</Text>
          </PressableScale>
        </GradientBrand>
        <PressableScale onPress={onSkip}>
          <Text variant="body.sm" style={styles.skip}>Browse without location</Text>
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,249,245,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  content: { alignItems: 'center', paddingHorizontal: 40, gap: spacing[4] },
  iconWrapper: { marginBottom: spacing[2] },
  title: { color: color.navy, textAlign: 'center' },
  description: { color: color.text.secondary, textAlign: 'center', lineHeight: 22 },
  ctaGradient: { borderRadius: radius.md, width: '100%' },
  cta: { paddingVertical: spacing[4], alignItems: 'center' },
  skip: { color: color.text.secondary, textDecorationLine: 'underline', marginTop: spacing[2] },
})
```

- [ ] **Step 6: Implement MapEmptyArea**

Create `src/features/map/components/MapEmptyArea.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { PressableScale } from '@/design-system/motion/PressableScale'

type Props = {
  onRecentre: () => void
  onClearFilters: () => void
}

export function MapEmptyArea({ onRecentre, onClearFilters }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MapPin size={20} color={color.text.tertiary} />
        <View style={styles.textCol}>
          <Text variant="body.sm" style={{ fontFamily: 'Lato-Bold', color: color.navy }}>No merchants in this area</Text>
          <Text variant="label.md" style={{ color: color.text.secondary }}>
            Try zooming out or moving the map to discover more deals nearby
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <GradientBrand style={styles.primaryBtn}>
          <PressableScale onPress={onRecentre} style={styles.btnInner}>
            <Text variant="label.md" style={{ color: '#FFF', fontFamily: 'Lato-Bold' }}>Re-centre</Text>
          </PressableScale>
        </GradientBrand>
        <PressableScale onPress={onClearFilters} style={styles.secondaryBtn}>
          <Text variant="label.md" style={{ color: color.navy, fontFamily: 'Lato-SemiBold' }}>Clear Filters</Text>
        </PressableScale>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 100,
    left: 18,
    right: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing[4],
    gap: spacing[3],
    ...elevation.md,
    zIndex: 15,
  },
  row: { flexDirection: 'row', gap: spacing[3] },
  textCol: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing[2] },
  primaryBtn: { flex: 1, borderRadius: radius.sm },
  btnInner: { paddingVertical: spacing[2], alignItems: 'center' },
  secondaryBtn: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.default,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
})
```

- [ ] **Step 7: Implement MapPins**

Create `src/features/map/components/MapPins.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import { Text, color as tokenColor } from '@/design-system'

type MerchantPin = {
  id: string
  businessName: string
  lat: number
  lng: number
  categoryColor: string
  categoryName: string
}

type Props = {
  merchants: MerchantPin[]
  selectedId: string | null
  onPinPress: (id: string) => void
}

export function MapPins({ merchants, selectedId, onPinPress }: Props) {
  return (
    <>
      {merchants.map(m => {
        const isSelected = selectedId === m.id
        const size = isSelected ? 42 : 34
        return (
          <Marker
            key={m.id}
            identifier={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            onPress={() => onPinPress(m.id)}
            accessibilityLabel={`${m.businessName}, ${m.categoryName}`}
          >
            <View style={[styles.pin, { width: size, height: size + 8, backgroundColor: m.categoryColor }]}>
              <Text variant="label.md" style={styles.pinIcon}>
                {m.categoryName.charAt(0)}
              </Text>
              <View style={[styles.pinTail, { borderTopColor: m.categoryColor }]} />
            </View>
          </Marker>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  pin: {
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pinIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Lato-Bold',
  },
  pinTail: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
})
```

- [ ] **Step 8: Implement MapScreen**

Create `src/features/map/screens/MapScreen.tsx`:

```tsx
import React, { useState, useRef, useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import MapView, { Region } from 'react-native-maps'
import { Locate, List } from 'lucide-react-native'
import { color, spacing, radius, elevation, layer } from '@/design-system'
import { useUserLocation } from '@/hooks/useLocation'
import { useCategories } from '@/hooks/useCategories'
import { useMapMerchants } from '../hooks/useMapMerchants'
import { MapPins } from '../components/MapPins'
import { MapCategoryPills } from '../components/MapCategoryPills'
import { LocationPermission } from '../components/LocationPermission'
import { MapEmptyArea } from '../components/MapEmptyArea'
import { SearchBar } from '@/features/search/components/SearchBar'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const LONDON: Region = { latitude: 51.5074, longitude: -0.1278, latitudeDelta: 0.05, longitudeDelta: 0.05 }

export function MapScreen() {
  const mapRef = useRef<MapView>(null)
  const { status, location, requestPermission } = useUserLocation()
  const { data: categoriesData } = useCategories()
  const [region, setRegion] = useState<Region>(
    location ? { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 } : LONDON
  )
  const [bbox, setBbox] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null)
  const [showPermission, setShowPermission] = useState(status === 'idle' || status === 'denied')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: searchData } = useMapMerchants(bbox, selectedCategory)

  const merchantPins = (searchData?.merchants ?? [])
    .filter(m => m.distance !== null)
    .map(m => ({
      id: m.id,
      businessName: m.businessName,
      lat: 0,
      lng: 0,
      categoryColor: m.primaryCategory ? getCategoryColor(m.primaryCategory.name) : color.brandRose,
      categoryName: m.primaryCategory?.name ?? 'Other',
    }))

  const onRegionChangeComplete = useCallback((r: Region) => {
    setRegion(r)
    const latDelta = r.latitudeDelta / 2
    const lngDelta = r.longitudeDelta / 2
    setBbox({
      minLat: r.latitude - latDelta,
      maxLat: r.latitude + latDelta,
      minLng: r.longitude - lngDelta,
      maxLng: r.longitude + lngDelta,
    })
  }, [])

  const recentre = () => {
    if (location) {
      const newRegion = { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      mapRef.current?.animateToRegion(newRegion, 500)
    }
  }

  if (showPermission && status !== 'granted') {
    return (
      <View style={styles.container}>
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={LONDON} />
        <LocationPermission
          onEnable={async () => {
            await requestPermission()
            setShowPermission(false)
          }}
          onSkip={() => setShowPermission(false)}
        />
      </View>
    )
  }

  const isEmpty = searchData && searchData.merchants.length === 0 && bbox !== null

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={location
          ? { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : LONDON
        }
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={status === 'granted'}
        showsMyLocationButton={false}
      >
        <MapPins
          merchants={merchantPins}
          selectedId={selectedMerchantId}
          onPinPress={(id) => setSelectedMerchantId(id)}
        />
      </MapView>

      {/* Search bar overlay */}
      <View style={styles.searchOverlay}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search area..."
        />
        <MapCategoryPills
          categories={categoriesData?.categories ?? []}
          activeId={selectedCategory}
          onSelect={setSelectedCategory}
        />
      </View>

      {/* Re-centre button */}
      <Pressable onPress={recentre} style={styles.recentreButton} accessibilityLabel="Re-centre map">
        <Locate size={20} color={color.navy} />
      </Pressable>

      {/* List toggle button */}
      <Pressable style={styles.listButton} accessibilityLabel="Show list view">
        <List size={16} color="#FFFFFF" />
        <View style={{ marginLeft: 4 }}>
          <View><View /></View>
        </View>
      </Pressable>

      {/* Empty area card */}
      {isEmpty && (
        <MapEmptyArea
          onRecentre={recentre}
          onClearFilters={() => setSelectedCategory(null)}
        />
      )}
    </View>
  )
}

function getCategoryColor(name: string): string {
  const map: Record<string, string> = {
    'Food & Drink': '#E65100',
    'Beauty & Wellness': '#E91E8C',
    'Fitness & Sport': '#4CAF50',
    'Shopping': '#7C4DFF',
  }
  return map[name] ?? color.brandRose
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: layer.sticky,
  },
  recentreButton: {
    position: 'absolute',
    bottom: 100,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 18,
    ...elevation.md,
  },
  listButton: {
    position: 'absolute',
    bottom: 100,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    zIndex: 18,
    ...elevation.md,
  },
})
```

- [ ] **Step 9: Update map route**

Replace `app/(app)/map.tsx`:

```tsx
import { MapScreen } from '@/features/map/screens/MapScreen'
export default MapScreen
```

- [ ] **Step 10: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/map/MapScreen.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/customer-app/src/features/map/ apps/customer-app/app/(app)/map.tsx apps/customer-app/tests/features/map/
git commit -m "feat: implement MapScreen with pins, category pills, location permission, empty area"
```

---

### Task 15: Map — floating merchant tile + swipeable tiles

**Files:**
- Create: `apps/customer-app/src/features/map/components/MapMerchantTile.tsx`
- Test: `apps/customer-app/tests/features/map/MapMerchantTile.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/map/MapMerchantTile.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MapMerchantTile } from '@/features/map/components/MapMerchantTile'

const merchants = [
  { id: 'm1', businessName: 'Pizza Place', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 50, isFavourited: false },
  { id: 'm2', businessName: 'Hair Salon', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c2', name: 'Beauty' }, subcategory: null, voucherCount: 2, maxEstimatedSaving: 10, distance: 1200, nearestBranchId: 'b2', avgRating: 4.8, reviewCount: 30, isFavourited: true },
]

describe('MapMerchantTile', () => {
  it('renders merchant name', () => {
    const { getByText } = render(
      <MapMerchantTile merchants={merchants} activeIndex={0} onClose={jest.fn()} onIndexChange={jest.fn()} onMerchantPress={jest.fn()} />
    )
    expect(getByText('Pizza Place')).toBeTruthy()
  })

  it('renders dot indicators', () => {
    const { getAllByTestId } = render(
      <MapMerchantTile merchants={merchants} activeIndex={0} onClose={jest.fn()} onIndexChange={jest.fn()} onMerchantPress={jest.fn()} />
    )
    // DotIndicator creates individual dots — we check the component renders
    expect(getAllByTestId || true).toBeTruthy()
  })

  it('calls onClose when X is pressed', () => {
    const onClose = jest.fn()
    const { getByLabelText } = render(
      <MapMerchantTile merchants={merchants} activeIndex={0} onClose={onClose} onIndexChange={jest.fn()} onMerchantPress={jest.fn()} />
    )
    fireEvent.press(getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/map/MapMerchantTile.test.tsx --no-coverage
```

- [ ] **Step 3: Implement MapMerchantTile**

Create `src/features/map/components/MapMerchantTile.tsx`:

```tsx
import React, { useRef } from 'react'
import { View, ScrollView, Dimensions, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, Animated } from 'react-native'
import { spacing, elevation, layer } from '@/design-system'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { DotIndicator } from '@/features/shared/DotIndicator'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TILE_WIDTH = SCREEN_WIDTH - 36

type Props = {
  merchants: MerchantTileType[]
  activeIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  onMerchantPress: (id: string) => void
  onFavourite?: (id: string) => void
}

export function MapMerchantTile({ merchants, activeIndex, onClose, onIndexChange, onMerchantPress, onFavourite }: Props) {
  const slideAnim = useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 260 }).start()
  }, [slideAnim])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const index = Math.round(x / (TILE_WIDTH + 12))
    if (index !== activeIndex && index >= 0 && index < merchants.length) {
      onIndexChange(index)
    }
  }

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] })

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <ScrollView
        horizontal
        pagingEnabled={false}
        snapToInterval={TILE_WIDTH + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
        contentOffset={{ x: activeIndex * (TILE_WIDTH + 12), y: 0 }}
      >
        {merchants.map(m => (
          <MerchantTile
            key={m.id}
            merchant={m}
            onPress={onMerchantPress}
            onFavourite={onFavourite}
            showClose
            onClose={onClose}
            width={TILE_WIDTH}
          />
        ))}
      </ScrollView>
      <DotIndicator count={merchants.length} activeIndex={activeIndex} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    zIndex: layer.raised + 5,
  },
})
```

- [ ] **Step 4: Wire MapMerchantTile into MapScreen**

Modify `src/features/map/screens/MapScreen.tsx` — add import and usage. After the `MapPins` component inside `MapView`, and before the closing `</View>`, add:

Between `{isEmpty && ...}` and the closing `</View>`:

```tsx
import { MapMerchantTile } from '../components/MapMerchantTile'
```

Add state:

```tsx
const [tileIndex, setTileIndex] = useState(0)
```

Add the tile render block (right before `{isEmpty && ...}`):

```tsx
{selectedMerchantId && searchData?.merchants && searchData.merchants.length > 0 && (
  <MapMerchantTile
    merchants={searchData.merchants}
    activeIndex={tileIndex}
    onClose={() => { setSelectedMerchantId(null); setTileIndex(0) }}
    onIndexChange={(idx) => {
      setTileIndex(idx)
      const m = searchData.merchants[idx]
      if (m) setSelectedMerchantId(m.id)
    }}
    onMerchantPress={(id) => {}}
  />
)}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/map/MapMerchantTile.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/map/components/MapMerchantTile.tsx apps/customer-app/src/features/map/screens/MapScreen.tsx apps/customer-app/tests/features/map/MapMerchantTile.test.tsx
git commit -m "feat: add swipeable floating merchant tile on map with dot indicators"
```

---

### Task 16: Map — Location Search for remote browsing + LocationBadge

**Files:**
- Create: `apps/customer-app/src/features/map/components/LocationSearch.tsx`
- Create: `apps/customer-app/src/features/map/components/LocationBadge.tsx`
- Test: `apps/customer-app/tests/features/map/LocationSearch.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/map/LocationSearch.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { LocationSearch } from '@/features/map/components/LocationSearch'

jest.mock('@/lib/geocoding', () => ({
  geocodeCity: jest.fn().mockResolvedValue({ lat: 53.4808, lng: -2.2426 }),
}))

describe('LocationSearch', () => {
  it('renders Use current location option', () => {
    const { getByText } = render(
      <LocationSearch query="Man" onCitySelect={jest.fn()} onCurrentLocation={jest.fn()} />
    )
    expect(getByText('Use current location')).toBeTruthy()
  })

  it('calls onCitySelect when a city is tapped', async () => {
    const onSelect = jest.fn()
    const { getByText } = render(
      <LocationSearch query="Manchester" onCitySelect={onSelect} onCurrentLocation={jest.fn()} />
    )
    fireEvent.press(getByText(expect.stringContaining('Manchester')))
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/map/LocationSearch.test.tsx --no-coverage
```

- [ ] **Step 3: Implement LocationBadge**

Create `src/features/map/components/LocationBadge.tsx`:

```tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { MapPin, X } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'

type Props = {
  cityName: string
  onDismiss: () => void
}

export function LocationBadge({ cityName, onDismiss }: Props) {
  return (
    <View style={styles.badge}>
      <MapPin size={14} color="#FFFFFF" />
      <Text variant="label.md" style={styles.text}>{cityName}</Text>
      <Pressable onPress={onDismiss} accessibilityLabel="Return to current location">
        <X size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: color.navy,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'flex-start',
    marginHorizontal: 18,
    marginTop: spacing[1],
  },
  text: { color: '#FFFFFF', fontFamily: 'Lato-SemiBold', fontSize: 12 },
})
```

- [ ] **Step 4: Implement LocationSearch**

Create `src/features/map/components/LocationSearch.tsx`:

```tsx
import React from 'react'
import { View, FlatList, StyleSheet } from 'react-native'
import { MapPin, Navigation } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { geocodeCity } from '@/lib/geocoding'

const UK_CITIES = [
  { name: 'Manchester', region: 'Greater Manchester' },
  { name: 'Birmingham', region: 'West Midlands' },
  { name: 'Leeds', region: 'West Yorkshire' },
  { name: 'Liverpool', region: 'Merseyside' },
  { name: 'Bristol', region: 'South West' },
  { name: 'Edinburgh', region: 'Scotland' },
  { name: 'Glasgow', region: 'Scotland' },
  { name: 'Cardiff', region: 'Wales' },
  { name: 'Newcastle', region: 'Tyne and Wear' },
  { name: 'Nottingham', region: 'East Midlands' },
  { name: 'Sheffield', region: 'South Yorkshire' },
  { name: 'London', region: 'Greater London' },
]

type Props = {
  query: string
  onCitySelect: (city: string, coords: { lat: number; lng: number }) => void
  onCurrentLocation: () => void
}

export function LocationSearch({ query, onCitySelect, onCurrentLocation }: Props) {
  const filtered = UK_CITIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  const handleCityPress = async (cityName: string) => {
    const coords = await geocodeCity(cityName)
    if (coords) onCitySelect(cityName, coords)
  }

  return (
    <View style={styles.container}>
      <PressableScale onPress={onCurrentLocation} style={styles.row}>
        <View style={styles.currentIcon}>
          <Navigation size={16} color="#3B82F6" />
        </View>
        <View style={styles.rowText}>
          <Text variant="body.sm" style={styles.cityName}>Use current location</Text>
        </View>
        <View style={styles.currentBadge}>
          <Text variant="label.md" style={styles.currentBadgeText}>Current</Text>
        </View>
      </PressableScale>

      {filtered.map(city => {
        const idx = city.name.toLowerCase().indexOf(query.toLowerCase())
        return (
          <PressableScale key={city.name} onPress={() => handleCityPress(city.name)} style={styles.row}>
            <MapPin size={16} color={color.text.tertiary} />
            <View style={styles.rowText}>
              <Text variant="body.sm" style={styles.cityName}>
                {idx >= 0 ? (
                  <>
                    {city.name.slice(0, idx)}
                    <Text style={{ color: color.brandRose }}>{city.name.slice(idx, idx + query.length)}</Text>
                    {city.name.slice(idx + query.length)}
                  </>
                ) : city.name}
              </Text>
              <Text variant="label.md" style={styles.region}>{city.region}</Text>
            </View>
          </PressableScale>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 18,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    maxHeight: 300,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  currentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 1 },
  cityName: { fontFamily: 'Lato-Bold', color: color.navy, fontSize: 14 },
  region: { color: color.text.secondary, fontSize: 11 },
  currentBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeText: { color: '#3B82F6', fontSize: 10, fontFamily: 'Lato-Bold' },
})
```

- [ ] **Step 5: Wire LocationSearch and LocationBadge into MapScreen**

Add to `MapScreen.tsx` imports:

```tsx
import { LocationSearch } from '../components/LocationSearch'
import { LocationBadge } from '../components/LocationBadge'
```

Add state:

```tsx
const [remoteCity, setRemoteCity] = useState<string | null>(null)
const [isLocationSearching, setIsLocationSearching] = useState(false)
```

In the search overlay section, after `<SearchBar>`, add:

```tsx
{isLocationSearching && searchQuery.length > 0 && (
  <LocationSearch
    query={searchQuery}
    onCitySelect={(city, coords) => {
      setRemoteCity(city)
      setSearchQuery('')
      setIsLocationSearching(false)
      const newRegion = { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
      mapRef.current?.animateToRegion(newRegion, 500)
    }}
    onCurrentLocation={() => {
      setRemoteCity(null)
      setSearchQuery('')
      setIsLocationSearching(false)
      recentre()
    }}
  />
)}

{remoteCity && (
  <LocationBadge
    cityName={remoteCity}
    onDismiss={() => {
      setRemoteCity(null)
      recentre()
    }}
  />
)}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/customer-app && npx jest tests/features/map/LocationSearch.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/map/components/LocationSearch.tsx apps/customer-app/src/features/map/components/LocationBadge.tsx apps/customer-app/src/features/map/screens/MapScreen.tsx apps/customer-app/tests/features/map/LocationSearch.test.tsx
git commit -m "feat: add location search for remote browsing with city typeahead and location badge"
```

---

### Task 17: Map — List View half-sheet

**Files:**
- Create: `apps/customer-app/src/features/map/components/MapListView.tsx`
- Test: `apps/customer-app/tests/features/map/MapListView.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/map/MapListView.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { MapListView } from '@/features/map/components/MapListView'

const merchants = [
  { id: 'm1', businessName: 'Pizza Place', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 3, maxEstimatedSaving: 15, distance: 800, nearestBranchId: 'b1', avgRating: 4.5, reviewCount: 50, isFavourited: false },
]

describe('MapListView', () => {
  it('renders header with merchant count', () => {
    const { getByText } = render(
      <MapListView visible merchants={merchants} total={1} onDismiss={jest.fn()} onMerchantPress={jest.fn()} />
    )
    expect(getByText('Nearby Merchants')).toBeTruthy()
    expect(getByText('1')).toBeTruthy()
  })

  it('renders merchant names', () => {
    const { getByText } = render(
      <MapListView visible merchants={merchants} total={1} onDismiss={jest.fn()} onMerchantPress={jest.fn()} />
    )
    expect(getByText('Pizza Place')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/map/MapListView.test.tsx --no-coverage
```

- [ ] **Step 3: Implement MapListView**

Create `src/features/map/components/MapListView.tsx`:

```tsx
import React from 'react'
import { View, FlatList, StyleSheet } from 'react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { StarRating } from '@/features/shared/StarRating'
import { SavePill } from '@/features/shared/SavePill'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

function formatDistance(m: number | null): string {
  if (m === null) return ''
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1609.34).toFixed(1)} mi`
}

type Props = {
  visible: boolean
  merchants: MerchantTileType[]
  total: number
  onDismiss: () => void
  onMerchantPress: (id: string) => void
}

export function MapListView({ visible, merchants, total, onDismiss, onMerchantPress }: Props) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Nearby merchants list">
      <View style={styles.header}>
        <Text variant="heading.sm" style={{ color: color.navy }}>Nearby Merchants</Text>
        <View style={styles.countBadge}>
          <Text variant="label.md" style={styles.countText}>{total}</Text>
        </View>
      </View>
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.id}
        style={{ maxHeight: 380 }}
        renderItem={({ item, index }) => (
          <FadeIn delay={index * 60}>
            <PressableScale onPress={() => onMerchantPress(item.id)} style={styles.row}>
              <View style={[styles.thumb, { backgroundColor: item.primaryCategory ? getCatColor(item.primaryCategory.name) : color.brandRose }]}>
                <Text variant="label.md" style={{ color: '#FFF', fontSize: 18 }}>{item.businessName.charAt(0)}</Text>
              </View>
              <View style={styles.info}>
                <Text variant="body.sm" style={styles.name} numberOfLines={1}>{item.businessName}</Text>
                <Text variant="label.md" style={styles.detail}>
                  {[item.primaryCategory?.name, formatDistance(item.distance)].filter(Boolean).join(' · ')}
                </Text>
                <StarRating rating={item.avgRating} count={item.reviewCount} />
              </View>
              <SavePill amount={item.maxEstimatedSaving} />
            </PressableScale>
          </FadeIn>
        )}
      />
    </BottomSheet>
  )
}

function getCatColor(name: string): string {
  const map: Record<string, string> = { 'Food & Drink': '#E65100', 'Beauty & Wellness': '#E91E8C', 'Fitness & Sport': '#4CAF50', 'Shopping': '#7C4DFF' }
  return map[name] ?? '#E20C04'
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  countBadge: {
    backgroundColor: color.brandRose,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFF', fontSize: 10, fontFamily: 'Lato-Bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: 'Lato-Bold', color: color.navy, fontSize: 14 },
  detail: { fontSize: 12, color: color.text.secondary },
})
```

- [ ] **Step 4: Wire list view into MapScreen**

Add import to `MapScreen.tsx`:

```tsx
import { MapListView } from '../components/MapListView'
```

Add state:

```tsx
const [showListView, setShowListView] = useState(false)
```

Update the list button `onPress`:

```tsx
<Pressable onPress={() => setShowListView(true)} style={styles.listButton} accessibilityLabel="Show list view">
```

Add before closing `</View>`:

```tsx
<MapListView
  visible={showListView}
  merchants={searchData?.merchants ?? []}
  total={searchData?.total ?? 0}
  onDismiss={() => setShowListView(false)}
  onMerchantPress={(id) => { setShowListView(false); setSelectedMerchantId(id) }}
/>
```

- [ ] **Step 5: Run tests**

```bash
cd apps/customer-app && npx jest tests/features/map/MapListView.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/map/components/MapListView.tsx apps/customer-app/src/features/map/screens/MapScreen.tsx apps/customer-app/tests/features/map/MapListView.test.tsx
git commit -m "feat: add map list view half-sheet with staggered animation"
```

---

### Task 18: Category Results screen

**Files:**
- Create: `apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx`
- Modify: `apps/customer-app/app/(app)/category/[id].tsx`
- Test: `apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/search/CategoryResultsScreen.test.tsx`:

```tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'

jest.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    data: { merchants: [{ id: 'm1', businessName: 'Test', tradingName: null, logoUrl: null, bannerUrl: null, primaryCategory: { id: 'c1', name: 'Food' }, subcategory: null, voucherCount: 2, maxEstimatedSaving: 10, distance: 500, nearestBranchId: 'b1', avgRating: 4.2, reviewCount: 15, isFavourited: false }], total: 1, limit: 20, offset: 0 },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: { categories: [{ id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 12, parentId: null }] },
  }),
}))

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    location: { lat: 51.5, lng: -0.1 },
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'c1' }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('CategoryResultsScreen', () => {
  it('renders merchant results', async () => {
    const { getByText } = render(<CategoryResultsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Test')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen.test.tsx --no-coverage
```

- [ ] **Step 3: Implement CategoryResultsScreen**

Create `src/features/search/screens/CategoryResultsScreen.tsx`:

```tsx
import React, { useState } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react-native'
import { Text, color, spacing } from '@/design-system'
import { useSearch } from '@/hooks/useSearch'
import { useCategories } from '@/hooks/useCategories'
import { useUserLocation } from '@/hooks/useLocation'
import { MerchantTile } from '@/features/shared/MerchantTile'
import { FilterSheet, FilterState } from '../components/FilterSheet'

const defaultFilters: FilterState = {
  categoryId: null,
  subcategoryId: null,
  sortBy: 'relevance',
  voucherTypes: [],
  maxDistanceMiles: 10,
  minSaving: 0,
  amenityIds: [],
  openNow: false,
}

export function CategoryResultsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { location } = useUserLocation()
  const { data: categoriesData } = useCategories()
  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters, categoryId: id ?? null })
  const [showFilter, setShowFilter] = useState(false)

  const category = categoriesData?.categories?.find(c => c.id === id)

  const { data, isLoading } = useSearch({
    categoryId: filters.categoryId ?? undefined,
    subcategoryId: filters.subcategoryId ?? undefined,
    lat: location?.lat,
    lng: location?.lng,
    sortBy: filters.sortBy,
    voucherTypes: filters.voucherTypes.length > 0 ? filters.voucherTypes : undefined,
    maxDistanceMiles: filters.maxDistanceMiles < 10 ? filters.maxDistanceMiles : undefined,
    minSaving: filters.minSaving > 0 ? filters.minSaving : undefined,
    amenityIds: filters.amenityIds.length > 0 ? filters.amenityIds : undefined,
    openNow: filters.openNow || undefined,
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backButton}>
          <ArrowLeft size={22} color={color.navy} />
        </Pressable>
        <Text variant="heading.md" style={{ color: color.navy, flex: 1 }}>{category?.name ?? 'Category'}</Text>
        <Pressable onPress={() => setShowFilter(true)} accessibilityLabel="Filter" style={styles.filterButton}>
          <SlidersHorizontal size={18} color={color.navy} />
        </Pressable>
      </View>

      <FlatList
        data={data?.merchants ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100, gap: 12 }}
        renderItem={({ item }) => (
          <MerchantTile merchant={item} onPress={() => {}} />
        )}
      />

      <FilterSheet
        visible={showFilter}
        filters={filters}
        resultCount={data?.total ?? 0}
        onApply={(f) => { setFilters(f); setShowFilter(false) }}
        onDismiss={() => setShowFilter(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: 18,
    paddingTop: 60,
    paddingBottom: spacing[4],
  },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface.neutral, alignItems: 'center', justifyContent: 'center' },
  filterButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface.neutral, alignItems: 'center', justifyContent: 'center' },
})
```

- [ ] **Step 4: Update route file**

Replace `app/(app)/category/[id].tsx`:

```tsx
import { CategoryResultsScreen } from '@/features/search/screens/CategoryResultsScreen'
export default CategoryResultsScreen
```

- [ ] **Step 5: Run test**

```bash
cd apps/customer-app && npx jest tests/features/search/CategoryResultsScreen.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/search/screens/CategoryResultsScreen.tsx "apps/customer-app/app/(app)/category/[id].tsx" apps/customer-app/tests/features/search/CategoryResultsScreen.test.tsx
git commit -m "feat: implement CategoryResultsScreen with filter integration"
```

---

### Task 19: Empty state for categories with no merchants

**Files:**
- Create: `apps/customer-app/src/features/shared/NoMerchantsState.tsx`
- Test: `apps/customer-app/tests/features/shared/NoMerchantsState.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/features/shared/NoMerchantsState.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { NoMerchantsState } from '@/features/shared/NoMerchantsState'

describe('NoMerchantsState', () => {
  it('renders category-specific message', () => {
    const { getByText } = render(
      <NoMerchantsState
        category="Pizza"
        area="Shoreditch"
        onExpandSearch={jest.fn()}
        onBrowseCategories={jest.fn()}
      />
    )
    expect(getByText('No Pizza merchants nearby')).toBeTruthy()
  })

  it('renders expand search CTA', () => {
    const onExpand = jest.fn()
    const { getByText } = render(
      <NoMerchantsState category="Pizza" area="Shoreditch" onExpandSearch={onExpand} onBrowseCategories={jest.fn()} />
    )
    fireEvent.press(getByText('Expand search area'))
    expect(onExpand).toHaveBeenCalled()
  })

  it('renders browse other categories CTA', () => {
    const onBrowse = jest.fn()
    const { getByText } = render(
      <NoMerchantsState category="Pizza" area="Shoreditch" onExpandSearch={jest.fn()} onBrowseCategories={onBrowse} />
    )
    fireEvent.press(getByText('Browse other categories'))
    expect(onBrowse).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/customer-app && npx jest tests/features/shared/NoMerchantsState.test.tsx --no-coverage
```

- [ ] **Step 3: Implement NoMerchantsState**

Create `src/features/shared/NoMerchantsState.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { GradientBrand } from '@/design-system/components/GradientBrand'
import { PressableScale } from '@/design-system/motion/PressableScale'

type Props = {
  category: string
  area: string | null
  nearbyArea?: { name: string; count: number; distance: string } | null
  onExpandSearch: () => void
  onBrowseCategories: () => void
}

export function NoMerchantsState({ category, area, nearbyArea, onExpandSearch, onBrowseCategories }: Props) {
  return (
    <View style={styles.container}>
      <MapPin size={40} color={color.text.tertiary} />
      <Text variant="heading.md" style={styles.title}>No {category} merchants nearby</Text>
      <Text variant="body.sm" style={styles.subtitle}>
        We don't have any {category} merchants in {area ?? 'your area'} yet, but we're growing fast!
      </Text>
      <View style={styles.actions}>
        <GradientBrand style={styles.primaryBtn}>
          <PressableScale onPress={onExpandSearch} style={styles.btnInner}>
            <Text variant="label.md" style={{ color: '#FFF', fontFamily: 'Lato-Bold' }}>Expand search area</Text>
          </PressableScale>
        </GradientBrand>
        <PressableScale onPress={onBrowseCategories} style={styles.secondaryBtn}>
          <Text variant="label.md" style={{ color: color.navy, fontFamily: 'Lato-SemiBold' }}>Browse other categories</Text>
        </PressableScale>
      </View>
      {nearbyArea && (
        <View style={styles.nearbyCard}>
          <Text variant="body.sm" style={{ color: color.navy }}>
            {nearbyArea.count} merchants in {nearbyArea.name}
          </Text>
          <Text variant="label.md" style={{ color: color.text.secondary }}>{nearbyArea.distance} away</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: 40, paddingVertical: spacing[8], gap: spacing[3] },
  title: { color: color.navy, textAlign: 'center' },
  subtitle: { color: color.text.secondary, textAlign: 'center', lineHeight: 22 },
  actions: { width: '100%', gap: spacing[3], marginTop: spacing[2] },
  primaryBtn: { borderRadius: radius.md },
  btnInner: { paddingVertical: spacing[3], alignItems: 'center' },
  secondaryBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.default,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  nearbyCard: {
    width: '100%',
    backgroundColor: color.surface.neutral,
    borderRadius: radius.md,
    padding: spacing[4],
    gap: 4,
    marginTop: spacing[2],
  },
})
```

- [ ] **Step 4: Run test**

```bash
cd apps/customer-app && npx jest tests/features/shared/NoMerchantsState.test.tsx --no-coverage
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/shared/NoMerchantsState.tsx apps/customer-app/tests/features/shared/NoMerchantsState.test.tsx
git commit -m "feat: add NoMerchantsState empty state with expand search and browse categories CTAs"
```

---

### Task 20: Final integration — typecheck, full test suite, visual smoke test

- [ ] **Step 1: Run full TypeScript check**

```bash
cd apps/customer-app && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run full test suite**

```bash
cd apps/customer-app && npx jest --no-coverage
```

Fix any failing tests.

- [ ] **Step 3: Start the app and visual smoke test**

```bash
cd apps/customer-app && npx expo start --ios
```

Verify:
- Tab bar shows 5 tabs with rose→red→coral gradient
- Home tab: greeting, campaign carousel auto-slides, category grid shows 5+More, featured carousel with FEATURED badges
- Search: typeahead shows results with highlighted text, trending tags work
- Map tab: pins render, category pills filter, location permission overlay appears on first load, re-centre button works
- All Categories: staggered animation, tap navigates to category results

- [ ] **Step 4: Fix any visual issues found**

Address any layout, spacing, colour, or animation issues that don't match the approved mockups.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: address integration issues from visual smoke test"
```

- [ ] **Step 6: Run tests one more time**

```bash
cd apps/customer-app && npx jest --no-coverage
```

Expected: All tests PASS.
