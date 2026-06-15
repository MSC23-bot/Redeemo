import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import {
  createBranchCore,
  softDeleteBranchCore,
  createBranch,
  softDeleteBranch,
  toAdminBranchShape,
} from '../../../src/api/merchant/branch/service'

// Option B B2.4-core: real-DB proof of admin branch create + soft-delete via the
// shared seams - location resolves from the postcode, the create response is
// redacted, the soft-delete cascade is atomic, the guards hold, and the merchant
// wrapper still works (non-regression). Route auth/capability/strict-body are
// pinned by admin-branch-manage-routes.test.ts.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `b24-core-it-${Date.now()}`
const ADMIN_ID = `${PREFIX}-admin`
const ctx = { ipAddress: '127.0.0.1', userAgent: 'b24-core-test' }
let seq = 0

async function makeMerchant(name: string, status: 'ACTIVE' | 'REGISTERED' = 'ACTIVE') {
  const m = await prisma.merchant.create({ data: { businessName: `${PREFIX} ${name}`, status, isTestData: true } })
  const admin = await prisma.merchantAdmin.create({ data: { email: `${PREFIX}-${seq++}@example.com`, firstName: 'O', lastName: 'W' } })
  await prisma.merchantMembership.create({ data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' } })
  return { merchantId: m.id, ownerAdminId: admin.id }
}

async function makeBranch(merchantId: string, opts: { main: boolean; active?: boolean; pin?: string }) {
  const b = await prisma.branch.create({
    data: {
      merchantId, name: `${PREFIX} Branch ${seq++}`, isMainBranch: opts.main, isActive: opts.active ?? true,
      addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB', country: 'GB',
      locationConfidence: 'POSTCODE_CENTROID', redemptionPin: opts.pin ?? null,
    },
  })
  return b.id
}

beforeAll(async () => {
  await prisma.adminUser.create({ data: { id: ADMIN_ID, email: `${PREFIX}-adminuser@example.com`, passwordHash: 'x', firstName: 'B24', lastName: 'Branch', role: 'OPERATIONS' } })
})

afterAll(async () => {
  const merchantIds = (await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((b) => b.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...merchantIds, ...branchIds] } } })
    await prisma.branchUser.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('toAdminBranchShape (redaction, pure)', () => {
  it('NEVER includes redemptionPin or branch secrets', () => {
    const shaped = toAdminBranchShape({
      id: 'b', name: 'X', isMainBranch: false, addressLine1: '1 St', addressLine2: null, city: 'London',
      postcode: 'EC1A 1BB', localityName: 'City of London', locationConfidence: 'POSTCODE_CENTROID',
      phone: null, email: null, websiteUrl: null, isActive: true,
      // extra secrets the caller might pass; the shape must drop them:
      redemptionPin: 'REDPIN-SENTINEL', logoUrl: 'secret', bannerUrl: 'secret', about: 'secret',
    } as any)
    expect(JSON.stringify(shaped)).not.toContain('REDPIN-SENTINEL')
    expect(shaped).not.toHaveProperty('redemptionPin')
    expect(shaped).not.toHaveProperty('logoUrl')
  })
})

describe('createBranchCore (real DB)', () => {
  it('admin create: resolves postcode (POSTCODE_CENTROID), first branch is main, audits BRANCH_CREATED (entityType branch, actor ADMIN, reason)', async () => {
    const { merchantId } = await makeMerchant('CreateCo', 'REGISTERED')
    const branch = await createBranchCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'merchant onboarding help' } },
      { name: `${PREFIX} Main`, addressLine1: '1 Old Street', city: 'London', postcode: 'EC1A 1BB' },
      ctx,
    )
    expect(branch.isMainBranch).toBe(true) // first branch
    expect(branch.locationConfidence).toBe('POSTCODE_CENTROID')

    const audit = await prisma.auditLog.findFirst({ where: { entityId: branch.id, event: 'BRANCH_CREATED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.entityType).toBe('branch')
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('merchant onboarding help')

    // The redacted shape the route returns never carries redemptionPin.
    expect(toAdminBranchShape(branch as any)).not.toHaveProperty('redemptionPin')
  })
})

describe('softDeleteBranchCore (real DB)', () => {
  it('soft-deletes a non-main active branch + cascades branch-users to INACTIVE + audits (atomic)', async () => {
    const { merchantId } = await makeMerchant('DeleteCo')
    await makeBranch(merchantId, { main: true })
    const target = await makeBranch(merchantId, { main: false, active: true })
    await prisma.branchUser.create({ data: { branchId: target, email: `${PREFIX}-staff-${seq++}@example.com`, passwordHash: 'x', firstName: 'S', lastName: 'T', status: 'ACTIVE' } })

    const result = await softDeleteBranchCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'branch closed' } }, target, ctx)
    expect(result).toEqual({ ok: true })

    const branch = await prisma.branch.findUnique({ where: { id: target } })
    expect(branch?.deletedAt).not.toBeNull()
    expect(branch?.isActive).toBe(false)
    const staff = await prisma.branchUser.findMany({ where: { branchId: target } })
    expect(staff.every((s) => s.status === 'INACTIVE')).toBe(true)
    const audit = await prisma.auditLog.findFirst({ where: { entityId: target, event: 'BRANCH_DELETED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.entityType).toBe('branch')
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('branch closed')
  })

  it('BRANCH_IS_MAIN: rejects deleting the main branch', async () => {
    const { merchantId } = await makeMerchant('MainGuardCo')
    const main = await makeBranch(merchantId, { main: true })
    await makeBranch(merchantId, { main: false }) // a second so it is not last-active
    await expect(
      softDeleteBranchCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, main, ctx),
    ).rejects.toMatchObject({ code: 'BRANCH_IS_MAIN' })
  })

  it('BRANCH_LAST_ACTIVE: rejects deleting the last active branch of an ACTIVE merchant', async () => {
    const { merchantId } = await makeMerchant('LastActiveCo')
    await makeBranch(merchantId, { main: true })
    const second = await makeBranch(merchantId, { main: false, active: true })
    // Deactivate the main so only `second` is active; deleting it would leave zero.
    const branches = await prisma.branch.findMany({ where: { merchantId, isMainBranch: true } })
    await prisma.branch.update({ where: { id: branches[0].id }, data: { isActive: false } })
    await expect(
      softDeleteBranchCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, second, ctx),
    ).rejects.toMatchObject({ code: 'BRANCH_LAST_ACTIVE' })
  })

  it('BRANCH_NOT_FOUND for an unknown branch', async () => {
    const { merchantId } = await makeMerchant('NotFoundCo')
    await expect(
      softDeleteBranchCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, '00000000-0000-0000-0000-000000000000', ctx),
    ).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' })
  })
})

describe('merchant wrapper non-regression (real DB)', () => {
  it('createBranch + softDeleteBranch still work and audit actorType MERCHANT_ADMIN on the branch entity', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('WrapperCo')
    // main branch first
    await createBranch(prisma, ownerAdminId, { name: `${PREFIX} WMain`, addressLine1: '1 Old Street', city: 'London', postcode: 'EC1A 1BB' }, ctx)
    // a second branch to delete
    const second = await createBranch(prisma, ownerAdminId, { name: `${PREFIX} WSecond`, addressLine1: '2 Old Street', city: 'London', postcode: 'EC1A 1BB' }, ctx)

    const createAudit = await prisma.auditLog.findFirst({ where: { entityId: (second as any).id, event: 'BRANCH_CREATED' }, orderBy: { createdAt: 'desc' } })
    expect(createAudit?.entityType).toBe('branch')
    expect(createAudit?.actorType).toBe('MERCHANT_ADMIN')

    const del = await softDeleteBranch(prisma, ownerAdminId, (second as any).id, ctx)
    expect(del).toEqual({ ok: true })
    const delAudit = await prisma.auditLog.findFirst({ where: { entityId: (second as any).id, event: 'BRANCH_DELETED' }, orderBy: { createdAt: 'desc' } })
    expect(delAudit?.actorType).toBe('MERCHANT_ADMIN')
  }, 30000) // two live postcode resolves + a delete exceed the default 5s
})
