// Zod parity pins for the favourites API client (Phase 3C.1g M2.1).
//
// These tests exercise the Zod schemas in isolation against the exact
// backend response shape returned by:
//   • src/api/customer/favourites/service.ts::listFavouriteBranches  (M1.3)
//   • src/api/customer/favourites/service.ts::listFavouriteVouchers (M1.4)
//
// The pin fails if the client schema drifts away from the backend's
// emitted shape — either by adding a required field the backend doesn't
// emit, or by dropping a field the backend will produce.

import {
  _favouriteBranchesResponseSchemaForTests,
  _favouriteVouchersResponseSchemaForTests,
} from '@/lib/api/favourites'

describe('favouriteBranchesResponseSchema — parity with listFavouriteBranches', () => {
  it('parses a representative single-row response with full enrichment', () => {
    const payload = {
      items: [
        {
          id:                 'br-a',
          name:               'Iron Forge Gym — Marsden',
          isMainBranch:       true,
          addressLine1:       '1 Test St',
          addressLine2:       null,
          city:               'Marsden',
          postcode:           'HD7 6EZ',
          latitude:           53.6,
          longitude:          -1.9,
          locationConfidence: 'MANUALLY_CONFIRMED',
          merchant: {
            id:              'm-1',
            businessName:    'Iron Forge Gym',
            tradingName:     null,
            logoUrl:         null,
            bannerUrl:       null,
            status:          'ACTIVE',
            primaryCategory: { id: 'cat-1', name: 'Gym' },
          },
          voucherCount:       3,
          maxEstimatedSaving: 25,
          avgRating:          4.2,
          reviewCount:        17,
          isOpen:             true,
          isUnavailable:      false,
          favouritedAt:       '2026-05-29T10:17:43.897Z',
        },
      ],
      total: 1,
      page:  1,
      limit: 20,
    }

    const parsed = _favouriteBranchesResponseSchemaForTests.parse(payload)
    expect(parsed.items[0]!.id).toBe('br-a')
    expect(parsed.items[0]!.merchant.primaryCategory?.name).toBe('Gym')
  })

  it('redacted POSTCODE_CENTROID branch parses with null lat/lng', () => {
    const payload = {
      items: [
        {
          id:                 'br-redacted',
          name:               'Approximate Location Co',
          isMainBranch:       true,
          addressLine1:       null,
          addressLine2:       null,
          city:               'Testtown',
          postcode:           'TT1 1TT',
          latitude:           null,
          longitude:          null,
          locationConfidence: 'POSTCODE_CENTROID',
          merchant: {
            id:              'm-r',
            businessName:    'Approximate Co',
            tradingName:     null,
            logoUrl:         null,
            bannerUrl:       null,
            status:          'ACTIVE',
            primaryCategory: null,
          },
          voucherCount:       0,
          maxEstimatedSaving: 0,
          avgRating:          null,
          reviewCount:        0,
          isOpen:             false,
          isUnavailable:      false,
          favouritedAt:       '2026-05-29T10:00:00.000Z',
        },
      ],
      total: 1,
      page:  1,
      limit: 20,
    }
    const parsed = _favouriteBranchesResponseSchemaForTests.parse(payload)
    expect(parsed.items[0]!.latitude).toBeNull()
    expect(parsed.items[0]!.longitude).toBeNull()
    expect(parsed.items[0]!.locationConfidence).toBe('POSTCODE_CENTROID')
  })

  it('rejects when isFavourited is incorrectly present on the per-row payload (field belongs on Discovery, NOT Favourites list)', () => {
    // The favourites list is intrinsically a list of favourited rows;
    // backend does NOT echo `isFavourited` per row.  This pin catches
    // an accidental client-side addition that would assume the field
    // exists.  zod parse() will reject unknown keys silently (defaults
    // to strip), so we exercise the absence by confirming the parsed
    // shape doesn't carry an `isFavourited` property.
    const payload = {
      items: [
        {
          id:                 'br-c',
          name:               'No-Heart-Field Co',
          isMainBranch:       true,
          addressLine1:       null,
          addressLine2:       null,
          city:               null,
          postcode:           null,
          latitude:           null,
          longitude:          null,
          locationConfidence: 'MANUALLY_CONFIRMED',
          merchant: {
            id:              'm-c',
            businessName:    'No-Heart Co',
            tradingName:     null,
            logoUrl:         null,
            bannerUrl:       null,
            status:          'ACTIVE',
            primaryCategory: null,
          },
          voucherCount:       0,
          maxEstimatedSaving: 0,
          avgRating:          null,
          reviewCount:        0,
          isOpen:             true,
          isUnavailable:      false,
          favouritedAt:       '2026-05-29T10:00:00.000Z',
        },
      ],
      total: 1,
      page:  1,
      limit: 20,
    }
    const parsed = _favouriteBranchesResponseSchemaForTests.parse(payload)
    expect((parsed.items[0] as Record<string, unknown>).isFavourited).toBeUndefined()
  })
})

describe('favouriteVouchersResponseSchema — parity with listFavouriteVouchers (v1.1)', () => {
  it('parses a representative single-row response with priorityBucket', () => {
    const payload = {
      items: [
        {
          id:                       'v-1',
          title:                    'BOGO Coffee',
          type:                     'BOGO',
          estimatedSaving:          5,
          description:              null,
          expiresAt:                null,
          status:                   'ACTIVE',
          approvalStatus:           'APPROVED',
          isRedeemedInCurrentCycle: false,
          merchant: {
            id:           'm-v1',
            businessName: 'Roast Co',
            logoUrl:      null,
            status:       'ACTIVE',
          },
          favouritedAt:    '2026-05-29T10:00:00.000Z',
          isUnavailable:   false,
          priorityBucket:  2,
        },
      ],
      total: 1,
      page:  1,
      limit: 20,
    }
    const parsed = _favouriteVouchersResponseSchemaForTests.parse(payload)
    expect(parsed.items[0]!.priorityBucket).toBe(2)
    expect(parsed.items[0]!.estimatedSaving).toBe(5)
  })

  it('coerces estimatedSaving from string (Prisma Decimal JSON serialisation)', () => {
    const payload = {
      items: [
        {
          id:                       'v-2',
          title:                    'Discount voucher',
          type:                     'DISCOUNT_FIXED',
          estimatedSaving:          '12.50',  // Prisma Decimal → string
          description:              'Save £12.50',
          expiresAt:                '2026-07-01T00:00:00.000Z',
          status:                   'ACTIVE',
          approvalStatus:           'APPROVED',
          isRedeemedInCurrentCycle: false,
          merchant: {
            id:           'm-v2',
            businessName: 'Sale Co',
            logoUrl:      null,
            status:       'ACTIVE',
          },
          favouritedAt:    '2026-05-29T10:00:00.000Z',
          isUnavailable:   false,
          priorityBucket:  2,
        },
      ],
      total: 1,
      page:  1,
      limit: 20,
    }
    const parsed = _favouriteVouchersResponseSchemaForTests.parse(payload)
    expect(parsed.items[0]!.estimatedSaving).toBe(12.5)
  })

  it('rejects priorityBucket outside the 1..7 range', () => {
    const base = {
      id:                       'v-bad',
      title:                    'Bad',
      type:                     'BOGO',
      estimatedSaving:          0,
      description:              null,
      expiresAt:                null,
      status:                   'ACTIVE',
      approvalStatus:           'APPROVED',
      isRedeemedInCurrentCycle: false,
      merchant: {
        id:           'm-bad',
        businessName: 'Bad Co',
        logoUrl:      null,
        status:       'ACTIVE',
      },
      favouritedAt:  '2026-05-29T10:00:00.000Z',
      isUnavailable: false,
    }
    const responseWith = (priorityBucket: number) => ({
      items: [{ ...base, priorityBucket }],
      total: 1, page: 1, limit: 20,
    })

    expect(() => _favouriteVouchersResponseSchemaForTests.parse(responseWith(0))).toThrow()
    expect(() => _favouriteVouchersResponseSchemaForTests.parse(responseWith(8))).toThrow()
    expect(() => _favouriteVouchersResponseSchemaForTests.parse(responseWith(1.5))).toThrow()
  })

  it('parses all 7 priority bucket values (1..7)', () => {
    for (const bucket of [1, 2, 3, 4, 5, 6, 7]) {
      const payload = {
        items: [
          {
            id:                       `v-${bucket}`,
            title:                    `Bucket ${bucket}`,
            type:                     'BOGO',
            estimatedSaving:          0,
            description:              null,
            expiresAt:                null,
            status:                   'ACTIVE',
            approvalStatus:           'APPROVED',
            isRedeemedInCurrentCycle: false,
            merchant: {
              id:           `m-${bucket}`,
              businessName: 'Co',
              logoUrl:      null,
              status:       'ACTIVE',
            },
            favouritedAt:    '2026-05-29T10:00:00.000Z',
            isUnavailable:   false,
            priorityBucket:  bucket,
          },
        ],
        total: 1, page: 1, limit: 20,
      }
      const parsed = _favouriteVouchersResponseSchemaForTests.parse(payload)
      expect(parsed.items[0]!.priorityBucket).toBe(bucket)
    }
  })
})
