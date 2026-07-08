import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import { hashRefreshToken } from '../../../src/api/shared/tokens'
import { refreshCustomerToken } from '../../../src/api/auth/customer/service'
import { refreshBranchToken } from '../../../src/api/auth/branch/service'
import { refreshAdminToken } from '../../../src/api/auth/admin/service'

// H4 (2026-07-06 security audit): token refresh must re-check account status.
// A suspended/deactivated/deleted account must NOT keep minting access tokens via
// the 90-day refresh chain. On a non-active status the refresh is denied AND all of
// the account's sessions are revoked (Redis keys + DB records), so no device can
// obtain a new access token. Merchant already had this (merchant-suspend-hardening);
// these cover customer / branch / admin.

const ENTITY = 'ent-1'
const SESSION = 'sess-1'
const REFRESH = 'GOOD_REFRESH_TOKEN'
const CTX = { ipAddress: '127.0.0.1', userAgent: 'test' }

function storedToken() {
  return JSON.stringify({ tokenHash: hashRefreshToken(REFRESH), deviceId: 'd1', deviceType: 'ios' })
}

describe('H4 — refresh re-checks account status (customer / branch / admin)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      user:        { findUnique: vi.fn() },
      branchUser:  { findUnique: vi.fn() },
      adminUser:   { findUnique: vi.fn() },
      userSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue(null) },
      auditLog:    { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get:    vi.fn().mockResolvedValue(storedToken()),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      keys:   vi.fn().mockResolvedValue([`refresh:x:${ENTITY}:${SESSION}`]),
      exists: vi.fn().mockResolvedValue(1),
      ttl:    vi.fn().mockResolvedValue(900),
    } as any)
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const call = {
    customer: () => refreshCustomerToken(app.prisma, app.redis, app, { refreshToken: REFRESH, sessionId: SESSION, entityId: ENTITY, ...CTX }),
    branch:   () => refreshBranchToken(app.prisma, app.redis, app, { refreshToken: REFRESH, sessionId: SESSION, entityId: ENTITY, ...CTX }),
    admin:    () => refreshAdminToken(app.prisma, app.redis, app, { refreshToken: REFRESH, sessionId: SESSION, entityId: ENTITY, ...CTX }),
  }

  // ── CUSTOMER ────────────────────────────────────────────────────────────────
  describe('customer', () => {
    it('ACTIVE account: refresh succeeds and rotates the token (existing valid session)', async () => {
      app.prisma.user.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE' })
      const res = await call.customer()
      expect(res.accessToken).toBeTruthy()
      expect(res.refreshToken).toBeTruthy()
      expect(res.refreshToken).not.toBe(REFRESH)              // rotated
      expect(app.redis.del).toHaveBeenCalledWith(`refresh:customer:${ENTITY}:${SESSION}`) // old token reuse blocked
      expect(app.redis.keys).not.toHaveBeenCalled()           // no revoke-all on the happy path
    })

    it('SUSPENDED account: refresh denied (ACCOUNT_SUSPENDED) and ALL sessions revoked', async () => {
      app.prisma.user.findUnique = vi.fn().mockResolvedValue({ status: 'SUSPENDED' })
      await expect(call.customer()).rejects.toThrow('ACCOUNT_SUSPENDED')
      expect(app.redis.keys).toHaveBeenCalledWith(`refresh:customer:${ENTITY}:*`) // revoke-all
      expect(app.prisma.userSession.updateMany).toHaveBeenCalled()
    })

    it('INACTIVE account: refresh denied (ACCOUNT_INACTIVE)', async () => {
      app.prisma.user.findUnique = vi.fn().mockResolvedValue({ status: 'INACTIVE' })
      await expect(call.customer()).rejects.toThrow('ACCOUNT_INACTIVE')
    })

    it('DELETED / missing account: refresh denied (INVALID_CREDENTIALS)', async () => {
      app.prisma.user.findUnique = vi.fn().mockResolvedValue(null)
      await expect(call.customer()).rejects.toThrow('INVALID_CREDENTIALS')
    })
  })

  // ── BRANCH ──────────────────────────────────────────────────────────────────
  describe('branch', () => {
    it('active branch user + active merchant: refresh succeeds', async () => {
      app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE', branch: { merchant: { status: 'ACTIVE' } } })
      const res = await call.branch()
      expect(res.accessToken).toBeTruthy()
      expect(app.redis.del).toHaveBeenCalledWith(`refresh:branch:${ENTITY}:${SESSION}`)
    })

    it('deactivated branch user (branch closed): refresh denied (BRANCH_USER_DEACTIVATED) + revoke-all', async () => {
      app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({ status: 'INACTIVE', branch: { merchant: { status: 'ACTIVE' } } })
      await expect(call.branch()).rejects.toThrow('BRANCH_USER_DEACTIVATED')
      expect(app.redis.keys).toHaveBeenCalledWith(`refresh:branch:${ENTITY}:*`)
      expect(app.prisma.userSession.updateMany).toHaveBeenCalled()
    })

    it('parent merchant suspended: refresh denied (MERCHANT_SUSPENDED)', async () => {
      app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE', branch: { merchant: { status: 'SUSPENDED' } } })
      await expect(call.branch()).rejects.toThrow('MERCHANT_SUSPENDED')
    })

    it('deactivated-user precedence over suspended-merchant (mirrors login order)', async () => {
      app.prisma.branchUser.findUnique = vi.fn().mockResolvedValue({ status: 'INACTIVE', branch: { merchant: { status: 'SUSPENDED' } } })
      await expect(call.branch()).rejects.toThrow('BRANCH_USER_DEACTIVATED')
    })
  })

// ── ADMIN ─────────────────────────────────────
  describe('admin', () => {
    it('active admin: refresh succeeds', async () => {
      app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({ id: ENTITY, isActive: true, role: 'ADMIN' })
      const res = await call.admin()
      expect(res.accessToken).toBeTruthy()
      expect(app.redis.del).toHaveBeenCalledWith(`refresh:admin:${ENTITY}:${SESSION}`)
    })

    it('deactivated admin (isActive=false): refresh denied (ACCOUNT_SUSPENDED) + revoke-all', async () => {
      app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue({ id: ENTITY, isActive: false, role: 'ADMIN' })
      await expect(call.admin()).rejects.toThrow('ACCOUNT_SUSPENDED')
      expect(app.redis.keys).toHaveBeenCalledWith(`refresh:admin:${ENTITY}:*`)
      expect(app.prisma.userSession.updateMany).toHaveBeenCalled()
    })

    it('missing admin row: refresh denied (ACCOUNT_SUSPENDED)', async () => {
      app.prisma.adminUser.findUnique = vi.fn().mockResolvedValue(null)
      await expect(call.admin()).rejects.toThrow('ACCOUNT_SUSPENDED')
    })
  })

  // ── refresh-token reuse (rotation invalidates the old token) ─────────────────
  describe('refresh-token reuse', () => {
    it('a stale/rotated refresh token whose Redis key is gone is rejected (REFRESH_TOKEN_INVALID)', async () => {
      app.prisma.user.findUnique = vi.fn().mockResolvedValue({ status: 'ACTIVE' })
      app.redis.get = vi.fn().mockResolvedValue(null) // key already rotated away / logged out
      await expect(call.customer()).rejects.toThrow('REFRESH_TOKEN_INVALID')
      // status re-check never runs when the token itself is invalid
      expect(app.prisma.user.findUnique).not.toHaveBeenCalled()
    })
  })
})
