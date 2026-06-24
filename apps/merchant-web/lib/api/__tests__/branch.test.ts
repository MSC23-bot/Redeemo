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
  getBranch,
  createBranchEditRequest,
  listBranchEditRequests,
  withdrawBranchEditRequest,
  sendBranchPin,
  branchSchema,
  branchPendingEditSchema,
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

// ---------------------------------------------------------------------------
// PR-1 F1: schema extensions + read / edit-request / pin-send functions.
// ---------------------------------------------------------------------------

describe('lib/api/branch (PR-1 F1)', () => {
  it('branchSchema parses the new PR-1 fields (logoUrl / locationConfidence / isActive / latitude / longitude / pendingEdits)', () => {
    const parsed = branchSchema.parse({
      id: 'b1',
      name: 'Main',
      logoUrl: 'https://cdn.test/logo.png',
      locationConfidence: 'MANUALLY_CONFIRMED',
      isActive: true,
      latitude: 53.645,
      longitude: -1.785,
      pendingEdits: [
        {
          id: 'pe1',
          branchId: 'b1',
          merchantId: 'm1',
          proposedChanges: { name: 'New Name', postcode: 'HD1 2BB' },
          includesPhotos: false,
          status: 'PENDING',
          createdAt: '2026-06-23T10:00:00.000Z',
        },
      ],
    })
    expect(parsed.logoUrl).toBe('https://cdn.test/logo.png')
    expect(parsed.locationConfidence).toBe('MANUALLY_CONFIRMED')
    expect(parsed.isActive).toBe(true)
    expect(parsed.latitude).toBe(53.645)
    expect(parsed.longitude).toBe(-1.785)
    expect(parsed.pendingEdits?.[0].status).toBe('PENDING')
  })

  it('branchSchema accepts null/absent values for the nullish PR-1 fields', () => {
    const parsed = branchSchema.parse({
      id: 'b1',
      name: 'Main',
      logoUrl: null,
      locationConfidence: null,
      latitude: null,
      longitude: null,
    })
    expect(parsed.logoUrl).toBeNull()
    expect(parsed.locationConfidence).toBeNull()
    // isActive / pendingEdits omitted entirely → undefined, no throw
    expect(parsed.isActive).toBeUndefined()
    expect(parsed.pendingEdits).toBeUndefined()
  })

  it('branchSchema REJECTS an invalid locationConfidence', () => {
    const validBranch = { id: 'b1', name: 'Main', locationConfidence: 'MANUALLY_CONFIRMED' as const }
    expect(() => branchSchema.parse({ ...validBranch, locationConfidence: 'BOGUS' })).toThrow()
  })

  it('branchPendingEditSchema accepts the four PendingEditStatus enum values', () => {
    for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
      const parsed = branchPendingEditSchema.parse({
        id: 'pe1',
        branchId: 'b1',
        merchantId: 'm1',
        proposedChanges: {},
        includesPhotos: false,
        status,
        createdAt: '2026-06-23T10:00:00.000Z',
      })
      expect(parsed.status).toBe(status)
    }
  })

  it('branchPendingEditSchema REJECTS an invalid status', () => {
    expect(() =>
      branchPendingEditSchema.parse({
        id: 'pe1',
        branchId: 'b1',
        merchantId: 'm1',
        proposedChanges: {},
        includesPhotos: false,
        status: 'BOGUS',
        createdAt: '2026-06-23T10:00:00.000Z',
      }),
    ).toThrow()
  })

  it('getBranch GETs /branches/:id with auth and returns the parsed branch', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'Main', isActive: true })
    const branch = await getBranch('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1', {
      method: 'GET',
      auth: true,
    })
    expect(branch.id).toBe('b1')
    expect(branch.isActive).toBe(true)
  })

  it('createBranchEditRequest POSTs the SENSITIVE subset to /edit-request and returns the parsed BranchPendingEdit', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      branchId: 'b1',
      merchantId: 'm1',
      proposedChanges: { name: 'New Name', city: 'Leeds' },
      includesPhotos: false,
      status: 'PENDING',
      createdAt: '2026-06-23T10:00:00.000Z',
    })
    const edit = await createBranchEditRequest('b1', {
      name: 'New Name',
      about: 'A new about.',
      addressLine1: '13 Mill Lane',
      addressLine2: 'Unit 3',
      city: 'Leeds',
      postcode: 'LS1 1AA',
      logoUrl: 'https://cdn.test/logo2.png',
      bannerUrl: 'https://cdn.test/banner2.png',
    })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/edit-request', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        name: 'New Name',
        about: 'A new about.',
        addressLine1: '13 Mill Lane',
        addressLine2: 'Unit 3',
        city: 'Leeds',
        postcode: 'LS1 1AA',
        logoUrl: 'https://cdn.test/logo2.png',
        bannerUrl: 'https://cdn.test/banner2.png',
      }),
    })
    // Returns the parsed shape (id/status/createdAt present).
    expect(edit.id).toBe('pe1')
    expect(edit.status).toBe('PENDING')
    expect(edit.createdAt).toBe('2026-06-23T10:00:00.000Z')
  })

  it('listBranchEditRequests GETs /edit-requests with auth and returns the parsed array (all statuses)', async () => {
    apiFetch.mockResolvedValueOnce([
      {
        id: 'pe1',
        branchId: 'b1',
        merchantId: 'm1',
        proposedChanges: { name: 'A' },
        includesPhotos: false,
        status: 'PENDING',
        createdAt: '2026-06-23T10:00:00.000Z',
      },
      {
        id: 'pe2',
        branchId: 'b1',
        merchantId: 'm1',
        proposedChanges: { name: 'B' },
        includesPhotos: false,
        status: 'WITHDRAWN',
        createdAt: '2026-06-22T10:00:00.000Z',
        reviewedAt: '2026-06-22T11:00:00.000Z',
      },
    ])
    const list = await listBranchEditRequests('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/edit-requests', {
      method: 'GET',
      auth: true,
    })
    expect(list).toHaveLength(2)
    expect(list[0].status).toBe('PENDING')
    expect(list[1].status).toBe('WITHDRAWN')
  })

  it('withdrawBranchEditRequest DELETEs /edit-requests/:editId with auth and returns the parsed edit', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      branchId: 'b1',
      merchantId: 'm1',
      proposedChanges: { name: 'A' },
      includesPhotos: false,
      status: 'WITHDRAWN',
      createdAt: '2026-06-23T10:00:00.000Z',
      reviewedAt: '2026-06-23T11:00:00.000Z',
    })
    const edit = await withdrawBranchEditRequest('b1', 'pe1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/edit-requests/pe1', {
      method: 'DELETE',
      auth: true,
    })
    expect(edit.status).toBe('WITHDRAWN')
  })

  it('sendBranchPin POSTs /pin/send with auth and returns the parsed message', async () => {
    apiFetch.mockResolvedValueOnce({ message: 'PIN dispatched.' })
    const res = await sendBranchPin('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/pin/send', {
      method: 'POST',
      auth: true,
    })
    expect(res.message).toBe('PIN dispatched.')
  })

  it('updateBranch accepts isMainBranch in the body', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'Main', isMainBranch: true })
    const branch = await updateBranch('b1', { isMainBranch: true })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ isMainBranch: true }),
    })
    expect(branch.isMainBranch).toBe(true)
  })
})
