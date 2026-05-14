// tests/api/customer/profile/resolve-on-write.test.ts
//
// Plan 4 M1.20 — PC2 submit resolve-on-write contract.
//
// Tested directly against the service function (not via Fastify inject) to
// keep the test focused on the new logic — resolver call + findOrCreateLocality
// + atomicity. The route-level shape is already covered by the existing
// profile.routes.test.ts which mocks the service module.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateCustomerProfile } from '../../../../src/api/customer/profile/service'
import { AppError } from '../../../../src/api/shared/errors'

type PrismaMock = {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  locality: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

function buildPrismaMock(): PrismaMock {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'user-1',
        firstName: 'Test', lastName: null, email: 't@test', phone: null,
        profileImageUrl: null, dateOfBirth: null, gender: null,
        addressLine1: null, addressLine2: null,
        city: data.city ?? null,
        postcode: data.postcode ?? null,
        newsletterConsent: false, emailVerified: true, phoneVerified: true,
        onboardingCompletedAt: null, subscriptionPromptSeenAt: null,
        interests: [],
      })),
    },
    locality: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'locality-new-1',
        name: 'Huddersfield',
        slug: 'huddersfield-kirklees',
        postTown: 'Huddersfield',
        ladDistrict: 'Kirklees',
        adminCounty: 'West Yorkshire',
        region: 'Yorkshire and the Humber',
        country: 'England',
        centerLat: 53.6463, centerLng: -1.7809,
        populationTier: 'UNKNOWN', needsReview: true,
      }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

const VALID_POSTCODES_IO_RESPONSE = {
  status: 200,
  result: {
    postcode: 'HD1 2PY',
    country: 'England',
    region: 'Yorkshire and the Humber',
    admin_district: 'Kirklees',
    admin_county: 'West Yorkshire',
    parish: 'Kirklees, unparished area',
    admin_ward: 'Newsome',
    parliamentary_constituency: 'Huddersfield',
    post_town: 'Huddersfield',
    latitude: 53.6463,
    longitude: -1.7809,
  },
}

describe('updateCustomerProfile — PC2 resolve-on-write (Plan 4 M1.20)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('persists the full location snapshot on a valid postcode submit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => VALID_POSTCODES_IO_RESPONSE,
    } as Response)

    const prismaMock = buildPrismaMock()
    await updateCustomerProfile(prismaMock as never, 'user-1', { postcode: 'HD12PY' })

    expect(prismaMock.user.update).toHaveBeenCalledOnce()
    const updateData = prismaMock.user.update.mock.calls[0][0].data
    expect(updateData.postcode).toBe('HD1 2PY')
    expect(updateData.latitude).toBe(53.6463)
    expect(updateData.longitude).toBe(-1.7809)
    expect(updateData.localityId).toBe('locality-new-1')
    expect(updateData.postTown).toBe('Huddersfield')
    expect(updateData.ladDistrict).toBe('Kirklees')
    expect(updateData.adminCounty).toBe('West Yorkshire')
    expect(updateData.region).toBe('Yorkshire and the Humber')
    expect(updateData.country).toBe('England')
    expect(updateData.locationResolvedAt).toBeInstanceOf(Date)
    // legacy `city` aligned to locality name
    expect(updateData.city).toBe('Huddersfield')
  })

  it('throws POSTCODE_NOT_FOUND and does NOT call user.update on resolver 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ status: 404 }),
    } as Response)

    const prismaMock = buildPrismaMock()
    await expect(
      updateCustomerProfile(prismaMock as never, 'user-1', { postcode: 'ZZ99 9ZZ' }),
    ).rejects.toThrow(AppError)
    await expect(
      updateCustomerProfile(prismaMock as never, 'user-1', { postcode: 'ZZ99 9ZZ' }),
    ).rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND', statusCode: 400 })

    // Critical: existing user.update MUST NOT run when the resolver fails.
    // This is what prevents the user's valid pre-existing location from being
    // overwritten by a typo / bad postcode.
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('throws GAZETTEER_UNAVAILABLE (503) and does NOT call user.update on resolver failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    const prismaMock = buildPrismaMock()
    await expect(
      updateCustomerProfile(prismaMock as never, 'user-1', { postcode: 'HD1 2PY' }),
    ).rejects.toMatchObject({ code: 'GAZETTEER_UNAVAILABLE', statusCode: 503 })

    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('does NOT call the resolver or write postcode snapshot fields when postcode is absent from payload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const prismaMock = buildPrismaMock()
    await updateCustomerProfile(prismaMock as never, 'user-1', { firstName: 'Alice' })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(prismaMock.user.update).toHaveBeenCalledOnce()
    const updateData = prismaMock.user.update.mock.calls[0][0].data
    expect(updateData.firstName).toBe('Alice')
    expect(updateData.postcode).toBeUndefined()
    expect(updateData.localityId).toBeUndefined()
    expect(updateData.locationResolvedAt).toBeUndefined()
  })

  it('legacy `city`-only path still works without triggering the resolver', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const prismaMock = buildPrismaMock()
    await updateCustomerProfile(prismaMock as never, 'user-1', { city: 'London' })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(prismaMock.user.update).toHaveBeenCalledOnce()
    const updateData = prismaMock.user.update.mock.calls[0][0].data
    expect(updateData.city).toBe('London')
    expect(updateData.postcode).toBeUndefined()
    expect(updateData.localityId).toBeUndefined()
  })
})
