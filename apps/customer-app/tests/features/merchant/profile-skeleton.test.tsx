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
  MetaSection: ({ businessName, category }: { businessName: string; category: string | null }) => {
    const { Text } = require('react-native')
    return (
      <>
        <Text>META_NAME={businessName}</Text>
        <Text>META_CATEGORY={category ?? 'NULL'}</Text>
      </>
    )
  },
}))
// Real-shape TabBar mock so tab-switching tests can press individual tabs.
jest.mock('@/features/merchant/components/TabBar', () => ({
  TabBar: ({ tabs, activeTab, onTabPress }: any) => {
    const { Text, Pressable, View } = require('react-native')
    return (
      <View>
        {tabs.map((t: { id: string; label: string }) => (
          <Pressable
            key={t.id}
            onPress={() => onTabPress(t.id)}
            accessibilityLabel={`tab-${t.id}`}
          >
            <Text>{t.label}{t.id === activeTab ? '*' : ''}</Text>
          </Pressable>
        ))}
      </View>
    )
  },
}))
jest.mock('@/features/merchant/components/VouchersTab', () => ({
  VouchersTab: ({ onVoucherPress }: { onVoucherPress: (id: string) => void }) => {
    const { Text, Pressable } = require('react-native')
    return <Pressable onPress={() => onVoucherPress('v1')} accessibilityLabel="Tap voucher"><Text>VOUCHERS_TAB</Text></Pressable>
  },
}))
jest.mock('@/features/merchant/components/AboutTab',    () => ({
  AboutTab: () => { const { Text } = require('react-native'); return <Text>ABOUT_TAB</Text> },
}))
jest.mock('@/features/merchant/components/BranchesTab', () => ({
  BranchesTab: () => { const { Text } = require('react-native'); return <Text>BRANCHES_TAB</Text> },
}))
jest.mock('@/features/merchant/components/ReviewsTab',  () => ({
  ReviewsTab: () => { const { Text } = require('react-native'); return <Text>REVIEWS_TAB</Text> },
}))
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

  // Regression for the on-device "descriptor too generic" bug: the screen
  // must pass the server-computed `descriptor` field (Plan 1.5 §3.6 — e.g.
  // "Indian Restaurant" for Covelum) into MetaSection's `category` prop,
  // NOT the raw `primaryCategory.name` (which would render just
  // "Restaurant"). See plan §8.1.
  it('passes merchant.descriptor (NOT primaryCategory.name) to MetaSection', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      descriptor: 'Indian Restaurant',
      primaryCategory: {
        id: 'cat-restaurant', name: 'Restaurant',
        pinColour: null, pinIcon: null, descriptorSuffix: null, parentId: 'cat-food',
      },
    })
    const { findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('META_CATEGORY=Indian Restaurant')).toBeTruthy()
    // The bug shape must NOT be rendered.
    expect(queryByText('META_CATEGORY=Restaurant')).toBeNull()
  })

  it('falls through to NULL category when descriptor is empty', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({ ...merchant, descriptor: '' })
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('META_CATEGORY=NULL')).toBeTruthy()
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

  // ── Tab switching (plan §12 "all 4 tab switches") ────────────────────────────
  it('renders the Vouchers tab content by default', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('VOUCHERS_TAB')).toBeTruthy()
  })

  it('switches to About when the About tab is pressed', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-about'))
    expect(await findByText('ABOUT_TAB')).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })

  it('hides the Branches tab on a single-branch merchant (intended UX)', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      ...merchant,
      branches: [{ id: 'b1', name: 'Only', addressLine1: null, addressLine2: null,
        city: null, postcode: null, latitude: null, longitude: null,
        phone: null, email: null, distance: null, isOpenNow: true,
        avgRating: null, reviewCount: 0 }],
    })
    const { queryByLabelText, findByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByLabelText('tab-vouchers')).toBeTruthy()
    expect(queryByLabelText('tab-branches')).toBeNull()
  })

  it('shows the Branches tab and switches to it on a multi-branch merchant', async () => {
    const branchA = { id: 'b1', name: 'A', addressLine1: null, addressLine2: null,
      city: null, postcode: null, latitude: null, longitude: null,
      phone: null, email: null, distance: 1000, isOpenNow: true,
      avgRating: null, reviewCount: 0 }
    const branchB = { ...branchA, id: 'b2', name: 'B', distance: 500 }
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({ ...merchant, branches: [branchA, branchB] })
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-branches'))
    expect(await findByText('BRANCHES_TAB')).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })

  it('switches to Reviews tab', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce(merchant)
    const { findByLabelText, findByText, queryByText } = wrap(<MerchantProfileScreen id="m1" />)
    fireEvent.press(await findByLabelText('tab-reviews'))
    expect(await findByText('REVIEWS_TAB')).toBeTruthy()
    expect(queryByText('VOUCHERS_TAB')).toBeNull()
  })
})
