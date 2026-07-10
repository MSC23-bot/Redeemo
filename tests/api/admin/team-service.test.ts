import { describe, it, expect, vi, beforeEach } from 'vitest'

// Team & Roles S1 — team-management service (grant/revoke/deactivate) with a
// mocked Prisma + Redis. The shared session module is mocked so we can assert
// the escape-hatch (session revoke) is invoked on revoke + deactivate.

const revokeAllSessionsForEntity = vi.fn().mockResolvedValue(undefined)
const revokeAllUserSessionRecords = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../src/api/shared/session', () => ({
  revokeAllSessionsForEntity: (...a: unknown[]) => revokeAllSessionsForEntity(...a),
  revokeAllUserSessionRecords: (...a: unknown[]) => revokeAllUserSessionRecords(...a),
}))

import {
  grantCapability,
  revokeCapability,
  deactivateAdmin,
} from '../../../src/api/admin/team/service'

const ctx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const ACTOR = 'super-1'
const TARGET = 'field-1'

function makeTx(overrides: Record<string, any> = {}) {
  return {
    adminUser: {
      findUnique: vi.fn().mockResolvedValue({ id: TARGET, role: 'FIELD', isActive: true }),
      update: vi.fn().mockResolvedValue({ id: TARGET, email: 'f@r.com', role: 'FIELD', isActive: false }),
    },
    adminCapabilityGrant: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'grant-1', capability: 'approval:action', grantedAt: new Date() }),
      findMany: vi.fn().mockResolvedValue([{ id: 'grant-1' }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  }
}

function makePrisma(tx: any) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
  } as any
}

const redis = {} as any

beforeEach(() => {
  revokeAllSessionsForEntity.mockClear()
  revokeAllUserSessionRecords.mockClear()
})

describe('grantCapability — allow-list enforcement', () => {
  it('REJECTS a non-grantable capability (admin:manage-team) with CAPABILITY_NOT_GRANTABLE (400)', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      grantCapability(prisma, ACTOR, TARGET, 'admin:manage-team', ctx),
    ).rejects.toThrow('CAPABILITY_NOT_GRANTABLE')
    // Never even opened a transaction / wrote a grant.
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.adminCapabilityGrant.create).not.toHaveBeenCalled()
  })

  it('REJECTS merchant:suspend (off the allow-list)', async () => {
    const prisma = makePrisma(makeTx())
    await expect(
      grantCapability(prisma, ACTOR, TARGET, 'merchant:suspend', ctx),
    ).rejects.toThrow('CAPABILITY_NOT_GRANTABLE')
  })

  it('grants approval:action: creates a grant row + writes an audit row', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const res = await grantCapability(prisma, ACTOR, TARGET, 'approval:action', ctx)
    expect(res.alreadyGranted).toBe(false)
    expect(tx.adminCapabilityGrant.create).toHaveBeenCalledOnce()
    expect(tx.adminCapabilityGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminUserId: TARGET, capability: 'approval:action', grantedById: ACTOR }) }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'ADMIN_CAPABILITY_GRANTED', actorId: ACTOR }) }),
    )
  })

  it('is idempotent: an already-active grant is returned without a new row', async () => {
    const tx = makeTx({
      adminCapabilityGrant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing', capability: 'approval:action', grantedAt: new Date() }),
        create: vi.fn(),
      },
      adminUser: { findUnique: vi.fn().mockResolvedValue({ id: TARGET }) },
      auditLog: { create: vi.fn() },
    })
    const prisma = makePrisma(tx)
    const res = await grantCapability(prisma, ACTOR, TARGET, 'approval:action', ctx)
    expect(res.alreadyGranted).toBe(true)
    expect(tx.adminCapabilityGrant.create).not.toHaveBeenCalled()
  })

  it('404 ADMIN_NOT_FOUND when the target admin does not exist', async () => {
    const tx = makeTx({ adminUser: { findUnique: vi.fn().mockResolvedValue(null) } })
    const prisma = makePrisma(tx)
    await expect(grantCapability(prisma, ACTOR, TARGET, 'approval:action', ctx)).rejects.toThrow('ADMIN_NOT_FOUND')
  })
})

describe('revokeCapability — soft revoke + escape hatch', () => {
  it('sets revokedAt/revokedById, audits, and INVOKES the session-revoke escape hatch', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const res = await revokeCapability(prisma, redis, ACTOR, TARGET, 'approval:action', ctx)
    expect(res.revokedCount).toBe(1)
    expect(tx.adminCapabilityGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ adminUserId: TARGET, capability: 'approval:action', revokedAt: null }),
        data: expect.objectContaining({ revokedById: ACTOR }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'ADMIN_CAPABILITY_REVOKED', actorId: ACTOR }) }),
    )
    // Escape hatch: both session-revoke paths fired for the grantee.
    expect(revokeAllSessionsForEntity).toHaveBeenCalledWith(redis, { role: 'admin', entityId: TARGET })
    expect(revokeAllUserSessionRecords).toHaveBeenCalledWith(prisma, expect.objectContaining({ entityId: TARGET, entityType: 'admin' }))
  })

  it('404 GRANT_NOT_FOUND when no active grant exists; escape hatch NOT fired', async () => {
    const tx = makeTx({
      adminCapabilityGrant: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    })
    const prisma = makePrisma(tx)
    await expect(revokeCapability(prisma, redis, ACTOR, TARGET, 'approval:action', ctx)).rejects.toThrow('GRANT_NOT_FOUND')
    expect(revokeAllSessionsForEntity).not.toHaveBeenCalled()
    expect(revokeAllUserSessionRecords).not.toHaveBeenCalled()
  })
})

describe('deactivateAdmin — isActive=false + escape hatch', () => {
  it('sets isActive=false, audits, and INVOKES the session-revoke escape hatch', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await deactivateAdmin(prisma, redis, ACTOR, TARGET, ctx)
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TARGET }, data: { isActive: false } }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'ADMIN_ACCOUNT_DEACTIVATED', actorId: ACTOR }) }),
    )
    expect(revokeAllSessionsForEntity).toHaveBeenCalledWith(redis, { role: 'admin', entityId: TARGET })
    expect(revokeAllUserSessionRecords).toHaveBeenCalledWith(prisma, expect.objectContaining({ entityId: TARGET, entityType: 'admin' }))
  })

  it('refuses self-deactivation (ADMIN_SELF_ACTION_FORBIDDEN); nothing revoked', async () => {
    const prisma = makePrisma(makeTx())
    await expect(deactivateAdmin(prisma, redis, ACTOR, ACTOR, ctx)).rejects.toThrow('ADMIN_SELF_ACTION_FORBIDDEN')
    expect(revokeAllSessionsForEntity).not.toHaveBeenCalled()
  })
})
