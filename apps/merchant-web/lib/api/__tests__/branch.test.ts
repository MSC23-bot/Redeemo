import {
  listBranches,
  createBranch,
  updateBranch,
  setBranchHours,
  getBranchAmenities,
  setBranchAmenities,
  getBranchPin,
  setBranchPin,
  requestBranchPhotoEdit,
} from '@/lib/api/branch'
import type { HoursPayloadRow } from '@/components/onboarding/branch/lib/hoursModel'

// M2 F4: the branch-step API client. We assert the exact HTTP verbs/paths/bodies
// against the REAL merged backend (src/api/merchant/branch/* + the open customer
// amenities endpoint). apiFetch is mocked; the client must compose the right calls.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({})
})

describe('lib/api/branch', () => {
  it('listBranches GETs the merchant branches with auth', async () => {
    apiFetch.mockResolvedValueOnce([{ id: 'b1', name: 'Main' }])
    const res = await listBranches()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches', { method: 'GET', auth: true })
    expect(res[0].id).toBe('b1')
  })

  it('createBranch POSTs the create-minimum body (name + address) plus contact + banner', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'Old Foundry' })
    const branch = await createBranch({
      name: 'Old Foundry',
      addressLine1: '12 Mill Lane',
      addressLine2: 'Unit 2',
      city: 'Huddersfield',
      postcode: 'HD1 1AA',
      phone: '+441484000000',
      email: 'hello@oldfoundry.co.uk',
      websiteUrl: 'oldfoundry.co.uk',
      bannerUrl: 'https://cdn.test/banner.png',
      about: 'A lovely place.',
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        name: 'Old Foundry',
        addressLine1: '12 Mill Lane',
        addressLine2: 'Unit 2',
        city: 'Huddersfield',
        postcode: 'HD1 1AA',
        phone: '+441484000000',
        email: 'hello@oldfoundry.co.uk',
        websiteUrl: 'oldfoundry.co.uk',
        bannerUrl: 'https://cdn.test/banner.png',
        about: 'A lovely place.',
      }),
    })
    expect(branch.id).toBe('b1')
  })

  it('updateBranch PATCHes only the provided editable detail fields and returns the parsed branch', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'New Foundry' })
    const branch = await updateBranch('b1', {
      name: 'New Foundry',
      addressLine1: '13 Mill Lane',
      addressLine2: 'Unit 3',
      city: 'Huddersfield',
      postcode: 'HD1 2BB',
      phone: '+441484111111',
      email: 'hi@newfoundry.co.uk',
      websiteUrl: 'newfoundry.co.uk',
      bannerUrl: 'https://cdn.test/banner2.png',
      about: 'An even lovelier place.',
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        name: 'New Foundry',
        addressLine1: '13 Mill Lane',
        addressLine2: 'Unit 3',
        city: 'Huddersfield',
        postcode: 'HD1 2BB',
        phone: '+441484111111',
        email: 'hi@newfoundry.co.uk',
        websiteUrl: 'newfoundry.co.uk',
        bannerUrl: 'https://cdn.test/banner2.png',
        about: 'An even lovelier place.',
      }),
    })
    expect(branch.id).toBe('b1')
  })

  it('setBranchHours POSTs { hours } to the branch hours route', async () => {
    const hours: HoursPayloadRow[] = [
      { dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 0, isClosed: true },
    ]
    await setBranchHours('b1', hours)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/hours', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ hours }),
    })
  })

  it('getBranchAmenities reads the OPEN customer amenities endpoint by category id (no auth header)', async () => {
    apiFetch.mockResolvedValueOnce({ amenities: [{ id: 'a1', name: 'Wifi', iconUrl: null, isActive: true }] })
    const amenities = await getBranchAmenities('cat-restaurant')
    // Open endpoint: no `auth: true` (the merchant portal client cannot present a
    // customer JWT; the route is no-auth by design).
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/customer/categories/cat-restaurant/amenities', {
      method: 'GET',
    })
    expect(amenities[0]).toMatchObject({ id: 'a1', name: 'Wifi' })
  })

  it('setBranchAmenities POSTs a full-replace amenityIds array', async () => {
    await setBranchAmenities('b1', ['a1', 'a2'])
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/amenities', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ amenityIds: ['a1', 'a2'] }),
    })
  })

  it('getBranchPin GETs the decrypted pin', async () => {
    apiFetch.mockResolvedValueOnce({ pin: '1234' })
    const res = await getBranchPin('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/pin', { method: 'GET', auth: true })
    expect(res.pin).toBe('1234')
  })

  it('setBranchPin PUTs { pin }', async () => {
    await setBranchPin('b1', '4821')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/pin', {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ pin: '4821' }),
    })
  })

  it('requestBranchPhotoEdit POSTs the governed photo edit-request (add urls)', async () => {
    await requestBranchPhotoEdit('b1', ['https://cdn.test/p1.png', 'https://cdn.test/p2.png'])
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/photos/edit-request', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ add: ['https://cdn.test/p1.png', 'https://cdn.test/p2.png'] }),
    })
  })
})
