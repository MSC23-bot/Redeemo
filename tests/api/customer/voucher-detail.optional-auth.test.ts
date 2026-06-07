import 'dotenv/config'
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// SEC-C1 (Gate-PR-5) — route-level proof for GET /api/v1/customer/vouchers/:id.
//
// The open-scope voucher-detail route derives userId via optionalUserId (now
// signature-verified) and passes it to getCustomerVoucher, which gates the
// secret lastRedemption.code on `if (userId)`. We mock getCustomerVoucher to
// return the code ONLY when a userId is present, then assert the route passes
// the VERIFIED sub for a valid token and null for a forged/guest caller — so a
// forged token can never make the route hand out the victim's redemption code.

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed: vi.fn(),
  getCustomerMerchant: vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher: vi.fn(),
  searchMerchants: vi.fn(),
  searchBranches: vi.fn(),
  listActiveCategories: vi.fn(),
  getActiveCampaigns: vi.fn(),
  getCampaignMerchants: vi.fn(),
  getCampaignBranches: vi.fn(),
  getCategoryMerchants: vi.fn(),
  getCategoryBranches: vi.fn(),
  getInAreaMerchants: vi.fn(),
  getInAreaBranches: vi.fn(),
  resolveLocationContext: vi.fn().mockResolvedValue({ source: 'none', city: null }),
  toLocationContextWire: vi.fn((x: unknown) => x),
}))

import { getCustomerVoucher } from '../../../src/api/customer/discovery/service'

const VICTIM = 'victim-user-1'
const VOUCHER = 'v1'
const SECRET_CODE = 'A7K2P9X4'

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}
function forgeUnsigned(sub: string): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub })}.not-a-real-signature`
}

let app: FastifyInstance
let validToken: string

beforeAll(async () => {
  app = await buildApp()
  app.decorate('prisma', {} as any)
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  } as any)
  await app.ready()
  validToken = (app.jwt as any).customer.sign({ sub: VICTIM })
})

afterAll(async () => {
  if (app) await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  // Mirror the real `if (userId)` gate: emit the secret code only when a userId
  // reaches the service (i.e. the caller was verified).
  ;(getCustomerVoucher as unknown as { mockImplementation: (f: (...a: any[]) => unknown) => void }).mockImplementation(
    (_prisma: unknown, id: string, userId: string | null) =>
      userId
        ? {
            id,
            isFavourited: true,
            lastRedemption: {
              code: SECRET_CODE,
              branch: { id: 'b1', name: 'High Street' },
              redeemedAt: '2026-06-01T10:00:00.000Z',
              isValidated: false,
              validatedAt: null,
            },
          }
        : { id, isFavourited: false, lastRedemption: null },
  )
})

async function getVoucher(authorization?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/customer/vouchers/${VOUCHER}`,
    ...(authorization ? { headers: { authorization } } : {}),
  })
}

describe('SEC-C1 — GET /vouchers/:id passes only a verified identity to the service', () => {
  it('VALID signed token → route passes the verified userId; the owner receives lastRedemption.code', async () => {
    const res = await getVoucher(`Bearer ${validToken}`)
    expect(res.statusCode).toBe(200)
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), VOUCHER, VICTIM)
    expect(JSON.parse(res.body).lastRedemption.code).toBe(SECRET_CODE)
  })

  it('FORGED token with the victim sub → route passes null; NO lastRedemption.code leaks', async () => {
    const res = await getVoucher(`Bearer ${forgeUnsigned(VICTIM)}`)
    expect(res.statusCode).toBe(200)
    // The critical assertion: the route did NOT trust the forged sub.
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), VOUCHER, null)
    expect(getCustomerVoucher).not.toHaveBeenCalledWith(expect.anything(), VOUCHER, VICTIM)
    const body = JSON.parse(res.body)
    expect(body.lastRedemption).toBeNull()
    expect(res.body).not.toContain(SECRET_CODE)
  })

  it('GUEST (no token) → route passes null; no code', async () => {
    const res = await getVoucher()
    expect(res.statusCode).toBe(200)
    expect(getCustomerVoucher).toHaveBeenCalledWith(expect.anything(), VOUCHER, null)
    expect(JSON.parse(res.body).lastRedemption).toBeNull()
    expect(res.body).not.toContain(SECRET_CODE)
  })
})
