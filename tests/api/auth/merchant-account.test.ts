/**
 * My Account (§BP-ACC) backend primitives — merchant authenticated
 * change-password + logout-all-other-sessions.
 *
 * Mirrors the mocked-Prisma / mocked-Redis style of
 * merchant-logout-durability.test.ts (no shared-Neon writes, safe for
 * `npm run test:unit`), but with a lightweight in-memory Redis double instead
 * of a real Redis connection — these tests don't need to prove Lua-level
 * atomicity, just the "revoke others, keep current" scan/filter semantics.
 *
 * Locked semantics under test:
 *   - changePasswordMerchant: wrong current password / weak new password /
 *     new===current all reject BEFORE any mutation; success hashes + persists,
 *     revokes every OTHER live session (Redis refresh-token keys + DB
 *     UserSession rows), leaves the CALLER'S current session untouched, and
 *     writes the PASSWORD_CHANGED audit event.
 *   - logoutAllOtherMerchantSessions: same keep-current revoke, returns the
 *     revoked count, writes AUTH_SESSIONS_REVOKED.
 *   - Both routes are authenticateMerchant-gated: no token -> 401.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'
import {
  changePasswordMerchant,
  logoutAllOtherMerchantSessions,
} from '../../../src/api/auth/merchant/service'
import { hashPassword, verifyPassword } from '../../../src/api/shared/password'
import { RedisKey } from '../../../src/api/shared/redis-keys'

const CURRENT_PASSWORD = 'CurrentPass1!'
const NEW_PASSWORD = 'NewPassword2@'

/**
 * In-memory Redis double modelling the string get/set/del + keys(pattern)
 * surface `revokeOtherSessionsForEntity` uses. `keys()` supports a single
 * trailing '*' wildcard, which is all the `refresh:<role>:<entityId>:*`
 * pattern ever needs.
 */
function fakeRedis() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: vi.fn(async (k: string, v: string, ..._rest: unknown[]) => {
      store.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0
      for (const k of keys) {
        if (store.delete(k)) count++
      }
      return count
    }),
    keys: vi.fn(async (pattern: string) => {
      const [prefix] = pattern.split('*')
      return [...store.keys()].filter((k) => k.startsWith(prefix))
    }),
  }
}

function makePrisma(admin: { id: string; passwordHash: string }) {
  return {
    merchantAdmin: {
      findUnique: vi.fn().mockResolvedValue(admin),
      update: vi.fn().mockResolvedValue({}),
    },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

describe('changePasswordMerchant', () => {
  const ADMIN_ID = 'ma-account-1'
  const CURRENT_SESSION = 'sess-current'
  const OTHER_SESSION = 'sess-other'
  let currentHash: string

  beforeEach(async () => {
    currentHash = await hashPassword(CURRENT_PASSWORD)
  })

  it('rejects an incorrect current password with CURRENT_PASSWORD_INCORRECT and mutates nothing', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: currentHash })
    const redis = fakeRedis()
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION), 'v1')
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, OTHER_SESSION), 'v2')

    await expect(
      changePasswordMerchant(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
        currentPassword: 'WrongPassword1!',
        newPassword: NEW_PASSWORD,
        ipAddress: '1.1.1.1',
        userAgent: 'test',
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' })

    expect(prisma.merchantAdmin.update).not.toHaveBeenCalled()
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
    // Both sessions survive — nothing was revoked on a failed attempt.
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION))).toBe(true)
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, OTHER_SESSION))).toBe(true)
  })

  it('rejects a policy-violating new password with PASSWORD_POLICY_VIOLATION', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: currentHash })
    const redis = fakeRedis()

    await expect(
      changePasswordMerchant(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: 'weak',
        ipAddress: '1.1.1.1',
        userAgent: 'test',
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_POLICY_VIOLATION' })

    expect(prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('rejects a new password identical to the current one with NEW_PASSWORD_SAME_AS_CURRENT', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: currentHash })
    const redis = fakeRedis()

    await expect(
      changePasswordMerchant(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: CURRENT_PASSWORD,
        ipAddress: '1.1.1.1',
        userAgent: 'test',
      }),
    ).rejects.toMatchObject({ code: 'NEW_PASSWORD_SAME_AS_CURRENT' })

    expect(prisma.merchantAdmin.update).not.toHaveBeenCalled()
  })

  it('on success: hashes + persists the new password, revokes OTHER sessions, KEEPS the current session, and writes PASSWORD_CHANGED', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: currentHash })
    const redis = fakeRedis()
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION), 'v1')
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, OTHER_SESSION), 'v2')

    const result = await changePasswordMerchant(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
      currentPassword: CURRENT_PASSWORD,
      newPassword: NEW_PASSWORD,
      ipAddress: '9.9.9.9',
      userAgent: 'jest-ua',
    })

    expect(result).toEqual({ message: 'Password updated.' })

    // hashPassword called (new hash persisted, matches the new password, differs from the old hash).
    expect(prisma.merchantAdmin.update).toHaveBeenCalledTimes(1)
    const updateArgs = prisma.merchantAdmin.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: ADMIN_ID })
    expect(updateArgs.data.passwordHash).not.toBe(currentHash)
    expect(await verifyPassword(NEW_PASSWORD, updateArgs.data.passwordHash)).toBe(true)

    // OTHER session revoked; CURRENT session key untouched (load-bearing keep-current assertion).
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, OTHER_SESSION))).toBe(false)
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION))).toBe(true)

    // DB UserSession revoke also excludes the current session.
    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(1)
    const sessionArgs = prisma.userSession.updateMany.mock.calls[0][0]
    expect(sessionArgs.where.entityId).toBe(ADMIN_ID)
    expect(sessionArgs.where.entityType).toBe('merchant')
    expect(sessionArgs.where.sessionId).toEqual({ not: CURRENT_SESSION })
    expect(sessionArgs.data.revokedReason).toBe('PASSWORD_CHANGED')

    // Audit written once, attributed to the admin + current session.
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      entityId: ADMIN_ID,
      entityType: 'merchant',
      event: 'PASSWORD_CHANGED',
      sessionId: CURRENT_SESSION,
    })
  })
})

describe('logoutAllOtherMerchantSessions', () => {
  const ADMIN_ID = 'ma-account-2'
  const CURRENT_SESSION = 'sess-current'

  it('revokes every OTHER session, keeps the current one, returns the revoked count, and writes AUTH_SESSIONS_REVOKED', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: 'unused' })
    const redis = fakeRedis()
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION), 'v0')
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, 'sess-other-1'), 'v1')
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, 'sess-other-2'), 'v2')

    const result = await logoutAllOtherMerchantSessions(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
      ipAddress: '2.2.2.2',
      userAgent: 'jest-ua',
    })

    expect(result).toEqual({ revokedCount: 2 })
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, 'sess-other-1'))).toBe(false)
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, 'sess-other-2'))).toBe(false)
    // Current session survives — the whole point of "logout ALL OTHER sessions".
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION))).toBe(true)

    expect(prisma.userSession.updateMany).toHaveBeenCalledTimes(1)
    const sessionArgs = prisma.userSession.updateMany.mock.calls[0][0]
    expect(sessionArgs.where.sessionId).toEqual({ not: CURRENT_SESSION })
    expect(sessionArgs.data.revokedReason).toBe('LOGOUT_ALL_OTHER_SESSIONS')

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      entityId: ADMIN_ID,
      entityType: 'merchant',
      event: 'AUTH_SESSIONS_REVOKED',
      sessionId: CURRENT_SESSION,
    })
  })

  it('returns revokedCount 0 and still writes the audit event when there are no other sessions to revoke', async () => {
    const prisma = makePrisma({ id: ADMIN_ID, passwordHash: 'unused' })
    const redis = fakeRedis()
    redis.store.set(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION), 'v0')

    const result = await logoutAllOtherMerchantSessions(prisma as any, redis as any, ADMIN_ID, CURRENT_SESSION, {
      ipAddress: '2.2.2.2',
      userAgent: 'jest-ua',
    })

    expect(result).toEqual({ revokedCount: 0 })
    expect(redis.store.has(RedisKey.refreshToken('merchant', ADMIN_ID, CURRENT_SESSION))).toBe(true)
  })
})

describe('My Account routes — authentication gate', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn(), update: vi.fn() },
      userSession: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/merchant/auth/change-password with no bearer token -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/auth/change-password',
      payload: { currentPassword: 'Whatever1!', newPassword: 'AnotherOne2@' },
    })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.merchantAdmin.findUnique).not.toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/auth/logout-all with no bearer token -> 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/merchant/auth/logout-all' })
    expect(res.statusCode).toBe(401)
    expect(app.prisma.userSession.updateMany).not.toHaveBeenCalled()
  })
})
