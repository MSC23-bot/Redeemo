import { api } from '@/lib/api'
import { merchantApi } from '@/lib/api/merchant'

jest.spyOn(api, 'get')

const fullProfile = {
  id:                  'm1',
  businessName:        'The Coffee House',
  tradingName:         null,
  status:              'ACTIVE',
  logoUrl:             null,
  bannerUrl:           null,
  description:         'A cosy cafe',
  websiteUrl:          null,
  primaryCategoryId:   'cat-food',
  primaryCategory: {
    id:               'cat-food',
    name:             'Food & Drink',
    pinColour:        '#E65100',
    pinIcon:          'fork-knife',
    descriptorSuffix: null,
    parentId:         null,
  },
  primaryDescriptorTag: null,
  subcategory:          null,
  descriptor:           'Cafe',
  highlights:           [{ id: 'h1', label: 'Outdoor seating' }],
  vouchers: [{
    id:              'v1',
    title:           'BOGO',
    type:            'BOGO',
    description:     null,
    terms:           null,
    imageUrl:        null,
    estimatedSaving: '4.50',  // Prisma Decimal serialises as string — coerce
    expiryDate:      null,
  }],
  about:        'A cosy cafe',
  avgRating:    4.5,
  reviewCount:  12,
  isFavourited: false,
  distance:     null,
  nearestBranch: {
    id:           'b1',
    name:         'Main',
    addressLine1: '1 High St',
    addressLine2: null,
    city:         'London',
    postcode:     'SW1A 1AA',
    latitude:     51.5,
    longitude:    -0.1,
    phone:        null,
    email:        null,
    distance:     null,
    isOpenNow:    true,
  },
  isOpenNow:    true,
  openingHours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }],
  amenities:    [{ id: 'a1', name: 'Wifi', iconUrl: null }],
  photos:       ['https://example.com/p1.jpg'],
  branches: [{
    id:           'b1',
    name:         'Main',
    addressLine1: '1 High St',
    addressLine2: null,
    city:         'London',
    postcode:     'SW1A 1AA',
    latitude:     51.5,
    longitude:    -0.1,
    phone:        null,
    email:        null,
    distance:     null,
    isOpenNow:    true,
    avgRating:    4.5,
    reviewCount:  12,
  }],
}

describe('merchantApi.getProfile', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses a fully-populated merchant response', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce(fullProfile)
    const r = await merchantApi.getProfile('m1')
    expect(r.businessName).toBe('The Coffee House')
    expect(r.descriptor).toBe('Cafe')
    expect(r.vouchers).toHaveLength(1)
    expect(r.vouchers[0]!.estimatedSaving).toBe(4.5)         // coerced number
    expect(r.nearestBranch?.id).toBe('b1')
    expect(r.openingHours[0]!.openTime).toBe('09:00')
  })

  it('omits coords from the URL when not provided', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce(fullProfile)
    await merchantApi.getProfile('m1')
    expect((api.get as jest.Mock).mock.calls[0]![0]).toBe('/api/v1/customer/merchants/m1')
  })

  it('appends coords to the URL when provided', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce(fullProfile)
    await merchantApi.getProfile('m1', { lat: 51.5, lng: -0.1 })
    expect((api.get as jest.Mock).mock.calls[0]![0]).toBe('/api/v1/customer/merchants/m1?lat=51.5&lng=-0.1')
  })

  it('url-encodes the merchant id', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce(fullProfile)
    await merchantApi.getProfile('id with spaces')
    expect((api.get as jest.Mock).mock.calls[0]![0]).toBe('/api/v1/customer/merchants/id%20with%20spaces')
  })

  it('rejects a payload missing required fields', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({ id: 'm1' })
    await expect(merchantApi.getProfile('m1')).rejects.toThrow()
  })
})
