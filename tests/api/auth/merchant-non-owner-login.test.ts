import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { loginMerchant, verifyMerchantOtp, refreshMerchantToken } from '../../../src/api/auth/merchant/service'
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

// Merchant-only atomic compare-and-rotate (backend logout-durability design
// 2026-07-06, §3.1) replaced refreshMerchantToken's plain del+set with a
// single Lua EVAL. This is a pure-JS mirror of that Lua's semantics over the
// same in-memory `store` these fakes already use, so the pre-existing
// stateful fake-redis pattern in this file keeps working without a real Lua
// engine. Mirrors the Lua exactly (see src/api/auth/merchant/atomicRotate.ts)
// — tombstone check first, then missing/corrupt/mismatch/ok.
function makeRotateEval(store: Record<string, string | null>) {
  return vi.fn(async (_script: string, numKeys: number, ...rest: unknown[]) => {
    const keys = rest.slice(0, numKeys) as string[]
    const argv = rest.slice(numKeys) as string[]
    const [tokenKey, tombstoneKey] = keys
    const [expectedHash, replacementValue] = argv
    if (store[tombstoneKey]) {
      delete store[tokenKey]
      delete store[tombstoneKey]
      return ['refused', 'revoked']
    }
    const cur = store[tokenKey]
    if (cur === undefined || cur === null) return ['refused', 'missing']
    let parsed: { tokenHash?: string }
    try {
      parsed = JSON.parse(cur)
    } catch {
      return ['refused', 'corrupt']
    }
    if (parsed.tokenHash !== expectedHash) return ['refused', 'mismatch']
    store[tokenKey] = replacementValue
    return ['ok']
  })
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
      // GAP-5: OTP resend-cooldown gate (eval SET-NX; [1] = allowed) + failed-round
      // counter (incr/expire, no-op here).
      eval: vi.fn(async () => [1] as unknown),
      incr: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
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

// PR-B review FIX 1 (MAJOR security): refreshMerchantToken's SEC-M2 suspended-merchant
// gate must use getActiveMembership (any-role) so a non-owner (BRANCH_MANAGER / STAFF)
// member of a SUSPENDED merchant cannot refresh their session forever. Before the fix
// the gate used getOwnerMembership (OWNER-only), so a non-owner resolved null and the
// suspended throw was skipped.
describe('FIX 1: refreshMerchantToken suspended-merchant gate (any-role)', () => {
  const SESSION_ID = 's1'
  const ENTITY_ID = 'bm-1'
  const REFRESH_TOKEN = 'raw-refresh-token'
  const REFRESH_KEY = RedisKey.refreshToken('merchant', ENTITY_ID, SESSION_ID)

  // The stored refresh record validateRefreshToken checks against. validateRefreshToken
  // hashes the raw token and compares to the stored tokenHash, so build it from the
  // shared hasher to keep the test honest.
  async function storedRecord(): Promise<string> {
    const tokens = await import('../../../src/api/shared/tokens')
    return JSON.stringify({ tokenHash: tokens.hashRefreshToken(REFRESH_TOKEN), deviceId: 'd1', deviceType: 'web' })
  }

  it('rejects a non-owner BRANCH_MANAGER of a SUSPENDED merchant with MERCHANT_SUSPENDED', async () => {
    const store: Record<string, string | null> = { [REFRESH_KEY]: await storedRecord() }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
      eval: makeRotateEval(store),
    }
    const prisma = {
      // getActiveMembership uses findMany (any role); a BRANCH_MANAGER of a SUSPENDED merchant.
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('SUSPENDED')]), findFirst: vi.fn(async () => null) },
      auditLog: { create: vi.fn(async () => ({})) },
      userSession: { updateMany: vi.fn(async () => ({ count: 0 })) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }

    await expect(refreshMerchantToken(prisma as any, redis as any, app as any, {
      refreshToken: REFRESH_TOKEN, sessionId: SESSION_ID, entityId: ENTITY_ID, ipAddress: '1.2.3.4', userAgent: 'test',
    })).rejects.toThrow('MERCHANT_SUSPENDED')
    // No new access token issued for a suspended merchant.
    expect(app.jwt.merchant.sign).not.toHaveBeenCalled()
  })

  it('still rejects an OWNER of a SUSPENDED merchant with MERCHANT_SUSPENDED (existing behaviour preserved)', async () => {
    const store: Record<string, string | null> = { [REFRESH_KEY]: await storedRecord() }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
      eval: makeRotateEval(store),
    }
    const ownerSuspended = { ...bmMembership('SUSPENDED'), id: 'mm-owner', role: 'OWNER', allBranches: true, branches: [] }
    const prisma = {
      merchantMembership: { findMany: vi.fn(async () => [ownerSuspended]), findFirst: vi.fn(async () => null) },
      auditLog: { create: vi.fn(async () => ({})) },
      userSession: { updateMany: vi.fn(async () => ({ count: 0 })) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }

    await expect(refreshMerchantToken(prisma as any, redis as any, app as any, {
      refreshToken: REFRESH_TOKEN, sessionId: SESSION_ID, entityId: ENTITY_ID, ipAddress: '1.2.3.4', userAgent: 'test',
    })).rejects.toThrow('MERCHANT_SUSPENDED')
    expect(app.jwt.merchant.sign).not.toHaveBeenCalled()
  })

  it('allows refresh for a non-owner BRANCH_MANAGER of an ACTIVE merchant', async () => {
    const store: Record<string, string | null> = { [REFRESH_KEY]: await storedRecord() }
    const redis = {
      get: vi.fn(async (k: string) => store[k] ?? null),
      set: vi.fn(async (k: string, v: string) => { store[k] = v; return 'OK' }),
      del: vi.fn(async (k: string) => { delete store[k]; return 1 }),
      eval: makeRotateEval(store),
    }
    const prisma = {
      merchantMembership: { findMany: vi.fn(async () => [bmMembership('ACTIVE')]), findFirst: vi.fn(async () => null) },
      auditLog: { create: vi.fn(async () => ({})) },
      userSession: { updateMany: vi.fn(async () => ({ count: 0 })) },
    }
    const app = { jwt: { merchant: { sign: vi.fn(() => 'access.jwt.token') } } }

    const res = await refreshMerchantToken(prisma as any, redis as any, app as any, {
      refreshToken: REFRESH_TOKEN, sessionId: SESSION_ID, entityId: ENTITY_ID, ipAddress: '1.2.3.4', userAgent: 'test',
    })
    expect(res.accessToken).toBe('access.jwt.token')
    expect((res as any).refreshToken).toBeTruthy()
  })
})
