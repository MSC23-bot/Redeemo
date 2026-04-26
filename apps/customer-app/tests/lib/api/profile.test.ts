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
      newsletterConsent: false, emailVerified: true, phoneVerified: false,
      onboardingCompletedAt: null, subscriptionPromptSeenAt: null,
      interests: [], profileCompleteness: 10, createdAt: new Date().toISOString(),
    })
    const me = await profileApi.getMe()
    expect(me.email).toBe('a@x.com')
  })
  it('updateInterests issues PUT with interestIds', async () => {
    (api.put as jest.Mock).mockResolvedValue({ interests: [] })
    await profileApi.updateInterests(['i1', 'i2'])
    expect(api.put).toHaveBeenCalledWith('/api/v1/customer/profile/interests', { interestIds: ['i1', 'i2'] })
  })
})
