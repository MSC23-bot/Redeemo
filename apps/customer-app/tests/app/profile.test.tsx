/**
 * Smoke test for the app/(app)/profile.tsx route file.
 * The full ProfileScreen surface is tested in:
 *   src/features/profile/__tests__/ProfileScreen.test.tsx
 *
 * This test just validates that the route re-exports ProfileScreen and that
 * the screen renders when the user is signed in.
 */
import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/hooks/useMe', () => ({
  useMe: jest.fn(() => ({
    data: {
      id: 'u1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phoneNumber: '+447700900000',
      dob: '1990-01-01',
      gender: 'female',
      addressLine1: null,
      addressLine2: null,
      city: null,
      postcode: 'SW1A 1AA',
      latitude: null,
      longitude: null,
      localityId: null,
      locality: null,
      profileImageUrl: null,
      profileCompleteness: 80,
      newsletterConsent: false,
      interests: [],
      onboardingCompletedAt: '2026-04-23T00:00:00.000Z',
    },
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(() => ({ subscription: null, isSubscribed: false, isSubLoading: false })),
}))

jest.mock('@/hooks/useUpdateAvatar', () => ({
  useUpdateAvatar: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}))

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector({
    signOut: jest.fn(),
    clearLocalAuth: jest.fn(),
    hapticsEnabled: true,
    motionScale: 1,
    setHaptics: jest.fn(),
    setMotionScale: jest.fn(),
    status: 'authed',
  })),
}))

jest.mock('@/lib/storage', () => ({
  prefsStorage: { get: jest.fn().mockResolvedValue(null) },
}))

jest.mock('@/features/profile/hooks/useReduceMotion', () => ({
  useReduceMotion: jest.fn(() => false),
  useOsReduceMotion: jest.fn(() => false),
}))

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}))

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useFocusEffect: (_cb: unknown) => {},
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/lib/config/links', () => ({
  LINKS: {
    merchantPortal: 'https://merchant.redeemo.com',
    about: 'https://redeemo.com/about',
    faq: 'https://redeemo.com/faq',
    terms: 'https://redeemo.com/terms',
    privacy: 'https://redeemo.com/privacy',
    appStoreIos: 'https://apps.apple.com/app/redeemo/id0000000000',
    appStoreAndroid: 'https://play.google.com/store/apps/details?id=com.redeemo',
  },
}))

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  requestReview: jest.fn(),
}))

jest.mock('@/design-system/motion/Toast', () => ({
  useToast: jest.fn(() => ({ show: jest.fn() })),
}))

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/api/profile', () => ({
  profileApi: { updateProfile: jest.fn().mockResolvedValue({}) },
}))

jest.mock('@/hooks/useInterestsCatalogue', () => ({
  useInterestsCatalogue: jest.fn(() => ({ data: [] })),
}))

jest.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}))

jest.mock('@/hooks/useUpdateInterests', () => ({
  useUpdateInterests: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}))

jest.mock('@/lib/api/auth', () => ({
  authApi: {
    sendDeleteAccountOtp: jest.fn().mockResolvedValue({}),
    verifyDeleteAccountOtp: jest.fn().mockResolvedValue({ actionToken: 'tok' }),
    deleteAccount: jest.fn().mockResolvedValue({}),
    changePassword: jest.fn().mockResolvedValue({}),
  },
}))

jest.mock('@/design-system/motion/BottomSheet', () => {
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? <View>{children}</View> : null,
  }
})

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

import ProfileScreen from '@/../app/(app)/profile'

describe('ProfileScreen (route smoke test)', () => {
  it('renders the signed-in user name', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
  })

  it('renders the Sign out row', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText('Sign out')).toBeTruthy()
  })
})
