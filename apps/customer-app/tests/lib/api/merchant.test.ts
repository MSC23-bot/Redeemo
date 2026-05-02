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
  // Real shape from `include: { tag: { select: { id, label } } }`. Label is
  // at .tag.label, NOT at the top level. The `{ id, label }` flat shape was
  // an early misread of the Prisma include — fixing the regression that
  // broke Covelum on device 2026-05-01 (highlights[i].label was undefined
  // because the schema looked at the wrong path).
  highlights: [
    { id: 'mh1', merchantId: 'm1', highlightTagId: 't1', sortOrder: 0,
      tag: { id: 't1', label: 'Outdoor seating' } },
  ],
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
    isMainBranch: true,
    isActive:     true,
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
  // P2.1 fields — required by the updated schema. fullProfile includes a
  // valid selectedBranch so existing tests continue to pass. The three new
  // selectedBranch-specific tests override these with their own values.
  selectedBranch: {
    id:           'b1',
    name:         'Main',
    isMainBranch: true,
    isActive:     true,
    addressLine1: '1 High St',
    addressLine2: null,
    city:         'London',
    postcode:     'SW1A 1AA',
    country:      'GB',
    latitude:     51.5,
    longitude:    -0.1,
    phone:        null,
    email:        null,
    websiteUrl:   null,
    logoUrl:      null,
    bannerUrl:    null,
    about:        null,
    openingHours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }],
    photos:       ['https://example.com/p1.jpg'],
    amenities:    [{ id: 'a1', name: 'Wifi', iconUrl: null }],
    distance:     null,
    isOpenNow:    true,
    avgRating:    4.5,
    reviewCount:  12,
    myReview:     null,
  },
  selectedBranchFallbackReason: 'no-candidate',
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

  // Regression for the on-device Covelum failure 2026-05-01: an earlier
  // schema read `highlights[i] = { id, label }` (flat) but the real
  // backend response from `include: { tag: ... }` is the full
  // MerchantHighlight model with a nested `tag` object. The UI's error
  // boundary surfaced "expected string, received undefined" at
  // path "highlights.0.label". This test pins the correct shape.
  it('parses real merchant highlights shape (Prisma include with tag relation)', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      highlights: [
        { id: 'mh1', merchantId: 'm1', highlightTagId: 't1', sortOrder: 0,
          tag: { id: 't1', label: 'Outdoor seating' } },
        { id: 'mh2', merchantId: 'm1', highlightTagId: 't2', sortOrder: 1,
          tag: { id: 't2', label: 'Vegan-friendly' } },
        { id: 'mh3', merchantId: 'm1', highlightTagId: 't3', sortOrder: 2,
          tag: { id: 't3', label: 'Dog-friendly' } },
      ],
    })
    const r = await merchantApi.getProfile('m1')
    expect(r.highlights).toHaveLength(3)
    expect(r.highlights[0]!.tag.label).toBe('Outdoor seating')
    expect(r.highlights[2]!.tag.label).toBe('Dog-friendly')
  })

  it('rejects a flat-shape highlight (the bug shape)', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      highlights: [{ id: 'h1', label: 'Wrong shape' }],   // missing merchantId/highlightTagId/sortOrder/tag
    })
    await expect(merchantApi.getProfile('m1')).rejects.toThrow()
  })

  // Regression for the on-device PR #29 failure: when a merchant has a
  // closed day in its opening-hours schedule, the backend serialises that
  // row as `{ isClosed: true, openTime: null, closeTime: null }` because
  // Prisma's `BranchOpeningHours.openTime/closeTime` are nullable. The
  // earlier schema's `z.string()` rejected null and the entire merchant
  // payload failed at the API edge. Schema is now `z.string().nullable()`;
  // this test pins the corrected contract.
  it('parses opening hours with null times on closed days', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      openingHours: [
        { dayOfWeek: 0, openTime: '12:00', closeTime: '22:00', isClosed: false },
        { dayOfWeek: 1, openTime: null,    closeTime: null,    isClosed: true  },  // ← was the bug shape
        { dayOfWeek: 2, openTime: '17:00', closeTime: '22:00', isClosed: false },
      ],
    })
    const r = await merchantApi.getProfile('m1')
    expect(r.openingHours).toHaveLength(3)
    expect(r.openingHours[1]!.isClosed).toBe(true)
    expect(r.openingHours[1]!.openTime).toBeNull()
    expect(r.openingHours[1]!.closeTime).toBeNull()
    // Open days still resolve normally.
    expect(r.openingHours[0]!.openTime).toBe('12:00')
    expect(r.openingHours[2]!.closeTime).toBe('22:00')
  })

  it('rejects malformed opening-hour entries (e.g. number where string expected)', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      openingHours: [
        { dayOfWeek: 0, openTime: 1200, closeTime: '22:00', isClosed: false },   // ← number, not string|null
      ],
    })
    await expect(merchantApi.getProfile('m1')).rejects.toThrow()
  })

  // ── selectedBranch + fallbackReason (P2.1) ────────────────────────────────

  const selectedBranchFixture = {
    id: 'b1', name: 'Brightlingsea',
    isMainBranch: true, isActive: true,
    addressLine1: '1 High St', addressLine2: null,
    city: 'Brightlingsea', postcode: 'CO7 0AA', country: 'GB',
    latitude: 51.81, longitude: 1.02,
    phone: null, email: null, websiteUrl: null,
    logoUrl: null, bannerUrl: null, about: null,
    openingHours: [
      { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
    ],
    photos: ['https://example.com/p1.jpg'],
    amenities: [{ id: 'a1', name: 'Wifi', iconUrl: null }],
    distance: 1500,
    isOpenNow: true,
    avgRating: 4.5,
    reviewCount: 12,
    myReview: null,
  }

  it('parses selectedBranch alongside merchant', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,                 // existing merchant-shape fixture
      selectedBranch: selectedBranchFixture,
      selectedBranchFallbackReason: 'used-candidate',
    })
    const r = await merchantApi.getProfile('m1')
    expect(r.selectedBranch).toBeDefined()
    expect(r.selectedBranch!.id).toBe('b1')
    expect(r.selectedBranch!.isOpenNow).toBe(true)
    expect(r.selectedBranch!.openingHours[0]!.openTime).toBe('09:00')
  })

  it('accepts selectedBranch=null when all branches suspended', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      selectedBranch: null,
      selectedBranchFallbackReason: 'all-suspended',
    })
    const r = await merchantApi.getProfile('m1')
    expect(r.selectedBranch).toBeNull()
    expect(r.selectedBranchFallbackReason).toBe('all-suspended')
  })

  it('rejects when selectedBranch.isOpenNow is missing', async () => {
    ;(api.get as jest.Mock).mockResolvedValueOnce({
      ...fullProfile,
      selectedBranch: { ...selectedBranchFixture, isOpenNow: undefined },
      selectedBranchFallbackReason: 'used-candidate',
    })
    await expect(merchantApi.getProfile('m1')).rejects.toThrow()
  })
})
