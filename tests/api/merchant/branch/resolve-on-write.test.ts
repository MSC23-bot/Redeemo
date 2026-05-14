// tests/api/merchant/branch/resolve-on-write.test.ts
//
// Plan 4 M1.21 — Branch resolve-on-write contract for createBranch +
// createBranchEditRequest.
//
// Unit-style mocked tests against the service functions directly. Covers:
//   - createBranch resolves postcode + populates snapshot
//   - createBranch throws POSTCODE_REQUIRED when postcode missing
//   - createBranch throws AppError on resolver failure
//   - createBranch drops caller-supplied lat/lng in favour of postcode centroid
//   - createBranchEditRequest eagerly resolves proposed postcode + snapshot
//     lands in pendingEdit.proposedChanges
//   - createBranchEditRequest rejects invalid postcode BEFORE writing the
//     pending edit row (resolver failure must short-circuit)
//   - createBranchEditRequest non-postcode edits don't trigger the resolver

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../../src/api/shared/errors'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { createBranch, createBranchEditRequest } from '../../../../src/api/merchant/branch/service'

const ADMIN_ID = 'admin-1'
const MERCHANT_ID = 'merchant-1'
const BRANCH_ID = 'branch-1'
const CTX = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

const VALID_HD1_RESPONSE = {
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

const VALID_CO7_RESPONSE = {
  status: 200,
  result: {
    postcode: 'CO7 0UB',
    country: 'England',
    region: 'East of England',
    admin_district: 'Tendring',
    admin_county: 'Essex',
    parish: 'Brightlingsea',
    admin_ward: 'Brightlingsea',
    parliamentary_constituency: 'Clacton',
    post_town: null,
    latitude: 51.81,
    longitude: 1.02,
  },
}

function buildPrismaMock() {
  return {
    merchantAdmin: {
      findUnique: vi.fn().mockResolvedValue({ id: ADMIN_ID, merchantId: MERCHANT_ID, status: 'ACTIVE' }),
    },
    branch: {
      count:     vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue({ id: BRANCH_ID, merchantId: MERCHANT_ID }),
      create:    vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: BRANCH_ID, ...data,
        pendingEdits: [], openingHours: [], amenities: [], photos: [],
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
        id: 'locality-resolved-1',
        ...data,
      })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any
}

describe('createBranch — Plan 4 M1.21 resolve-on-write', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('resolves postcode and populates the location snapshot', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => VALID_HD1_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock()

    const branch = await createBranch(prisma, ADMIN_ID, {
      name: 'Karaara — Huddersfield', addressLine1: '11 Cross Church Street',
      city: 'Huddersfield', postcode: 'HD1 2PY',
    }, CTX)

    expect(prisma.branch.create).toHaveBeenCalledOnce()
    const created = prisma.branch.create.mock.calls[0][0].data
    expect(created.postcode).toBe('HD1 2PY')
    expect(created.latitude).toBe(53.6463)
    expect(created.longitude).toBe(-1.7809)
    expect(created.localityId).toBe('locality-resolved-1')
    expect(created.localityName).toBe('Huddersfield')
    expect(created.ladDistrict).toBe('Kirklees')
    expect(created.adminCounty).toBe('West Yorkshire')
    expect(created.region).toBe('Yorkshire and the Humber')
    expect(created.locationCountry).toBe('England')   // Plan 4 nation snapshot
    expect(created.country).toBe('GB')                // legacy ISO-2 preserved
    expect(created.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(created.locationResolvedAt).toBeInstanceOf(Date)
    expect(branch.localityId).toBe('locality-resolved-1')
  })

  it('throws POSTCODE_REQUIRED when payload omits postcode', async () => {
    const prisma = buildPrismaMock()
    await expect(createBranch(prisma, ADMIN_ID, {
      name: 'No Postcode', addressLine1: '1 X', city: 'Anywhere',
    }, CTX)).rejects.toMatchObject({ code: 'POSTCODE_REQUIRED', statusCode: 400 })
    expect(prisma.branch.create).not.toHaveBeenCalled()
  })

  it('throws POSTCODE_NOT_FOUND (400) on resolver 404 and does NOT write branch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ status: 404 }),
    } as Response)
    const prisma = buildPrismaMock()
    await expect(createBranch(prisma, ADMIN_ID, {
      name: 'Bad Postcode', addressLine1: '1 X', city: 'X', postcode: 'ZZ99 9ZZ',
    }, CTX)).rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND', statusCode: 400 })
    expect(prisma.branch.create).not.toHaveBeenCalled()
  })

  it('throws GAZETTEER_UNAVAILABLE (503) on resolver network failure and does NOT write branch', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))
    const prisma = buildPrismaMock()
    await expect(createBranch(prisma, ADMIN_ID, {
      name: 'Down Resolver', addressLine1: '1 X', city: 'X', postcode: 'HD1 2PY',
    }, CTX)).rejects.toMatchObject({ code: 'GAZETTEER_UNAVAILABLE', statusCode: 503 })
    expect(prisma.branch.create).not.toHaveBeenCalled()
  })

  it('drops caller-supplied latitude/longitude in favour of postcode centroid', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => VALID_HD1_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock()

    await createBranch(prisma, ADMIN_ID, {
      name: 'Pin Override Attempt', addressLine1: '1 X', city: 'X',
      postcode: 'HD1 2PY',
      latitude: 99.9, longitude: 99.9,   // caller-supplied; should be ignored
    }, CTX)

    const created = prisma.branch.create.mock.calls[0][0].data
    expect(created.latitude).toBe(53.6463)   // from postcodes.io centroid, not 99.9
    expect(created.longitude).toBe(-1.7809)
  })
})

describe('createBranchEditRequest — Plan 4 M1.21 eager resolve', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('eagerly resolves a proposed postcode change and lands snapshot in proposedChanges', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => VALID_CO7_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock()

    await createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      postcode: 'CO7 0UB',
      addressLine1: 'New address',
    }, false, CTX)

    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.postcode).toBe('CO7 0UB')
    expect(proposed.addressLine1).toBe('New address')   // preserved alongside snapshot
    expect(proposed.localityId).toBe('locality-resolved-1')
    expect(proposed.ladDistrict).toBe('Tendring')
    expect(proposed.adminCounty).toBe('Essex')
    expect(proposed.region).toBe('East of England')
    expect(proposed.locationCountry).toBe('England')
    expect(proposed.latitude).toBe(51.81)
    expect(proposed.longitude).toBe(1.02)
    expect(proposed.locationConfidence).toBe('POSTCODE_CENTROID')
    expect(proposed.locationResolvedAt).toBeInstanceOf(Date)
  })

  it('rejects invalid postcode BEFORE creating the pending edit row', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ status: 404 }),
    } as Response)
    const prisma = buildPrismaMock()

    await expect(createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      postcode: 'ZZ99 9ZZ',
    }, false, CTX)).rejects.toMatchObject({ code: 'POSTCODE_NOT_FOUND' })

    // The critical assertion: no pending-edit row written.
    expect(prisma.branchPendingEdit.create).not.toHaveBeenCalled()
    expect(prisma.adminApproval.create).not.toHaveBeenCalled()
  })

  it('does NOT trigger the resolver for non-postcode edits (e.g. logoUrl only)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    const prisma = buildPrismaMock()

    await createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      logoUrl: 'https://example.test/new-logo.png',
    }, false, CTX)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(prisma.branchPendingEdit.create).toHaveBeenCalledOnce()
    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.logoUrl).toBe('https://example.test/new-logo.png')
    expect(proposed.localityId).toBeUndefined()
    expect(proposed.locationConfidence).toBeUndefined()
  })

  it('postcode change overwrites caller-supplied latitude/longitude in proposedChanges', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      json: async () => VALID_CO7_RESPONSE,
    } as Response)
    const prisma = buildPrismaMock()

    await createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      postcode: 'CO7 0UB',
      latitude: 99.9, longitude: 99.9,
    }, false, CTX)

    const proposed = prisma.branchPendingEdit.create.mock.calls[0][0].data.proposedChanges
    expect(proposed.latitude).toBe(51.81)   // from CO7 0UB centroid, not 99.9
    expect(proposed.longitude).toBe(1.02)
  })

  it('AppError is the throw type (not a generic Error)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ status: 404 }),
    } as Response)
    const prisma = buildPrismaMock()

    await expect(createBranchEditRequest(prisma, ADMIN_ID, BRANCH_ID, {
      postcode: 'ZZ99 9ZZ',
    }, false, CTX)).rejects.toBeInstanceOf(AppError)
  })
})
