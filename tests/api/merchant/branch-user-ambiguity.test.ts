import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resetBranchUserPassword,
  deactivateBranchUser,
  reactivateBranchUser,
  listBranchAppUsers,
} from '../../../src/api/auth/merchant/branch-user.service'

// Task B4 (spec §5.3): the reset/deactivate/reactivate app-user mutations select
// their target via the branch only. When a branch has >1 BranchUser the old
// `findFirst({where:{branchId}})` acted on a NON-DETERMINISTIC row. The guard
// counts (take:2) inside a $transaction and REFUSES with MULTIPLE_BRANCH_USERS,
// mutating nothing, when there is more than one row.

// A prisma double whose $transaction passes the SAME mock as the tx client, and
// whose branchUser.findMany returns the configured rows. resolveAdminMerchant
// (assertBranchOwnership) is satisfied via merchantMembership.findFirst + branch.
const makePrisma = (over: {
  branchUserRows?: Array<{ id: string }>
  branchUserListRows?: any[]
  merchantId?: string
} = {}) => {
  const merchantId = over.merchantId ?? 'm1'
  const update = vi.fn().mockResolvedValue({ id: 'bu1' })
  const prisma: any = {
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'mm1', merchantId, merchantAdminId: 'ma1',
        merchant: { status: 'ACTIVE', businessName: 'X' },
      }),
    },
    branch: {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', merchantId }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Main', merchantId },
      ]),
    },
    branchUser: {
      findMany: vi.fn().mockResolvedValue(over.branchUserRows ?? over.branchUserListRows ?? []),
      update,
    },
    userSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prisma.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma))
  return { prisma, update }
}

const redis: any = {
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockResolvedValue([]),
}

const baseData = { merchantAdminId: 'ma1', branchId: 'b1', ipAddress: '1.1.1.1', userAgent: 'x' }

describe('B4 findFirst-ambiguity guard', () => {
  beforeEach(() => vi.clearAllMocks())

  // (a) 2 rows -> refuse, mutate nothing
  it('resetBranchUserPassword refuses MULTIPLE_BRANCH_USERS and mutates nothing when a branch has 2 app users', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [{ id: 'bu1' }, { id: 'bu2' }] })
    await expect(resetBranchUserPassword(prisma, redis, baseData)).rejects.toThrow('MULTIPLE_BRANCH_USERS')
    expect(update).not.toHaveBeenCalled()
  })

  it('deactivateBranchUser refuses MULTIPLE_BRANCH_USERS and mutates nothing when a branch has 2 app users', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [{ id: 'bu1' }, { id: 'bu2' }] })
    await expect(deactivateBranchUser(prisma, redis, baseData)).rejects.toThrow('MULTIPLE_BRANCH_USERS')
    expect(update).not.toHaveBeenCalled()
  })

  it('reactivateBranchUser refuses MULTIPLE_BRANCH_USERS and mutates nothing when a branch has 2 app users', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [{ id: 'bu1' }, { id: 'bu2' }] })
    await expect(reactivateBranchUser(prisma, redis, baseData)).rejects.toThrow('MULTIPLE_BRANCH_USERS')
    expect(update).not.toHaveBeenCalled()
  })

  // (b) exactly 1 -> acts on that row's id
  it('reactivateBranchUser acts on the single row id when a branch has exactly 1 app user', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [{ id: 'buX' }] })
    await reactivateBranchUser(prisma, redis, baseData)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'buX' } }))
  })

  it('deactivateBranchUser acts on the single row id when a branch has exactly 1 app user', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [{ id: 'buY' }] })
    await deactivateBranchUser(prisma, redis, baseData)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'buY' } }))
  })

  // (c) 0 -> BRANCH_USER_NOT_FOUND
  it('resetBranchUserPassword throws BRANCH_USER_NOT_FOUND when a branch has no app user', async () => {
    const { prisma, update } = makePrisma({ branchUserRows: [] })
    await expect(resetBranchUserPassword(prisma, redis, baseData)).rejects.toThrow('BRANCH_USER_NOT_FOUND')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('B4 listBranchAppUsers', () => {
  beforeEach(() => vi.clearAllMocks())

  // (d) curated list with per-branch appUserCount, never passwordHash
  it('returns app users grouped by branch with a per-branch appUserCount and NO passwordHash', async () => {
    const prisma: any = {
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Second' },
        ]),
      },
      branchUser: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'u1', branchId: 'b1', firstName: 'Ann', lastName: 'Lee', jobTitle: 'Manager', email: 'a@x.com', status: 'ACTIVE', lastLoginAt: null },
          { id: 'u2', branchId: 'b1', firstName: 'Bo', lastName: 'Tan', jobTitle: null, email: 'b@x.com', status: 'ACTIVE', lastLoginAt: null },
          { id: 'u3', branchId: 'b2', firstName: 'Cy', lastName: 'Ng', jobTitle: null, email: 'c@x.com', status: 'INACTIVE', lastLoginAt: null },
        ]),
      },
    }

    const result = await listBranchAppUsers(prisma, 'm1')

    expect(result.branches).toHaveLength(2)
    const b1 = result.branches.find((b) => b.branchId === 'b1')!
    expect(b1.branchName).toBe('Main')
    expect(b1.appUserCount).toBe(2)
    expect(b1.users).toHaveLength(2)

    const b2 = result.branches.find((b) => b.branchId === 'b2')!
    expect(b2.appUserCount).toBe(1)

    // Curated select: the BranchUser findMany must never request passwordHash, and
    // no user object exposes it.
    const json = JSON.stringify(result)
    expect(json).not.toContain('passwordHash')
    expect(b1.users[0]).toMatchObject({ id: 'u1', branchId: 'b1', firstName: 'Ann', email: 'a@x.com', status: 'ACTIVE' })
    expect(b1.users[0]).not.toHaveProperty('passwordHash')

    // Only the merchant's branches are queried.
    expect(prisma.branchUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branch: { merchantId: 'm1' } }),
        select: expect.not.objectContaining({ passwordHash: true }),
      })
    )
  })
})
