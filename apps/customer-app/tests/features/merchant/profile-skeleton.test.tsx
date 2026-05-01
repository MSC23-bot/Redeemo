import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the sub-components — they each have their own visual tests; here we
// only verify the screen composes them correctly and gates behaviour
// (loading / error / free-user voucher gate).
jest.mock('@/features/merchant/components/HeroSection', () => ({
  HeroSection: ({ isFavourited }: { isFavourited: boolean }) => {
    const { Text } = require('react-native')
    return <Text>HERO_FAV={String(isFavourited)}</Text>
  },
}))
jest.mock('@/features/merchant/components/MetaSection', () => ({
  MetaSection: ({ businessName }: { businessName: string }) => {
    const { Text } = require('react-native')
    return <Text>META_NAME={businessName}</Text>
  },
}))
jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: () => null,
}))
jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: ({ onVoucherPress }: { onVoucherPress: (id: string) => void }) => {
    const { Text, Pressable } = require('react-native')
    return <Pressable onPress={() => onVoucherPress('v1')} accessibilityLabel="Tap voucher"><Text>VOUCHERS</Text></Pressable>
  },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({ AboutTab:    () => null }))
jest.mock('@/features/merchant/components/BranchesTab', () => ({ BranchesTab: () => null }))
jest.mock('@/features/merchant/components/ReviewsTab',  () => ({ ReviewsTab:  () => null }))
jest.mock('@/features/merchant/components/ContactSheet',     () => ({ ContactSheet:     () => null }))
jest.mock('@/features/merchant/components/DirectionsSheet',  () => ({ DirectionsSheet:  () => null }))
jest.mock('@/features/merchant/components/FreeUserGateModal', () => ({
  FreeUserGateModal: ({ visible }: { visible: boolean }) => {
    const { Text } = require('react-native')
    return visible ? <Text>GATE_VISIBLE</Text> : null
  },
}))

jest.mock('@/hooks/useFavourite', () => ({
  useFavourite: () => ({ isFavourited: false, toggle: jest.fn(), isLoading: false }),
}))
let mockSubscribed = true
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ isSubscribed: mockSubscribed, isSubLoading: false, subscription: null }),
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({ status: 'authed', user: { id: 'u1' } })),
}))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}))

import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'
import { router } from 'expo-router'

jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const merchant = {
  id: 'm1', businessName: 'The Coffee House', tradingName: null, status: 'ACTIVE',
  logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
  primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
  subcategory: null, descriptor: 'Cafe', highlights: [],
  vouchers: [{
    id: 'v1', title: 'BOGO', type: 'BOGO', description: null, terms: null,
    imageUrl: null, estimatedSaving: 4.5, expiryDate: null,
  }],
  about: null, avgRating: null, reviewCount: 0, isFavourited: false,
  distance: null, nearestBranch: null,
  isOpenNow: true, openingHours: [], amenities: [], photos: [], branches: [],
}

describe('MerchantProfileScreen (M2)', () => {
  beforeEach(() => {
    ;(merchantApi.getProfile as jest.Mock).mockReset()
    mockSubscribed = true
    ;(router.push as jest.Mock).mockClear()
  })

  it('renders the missing-id error block when id is undefined', () => {
    const { getByText } = wrap(<MerchantProfileScreen id={undefined} />)
    expect(getByText('No merchant id')).toBeTruthy()
  })

  it('shows a loading indicator while the query is pending', () => {
    ;(merchantApi.getProfile as jest.Mock).mockReturnValueOnce(new Promise(() => {}))
    const { getByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(getByLabelText('Loading merchant profile')).toBeTruthy()
  })

  it('composes Hero + Meta with the merchant data on success', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('META_NAME=The Coffee House')).toBeTruthy()
    expect(await findByText('HERO_FAV=false')).toBeTruthy()
  })

  it('renders the error block on fetch failure', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText("Couldn't load merchant")).toBeTruthy()
    expect(await findByText('boom')).toBeTruthy()
  })

  it('subscribed user: tapping a voucher routes to /voucher/[id]', async () => {
    mockSubscribed = true
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('Tap voucher'))
    expect(router.push).toHaveBeenCalledWith('/voucher/v1')
  })

  it('free user: tapping a voucher shows the free-user gate, no nav', async () => {
    mockSubscribed = false
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('Tap voucher'))
    expect(await findByText('GATE_VISIBLE')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })
})
