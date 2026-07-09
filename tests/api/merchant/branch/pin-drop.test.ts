// tests/api/merchant/branch/pin-drop.test.ts
//
// Branch Location Trust Slice 3 (spec 2026-07-09 pin-drop addendum, APPROVED) —
// unit-style mocked tests for dropBranchPin, the SOLE writer-authority of
// MERCHANT_CONFIRMED. Covers the cross-radius matrix (inside / outside), the
// no-downgrade rejections (ADDRESS_GEOCODED / MANUALLY_CONFIRMED / MERCHANT_CONFIRMED
// targets), the OWNER-only + suspended auth guards, the FAIL-lane NEEDS_REVIEW
// degrade + merchant_pin_drop suggestion staging, and the audit writes on both
// outcomes.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../../src/api/shared/errors'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { dropBranchPin } from '../../../../src/api/merchant/branch/service'

const ADMIN_ID = 'admin-1'
const MERCHANT_ID = 'merchant-1'
const BRANCH_ID = 'branch-1'
const CTX = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

// HD1 2PY centroid (postcodes.io mock). The radius check runs against THIS point.
const CENTROID = { latitude: 53.6463, longitude: -1.7809 }
const HD1_RESPONSE = {
  status: 200,
  result: {
    postcode: 'HD1 2PY', country: 'England', region: 'Yorkshire and the Humber',
    admin_district: 'Kirklees', admin_county: 'West Yorkshire',
    parish: null, admin_ward: 'Newsome', parliamentary_constituency: 'Huddersfield',
    post_town: 'Huddersfield', latitude: CENTROID.latitude, longitude: CENTROID.longitude,
  },
}

const PIN_INSIDE  = { latitude: 53.6465, longitude: -1.7805 } // ~40 m from centroid
const PIN_OUTSIDE = { latitude: 53.7500, longitude: -1.7809 } // ~11 km from centroid

function mockCentroidFetch() {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true, status: 200, json: async () => HD1_RESPONSE,
  } as Response)
}

function buildPrismaMock(branchOverrides: Record<string, unknown> = {}, membership?: unknown) {
  const mock: any = {
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue(
        membership === undefined
          ? { id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID, merchant: { status: 'ACTIVE', businessName: 'Acme' } }
          : membership,
      ),
      // WF8: when getOwnerMembership (findFirst) resolves null, resolveAdminMerchant
      // now falls back to getActiveMembership (findMany) to pick INSUFFICIENT_PERMISSIONS
      // (real non-owner membership) vs INVALID_CREDENTIALS (no membership at all). The
      // "no OWNER membership" test below passes `membership: null` to simulate a caller
      // with NO membership whatsoever, so findMany defaults to empty.
      findMany: vi.fn().mockResolvedValue([]),
    },
    branch: {
      findFirst: vi.fn().mockResolvedValue({
        id: BRANCH_ID, merchantId: MERCHANT_ID,
        postcode: 'HD1 2PY',
        locationConfidence: 'POSTCODE_CENTROID',
        latitude: CENTROID.latitude, longitude: CENTROID.longitude,
        googlePlaceId: null,
        redemptionPin: 'enc:1234',
        pendingEdits: [], openingHours: [], amenities: [], photos: [], pendingHours: [],
        ...branchOverrides,
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: BRANCH_ID, merchantId: MERCHANT_ID, postcode: 'HD1 2PY',
        pendingEdits: [], openingHours: [], amenities: [], photos: [], pendingHours: [],
        ...data,
      })),
    },
    locality: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'loc-1', ...data })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))
  return mock as any
}

describe('dropBranchPin — inside the radius (PASS)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('applies the pin + MERCHANT_CONFIRMED and nulls googlePlaceId', async () => {
    mockCentroidFetch()
    const prisma = buildPrismaMock()

    const out = await dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX)

    expect(prisma.branch.update).toHaveBeenCalledOnce()
    const data = prisma.branch.update.mock.calls[0][0].data
    expect(data.locationConfidence).toBe('MERCHANT_CONFIRMED')
    expect(data.latitude).toBe(PIN_INSIDE.latitude)
    expect(data.longitude).toBe(PIN_INSIDE.longitude)
    expect(data.googlePlaceId).toBeNull()
    // Response is pin-hygiene stripped (no redemptionPin ciphertext).
    expect((out as Record<string, unknown>).redemptionPin).toBeUndefined()
    expect(out.locationConfidence).toBe('MERCHANT_CONFIRMED')
  })

  it('writes a BRANCH_UPDATED audit tagged outcome merchant_confirmed, with NO staged suggestion', async () => {
    mockCentroidFetch()
    const prisma = buildPrismaMock()

    await dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX)

    expect(prisma.auditLog.create).toHaveBeenCalledOnce()
    const audit = prisma.auditLog.create.mock.calls[0][0].data
    expect(audit.event).toBe('BRANCH_UPDATED')
    expect(audit.actorType).toBe('MERCHANT_ADMIN')
    expect(audit.metadata.pinDrop).toMatchObject({ outcome: 'merchant_confirmed', latitude: PIN_INSIDE.latitude, longitude: PIN_INSIDE.longitude })
    expect(audit.metadata.locationSuggestion).toBeUndefined()
  })
})

describe('dropBranchPin — outside the radius (FAIL / L4 degrade)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('stamps NEEDS_REVIEW WITHOUT applying the pin coordinates', async () => {
    mockCentroidFetch()
    const prisma = buildPrismaMock()

    await dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_OUTSIDE, CTX)

    const data = prisma.branch.update.mock.calls[0][0].data
    expect(data.locationConfidence).toBe('NEEDS_REVIEW')
    // Critical: the dropped pin is NOT applied to the branch coordinates.
    expect(data.latitude).toBeUndefined()
    expect(data.longitude).toBeUndefined()
    expect(data.googlePlaceId).toBeUndefined()
  })

  it('stages the dropped pin as a merchant_pin_drop suggestion (placeId null) in the audit', async () => {
    mockCentroidFetch()
    const prisma = buildPrismaMock()

    await dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_OUTSIDE, CTX)

    const audit = prisma.auditLog.create.mock.calls[0][0].data
    expect(audit.event).toBe('BRANCH_UPDATED')
    expect(audit.metadata.pinDrop).toMatchObject({ outcome: 'needs_review', reason: 'radius_exceeded' })
    expect(audit.metadata.locationSuggestion).toEqual({
      placeId: null,
      latitude: PIN_OUTSIDE.latitude,
      longitude: PIN_OUTSIDE.longitude,
      postcode: 'HD1 2PY',
      source: 'merchant_pin_drop',
    })
  })
})

describe('dropBranchPin — no-downgrade eligibility gate (D-L5)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  for (const confirmed of ['ADDRESS_GEOCODED', 'MANUALLY_CONFIRMED', 'MERCHANT_CONFIRMED']) {
    it(`rejects a ${confirmed} branch with BRANCH_LOCATION_ALREADY_CONFIRMED before any postcodes.io call`, async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')
      const prisma = buildPrismaMock({ locationConfidence: confirmed })

      await expect(dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX))
        .rejects.toMatchObject({ code: 'BRANCH_LOCATION_ALREADY_CONFIRMED', statusCode: 409 })

      expect(fetchSpy).not.toHaveBeenCalled() // gate is BEFORE the centroid resolve
      expect(prisma.branch.update).not.toHaveBeenCalled()
    })
  }

  it('admits a NEEDS_REVIEW branch (re-drop after a prior fail is allowed)', async () => {
    mockCentroidFetch()
    const prisma = buildPrismaMock({ locationConfidence: 'NEEDS_REVIEW' })
    await dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX)
    expect(prisma.branch.update.mock.calls[0][0].data.locationConfidence).toBe('MERCHANT_CONFIRMED')
  })
})

describe('dropBranchPin — auth guards (OWNER-only)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('rejects a non-owner (no OWNER membership) with INVALID_CREDENTIALS, no write', async () => {
    const prisma = buildPrismaMock({}, null) // getOwnerMembership -> null
    await expect(dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(prisma.branch.update).not.toHaveBeenCalled()
  })

  it('rejects a SUSPENDED merchant with MERCHANT_SUSPENDED (SEC-M2), no write', async () => {
    const prisma = buildPrismaMock({}, {
      id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: ADMIN_ID,
      merchant: { status: 'SUSPENDED', businessName: 'Acme' },
    })
    await expect(dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX))
      .rejects.toMatchObject({ code: 'MERCHANT_SUSPENDED', statusCode: 403 })
    expect(prisma.branch.update).not.toHaveBeenCalled()
  })
})

describe('dropBranchPin — postcode resolver failure', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('maps a resolver 404 to POSTCODE_NOT_FOUND and never opens a write', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({ status: 404 }) } as Response)
    const prisma = buildPrismaMock()
    await expect(dropBranchPin(prisma, ADMIN_ID, BRANCH_ID, PIN_INSIDE, CTX))
      .rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND' })
    expect(prisma.branch.update).not.toHaveBeenCalled()
    expect(AppError).toBeDefined()
  })
})
