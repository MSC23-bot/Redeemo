import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { loginMerchant, verifyMerchantOtp } from '../../../src/api/auth/merchant/service'
import { RedisKey } from '../../../src/api/shared/redis-keys'

// Staff & Access PR-B B8 (THE CUTOVER, §4.4): non-owner login is now LIVE.
// resolveMerchantInfo resolves ANY ACTIVE membership (getActiveMembership ->
// merchantMembership.findMany), so a BRANCH_MANAGER / STAFF member can authenticate
// into a working merchant session. The SEC-M2 suspended throw is preserved, and an
// admin with no active membership still gets INVALID_CREDENTIALS.
//
// Before B8, resolveMerchantInfo used getOwnerMembership (findFirst, OWNER-only), so
// a non-owner could not authenticate at all.

const TEST_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const CHALLENGE = 'bm-challenge-token'
const KEY = RedisKey.otpChallenge('merchant', CHALLENGE)

// A BRANCH_MANAGER admin (claimed: passwordHash set, emailVerified) + their ACTIVE
// BRANCH_MANAGER membership in the getActiveMembership (findMany) shape.
const BM_ADMIN = { id: 'bm-1', email: 'manager@example.com', passwordHash: 'hash', otpVerifiedAt: null, status: 'ACTIVE', emailVerified: true }
function bmMembership(merchantStatus = 'ACTIVE') {
  return {
    id: 'mm-bm', merchantId: 'm1', merchantAdminId: 'bm-1', role: 'BRANCH_MANAGER',
    allBranches: false, canManageVouchers: false,
    merchant: { status: merchantStatus, businessName: 'Test Co' }, branches: [{ branchId: 'b1' }],
  }
}

function hmacFor(challenge: string, code: string): string {
  return crypto.createHmac('sha256', TEST_ENCRYPTION_KEY).update(challenge + ':' + code).digest('hex')
}

let savedEncKey: string | undefined
let savedNodeEnv: string | undefined
beforeEach(() => {
  savedEncKey = process.env.ENCRYPTION_KEY
  savedNodeEnv = process.env.NODE_ENV
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
})
afterEach(() => {
  if (savedEncKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = savedEncKey
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = savedNodeEnv
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('B8 cutover: non-owner (BRANCH_MANAGER) login', () => {
  it('loginMerchant for a BRANCH_MANAGER -> OTP_REQUIRED + sessionChallenge (no longer INVALID_CREDENTIALS)', async () => {
    const redis = {
      get: vi.fn(async (_k: string) => null as string | null),
      set: vi.fn(async (_k: string, _v: string, ..._rest: unknown[]) => 'OK'),
      del: vi.fn(async (_k: string) => 1),
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => BM_ADMIN) },
      // resolveMerchantInfo now uses getActiveMembership -> findMany (any active role).
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('ACTIVE')]) },
    }
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)
    const notify = await import('../../../src/api/shared/notify')
    vi.spyOn(notify, 'notify').mockResolvedValue({ queued: true, communicationLogId: 'log-1', enqueued: true } as any)

    const res = await loginMerchant(prisma as any, redis as any, {} as any, {
      email: BM_ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(res.status).toBe('OTP_REQUIRED')
    expect(res.sessionChallenge).toBeTruthy()
    expect(prisma.merchantMembership.findMany).toHaveBeenCalled()
  })

  it('verifyMerchantOtp for a BRANCH_MANAGER -> issues a working session (accessToken + refreshToken)', async () => {
    process.env.NODE_ENV = 'production'
    const CORRECT_CODE = '492018'
    const store: Record<string, string> = {
      [KEY]: JSON.stringify({ adminId: BM_ADMIN.id, deviceId: 'd1', deviceType: 'web', codeHmac: hmacFor(CHALLENGE, CORRECT_CODE), attempts: 0 }),
    }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string, ..._rest: unknown[]) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
    }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => ({ id: BM_ADMIN.id, email: BM_ADMIN.email })), update: vi.fn(async () => ({})) },
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('ACTIVE')]) },
      userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }

    const res = await verifyMerchantOtp(prisma as any, redis as any, app as any, {
      sessionChallenge: CHALLENGE, code: CORRECT_CODE, ipAddress: '1.2.3.4', userAgent: 'test',
    })

    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
    expect(app.jwt.merchant.sign).toHaveBeenCalledTimes(1)
    expect(store[KEY]).toBeUndefined()
  })

  it('loginMerchant still rejects a SUSPENDED merchant (MERCHANT_SUSPENDED) for a non-owner', async () => {
    const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => BM_ADMIN) },
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('SUSPENDED')]) },
    }
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)

    await expect(loginMerchant(prisma as any, redis as any, {} as any, {
      email: BM_ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })).rejects.toThrow('MERCHANT_SUSPENDED')
  })

  it('loginMerchant still rejects an admin with NO active membership (INVALID_CREDENTIALS)', async () => {
    const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => BM_ADMIN) },
      // No active membership -> getActiveMembership returns null -> INVALID_CREDENTIALS.
      merchantMembership: { findMany: vi.fn(async () => []) },
    }
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)

    await expect(loginMerchant(prisma as any, redis as any, {} as any, {
      email: BM_ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('loginMerchant throws MULTI_MEMBERSHIP_UNSUPPORTED when the person holds >1 active membership', async () => {
    const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) }
    const prisma = {
      merchantAdmin: { findUnique: vi.fn(async () => BM_ADMIN) },
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('ACTIVE'), { ...bmMembership('ACTIVE'), id: 'mm-bm2', merchantId: 'm2' }]) },
    }
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)

    await expect(loginMerchant(prisma as any, redis as any, {} as any, {
      email: BM_ADMIN.email, password: 'MyPass123!', deviceId: 'd1', deviceType: 'web',
      ipAddress: '1.2.3.4', userAgent: 'test',
    })).rejects.toThrow('MULTI_MEMBERSHIP_UNSUPPORTED')
  })
})
