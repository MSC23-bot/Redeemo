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
  listTeamAdmins,
  grantCapability,
  revokeCapability,
  deactivateAdmin,
  createAdminAccount,
  setAdminRole,
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

// S2 — the roster read. No transaction (a plain findMany), so this uses its
// own prisma mock shape rather than makeTx/makePrisma.
describe('listTeamAdmins — roster read (S2)', () => {
  it('maps admins to the curated shape: id/email/name/role/isActive/createdAt/activeGrants', async () => {
    const createdAt = new Date('2026-07-01T00:00:00.000Z')
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'super-1',
        email: 'owner@redeemo.com',
        firstName: 'Priya',
        lastName: 'Owner',
        role: 'SUPER_ADMIN',
        isActive: true,
        createdAt,
        capabilityGrants: [],
      },
      {
        id: TARGET,
        email: 'f@r.com',
        firstName: 'Field',
        lastName: 'Rep',
        role: 'FIELD',
        isActive: true,
        createdAt,
        capabilityGrants: [{ capability: 'approval:action' }],
      },
    ])
    const prisma = { adminUser: { findMany } } as any

    const result = await listTeamAdmins(prisma)

    expect(result).toEqual({
      admins: [
        { id: 'super-1', email: 'owner@redeemo.com', name: 'Priya Owner', role: 'SUPER_ADMIN', isActive: true, createdAt, activeGrants: [] },
        { id: TARGET, email: 'f@r.com', name: 'Field Rep', role: 'FIELD', isActive: true, createdAt, activeGrants: ['approval:action'] },
      ],
    })
  })

  it('the underlying select NEVER includes passwordHash (curated select, wire-pin)', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { adminUser: { findMany } } as any

    await listTeamAdmins(prisma)

    expect(findMany).toHaveBeenCalledOnce()
    const call = findMany.mock.calls[0][0]
    expect(call.select).toBeDefined()
    expect(call.select.passwordHash).toBeUndefined()
    // Explicit allow-list check: only these top-level keys are selected.
    expect(Object.keys(call.select).sort()).toEqual(
      ['capabilityGrants', 'createdAt', 'email', 'firstName', 'id', 'isActive', 'lastName', 'role'].sort(),
    )
  })

  it('only reads ACTIVE (non-revoked) grants for the activeGrants list', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = { adminUser: { findMany } } as any

    await listTeamAdmins(prisma)

    const call = findMany.mock.calls[0][0]
    expect(call.select.capabilityGrants.where).toEqual({ revokedAt: null })
  })

  it('returns an empty admins array when there are no admin accounts', async () => {
    const prisma = { adminUser: { findMany: vi.fn().mockResolvedValue([]) } } as any
    expect(await listTeamAdmins(prisma)).toEqual({ admins: [] })
  })
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

// S3 (2026-07-10): the S1 interim "FIELD not yet assignable" guard is REMOVED —
// FIELD is now a fully assignable base role (its on-behalf caps are confined to
// pre-live merchants by the server-side scope guard, tested in prelive-scope.test.ts).
// A FIELD-assignment happy-path pin lives below so the removal stays intentional.
describe('FIELD role is assignable (S1 interim guard removed in S3)', () => {
  const ctx = { ipAddress: '1.1.1.1', userAgent: 'test' }

  it('createAdminAccount assigns role FIELD (reaches the email/create path, no interim 409)', async () => {
    const created = { id: 'new-field', email: 'rep@redeemo.com', firstName: 'R', lastName: 'Ep', role: 'FIELD', isActive: true, createdAt: new Date() }
    const tx = {
      adminUser: { create: vi.fn().mockResolvedValue(created) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const prisma = { adminUser: { findUnique: vi.fn().mockResolvedValue(null) }, ...makePrisma(tx) } as any
    const result = await createAdminAccount(prisma, 'super-1', { email: 'rep@redeemo.com', firstName: 'R', lastName: 'Ep', role: 'FIELD' }, ctx)
    expect(result.role).toBe('FIELD')
    expect(tx.adminUser.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'FIELD' }) }))
  })

  it('setAdminRole assigns role FIELD (reaches the update path, no interim 409)', async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'target-1', role: 'SUPPORT' }),
        update: vi.fn().mockResolvedValue({ id: 'target-1', email: 't@r.com', role: 'FIELD', isActive: true }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const prisma = makePrisma(tx)
    const updated = await setAdminRole(prisma, 'super-1', 'target-1', 'FIELD' as any, ctx)
    expect(updated.role).toBe('FIELD')
    expect(tx.adminUser.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'FIELD' } }))
  })
})

describe('last-SUPER_ADMIN lockout guard', () => {
  const ctx = { ipAddress: '1.1.1.1', userAgent: 'test' }

  it('setAdminRole REJECTS demoting the last active SUPER_ADMIN (LAST_SUPER_ADMIN_PROTECTED, 409)', async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'super-solo', role: 'SUPER_ADMIN' }),
        count: vi.fn().mockResolvedValue(0), // no OTHER active super
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    }
    await expect(setAdminRole(makePrisma(tx), 'super-solo', 'super-solo', 'OPERATIONS' as any, ctx)).rejects.toThrow('LAST_SUPER_ADMIN_PROTECTED')
    expect(tx.adminUser.update).not.toHaveBeenCalled()
  })

  it('setAdminRole ALLOWS demoting a SUPER_ADMIN when another active super exists', async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'super-2', role: 'SUPER_ADMIN' }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue({ id: 'super-2', email: 's2@r.com', role: 'OPERATIONS', isActive: true }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const r = await setAdminRole(makePrisma(tx), 'super-1', 'super-2', 'OPERATIONS' as any, ctx)
    expect(r.role).toBe('OPERATIONS')
  })

  it('setAdminRole does NOT count supers when the target is not a SUPER_ADMIN', async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ops-1', role: 'OPERATIONS' }),
        count: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'ops-1', email: 'o@r.com', role: 'FIELD', isActive: true }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    await setAdminRole(makePrisma(tx), 'super-1', 'ops-1', 'FIELD' as any, ctx)
    expect(tx.adminUser.count).not.toHaveBeenCalled()
  })

  it('deactivateAdmin REJECTS deactivating the last active SUPER_ADMIN', async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ id: 'super-2', role: 'SUPER_ADMIN', isActive: true }),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    }
    await expect(deactivateAdmin(makePrisma(tx), redis, 'super-1', 'super-2', ctx)).rejects.toThrow('LAST_SUPER_ADMIN_PROTECTED')
    expect(tx.adminUser.update).not.toHaveBeenCalled()
    expect(revokeAllSessionsForEntity).not.toHaveBeenCalled()
  })
})
