import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listMembers,
  inviteMember,
  updateMemberAccess,
  deactivateMember,
  reactivateMember,
  removeMember,
  resendInvite,
  type StaffServiceContext,
} from '../../../src/api/merchant/staff/service'

// Mock issueMerchantClaim so we can assert it is invoked without touching Redis.
vi.mock('../../../src/api/auth/merchant/service', () => ({
  issueMerchantClaim: vi.fn().mockResolvedValue(undefined),
}))
import { issueMerchantClaim } from '../../../src/api/auth/merchant/service'

const OWNER_CTX: StaffServiceContext = {
  adminId: 'owner-admin',
  merchantId: 'm1',
  role: 'OWNER',
  allBranches: true,
  allowedBranchIds: [],
  canManageVouchers: true,
}

const redis: any = { del: vi.fn(), keys: vi.fn().mockResolvedValue([]), set: vi.fn() }
const reqMeta = { ipAddress: '1.1.1.1', userAgent: 'x' }

// Build a prisma double. `resolveAdminMerchant` (owner-only) is satisfied by
// merchantMembership.findFirst; `resolveMerchantContext` (caller ctx) is passed
// in directly by the route, so the service only needs the merchant-scoped data.
function makePrisma(over: any = {}) {
  const tx: any = {
    merchantAdmin: {
      create: over.adminCreate ?? vi.fn().mockResolvedValue({ id: 'new-admin', email: 'new@x.com' }),
      update: over.adminUpdate ?? vi.fn().mockResolvedValue({}),
    },
    merchantMembership: {
      create: over.membershipCreate ?? vi.fn().mockResolvedValue({ id: 'new-mm' }),
      update: over.membershipUpdate ?? vi.fn().mockResolvedValue({}),
    },
    merchantMembershipBranch: {
      createMany: over.branchCreateMany ?? vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: over.branchDeleteMany ?? vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  const prisma: any = {
    // owner-only resolveAdminMerchant
    merchantMembership: {
      findFirst: over.membershipFindFirst ?? vi.fn().mockResolvedValue({
        id: 'owner-mm', merchantId: 'm1', merchantAdminId: 'owner-admin',
        merchant: { status: 'ACTIVE', businessName: 'X' },
      }),
      findMany: over.membershipFindMany ?? vi.fn().mockResolvedValue([]),
      create: tx.merchantMembership.create,
      update: tx.merchantMembership.update,
      count: over.membershipCount ?? vi.fn().mockResolvedValue(1),
    },
    merchantAdmin: {
      findUnique: over.adminFindUnique ?? vi.fn().mockResolvedValue(null),
      create: tx.merchantAdmin.create,
      update: tx.merchantAdmin.update,
    },
    merchantMembershipBranch: tx.merchantMembershipBranch,
    branch: { findMany: over.branchFindMany ?? vi.fn().mockResolvedValue([{ id: 'b1', merchantId: 'm1' }]) },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: tx.auditLog,
  }
  prisma.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma))
  return prisma
}

describe('B1 listMembers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns curated member rows (claimed derived, NO passwordHash)', async () => {
    const prisma = makePrisma({
      membershipFindFirst: vi.fn().mockResolvedValue({
        id: 'owner-mm', merchantId: 'm1', merchantAdminId: 'owner-admin',
        merchant: { status: 'ACTIVE', businessName: 'X' },
      }),
      membershipFindMany: vi.fn().mockResolvedValue([
        {
          id: 'mm1', role: 'OWNER', status: 'ACTIVE', canManageVouchers: false, allBranches: true,
          merchantAdmin: { id: 'a1', firstName: 'Owner', lastName: 'One', email: 'o@x.com', passwordHash: 'SECRET_HASH', lastLoginAt: null },
          branches: [],
        },
        {
          id: 'mm2', role: 'BRANCH_MANAGER', status: 'ACTIVE', canManageVouchers: true, allBranches: false,
          merchantAdmin: { id: 'a2', firstName: 'Mgr', lastName: 'Two', email: 'm@x.com', passwordHash: null, lastLoginAt: null },
          branches: [{ branchId: 'b1' }],
        },
      ]),
    })

    const rows = await listMembers(prisma, OWNER_CTX.adminId)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'mm1', role: 'OWNER', status: 'ACTIVE', claimed: true, canManageVouchers: false, allBranches: true, branchIds: [] })
    expect(rows[1]).toMatchObject({ id: 'mm2', role: 'BRANCH_MANAGER', claimed: false, canManageVouchers: true, allBranches: false, branchIds: ['b1'] })

    const json = JSON.stringify(rows)
    expect(json).not.toContain('passwordHash')
    expect(json).not.toContain('SECRET_HASH')
    expect(rows[0]).not.toHaveProperty('passwordHash')
  })

  it('excludes DELETED memberships from the query', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const prisma = makePrisma({ membershipFindMany: findMany })
    await listMembers(prisma, OWNER_CTX.adminId)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ merchantId: 'm1', status: { not: 'DELETED' } }) })
    )
  })
})

describe('B1 inviteMember', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => { delete process.env.EMAIL_ENABLED })

  const body = {
    email: 'invitee@x.com', firstName: 'In', lastName: 'Vitee', jobTitle: 'Cashier',
    role: 'STAFF' as const, allBranches: true,
  }

  it('creates admin (passwordHash:null) + membership + audit, then issues a claim', async () => {
    const prisma = makePrisma()
    const result = await inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta })

    expect(prisma.merchantAdmin.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'invitee@x.com', passwordHash: null }) })
    )
    expect(prisma.merchantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantId: 'm1', role: 'STAFF', status: 'ACTIVE', invitedById: 'owner-admin' }) })
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_INVITED', actorType: 'MERCHANT_ADMIN', actorId: 'owner-admin' }) })
    )
    expect(issueMerchantClaim).toHaveBeenCalled()
    expect(result.memberId).toBeDefined()
  })

  it('rejects EMAIL_ALREADY_EXISTS when the email already belongs to a MerchantAdmin (D5b)', async () => {
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({ id: 'existing-admin', email: 'invitee@x.com', memberships: [] }),
    })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('EMAIL_ALREADY_EXISTS')
    expect(prisma.merchantAdmin.create).not.toHaveBeenCalled()
  })

  it('only an OWNER caller may create an OWNER (role-elevation guard)', async () => {
    const prisma = makePrisma()
    const nonOwnerCtx: any = { ...OWNER_CTX, role: 'BRANCH_MANAGER', canManageVouchers: false, ...reqMeta }
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, { ...body, role: 'OWNER' as any }, nonOwnerCtx))
      .rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  it('only an OWNER caller may grant canManageVouchers (role-elevation guard)', async () => {
    const prisma = makePrisma()
    const nonOwnerCtx: any = { ...OWNER_CTX, role: 'BRANCH_MANAGER', canManageVouchers: false, ...reqMeta }
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, { ...body, role: 'BRANCH_MANAGER' as const, canManageVouchers: true }, nonOwnerCtx))
      .rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  it('Staff can never receive canManageVouchers (rejected even from an OWNER caller)', async () => {
    const prisma = makePrisma()
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, { ...body, role: 'STAFF' as const, canManageVouchers: true }, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  // Invite-delivery contract (non-secret status, never the token)
  it('inviteDelivery === EMAIL_DARK when EMAIL_ENABLED is unset', async () => {
    delete process.env.EMAIL_ENABLED
    const prisma = makePrisma()
    const result = await inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta })
    expect(result.inviteDelivery).toBe('EMAIL_DARK')
  })

  it('inviteDelivery === QUEUED when EMAIL_ENABLED === "true"', async () => {
    process.env.EMAIL_ENABLED = 'true'
    const prisma = makePrisma()
    const result = await inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta })
    expect(result.inviteDelivery).toBe('QUEUED')
  })

  it('NEVER returns a token / claimLink / claimToken in the response body', async () => {
    const prisma = makePrisma()
    const result: any = await inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta })
    expect(result).not.toHaveProperty('token')
    expect(result).not.toHaveProperty('claimLink')
    expect(result).not.toHaveProperty('claimToken')
    expect(JSON.stringify(result)).not.toMatch(/token/i)
  })

  // B2a: re-invite-after-remove (D5b x D6 interaction)
  it('B2a: re-invites a removed member (admin exists, membership DELETED for THIS merchant) by reactivating, not EMAIL_ALREADY_EXISTS', async () => {
    const membershipUpdate = vi.fn().mockResolvedValue({ id: 'old-mm' })
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({
        id: 'returning-admin', email: 'invitee@x.com',
        memberships: [{ id: 'old-mm', merchantId: 'm1', status: 'DELETED' }],
      }),
      membershipUpdate,
    })
    const result = await inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta })

    // Reactivates the existing membership rather than creating a fresh admin.
    expect(prisma.merchantAdmin.create).not.toHaveBeenCalled()
    expect(membershipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old-mm' }, data: expect.objectContaining({ status: 'ACTIVE', role: 'STAFF' }) })
    )
    expect(issueMerchantClaim).toHaveBeenCalled()
    expect(result.memberId).toBe('old-mm')
  })

  it('B2a: rejects re-invite when the existing membership for THIS merchant is ACTIVE', async () => {
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({
        id: 'a', email: 'invitee@x.com',
        memberships: [{ id: 'mmX', merchantId: 'm1', status: 'ACTIVE' }],
      }),
    })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('EMAIL_ALREADY_EXISTS')
  })

  it('B2a: rejects re-invite when the existing membership for THIS merchant is INACTIVE', async () => {
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({
        id: 'a', email: 'invitee@x.com',
        memberships: [{ id: 'mmI', merchantId: 'm1', status: 'INACTIVE' }],
      }),
    })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('EMAIL_ALREADY_EXISTS')
  })

  it('B2a: rejects re-invite when the admin belongs to a DIFFERENT merchant (multi-merchant deferred)', async () => {
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({
        id: 'a', email: 'invitee@x.com',
        memberships: [{ id: 'mmOther', merchantId: 'm-other', status: 'ACTIVE' }],
      }),
    })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('EMAIL_ALREADY_EXISTS')
  })

  it('B2a: rejects re-invite when the admin has a DELETED membership for a DIFFERENT merchant only', async () => {
    const prisma = makePrisma({
      adminFindUnique: vi.fn().mockResolvedValue({
        id: 'a', email: 'invitee@x.com',
        memberships: [{ id: 'mmOtherDel', merchantId: 'm-other', status: 'DELETED' }],
      }),
    })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, body, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('EMAIL_ALREADY_EXISTS')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B2 — edit / deactivate / reactivate / remove / resend
// ─────────────────────────────────────────────────────────────────────────────

// A target-member membership row the service loads before acting.
function targetMembership(over: any = {}) {
  return {
    id: 'mm-target', merchantId: 'm1', merchantAdminId: 'target-admin',
    role: 'STAFF', status: 'ACTIVE', allBranches: true, canManageVouchers: false,
    merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: 'HASH', firstName: 'T', lastName: 'X' },
    branches: [],
    ...over,
  }
}

function makePrismaWithTarget(target: any, over: any = {}) {
  const prisma = makePrisma(over)
  // The service loads the target membership by id (scoped to merchantId). Route to
  // a dedicated findUnique that the service uses for the target lookup.
  prisma.merchantMembership.findUnique = over.membershipFindUnique ?? vi.fn().mockResolvedValue(target)
  return prisma
}

describe('B2 deactivateMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status INACTIVE + revokes sessions + audits', async () => {
    const target = targetMembership()
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(2) })
    await deactivateMember(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta })

    expect(prisma.merchantMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mm-target' }, data: expect.objectContaining({ status: 'INACTIVE' }) })
    )
    expect(prisma.userSession.updateMany).toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_DEACTIVATED' }) })
    )
  })

  it('refuses to deactivate the last active OWNER (assertNotLastOwner)', async () => {
    const target = targetMembership({ role: 'OWNER' })
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(0) })
    await expect(deactivateMember(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('LAST_OWNER_PROTECTED')
    expect(prisma.merchantMembership.update).not.toHaveBeenCalled()
  })
})

describe('B2 reactivateMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status ACTIVE + audits', async () => {
    const target = targetMembership({ status: 'INACTIVE' })
    const prisma = makePrismaWithTarget(target)
    await reactivateMember(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta })
    expect(prisma.merchantMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mm-target' }, data: expect.objectContaining({ status: 'ACTIVE' }) })
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_REACTIVATED' }) })
    )
  })
})

describe('B2 removeMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status DELETED + revokes sessions + clears branch rows + audits', async () => {
    const target = targetMembership()
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(2) })
    await removeMember(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta })

    expect(prisma.merchantMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mm-target' }, data: expect.objectContaining({ status: 'DELETED' }) })
    )
    expect(prisma.merchantMembershipBranch.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { membershipId: 'mm-target' } })
    )
    expect(prisma.userSession.updateMany).toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_REMOVED' }) })
    )
  })

  it('refuses to remove the last active OWNER', async () => {
    const target = targetMembership({ role: 'OWNER' })
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(0) })
    await expect(removeMember(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('LAST_OWNER_PROTECTED')
    expect(prisma.merchantMembership.update).not.toHaveBeenCalled()
  })
})

describe('B2 updateMemberAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates role + canManageVouchers + audits before/after', async () => {
    const target = targetMembership({ role: 'STAFF' })
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(1) })
    await updateMemberAccess(prisma, redis, OWNER_CTX.adminId, 'mm-target', { role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: true }, { ...OWNER_CTX, ...reqMeta })

    expect(prisma.merchantMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mm-target' }, data: expect.objectContaining({ role: 'BRANCH_MANAGER', canManageVouchers: true }) })
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_ACCESS_UPDATED' }) })
    )
  })

  it('a non-owner caller is rejected (assertOwner upstream is in the route; service double-checks role-elevation)', async () => {
    const target = targetMembership({ role: 'STAFF' })
    const prisma = makePrismaWithTarget(target)
    const nonOwnerCtx: any = { ...OWNER_CTX, role: 'BRANCH_MANAGER', canManageVouchers: false, ...reqMeta }
    // A non-owner granting canManageVouchers / OWNER is refused server-side.
    await expect(updateMemberAccess(prisma, redis, OWNER_CTX.adminId, 'mm-target', { role: 'BRANCH_MANAGER', allBranches: true, canManageVouchers: true }, nonOwnerCtx))
      .rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  it('Staff can never be granted canManageVouchers via edit', async () => {
    const target = targetMembership({ role: 'STAFF' })
    const prisma = makePrismaWithTarget(target)
    await expect(updateMemberAccess(prisma, redis, OWNER_CTX.adminId, 'mm-target', { role: 'STAFF', allBranches: true, canManageVouchers: true }, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  it('refuses to demote the last active OWNER away from OWNER', async () => {
    const target = targetMembership({ role: 'OWNER' })
    const prisma = makePrismaWithTarget(target, { membershipCount: vi.fn().mockResolvedValue(0) })
    await expect(updateMemberAccess(prisma, redis, OWNER_CTX.adminId, 'mm-target', { role: 'STAFF', allBranches: true }, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('LAST_OWNER_PROTECTED')
  })
})

describe('B2 resendInvite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('re-issues a claim only when the member is unclaimed (passwordHash==null)', async () => {
    const target = targetMembership({ merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: null, firstName: 'T', lastName: 'X' } })
    const prisma = makePrismaWithTarget(target)
    await resendInvite(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta })
    expect(issueMerchantClaim).toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ event: 'MEMBER_INVITE_RESENT' }) })
    )
  })

  it('refuses to resend when the member has already claimed (passwordHash!=null)', async () => {
    // No `errors.ts` change is in chunk-1 scope, so an already-claimed member reuses
    // the existing ALREADY_VERIFIED (409): claiming sets emailVerified=true, so a
    // claimed member IS verified — semantically accurate and avoids a new code.
    const target = targetMembership({ merchantAdmin: { id: 'target-admin', email: 't@x.com', passwordHash: 'HASH', firstName: 'T', lastName: 'X' } })
    const prisma = makePrismaWithTarget(target)
    await expect(resendInvite(prisma, redis, OWNER_CTX.adminId, 'mm-target', { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow('ALREADY_VERIFIED')
    expect(issueMerchantClaim).not.toHaveBeenCalled()
  })

})

// SPECIFIC_BRANCHES_ENABLED gate. B7 FLIPPED it to TRUE now that branch-scope
// enforcement (B5 + B6) lands, so a scoped (allBranches:false) invite is now
// ACCEPTED: it creates the membership AND writes MerchantMembershipBranch scope
// rows for the requested branches (validated to belong to the merchant first).
describe('B1 inviteMember — SPECIFIC_BRANCHES gate (B7: enabled)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts a scoped (allBranches:false) invite and writes MerchantMembershipBranch rows', async () => {
    const scopedBody = {
      email: 'invitee@x.com', firstName: 'In', lastName: 'Vitee', jobTitle: 'Cashier',
      role: 'BRANCH_MANAGER' as const, allBranches: false, branchIds: ['b1'],
    }
    const prisma = makePrisma()
    const res = await inviteMember(prisma, redis, OWNER_CTX.adminId, scopedBody, { ...OWNER_CTX, ...reqMeta })
    expect(res.memberId).toBe('new-mm')
    // The membership is created with allBranches:false.
    expect(prisma.merchantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allBranches: false }) }),
    )
    // The branch-scope rows are written for the requested branch.
    expect(prisma.merchantMembershipBranch.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ membershipId: 'new-mm', branchId: 'b1' }] }),
    )
  })

  it('rejects a scoped invite whose branchId does not belong to the merchant (BRANCH_NOT_OWNED)', async () => {
    const scopedBody = {
      email: 'invitee2@x.com', firstName: 'In', lastName: 'Vitee', jobTitle: 'Cashier',
      role: 'BRANCH_MANAGER' as const, allBranches: false, branchIds: ['b-not-mine'],
    }
    // branch.findMany returns empty -> owned.length !== wantBranchIds.length -> reject.
    const prisma = makePrisma({ branchFindMany: vi.fn().mockResolvedValue([]) })
    await expect(inviteMember(prisma, redis, OWNER_CTX.adminId, scopedBody, { ...OWNER_CTX, ...reqMeta }))
      .rejects.toThrow(/BRANCH_NOT_OWNED/)
    expect(prisma.merchantMembership.create).not.toHaveBeenCalled()
  })
})
