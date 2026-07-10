import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/api/app'
import { verifyAdminOtp, refreshAdminToken } from '../../../src/api/auth/admin/service'
import { hashRefreshToken } from '../../../src/api/shared/tokens'

// Team & Roles S1 — the effective-capability `caps` claim is minted into the
// 15m admin access token at BOTH login (verifyAdminOtp) and refresh
// (refreshAdminToken), recomputed from the admin's ACTIVE grants each time. A
// grant revoked since the last mint is gone from the next token (<=15m bound).

describe('admin JWT caps claim — login + refresh recompute', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildApp()
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  const decodeCaps = (token: string): string[] => {
    const payload = (app.jwt as any).admin.verify(token) as { caps?: string[]; adminRole?: string }
    return payload.caps ?? []
  }

  function prismaWithGrants(role: string, grantCaps: string[]) {
    return {
      adminUser: { findUnique: vi.fn().mockResolvedValue({ id: 'field-1', email: 'f@r.com', role, isActive: true }) },
      adminCapabilityGrant: { findMany: vi.fn().mockResolvedValue(grantCaps.map((capability) => ({ capability }))) },
      userSession: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any
  }

  // ---- LOGIN (verifyAdminOtp), via the dev OTP bypass (NODE_ENV=test) ----

  it('LOGIN embeds baseline UNION active grant (FIELD + approval:action)', async () => {
    const prisma = prismaWithGrants('FIELD', ['approval:action'])
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ adminId: 'field-1', deviceId: 'd1', deviceType: 'web', codeHmac: 'x', attempts: 0 })),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any
    const { accessToken } = await verifyAdminOtp(prisma, redis, app, { sessionChallenge: 'ch', code: '000000', ipAddress: '127.0.0.1', userAgent: 't' })
    const caps = decodeCaps(accessToken)
    expect(caps).toContain('approval:action')
    expect(caps).toContain('lead:manage') // FIELD baseline still present
  })

  it('LOGIN for a FIELD admin with NO active grant has NO approval:action', async () => {
    const prisma = prismaWithGrants('FIELD', [])
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ adminId: 'field-1', deviceId: 'd1', deviceType: 'web', codeHmac: 'x', attempts: 0 })),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any
    const { accessToken } = await verifyAdminOtp(prisma, redis, app, { sessionChallenge: 'ch', code: '000000', ipAddress: '127.0.0.1', userAgent: 't' })
    expect(decodeCaps(accessToken)).not.toContain('approval:action')
  })

  // ---- REFRESH (refreshAdminToken, the H4 re-fetch path) ----

  function refreshRedis(refreshToken: string) {
    const stored = JSON.stringify({ tokenHash: hashRefreshToken(refreshToken), deviceId: 'd1', deviceType: 'web' })
    return {
      get: vi.fn().mockResolvedValue(stored),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any
  }

  it('REFRESH re-mints caps: a FIELD admin WITH an active grant gets approval:action', async () => {
    const refreshToken = 'r'.repeat(128)
    const prisma = prismaWithGrants('FIELD', ['approval:action'])
    const { accessToken } = await refreshAdminToken(prisma, refreshRedis(refreshToken), app, {
      refreshToken, sessionId: 's1', entityId: 'field-1', ipAddress: '127.0.0.1', userAgent: 't',
    })
    expect(decodeCaps(accessToken)).toContain('approval:action')
  })

  it('REFRESH after a revoke: the next token has NO approval:action (findMany returns no active grant)', async () => {
    const refreshToken = 'r'.repeat(128)
    // Grant revoked -> getActiveGrantCapabilities (revokedAt:null filter) yields [].
    const prisma = prismaWithGrants('FIELD', [])
    const { accessToken } = await refreshAdminToken(prisma, refreshRedis(refreshToken), app, {
      refreshToken, sessionId: 's1', entityId: 'field-1', ipAddress: '127.0.0.1', userAgent: 't',
    })
    const caps = decodeCaps(accessToken)
    expect(caps).not.toContain('approval:action')
    expect(caps).toContain('lead:manage') // baseline intact
    // The active-grant query was keyed on revokedAt:null (only ACTIVE grants).
    expect(prisma.adminCapabilityGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ adminUserId: 'field-1', revokedAt: null }) }),
    )
  })

  it('REFRESH for SUPER_ADMIN does NOT query the grant table (short-circuit authority)', async () => {
    const refreshToken = 'r'.repeat(128)
    const prisma = prismaWithGrants('SUPER_ADMIN', [])
    await refreshAdminToken(prisma, refreshRedis(refreshToken), app, {
      refreshToken, sessionId: 's1', entityId: 'field-1', ipAddress: '127.0.0.1', userAgent: 't',
    })
    expect(prisma.adminCapabilityGrant.findMany).not.toHaveBeenCalled()
  })
})
