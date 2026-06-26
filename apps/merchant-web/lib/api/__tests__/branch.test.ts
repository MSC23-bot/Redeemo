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
  uploadBranchPhoto,
  removeBranchPhoto,
  getBranch,
  createBranchEditRequest,
  listBranchEditRequests,
  withdrawBranchEditRequest,
  sendBranchPin,
  stageBranchHours,
  cancelPendingHours,
  cancelPendingCreate,
  requestBranchClose,
  withdrawBranchClose,
  branchSchema,
  branchPendingEditSchema,
  branchPendingHoursSchema,
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

// ---------------------------------------------------------------------------
// PR-3 §7: photo moderationStatus on the read schema + the new upload / remove
// clients.
// ---------------------------------------------------------------------------

describe('lib/api/branch (PR-3 photos)', () => {
  it('branchSchema parses photos[].moderationStatus', () => {
    const parsed = branchSchema.parse({
      id: 'b1',
      name: 'Main',
      photos: [
        { id: 'p1', url: 'https://cdn.test/p1.png', moderationStatus: 'APPROVED' },
        { id: 'p2', url: 'https://cdn.test/p2.png', moderationStatus: 'PENDING' },
        { id: 'p3', url: 'https://cdn.test/p3.png', moderationStatus: 'FLAGGED' },
      ],
    })
    expect(parsed.photos?.map((p) => p.moderationStatus)).toEqual(['APPROVED', 'PENDING', 'FLAGGED'])
  })

  it('branchSchema REJECTS a photo without moderationStatus (P3 hardening: the field is now REQUIRED)', () => {
    // The backend GUARANTEES moderationStatus (Prisma non-nullable @default(PENDING),
    // and GET /branches/:id ships the whole row via `photos: true`), so the client
    // schema requires it. A photo object missing the field must fail the parse, which
    // proves a PENDING/FLAGGED row can never slip through untyped.
    expect(() =>
      branchSchema.parse({
        id: 'b1',
        name: 'Main',
        photos: [{ id: 'p1', url: 'https://cdn.test/p1.png' }],
      }),
    ).toThrow()
  })

  it('branchSchema REJECTS an invalid photo moderationStatus', () => {
    expect(() =>
      branchSchema.parse({
        id: 'b1',
        name: 'Main',
        photos: [{ id: 'p1', url: 'https://cdn.test/p1.png', moderationStatus: 'BOGUS' }],
      }),
    ).toThrow()
  })

  it('uploadBranchPhoto POSTs a multipart FormData (file) to the branch-scoped upload and returns { url }', async () => {
    apiFetch.mockResolvedValueOnce({ url: 'https://cdn.test/uploaded.png' })
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const res = await uploadBranchPhoto('b1', file)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    const [path, opts] = apiFetch.mock.calls[0]
    expect(path).toBe('/api/v1/merchant/branches/b1/photos/upload')
    expect(opts.method).toBe('POST')
    expect(opts.auth).toBe(true)
    expect(opts.body).toBeInstanceOf(FormData)
    expect((opts.body as FormData).get('file')).toBe(file)
    expect(res.url).toBe('https://cdn.test/uploaded.png')
  })

  it('removeBranchPhoto DELETEs /branches/:id/photos/:photoId with auth', async () => {
    await removeBranchPhoto('b1', 'p1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/photos/p1', {
      method: 'DELETE',
      auth: true,
    })
  })
})

// ---------------------------------------------------------------------------
// PR-4: opening-hours cool-off staging: pendingHours schema + stage / cancel.
// ---------------------------------------------------------------------------

describe('lib/api/branch (PR-4 hours cool-off)', () => {
  it('branchSchema parses the new pendingHours field (proposed rows + effectiveAt + status)', () => {
    const parsed = branchSchema.parse({
      id: 'b1',
      name: 'Main',
      openingHours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }],
      pendingHours: [
        {
          id: 'ph1',
          proposedHours: [
            { dayOfWeek: 1, openTime: '10:00', closeTime: '18:00', isClosed: false },
            { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
          ],
          effectiveAt: '2026-06-24T16:30:00.000Z',
          status: 'PENDING',
        },
      ],
    })
    expect(parsed.pendingHours?.[0].id).toBe('ph1')
    expect(parsed.pendingHours?.[0].effectiveAt).toBe('2026-06-24T16:30:00.000Z')
    expect(parsed.pendingHours?.[0].status).toBe('PENDING')
    expect(parsed.pendingHours?.[0].proposedHours).toHaveLength(2)
  })

  it('branchSchema tolerates an ABSENT pendingHours field (older backend / list rows)', () => {
    const parsed = branchSchema.parse({ id: 'b1', name: 'Main' })
    expect(parsed.pendingHours).toBeUndefined()
  })

  it('branchPendingHoursSchema accepts the three PendingHoursStatus enum values', () => {
    for (const status of ['PENDING', 'PROMOTED', 'CANCELLED'] as const) {
      const parsed = branchPendingHoursSchema.parse({
        id: 'ph1',
        proposedHours: [],
        effectiveAt: '2026-06-24T16:30:00.000Z',
        status,
      })
      expect(parsed.status).toBe(status)
    }
  })

  it('branchPendingHoursSchema REJECTS an invalid status', () => {
    expect(() =>
      branchPendingHoursSchema.parse({
        id: 'ph1',
        proposedHours: [],
        effectiveAt: '2026-06-24T16:30:00.000Z',
        status: 'BOGUS',
      }),
    ).toThrow()
  })

  it('stageBranchHours POSTs { hours } and returns the parsed pending record', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'ph1',
      proposedHours: [{ dayOfWeek: 1, openTime: '10:00', closeTime: '18:00', isClosed: false }],
      effectiveAt: '2026-06-24T16:30:00.000Z',
      status: 'PENDING',
    })
    const hours: HoursPayloadRow[] = [
      { dayOfWeek: 1, isClosed: false, openTime: '10:00', closeTime: '18:00' },
      { dayOfWeek: 0, isClosed: true },
    ]
    const pending = await stageBranchHours('b1', hours)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/hours', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ hours }),
    })
    expect(pending.id).toBe('ph1')
    expect(pending.status).toBe('PENDING')
  })

  it('cancelPendingHours DELETEs the pending hours route and returns { ok: true }', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true })
    const res = await cancelPendingHours('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/hours/pending', {
      method: 'DELETE',
      auth: true,
    })
    expect(res).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// PR-5: branch lifecycle (add + close): the lifecycle schema fields + the cancel
// pending-create / close-request / withdraw-close clients.
// ---------------------------------------------------------------------------

describe('lib/api/branch (PR-5 lifecycle)', () => {
  it('branchSchema parses lifecycleStatus + closeReason', () => {
    const parsed = branchSchema.parse({
      id: 'b1',
      name: 'Mill Road',
      lifecycleStatus: 'PENDING_CLOSE',
      closeReason: 'Relocating to a new address',
    })
    expect(parsed.lifecycleStatus).toBe('PENDING_CLOSE')
    expect(parsed.closeReason).toBe('Relocating to a new address')
  })

  it('branchSchema accepts each BranchLifecycleStatus enum value', () => {
    for (const status of ['PENDING_CREATE', 'LIVE', 'PENDING_CLOSE', 'CLOSED'] as const) {
      const parsed = branchSchema.parse({ id: 'b1', name: 'Main', lifecycleStatus: status })
      expect(parsed.lifecycleStatus).toBe(status)
    }
  })

  it('branchSchema tolerates an ABSENT / null lifecycleStatus (older backend / list rows)', () => {
    expect(branchSchema.parse({ id: 'b1', name: 'Main' }).lifecycleStatus).toBeUndefined()
    expect(branchSchema.parse({ id: 'b1', name: 'Main', lifecycleStatus: null }).lifecycleStatus).toBeNull()
  })

  it('branchSchema REJECTS an invalid lifecycleStatus', () => {
    expect(() => branchSchema.parse({ id: 'b1', name: 'Main', lifecycleStatus: 'BOGUS' })).toThrow()
  })

  it('cancelPendingCreate DELETEs /pending-create with auth and returns { ok: true }', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true })
    const res = await cancelPendingCreate('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/pending-create', {
      method: 'DELETE',
      auth: true,
    })
    expect(res).toEqual({ ok: true })
  })

  it('requestBranchClose POSTs { reason } to /close-request and returns the parsed (PENDING_CLOSE) branch', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'Mill Road', lifecycleStatus: 'PENDING_CLOSE', closeReason: 'Permanently closed' })
    const branch = await requestBranchClose('b1', 'Permanently closed')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/close-request', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Permanently closed' }),
    })
    expect(branch.lifecycleStatus).toBe('PENDING_CLOSE')
    expect(branch.closeReason).toBe('Permanently closed')
  })

  it('withdrawBranchClose DELETEs /close-request with auth and returns the parsed (LIVE) branch', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'b1', name: 'Mill Road', lifecycleStatus: 'LIVE', closeReason: null })
    const branch = await withdrawBranchClose('b1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/branches/b1/close-request', {
      method: 'DELETE',
      auth: true,
    })
    expect(branch.lifecycleStatus).toBe('LIVE')
  })
})

// ---------------------------------------------------------------------------
// Decimal-on-the-wire coordinates. latitude/longitude are Prisma Decimal, which
// serialize to JSON STRINGS (e.g. "53.646307"). A plain z.number() REJECTS the
// string, so once a postcode resolves to coordinates (every real UK address) the
// parse throws — breaking createBranch (POST 201 -> "We could not save your branch"
// + a fresh orphan branch on every retry, no hours/amenities/pin sub-steps),
// listBranches ("We could not load your branches"), and the onboarding prefill.
// Regression for the real-browser reproduction (2026-06-26). The earlier PR-1
// tests above pass NUMBER coords, which never exercised the on-the-wire shape.
// ---------------------------------------------------------------------------

describe('lib/api/branch (Decimal coordinate coercion)', () => {
  // The exact shape POST /branches returns once a postcode resolves to coords.
  const backendBranchWithStringCoords = {
    id: 'b1',
    name: 'Karaara',
    isMainBranch: false,
    addressLine1: '11 Cross Church Street',
    city: 'Huddersfield',
    postcode: 'HD1 2PY',
    latitude: '53.646307',
    longitude: '-1.780861',
    lifecycleStatus: 'PENDING_CREATE',
    locationConfidence: 'POSTCODE_CENTROID',
    isActive: false,
    openingHours: [],
    amenities: [],
    photos: [],
    pendingEdits: [],
    pendingHours: [],
  }

  it('branchSchema coerces STRING latitude/longitude (Prisma Decimal) to numbers', () => {
    const parsed = branchSchema.parse(backendBranchWithStringCoords)
    expect(parsed.latitude).toBe(53.646307)
    expect(parsed.longitude).toBe(-1.780861)
    expect(typeof parsed.latitude).toBe('number')
    expect(typeof parsed.longitude).toBe('number')
  })

  it('branchSchema preserves NULL coordinates (does not coerce null to 0)', () => {
    const parsed = branchSchema.parse({ id: 'b1', name: 'Main', latitude: null, longitude: null })
    expect(parsed.latitude).toBeNull()
    expect(parsed.longitude).toBeNull()
  })

  it('createBranch does NOT throw on a 201 carrying string coordinates and returns numeric coords', async () => {
    // The "We could not save your branch just now" bug: the backend saved it (201)
    // but the client parse threw on the string coords, so persistedBranchRef was
    // never set and each retry POSTed a brand-new (orphan) branch.
    apiFetch.mockResolvedValueOnce(backendBranchWithStringCoords)
    const branch = await createBranch({
      name: 'Karaara',
      addressLine1: '11 Cross Church Street',
      city: 'Huddersfield',
      postcode: 'HD1 2PY',
    })
    expect(branch.id).toBe('b1')
    expect(branch.latitude).toBe(53.646307)
    expect(branch.longitude).toBe(-1.780861)
  })

  it('listBranches parses an array of branches with string coordinates', async () => {
    // The "We could not load your branches" bug: the same schema parses the list.
    apiFetch.mockResolvedValueOnce([backendBranchWithStringCoords])
    const res = await listBranches()
    expect(res).toHaveLength(1)
    expect(res[0].latitude).toBe(53.646307)
    expect(res[0].longitude).toBe(-1.780861)
  })
})
