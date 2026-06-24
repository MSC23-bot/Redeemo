// tests/api/merchant/branch/location-suggestion-apply.test.ts
//
// Branches PR-6 (§4b) — Layer 2: an OPTIONAL candidateToken on the branch
// address-apply paths resolves (server-side, Redis-only) to a Google suggestion
// that is staged as ADMIN-REVIEW METADATA ONLY — never a Branch column, never a
// CONFIRMED_LOCATION_SET confidence write. The address itself flows through the
// existing lanes unchanged (resolveBranchLocationFields stamps POSTCODE_CENTROID).
//
// THE LOAD-BEARING SECURITY INVARIANT under test: a merchant's Google pick must
// NEVER make the branch discovery-visible / go-live-eligible. Only the admin's
// confirmBranchLocation -> MANUALLY_CONFIRMED can.
//
// Mocked-prisma unit tests against the service + a mocked approveEdit to PROVE
// the editApplier allow-list never applies the suggestion sub-key as a column,
// PLUS route-level tests for the candidate-token resolution + expired-token path.
// No dev-DB dependence; no live Google call.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Shared module mocks (route-level suite) ──────────────────────────────────
// Mock the Google wrapper + the limiter so the route's search call never touches
// the network / billing path, and never depends on the Redis limiter script.
const searchPlacesMock = vi.fn()
vi.mock('../../../../src/api/lib/googlePlaces', () => ({
  searchPlaces: (...args: any[]) => searchPlacesMock(...args),
}))
const limiterMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../../../../src/api/shared/merchantLocationLimiter', async (orig) => {
  const actual = await (orig as any)()
  return { ...actual, consumeMerchantLocationSearch: (...args: any[]) => limiterMock(...args) }
})

// enqueue (hours stage) is unused on these paths but branch.test.ts mocks it to
// keep the route plugin off BullMQ; mirror that defensively.
const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn().mockResolvedValue({ id: 'job-1' }) }))
vi.mock('../../../../src/api/queues', () => ({ MAINTENANCE_QUEUE: 'maintenance', enqueue: enqueueMock }))

import { buildApp } from '../../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { AppError } from '../../../../src/api/shared/errors'
import {
  createBranch,
  createBranchEditRequest,
  type BranchLocationSuggestion,
} from '../../../../src/api/merchant/branch/service'
import { approveEdit } from '../../../../src/api/admin/approvals/editApplier'
import { confirmBranchLocation } from '../../../../src/api/admin/branches/service'

const ADMIN_ID = 'admin-1'
const MERCHANT_ID = 'merchant-1'
const BRANCH_ID = 'branch-1'
const CTX = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

const SUGGESTION: BranchLocationSuggestion = { placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809 }

const VALID_HD1_RESPONSE = {
  status: 200,
  result: {
    postcode: 'HD1 2PY', country: 'England', region: 'Yorkshire and the Humber',
    admin_district: 'Kirklees', admin_county: 'West Yorkshire',
    parish: 'Kirklees, unparished area', admin_ward: 'Newsome',
    parliamentary_constituency: 'Huddersfield', post_town: 'Huddersfield',
    latitude: 53.6463, longitude: -1.7809,
  },
}

// ── Mocked prisma for the service-level paths (mirrors resolve-on-write.test.ts) ──
function buildPrismaMock() {
  const mock: any = {
    merchantAdmin: {
      findUnique: vi.fn().mockResolvedValue({ id: ADMIN_ID, merchantId: MERCHANT_ID, status: 'ACTIVE' }),
    },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID }),
      findMany: vi.fn().mockResolvedValue([{
        id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID, role: 'OWNER',
        allBranches: true, canManageVouchers: false,
        merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
      }]),
    },
    branch: {
      count:     vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue({ id: BRANCH_ID, merchantId: MERCHANT_ID }),
      create:    vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: BRANCH_ID, ...data, pendingEdits: [], openingHours: [], amenities: [], photos: [],
      })),
    },
    branchPendingEdit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create:    vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'pending-edit-1', ...data,
      })),
    },
    adminApproval: { create: vi.fn().mockResolvedValue({}) },
    locality: {
      findUnique: vi.fn().mockResolvedValue(null),
      create:     vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'locality-resolved-1', ...data,
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))
  return mock as any
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE (direct-write) — suggestion lands in BRANCH_CREATED audit metadata only.
// ─────────────────────────────────────────────────────────────────────────────
describe('createBranch — Branches PR-6 location suggestion (direct-write)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('saves the branch at POSTCODE_CENTROID (NOT a CONFIRMED value) with the Google suggestion in the BRANCH_CREATED audit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => VALID_HD1_RESPONSE } as Response)
    const prisma = buildPrismaMock()

    const branch = await createBranch(prisma, ADMIN_ID, {
      name: 'Karaara', addressLine1: '11 Cross Church Street', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, CTX, SUGGESTION)

    // Branch saved at POSTCODE_CENTROID — never a CONFIRMED_LOCATION_SET value.
    const created = prisma.branch.create.mock.calls[0][0].data
    expect(created.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(created.locationConfidence).not.toBe('MANUALLY_CONFIRMED')
    expect(created.locationConfidence).not.toBe('ADDRESS_GEOCODED')
    expect(branch.locationConfidence).toBe('POSTCODE_CENTROID')

    // The branch row carries NO placeId column (no schema).
    expect(created).not.toHaveProperty('placeId')
    expect(created).not.toHaveProperty('googlePlaceId')

    // The Google suggestion is in the BRANCH_CREATED audit metadata.
    const auditCall = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_CREATED')
    expect(auditCall).toBeDefined()
    expect(auditCall[0].data.metadata.locationSuggestion).toEqual({
      placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809, source: 'merchant_portal_google',
    })
  })

  it('omits the suggestion from the audit when no token resolved (undefined)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => VALID_HD1_RESPONSE } as Response)
    const prisma = buildPrismaMock()

    await createBranch(prisma, ADMIN_ID, {
      name: 'Karaara', addressLine1: '11 Cross Church Street', city: 'Huddersfield', postcode: 'HD1 2PY',
    }, CTX /* no suggestion */)

    const auditCall = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_CREATED')
    expect(auditCall[0].data.metadata).not.toHaveProperty('locationSuggestion')
    // The branch still saved at POSTCODE_CENTROID (address-only apply).
    expect(prisma.branch.create.mock.calls[0][0].data.locationConfidence).toBe('POSTCODE_CENTROID')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LIVE reviewed edit lane — suggestion sub-key in proposedChanges + audit.
// ─────────────────────────────────────────────────────────────────────────────
describe('createBranchEditRequest — Branches PR-6 location suggestion (reviewed lane)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('stages the suggestion as a __locationSuggestion sub-key in proposedChanges; confidence stays POSTCODE_CENTROID', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => VALID_HD1_RESPONSE } as Response)
    const prisma = buildPrismaMock()

    await createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      addressLine1: 'New address', postcode: 'HD1 2PY',
    }, false, CTX, SUGGESTION)

    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    // Address + the postcode-resolved snapshot land as normal.
    expect(proposed.addressLine1).toBe('New address')
    expect(proposed.locationConfidence).toBe('POSTCODE_CENTROID') // the snapshot, NOT a confirmed value
    expect(proposed.locationConfidence).not.toBe('ADDRESS_GEOCODED')
    expect(proposed.locationConfidence).not.toBe('MANUALLY_CONFIRMED')
    // The suggestion rides under the metadata sub-key (NOT a Branch field).
    expect(proposed.__locationSuggestion).toEqual({
      placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809, source: 'merchant_portal_google',
    })

    // The BRANCH_EDIT_REQUEST_CREATED audit also carries the suggestion.
    const auditCall = prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_EDIT_REQUEST_CREATED')
    expect(auditCall[0].data.metadata.locationSuggestion).toMatchObject({ placeId: 'place-google-1', source: 'merchant_portal_google' })
  })

  it('omits the sub-key when no suggestion is passed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => VALID_HD1_RESPONSE } as Response)
    const prisma = buildPrismaMock()

    await createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, { addressLine1: 'New address', postcode: 'HD1 2PY' }, false, CTX)

    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed).not.toHaveProperty('__locationSuggestion')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// editApplier allow-list PROOF — the suggestion sub-key is NEVER applied as a
// Branch column, and confidence is never bumped to a CONFIRMED value on approve.
// ─────────────────────────────────────────────────────────────────────────────
describe('approveEdit — Branches PR-6 __locationSuggestion sub-key is NOT applied as a column', () => {
  function buildApplierPrismaMock(proposedChanges: Record<string, unknown>) {
    const branchUpdate = vi.fn().mockResolvedValue({ id: BRANCH_ID })
    const mock: any = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr-1', type: 'BRANCH_IDENTITY_EDIT', status: 'PENDING', referenceId: 'pe-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      branchPendingEdit: {
        findUnique: vi.fn().mockResolvedValue({ id: 'pe-1', status: 'PENDING', branchId: BRANCH_ID, merchantId: MERCHANT_ID, includesPhotos: false, proposedChanges }),
        update: vi.fn().mockResolvedValue({}),
      },
      branch: {
        findUnique: vi.fn().mockResolvedValue({
          id: BRANCH_ID, addressLine1: '1 Old St', city: 'Old', postcode: 'EC1A 1BB',
          latitude: 51.5, longitude: -0.1, locationConfidence: 'POSTCODE_CENTROID',
        }),
        update: branchUpdate,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      // getMerchantOwner runs AFTER commit (best-effort notify); return null so it no-ops.
      merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))
    return { mock, branchUpdate }
  }

  it('applies the address fields + snapshot but NOT __locationSuggestion, and never writes a CONFIRMED confidence', async () => {
    const proposedChanges = {
      addressLine1: 'New address',
      postcode: 'HD1 2PY',
      latitude: 53.6463, longitude: -1.7809,
      locationConfidence: 'POSTCODE_CENTROID', // the eager snapshot — never confirmed
      localityId: 'locality-resolved-1',
      __locationSuggestion: { placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809, source: 'merchant_portal_google' },
    }
    const { mock, branchUpdate } = buildApplierPrismaMock(proposedChanges)

    await approveEdit(mock, {} as any, 'appr-1', ADMIN_ID, CTX)

    expect(branchUpdate).toHaveBeenCalledOnce()
    const applied = branchUpdate.mock.calls[0][0].data
    // The address + snapshot fields are applied verbatim.
    expect(applied.addressLine1).toBe('New address')
    expect(applied.locationConfidence).toBe('POSTCODE_CENTROID')
    // The suggestion sub-key is NEVER written as a Branch column.
    expect(applied).not.toHaveProperty('__locationSuggestion')
    expect(applied).not.toHaveProperty('placeId')
    expect(applied).not.toHaveProperty('googlePlaceId')
    expect(applied).not.toHaveProperty('source')
    // Confidence is never a CONFIRMED value from this apply.
    expect(applied.locationConfidence).not.toBe('MANUALLY_CONFIRMED')
    expect(applied.locationConfidence).not.toBe('ADDRESS_GEOCODED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Admin confirmBranchLocation is the ONLY path to MANUALLY_CONFIRMED.
// ─────────────────────────────────────────────────────────────────────────────
describe('confirmBranchLocation — admin authority is the only confirm path', () => {
  it('admin confirm sets MANUALLY_CONFIRMED (the merchant pick never reaches a CONFIRMED value)', async () => {
    const branchUpdate = vi.fn().mockResolvedValue({ id: BRANCH_ID, locationConfidence: 'MANUALLY_CONFIRMED' })
    const mock: any = {
      branch: {
        findUnique: vi.fn().mockResolvedValue({ id: BRANCH_ID, latitude: 51.5, longitude: -0.1, locationConfidence: 'POSTCODE_CENTROID' }),
        update: branchUpdate,
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))

    await confirmBranchLocation(mock, ADMIN_ID, BRANCH_ID, { latitude: 53.6463, longitude: -1.7809 } as any, CTX)

    const data = branchUpdate.mock.calls[0][0].data
    expect(data.locationConfidence).toBe('MANUALLY_CONFIRMED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Route-level: candidateToken resolves to admin-review metadata; expired token
// applies the address with no suggestion + no fresh Google call.
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/merchant/branches — candidateToken route resolution', () => {
  let app: FastifyInstance
  let token: string

  // postcodes.io mock for the create path (createBranchCore resolves postcode).
  const mockPostcodesIo = () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => VALID_HD1_RESPONSE } as Response)
  }

  function decorateBaseline(a: FastifyInstance, redisStore: Map<string, string>) {
    a.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: ADMIN_ID, merchantId: MERCHANT_ID }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID }),
        findMany: vi.fn().mockResolvedValue([{
          id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID, role: 'OWNER',
          allBranches: true, canManageVouchers: false, status: 'ACTIVE',
          merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
        }]),
      },
      merchant: { findUnique: vi.fn() },
      branch: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({ id: BRANCH_ID, merchantId: MERCHANT_ID }),
        create: vi.fn().mockImplementation(({ data }: any) => ({ id: BRANCH_ID, ...data, pendingEdits: [], openingHours: [], amenities: [], photos: [] })),
      },
      branchPendingEdit: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }: any) => ({ id: 'pe-1', ...data })) },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      locality: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'locality-resolved-1', name: 'Huddersfield', postTown: 'Huddersfield', ladDistrict: 'Kirklees', adminCounty: 'West Yorkshire', region: 'Yorkshire and the Humber', country: 'England', centerLat: 53.6, centerLng: -1.7 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb((a as any).prisma)),
    } as any)
    // Stateful fake redis honouring get/set/del/exists; pre-seed the candidate stash.
    a.decorate('redis', {
      get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => { redisStore.set(k, v); return 'OK' }),
      del: vi.fn(async (k: string) => { const had = redisStore.has(k); redisStore.delete(k); return had ? 1 : 0 }),
      exists: vi.fn().mockResolvedValue(1),
    } as any)
  }

  afterEach(async () => { if (app) await app.close() })

  it('resolves a valid candidateToken to admin-review metadata; branch stays POSTCODE_CENTROID, no fresh Google call', async () => {
    searchPlacesMock.mockReset()
    const redisStore = new Map<string, string>()
    // Pre-seed the Layer 1 stash for merchant-1 + token "tok-1".
    redisStore.set(`merchant:${MERCHANT_ID}:loccand:tok-1`, JSON.stringify({ placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809 }))

    app = await buildApp()
    decorateBaseline(app, redisStore)
    await app.ready()
    mockPostcodesIo()
    token = (app.jwt as any).merchant.sign({ sub: ADMIN_ID, role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Karaara', addressLine1: '11 Cross Church Street', city: 'Huddersfield', postcode: 'HD1 2PY', candidateToken: 'tok-1' },
    })
    expect(res.statusCode).toBe(201)

    // Branch saved at POSTCODE_CENTROID (NOT confirmed).
    const created = (app as any).prisma.branch.create.mock.calls[0][0].data
    expect(created.locationConfidence).toBe('POSTCODE_CENTROID')
    // candidateToken was popped at the route — it never reached the branch row.
    expect(created).not.toHaveProperty('candidateToken')
    expect(created).not.toHaveProperty('placeId')

    // Suggestion staged in the BRANCH_CREATED audit metadata.
    const auditCall = (app as any).prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_CREATED')
    expect(auditCall[0].data.metadata.locationSuggestion).toMatchObject({ placeId: 'place-google-1', source: 'merchant_portal_google' })

    // The token was CONSUMED (single-use): the stash is gone.
    expect(redisStore.has(`merchant:${MERCHANT_ID}:loccand:tok-1`)).toBe(false)

    // CRITICAL: no fresh billable Google call at apply time.
    expect(searchPlacesMock).not.toHaveBeenCalled()

    // The candidate value / coords / placeId never crossed the wire on the response.
    expect(res.body).not.toContain('place-google-1')
    expect(res.body).not.toContain('candidateToken')
  })

  it('expired/absent candidateToken: address still applies, no suggestion staged, no Google call', async () => {
    searchPlacesMock.mockReset()
    const redisStore = new Map<string, string>() // EMPTY — token "tok-expired" is not present.

    app = await buildApp()
    decorateBaseline(app, redisStore)
    await app.ready()
    mockPostcodesIo()
    token = (app.jwt as any).merchant.sign({ sub: ADMIN_ID, role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Karaara', addressLine1: '11 Cross Church Street', city: 'Huddersfield', postcode: 'HD1 2PY', candidateToken: 'tok-expired' },
    })
    // The submit does NOT fail — the address still applies.
    expect(res.statusCode).toBe(201)

    const created = (app as any).prisma.branch.create.mock.calls[0][0].data
    expect(created.locationConfidence).toBe('POSTCODE_CENTROID')

    // No suggestion in the audit (resolver returned null).
    const auditCall = (app as any).prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_CREATED')
    expect(auditCall[0].data.metadata).not.toHaveProperty('locationSuggestion')

    // No fresh Google re-call on the expired token.
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  it('PATCH draft-window sensitive address edit with candidateToken: direct write at POSTCODE_CENTROID; suggestion in BRANCH_UPDATED audit; token consumed', async () => {
    searchPlacesMock.mockReset()
    const redisStore = new Map<string, string>()
    redisStore.set(`merchant:${MERCHANT_ID}:loccand:tok-patch`, JSON.stringify({ placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809 }))

    app = await buildApp()
    decorateBaseline(app, redisStore)
    // Draft window: merchant.status REGISTERED -> updateBranch takes the
    // updateBranchSensitiveDirectCore path (direct write).
    ;(app as any).prisma.merchant.findUnique = vi.fn().mockResolvedValue({ status: 'REGISTERED', onboardingStep: 'BUSINESS_DETAILS' })
    ;(app as any).prisma.branch.update = vi.fn().mockImplementation(({ data }: any) => ({ id: BRANCH_ID, ...data, pendingEdits: [], openingHours: [], amenities: [], photos: [] }))
    await app.ready()
    mockPostcodesIo()
    token = (app.jwt as any).merchant.sign({ sub: ADMIN_ID, role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/merchant/branches/${BRANCH_ID}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { addressLine1: 'New address', postcode: 'HD1 2PY', candidateToken: 'tok-patch' },
    })
    expect(res.statusCode).toBe(200)

    // Direct write (no BranchPendingEdit created in the draft window).
    expect((app as any).prisma.branchPendingEdit.create).not.toHaveBeenCalled()
    const written = (app as any).prisma.branch.update.mock.calls[0][0].data
    expect(written.addressLine1).toBe('New address')
    expect(written.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(written).not.toHaveProperty('candidateToken')
    expect(written).not.toHaveProperty('placeId')

    // Suggestion staged in the BRANCH_UPDATED audit metadata.
    const auditCall = (app as any).prisma.auditLog.create.mock.calls.find((c: any) => c[0].data.event === 'BRANCH_UPDATED')
    expect(auditCall[0].data.metadata.locationSuggestion).toMatchObject({ placeId: 'place-google-1', source: 'merchant_portal_google' })

    expect(redisStore.has(`merchant:${MERCHANT_ID}:loccand:tok-patch`)).toBe(false)
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  it('PATCH live-merchant sensitive address edit with candidateToken: routes through the reviewed lane (BranchPendingEdit + suggestion sub-key)', async () => {
    searchPlacesMock.mockReset()
    const redisStore = new Map<string, string>()
    redisStore.set(`merchant:${MERCHANT_ID}:loccand:tok-live`, JSON.stringify({ placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809 }))

    app = await buildApp()
    decorateBaseline(app, redisStore)
    // Live merchant (NOT draft window) -> updateBranch routes sensitive fields to
    // createBranchEditRequest (the governed reviewed lane).
    ;(app as any).prisma.merchant.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE', onboardingStep: 'COMPLETE' })
    await app.ready()
    mockPostcodesIo()
    token = (app.jwt as any).merchant.sign({ sub: ADMIN_ID, role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })

    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/merchant/branches/${BRANCH_ID}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { addressLine1: 'New address', postcode: 'HD1 2PY', candidateToken: 'tok-live' },
    })
    expect(res.statusCode).toBe(200)

    // Routed through the reviewed lane -> a BranchPendingEdit was created.
    expect((app as any).prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    const proposed = (app as any).prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.addressLine1).toBe('New address')
    expect(proposed.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(proposed.__locationSuggestion).toMatchObject({ placeId: 'place-google-1', source: 'merchant_portal_google' })
    expect(proposed).not.toHaveProperty('candidateToken')

    expect(redisStore.has(`merchant:${MERCHANT_ID}:loccand:tok-live`)).toBe(false)
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  it('day-2 LIVE edit-request with candidateToken: stages a BranchPendingEdit carrying the suggestion sub-key; confidence not confirmed; token consumed', async () => {
    searchPlacesMock.mockReset()
    const redisStore = new Map<string, string>()
    redisStore.set(`merchant:${MERCHANT_ID}:loccand:tok-edit`, JSON.stringify({ placeId: 'place-google-1', latitude: 53.6463, longitude: -1.7809 }))

    app = await buildApp()
    decorateBaseline(app, redisStore)
    await app.ready()
    mockPostcodesIo()
    token = (app.jwt as any).merchant.sign({ sub: ADMIN_ID, role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })

    const res = await app.inject({
      method: 'POST', url: `/api/v1/merchant/branches/${BRANCH_ID}/edit-request`,
      headers: { authorization: `Bearer ${token}` },
      payload: { addressLine1: 'New address', postcode: 'HD1 2PY', candidateToken: 'tok-edit' },
    })
    expect(res.statusCode).toBe(201)

    const proposed = (app as any).prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.addressLine1).toBe('New address')
    // Never a CONFIRMED confidence from this action.
    expect(proposed.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(proposed.locationConfidence).not.toBe('MANUALLY_CONFIRMED')
    expect(proposed.locationConfidence).not.toBe('ADDRESS_GEOCODED')
    // The suggestion rides under the sub-key; candidateToken itself is NOT persisted.
    expect(proposed.__locationSuggestion).toMatchObject({ placeId: 'place-google-1', source: 'merchant_portal_google' })
    expect(proposed).not.toHaveProperty('candidateToken')

    // A BRANCH_IDENTITY_EDIT approval was created (reviewed lane), not a direct write.
    expect((app as any).prisma.adminApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'BRANCH_IDENTITY_EDIT' }) }),
    )

    // Token consumed; no Google re-call.
    expect(redisStore.has(`merchant:${MERCHANT_ID}:loccand:tok-edit`)).toBe(false)
    expect(searchPlacesMock).not.toHaveBeenCalled()
  })
})
