import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  softDeleteBranch,
  listBranches,
  getBranch,
  getBranchPin,
} from '../../../src/api/merchant/branch/service'

// §BRANCHDEL — real-DB coverage for Branch soft-delete. The whole soft-delete
// surface was previously tested ONLY by mocks (which ignore the `deletedAt`
// argument), which is exactly why the missing column went unnoticed. This block
// runs the service against Neon to pin: the column exists; softDeleteBranch
// writes deletedAt + isActive=false; reads exclude soft-deleted branches; the
// main-branch and last-active guards still fire; and history is preserved
// (the row + its branch users survive — soft, not hard, delete).

describe('§BRANCHDEL — Branch soft-delete (real DB)', () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  const ctx = { ipAddress: '127.0.0.1', userAgent: 'vitest' }

  let merchantId: string
  let adminId: string
  let branchMainId: string // main branch
  let branchAId: string    // secondary, used for the last-active guard
  let branchBId: string    // secondary, soft-deleted in test 1
  let branchUserBId: string

  beforeAll(async () => {
    const m = await prisma.merchant.create({
      data: { businessName: 'TEST §BRANCHDEL-softdelete', status: 'ACTIVE', isTestData: true },
    })
    merchantId = m.id
    const a = await prisma.merchantAdmin.create({
      data: { email: `branchdel-${Date.now()}@example.com`, passwordHash: 'p', firstName: 'T', lastName: 'BD' },
    })
    adminId = a.id
    await prisma.merchantMembership.create({
      data: { merchantId, merchantAdminId: adminId, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
    })

    const branchData = (name: string, isMain: boolean) => ({
      merchantId, name, isMainBranch: isMain, isActive: true, isTestData: true,
      addressLine1: '1 Test St', city: 'Testville', postcode: 'TS1 1AA',
    })
    branchMainId = (await prisma.branch.create({ data: branchData('Main', true) })).id
    branchAId    = (await prisma.branch.create({ data: branchData('Secondary A', false) })).id
    branchBId    = (await prisma.branch.create({ data: branchData('Secondary B', false) })).id

    // A branch user on B — softDeleteBranch deactivates (not deletes) branch users.
    branchUserBId = (await prisma.branchUser.create({
      data: { branchId: branchBId, email: `bu-${Date.now()}@example.com`, passwordHash: 'p', firstName: 'B', lastName: 'U' },
    })).id
  })

  afterAll(async () => {
    await prisma.branchUser.deleteMany({ where: { branch: { merchantId } } })
    await prisma.auditLog.deleteMany({ where: { entityId: merchantId } }).catch(() => {})
    await prisma.branch.deleteMany({ where: { merchantId } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId } })
    await prisma.merchantAdmin.deleteMany({ where: { id: adminId } })
    await prisma.merchant.delete({ where: { id: merchantId } })
    await prisma.$disconnect()
  })

  it('softDeleteBranch writes deletedAt + isActive=false, preserves the row, and deactivates (not deletes) its branch users', async () => {
    const result = await softDeleteBranch(prisma, adminId, branchBId, ctx)
    expect(result).toEqual({ ok: true })

    // Soft, not hard: the row still exists, with deletedAt set + isActive false.
    const b = await prisma.branch.findUnique({ where: { id: branchBId } })
    expect(b).not.toBeNull()
    expect(b!.deletedAt).not.toBeNull()
    expect(b!.isActive).toBe(false)

    // History preserved: the branch user is deactivated, not cascade-deleted.
    const bu = await prisma.branchUser.findUnique({ where: { id: branchUserBId } })
    expect(bu).not.toBeNull()
    expect(bu!.status).toBe('INACTIVE')
  })

  it('listBranches excludes the soft-deleted branch', async () => {
    const list = await listBranches(prisma, adminId)
    const ids = list.map((b) => b.id)
    expect(ids).toContain(branchMainId)
    expect(ids).toContain(branchAId)
    expect(ids).not.toContain(branchBId)
  })

  it('getBranch on a soft-deleted branch throws BRANCH_NOT_FOUND', async () => {
    await expect(getBranch(prisma, adminId, branchBId)).rejects.toThrow('BRANCH_NOT_FOUND')
  })

  it('getBranchPin on a soft-deleted branch throws BRANCH_NOT_FOUND', async () => {
    await expect(getBranchPin(prisma, adminId, branchBId)).rejects.toThrow('BRANCH_NOT_FOUND')
  })

  it('main-branch guard still prevents deleting the main branch (BRANCH_IS_MAIN)', async () => {
    await expect(softDeleteBranch(prisma, adminId, branchMainId, ctx)).rejects.toThrow('BRANCH_IS_MAIN')
    // unchanged
    const main = await prisma.branch.findUnique({ where: { id: branchMainId } })
    expect(main!.deletedAt).toBeNull()
  })

  it('last-active-branch guard still fires for a live merchant (BRANCH_LAST_ACTIVE)', async () => {
    // After B was soft-deleted, deactivate the main so only A remains active (count = 1).
    await prisma.branch.update({ where: { id: branchMainId }, data: { isActive: false } })
    await expect(softDeleteBranch(prisma, adminId, branchAId, ctx)).rejects.toThrow('BRANCH_LAST_ACTIVE')
    // A is not deleted by the blocked call.
    const a = await prisma.branch.findUnique({ where: { id: branchAId } })
    expect(a!.deletedAt).toBeNull()
  })
})
