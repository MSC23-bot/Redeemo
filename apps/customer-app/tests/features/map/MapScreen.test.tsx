import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapScreen } from '@/features/map/screens/MapScreen'

jest.mock('react-native-maps', () => {
  const { View } = require('react-native')
  const MockMapView = (props: any) => <View testID="map-view">{props.children}</View>
  MockMapView.Marker = (props: any) => <View testID={`marker-${props.identifier}`} />
  return { __esModule: true, default: MockMapView, Marker: MockMapView.Marker }
})

jest.mock('@/hooks/useLocation', () => ({
  useUserLocation: () => ({
    status: 'granted',
    location: { lat: 51.5074, lng: -0.1278, area: 'Central London', city: 'London' },
    requestPermission: jest.fn(),
  }),
}))

jest.mock('@/features/map/hooks/useMapMerchants', () => ({
  useMapMerchants: () => ({
    data: {
      merchants: [
        {
          id: 'm1',
          businessName: 'Pizza Express',
          tradingName: null,
          logoUrl: null,
          bannerUrl: null,
          primaryCategory: { id: 'c1', name: 'Food & Drink' },
          subcategory: null,
          voucherCount: 3,
          maxEstimatedSaving: 15,
          distance: 800,
          nearestBranchId: 'b1',
          avgRating: 4.5,
          reviewCount: 50,
          isFavourited: false,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    },
    isLoading: false,
  }),
}))

jest.mock('@/hooks/useCategories', () => ({
  useCategories: () => ({
    data: {
      categories: [
        { id: 'c1', name: 'Food & Drink', iconUrl: null, pinColour: '#E65100', pinIcon: null, merchantCount: 5, parentId: null },
      ],
    },
    isLoading: false,
  }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 51.5074, longitude: -0.1278 } }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([{ city: 'London', subregion: null, district: null }]),
  geocodeAsync: jest.fn().mockResolvedValue([{ latitude: 51.5074, longitude: -0.1278 }]),
  Accuracy: { Balanced: 3 },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('MapScreen', () => {
  it('renders map-view', () => {
    const { getByTestId } = render(<MapScreen />, { wrapper })
    expect(getByTestId('map-view')).toBeTruthy()
  })

  it('renders category pills when categories are available', () => {
    const { getByText } = render(<MapScreen />, { wrapper })
    expect(getByText('All')).toBeTruthy()
  })

  it('renders Food & Drink category pill', () => {
    const { getByText } = render(<MapScreen />, { wrapper })
    expect(getByText('Food & Drink')).toBeTruthy()
  })
})
