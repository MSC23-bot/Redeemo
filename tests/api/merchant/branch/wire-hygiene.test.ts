// Wire hygiene (2026-07-05): the AES-encrypted `redemptionPin` ciphertext must
// NEVER leave the API on a branch row. Every branch-row wire exit routes through
// `toMerchantBranch`, which strips `redemptionPin` and adds a derived
// `redemptionPinSet` boolean. The guarded reveal route (GET /pin) is the ONLY
// place the decrypted value is returned, and it is untouched by this change
// (proven inline below, not duplicated - see pin.test.ts for the full suite).
//
// This suite covers:
//   1. Unit pins on `toMerchantBranch` itself.
//   2. Real Fastify-request pins on GET /branches (list), GET /branches/:id,
//      PATCH /branches/:id (no-op + real-update paths), POST /branches (create).
//   3. Service-level pins on setRedemptionAlerts / requestBranchClose /
//      withdrawBranchClose.
//   4. A guard pin proving GET /branches/:id/pin still returns the decrypted
//      value untouched (the full behavioural suite lives in pin.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))
vi.mock('../../../../src/api/shared/smsLimiter', () => ({
  consumeSmsSend: vi.fn().mockResolvedValue(undefined),
  smsCountryCodeConfigWarning: vi.fn(() => null),
}))

import {
  toMerchantBranch,
  listBranches,
  getBranch,
  updateBranch,
  setRedemptionAlerts,
  requestBranchClose,
  withdrawBranchClose,
} from '../../../../src/api/merchant/branch/service'
import { buildApp } from '../../../../src/api/app'

// A distinctive fixture so a raw-body substring check is unambiguous.
const CIPHERTEXT = 'enc:SECRETCIPHER123'

// ── 1. Unit pins on toMerchantBranch ────────────────────────────────────────

describe('toMerchantBranch', () => {
  it('ciphertext present ⇒ redemptionPinSet:true, redemptionPin key removed', () => {
    const out = toMerchantBranch({ id: 'b1', name: 'Main', redemptionPin: CIPHERTEXT })
    expect(out).toEqual({ id: 'b1', name: 'Main', redemptionPinSet: true })
    expect(out).not.toHaveProperty('redemptionPin')
  })

  it('redemptionPin: null ⇒ redemptionPinSet:false, redemptionPin key removed', () => {
    const out = toMerchantBranch({ id: 'b1', name: 'Main', redemptionPin: null })
    expect(out).toEqual({ id: 'b1', name: 'Main', redemptionPinSet: false })
    expect(out).not.toHaveProperty('redemptionPin')
  })

  it('redemptionPin field entirely absent ⇒ redemptionPinSet:false, no crash', () => {
    const out = toMerchantBranch({ id: 'b1', name: 'Main' } as any)
    expect(out).toEqual({ id: 'b1', name: 'Main', redemptionPinSet: false })
    expect(out).not.toHaveProperty('redemptionPin')
  })

  it('other fields pass through untouched', () => {
    const out = toMerchantBranch({
      id: 'b1', name: 'Main', isActive: true, phone: '+44111',
      openingHours: [{ id: 'h1' }], redemptionPin: CIPHERTEXT,
    })
    expect(out).toMatchObject({
      id: 'b1', name: 'Main', isActive: true, phone: '+44111',
      openingHours: [{ id: 'h1' }], redemptionPinSet: true,
    })
  })

  // Open-register closure pin (chore/admin-s3-hygiene, 2026-07-09): the merchant
  // GET /branches serializer must NEVER emit the redemptionPin key for a FULL DB
  // row shape (BRANCH_INCLUDE selects every branch scalar, so the raw row DOES
  // carry the ciphertext; toMerchantBranch is the single strip point on the wire
  // exit). Object.keys is the belt-and-braces guard so a future field add cannot
  // silently re-surface it. The guarded reveal route (GET /pin) is the ONLY
  // legitimate redemptionPin exit and is unaffected (see section 4 below).
  it('a full DB-shaped branch row never leaves with the redemptionPin key', () => {
    const out = toMerchantBranch(baseBranchRow())
    expect(Object.keys(out)).not.toContain('redemptionPin')
    expect((out as { redemptionPinSet: boolean }).redemptionPinSet).toBe(true)
    // The distinctive ciphertext must not survive anywhere in the serialized row.
    expect(JSON.stringify(out)).not.toContain(CIPHERTEXT)
  })
})

// ── 2. Real Fastify-request pins ────────────────────────────────────────────

function baseBranchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1', merchantId: 'm1', name: 'High Street', isMainBranch: true,
    addressLine1: '1 High St', addressLine2: null, city: 'London', postcode: 'SW1A 1AA',
    country: 'GB', phone: null, email: null, websiteUrl: null, logoUrl: null, bannerUrl: null,
    about: null, isActive: true, deletedAt: null,
    latitude: 51.5, longitude: -0.1, localityId: 'loc1', localityName: 'London',
    postTown: null, ladDistrict: null, adminCounty: null, region: null, locationCountry: 'GB',
    locationResolvedAt: new Date(), locationConfidence: 'MANUALLY_CONFIRMED',
    lifecycleStatus: 'LIVE', closeReason: null,
    redemptionPin: CIPHERTEXT,
    redemptionAlertsEnabled: false,
    openingHours: [], amenities: [], photos: [], pendingEdits: [], pendingHours: [],
    ...overrides,
  }
}

function mockPrisma(overrides: Record<string, unknown> = {}) {
  const row = baseBranchRow(overrides)
  const mock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
      findMany: vi.fn().mockResolvedValue([{
        id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER',
        allBranches: true, canManageVouchers: false,
        merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
      }]),
    },
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
    branch: {
      findMany: vi.fn().mockResolvedValue([row]),
      findFirst: vi.fn().mockResolvedValue(row),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...row, ...data, id: 'b-new',
      })),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...row, ...data,
      })),
    },
    branchUser: { findMany: vi.fn().mockResolvedValue([]) },
    adminApproval: { create: vi.fn().mockResolvedValue({}) },
    locality: { findUnique: vi.fn().mockResolvedValue({ id: 'loc1', name: 'London' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  mock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(mock))
  return mock
}

async function makeApp(prisma: ReturnType<typeof mockPrisma>) {
  const app = await buildApp()
  app.decorate('prisma', prisma as any)
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null), set: vi.fn(), incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1), exists: vi.fn().mockResolvedValue(1), ttl: vi.fn().mockResolvedValue(900),
  } as any)
  await app.ready()
  const token = (app.jwt as any).merchant.sign(
    { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' },
  )
  return { app, token }
}

describe('GET /merchant/branches (list) - wire hygiene', () => {
  it('rows carry redemptionPinSet and the raw body never contains the ciphertext or the key', async () => {
    const prisma = mockPrisma()
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/merchant/branches',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(Array.isArray(body)).toBe(true)
      expect(body[0].redemptionPinSet).toBe(true)
      expect(body[0]).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain('redemptionPin"')
      expect(res.body).not.toContain(CIPHERTEXT)
    } finally {
      await app.close()
    }
  })

  it('redemptionPinSet:false when the row has no pin', async () => {
    const prisma = mockPrisma({ redemptionPin: null })
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/merchant/branches',
        headers: { authorization: `Bearer ${token}` },
      })
      const body = JSON.parse(res.body)
      expect(body[0].redemptionPinSet).toBe(false)
      expect(res.body).not.toContain('redemptionPin"')
    } finally {
      await app.close()
    }
  })
})

describe('GET /merchant/branches/:id - wire hygiene', () => {
  it('response carries redemptionPinSet, raw body has no ciphertext / key', async () => {
    const prisma = mockPrisma()
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/merchant/branches/b1',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.redemptionPinSet).toBe(true)
      expect(body).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain('redemptionPin"')
      expect(res.body).not.toContain(CIPHERTEXT)
    } finally {
      await app.close()
    }
  })
})

describe('PATCH /merchant/branches/:id - wire hygiene', () => {
  it('early-return no-op path (empty body) is sanitized', async () => {
    const prisma = mockPrisma()
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/merchant/branches/b1',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.redemptionPinSet).toBe(true)
      expect(body).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain(CIPHERTEXT)
    } finally {
      await app.close()
    }
  })

  it('real-update path (direct field change) is sanitized', async () => {
    const prisma = mockPrisma()
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/merchant/branches/b1',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: '+44999' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.redemptionPinSet).toBe(true)
      expect(body).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain(CIPHERTEXT)
    } finally {
      await app.close()
    }
  })
})

describe('POST /merchant/branches (create) - wire hygiene', () => {
  it('the create response is sanitized', async () => {
    // First branch for the merchant -> instant-live create path (existingCount 0).
    const prisma = mockPrisma()
    prisma.branch.count.mockResolvedValue(0)
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/merchant/branches',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'New Branch', addressLine1: '2 New St', city: 'London', postcode: 'SW1A 2AA',
        },
      })
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(typeof body.redemptionPinSet).toBe('boolean')
      expect(body).not.toHaveProperty('redemptionPin')
      expect(res.body).not.toContain(CIPHERTEXT)
    } finally {
      await app.close()
    }
  })
})

// ── 3. Service-level pins on alerts/close/withdraw ──────────────────────────

describe('setRedemptionAlerts / requestBranchClose / withdrawBranchClose - wire hygiene (service level)', () => {
  it('setRedemptionAlerts returns a sanitized branch', async () => {
    const prisma = mockPrisma()
    const result = await setRedemptionAlerts(prisma as any, 'ma1', 'b1', true)
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
  })

  it('requestBranchClose returns a sanitized branch', async () => {
    const prisma = mockPrisma({ lifecycleStatus: 'LIVE', isMainBranch: false })
    // requestBranchClose reads via findFirst (select id/isMainBranch/isActive/
    // lifecycleStatus), then re-checks BRANCH_LAST_ACTIVE via branch.count. Give
    // it >1 active branch so the guard passes.
    prisma.branch.count.mockResolvedValue(2)
    const result = await requestBranchClose(prisma as any, 'ma1', 'b1', 'closing down', {
      ipAddress: '1.2.3.4', userAgent: 'vitest',
    })
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
  })

  it('withdrawBranchClose returns a sanitized branch', async () => {
    const prisma = mockPrisma({ lifecycleStatus: 'PENDING_CLOSE', closeReason: 'closing down' })
    prisma.adminApproval = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn() }
    const result = await withdrawBranchClose(prisma as any, 'ma1', 'b1', {
      ipAddress: '1.2.3.4', userAgent: 'vitest',
    })
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
  })

  // CodeRabbit #377: the two remaining wire exits, exercised end-to-end through
  // the exported updateBranch dispatcher (the cores are not exported).
  it('isMainBranch promotion returns a sanitized branch', async () => {
    const prisma = mockPrisma()
    prisma.branch.updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const result = await updateBranch(prisma as any, 'ma1', 'b1', { isMainBranch: true }, {
      ipAddress: '1.2.3.4', userAgent: 'vitest',
    })
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
  })

  it('draft-window SENSITIVE-direct update returns a sanitized branch', async () => {
    const prisma = mockPrisma()
    // Draft window = merchant status REGISTERED (isDraftWindow); OWNER context is
    // the mockPrisma default. addressLine1 is SENSITIVE but avoids the postcode
    // gazetteer resolve.
    prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', status: 'REGISTERED', onboardingStep: 'BRANCHES',
    })
    const result = await updateBranch(prisma as any, 'ma1', 'b1', { addressLine1: '2 New Row' }, {
      ipAddress: '1.2.3.4', userAgent: 'vitest',
    })
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
  })
})

// ── 4. Guarded reveal route unchanged ───────────────────────────────────────
// pin.test.ts carries the full getBranchPin/setBranchPin/sendBranchPin
// behavioural suite; this is a single confirming pin (not a duplicate) that the
// decrypted-value reveal path is untouched by the wire-hygiene sanitizer.

describe('GET /merchant/branches/:id/pin - guarded reveal unchanged', () => {
  it('still returns the decrypted PIN via the explicit reveal route', async () => {
    const prisma = mockPrisma()
    const { app, token } = await makeApp(prisma)
    try {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/merchant/branches/b1/pin',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body).toEqual({ pin: 'SECRETCIPHER123' })
    } finally {
      await app.close()
    }
  })
})
