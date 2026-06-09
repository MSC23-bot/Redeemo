import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('@/hooks/useMe', () => ({
  useMe: jest.fn(() => ({
    data: {
      id: 'u1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      phoneNumber: '+441234567890',
      dob: null,
      gender: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postcode: null,
      latitude: null,
      longitude: null,
      localityId: null,
      locality: null,
      profileImageUrl: null,
      profileCompleteness: 60,
      newsletterConsent: false,
      interests: [],
      onboardingCompletedAt: '2026-01-01',
    },
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(() => ({
    subscription: null,
    isSubscribed: false,
    isSubLoading: false,
  })),
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
    merchantPortal: 'https://merchant.redeemo.co.uk',
    about: 'https://redeemo.co.uk/about',
    faq: 'https://redeemo.co.uk/faq',
    terms: 'https://redeemo.co.uk/terms',
    privacy: 'https://redeemo.co.uk/privacy',
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

import { ProfileScreen } from '../screens/ProfileScreen'

describe('ProfileScreen', () => {
  it('renders the profile header with user name', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText('Alice Smith')).toBeTruthy()
  })

  it('renders My Account section', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText('My Account')).toBeTruthy()
    expect(screen.getByText('Personal info')).toBeTruthy()
  })

  it('renders Sign out and Delete account rows', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText('Sign out')).toBeTruthy()
    expect(screen.getByText('Delete account')).toBeTruthy()
  })

  // Profile Stabilisation Hotfix #6 — Active session row removed.
  // Disabled/non-actionable rows look broken on device. Smallest safe
  // v1: drop the row. A real "Devices & Sessions" sheet can ship as a
  // separate workstream (Profile Polish Batch or post-launch).
  it('does NOT render the Active session row (removed in stabilisation hotfix)', () => {
    renderWithClient(<ProfileScreen />)
    expect(screen.queryByText('Active session')).toBeNull()
    expect(screen.queryByText(/Signed in on/i)).toBeNull()
  })

  // Profile Stabilisation Hotfix #7 — minimal clarity tweak on the
  // subscription label. Was "Monthly · £6.99/mo"; now "Monthly Plan ·
  // £6.99/mo" so the plan type reads explicitly. Deeper UX deferred to
  // Profile Polish Batch.
  it('renders subscription label with "Plan" suffix when subscription is active', () => {
    const { useSubscription } = require('@/hooks/useSubscription')
    ;(useSubscription as jest.Mock).mockReturnValueOnce({
      subscription: {
        status: 'ACTIVE',
        plan: { name: 'Monthly', priceGbp: 6.99, billingInterval: 'MONTHLY' },
        cancelAtPeriodEnd: false,
        currentPeriodEnd: '2026-06-26T00:00:00.000Z',
      },
      isSubscribed: true,
      isSubLoading: false,
    })
    renderWithClient(<ProfileScreen />)
    expect(screen.getByText(/Monthly Plan/i)).toBeTruthy()
  })
})
