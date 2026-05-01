import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'
import { merchantApi } from '@/lib/api/merchant'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }))

jest.spyOn(merchantApi, 'getProfile')

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('MerchantProfileScreen (M1 skeleton)', () => {
  beforeEach(() => { (merchantApi.getProfile as jest.Mock).mockReset() })

  it('renders the missing-id error block when id is undefined', () => {
    const { getByText } = wrap(<MerchantProfileScreen id={undefined} />)
    expect(getByText('No merchant id')).toBeTruthy()
  })

  it('shows a loading indicator while the query is pending', () => {
    ;(merchantApi.getProfile as jest.Mock).mockReturnValueOnce(new Promise(() => {}))
    const { getByLabelText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(getByLabelText('Loading merchant')).toBeTruthy()
  })

  it('renders the M1-skeleton card on success', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockResolvedValueOnce({
      id: 'm1', businessName: 'The Coffee House', tradingName: null, status: 'ACTIVE',
      logoUrl: null, bannerUrl: null, description: null, websiteUrl: null,
      primaryCategoryId: null, primaryCategory: null, primaryDescriptorTag: null,
      subcategory: null, descriptor: 'Cafe', highlights: [], vouchers: [],
      about: null, avgRating: null, reviewCount: 0, isFavourited: false,
      distance: null, nearestBranch: null,
      isOpenNow: true, openingHours: [], amenities: [], photos: [], branches: [],
    })
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText('The Coffee House')).toBeTruthy()
    expect(await findByText('Cafe')).toBeTruthy()
    expect(await findByText('Open now')).toBeTruthy()
  })

  it('renders the error block on fetch failure', async () => {
    ;(merchantApi.getProfile as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { findByText } = wrap(<MerchantProfileScreen id="m1" />)
    expect(await findByText("Couldn't load merchant")).toBeTruthy()
    expect(await findByText('boom')).toBeTruthy()
  })
})
