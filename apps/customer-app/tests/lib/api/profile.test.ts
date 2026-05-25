import { api } from '@/lib/api'
import { profileApi } from '@/lib/api/profile'

jest.spyOn(api, 'get')
jest.spyOn(api, 'patch')
jest.spyOn(api, 'put')

describe('profileApi', () => {
  it('getMe returns typed profile', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: null, email: 'a@x.com', phone: null,
      dateOfBirth: null, gender: null, addressLine1: null, addressLine2: null,
      city: null, postcode: null, profileImageUrl: null,
      // §DF PR #128 R1-1 prereq — additive saved-postcode coordinates +
      // locality.  All nullable on the wire when the user hasn't set a
      // postcode yet.
      latitude: null, longitude: null, localityId: null, locality: null,
      newsletterConsent: false, emailVerified: true, phoneVerified: false,
      onboardingCompletedAt: null,
      subscriptionPromptSeenAt: null,
      interests: [], profileCompleteness: 10, createdAt: new Date().toISOString(),
    })
    const me = await profileApi.getMe()
    expect(me.email).toBe('a@x.com')
  })

  it('getMe coerces string-typed Decimal latitude/longitude into numbers', async () => {
    // §DF PR #128 R1-1 prereq — Prisma `Decimal` serialises as a string
    // in JSON.  The Zod schema's `decimalNullableNumber` transform
    // mirrors the `subscription.ts:priceGbp` z.coerce.number() pattern
    // — coerce strings into numbers so downstream callers can rely on
    // numeric typing without per-call casts.
    (api.get as jest.Mock).mockResolvedValue({
      id: 'u2', firstName: 'B', lastName: 'C', email: 'b@x.com', phone: null,
      dateOfBirth: null, gender: null, addressLine1: null, addressLine2: null,
      city: 'Huddersfield', postcode: 'HD1 1AA', profileImageUrl: null,
      // Prisma Decimal-as-string wire shape:
      latitude:  '53.6458',
      longitude: '-1.7850',
      localityId: 'loc-huddersfield',
      locality: { id: 'loc-huddersfield', name: 'Huddersfield', postTown: 'HUDDERSFIELD', region: 'Yorkshire and The Humber' },
      newsletterConsent: false, emailVerified: true, phoneVerified: false,
      onboardingCompletedAt: null,
      subscriptionPromptSeenAt: null,
      interests: [], profileCompleteness: 100, createdAt: new Date().toISOString(),
    })
    const me = await profileApi.getMe()
    expect(me.latitude).toBe(53.6458)
    expect(me.longitude).toBe(-1.785)
    expect(me.localityId).toBe('loc-huddersfield')
    expect(me.locality?.name).toBe('Huddersfield')
  })
  it('updateInterests issues PUT with interestIds', async () => {
    (api.put as jest.Mock).mockResolvedValue({ interests: [] })
    await profileApi.updateInterests(['i1', 'i2'])
    expect(api.put).toHaveBeenCalledWith('/api/v1/customer/profile/interests', { interestIds: ['i1', 'i2'] })
  })
})
