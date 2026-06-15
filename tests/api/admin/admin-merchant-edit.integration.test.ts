import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { updateMerchantProfileDirectCore, updateMerchantProfile } from '../../../src/api/merchant/profile/service'
import { updateBranchDirectCore, updateBranch } from '../../../src/api/merchant/branch/service'

// Option B B2.1: real-DB proof that the admin direct-edit-on-behalf path and the
// merchant direct-edit path run the SAME shared core, with identical apply +
// transactional actor audit (no weaker path). We exercise the service cores +
// the merchant wrappers directly (the route auth/capability/strict-body gating is
// pinned by the sibling mock test admin-merchant-edit-routes.test.ts).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = 'b2-admin-edit'
const ctx = { ipAddress: '127.0.0.1', userAgent: 'b2-admin-edit-test' }
const ADMIN_ID = 'b2-admin-edit-admin-id'
let seq = 0

/** A merchant + ACTIVE OWNER membership so the merchant-wrapper resolves ownership. */
async function makeMerchant(businessName: string, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${businessName}`, status, isTestData: true },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}-${Date.now()}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  return { merchantId: m.id, ownerAdminId: admin.id }
}

async function makeBranch(merchantId: string, name: string) {
  const b = await prisma.branch.create({
    data: {
      merchantId,
      name: `${PREFIX} ${name}`,
      isMainBranch: true,
      addressLine1: '1 Old Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      isActive: true,
      phone: '+441110000000',
      locationConfidence: 'POSTCODE_CENTROID',
      localityName: 'City of London',
    },
  })
  return b.id
}

beforeAll(async () => {
  await prisma.adminUser.create({
    data: {
      id: ADMIN_ID,
      email: `${PREFIX}-admin-${Date.now()}@example.com`,
      passwordHash: 'x',
      firstName: 'B2',
      lastName: 'Editor',
      role: 'OPERATIONS',
    },
  })
})

afterAll(async () => {
  // BULK prefix-scoped cleanup (self-healing). FK order: audit + branches + memberships
  // before merchants + owners. One deleteMany per table, not per-merchant.
  const merchantIds = (
    await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })
  ).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (
      await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })
    ).map((b) => b.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...merchantIds, ...branchIds] } } })
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('B2.1: admin direct-edit-on-behalf (merchant, real DB)', () => {
  it('admin sets merchant websiteUrl; applied + ADMIN before/after/reason audit', async () => {
    const { merchantId } = await makeMerchant('Merchant Site Co')

    await updateMerchantProfileDirectCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'merchant phoned support' } },
      { websiteUrl: 'https://admin-set.example.com' },
      ctx,
    )

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.websiteUrl).toBe('https://admin-set.example.com')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_PROFILE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.reason).toBe('merchant phoned support')
    expect(audit?.before).toMatchObject({ websiteUrl: null })
    expect(audit?.after).toMatchObject({ websiteUrl: 'https://admin-set.example.com' })
  })

  it('admin can edit a SUSPENDED merchant (with reason); edit applies, status stays SUSPENDED', async () => {
    const { merchantId } = await makeMerchant('Suspended Co', 'SUSPENDED')

    await updateMerchantProfileDirectCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'operational correction while suspended' } },
      { websiteUrl: 'https://suspended-fix.example.com' },
      ctx,
    )

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.websiteUrl).toBe('https://suspended-fix.example.com')
    expect(merchant?.status).toBe('SUSPENDED')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_PROFILE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('operational correction while suspended')
  })

  it('merchant wrapper path still applies + now audits actorType MERCHANT_ADMIN', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('Wrapper Merchant Co')

    await updateMerchantProfile(
      prisma,
      ownerAdminId,
      { websiteUrl: 'https://merchant-self-set.example.com' },
      ctx,
    )

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.websiteUrl).toBe('https://merchant-self-set.example.com')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_PROFILE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.actorType).toBe('MERCHANT_ADMIN')
    expect(audit?.actorId).toBe(ownerAdminId)
  })
})

describe('B2.1: admin direct-edit-on-behalf (branch, real DB)', () => {
  it('admin sets branch phone + isActive; applied + branch-entity ADMIN audit', async () => {
    const { merchantId } = await makeMerchant('Branch Edit Co')
    const branchId = await makeBranch(merchantId, 'Edit Branch')

    await updateBranchDirectCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'branch closed temporarily' } },
      branchId,
      { phone: '+441119999999', isActive: false },
      ctx,
    )

    const branch = await prisma.branch.findUnique({ where: { id: branchId } })
    expect(branch?.phone).toBe('+441119999999')
    expect(branch?.isActive).toBe(false)

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: branchId, event: 'BRANCH_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.entityType).toBe('branch')
    expect(audit?.entityId).toBe(branchId)
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.reason).toBe('branch closed temporarily')
    expect(audit?.before).toMatchObject({ phone: '+441110000000', isActive: true })
    expect(audit?.after).toMatchObject({ phone: '+441119999999', isActive: false })
  })

  it('merchant wrapper branch path still applies + now audits actorType MERCHANT_ADMIN on the branch entity', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('Wrapper Branch Co')
    const branchId = await makeBranch(merchantId, 'Wrapper Branch')

    await updateBranch(
      prisma,
      ownerAdminId,
      branchId,
      { phone: '+441118888888' },
      ctx,
    )

    const branch = await prisma.branch.findUnique({ where: { id: branchId } })
    expect(branch?.phone).toBe('+441118888888')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: branchId, event: 'BRANCH_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.entityType).toBe('branch')
    expect(audit?.actorType).toBe('MERCHANT_ADMIN')
    expect(audit?.actorId).toBe(ownerAdminId)
  })
})

// Option B B2.2: the admin identity edit reuses the SAME shared core, tagged with
// the distinct MERCHANT_IDENTITY_UPDATED event (passed via the core's optional
// event param). Route auth / capability / confirm / strict-body / 404 are pinned
// by the sibling mock test admin-merchant-edit-routes.test.ts.
describe('B2.2: admin identity edit on-behalf (real DB)', () => {
  it('admin sets vat/company; applied + MERCHANT_IDENTITY_UPDATED before/after/reason audit (ADMIN)', async () => {
    const { merchantId } = await makeMerchant('Identity Edit Co')

    await updateMerchantProfileDirectCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'companies house correction' } },
      { vatNumber: 'GB424242', companyNumber: '87654321' },
      ctx,
      'MERCHANT_IDENTITY_UPDATED',
    )

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.vatNumber).toBe('GB424242')
    expect(merchant?.companyNumber).toBe('87654321')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_IDENTITY_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.actorId).toBe(ADMIN_ID)
    expect(audit?.reason).toBe('companies house correction')
    expect(audit?.before).toMatchObject({ vatNumber: null, companyNumber: null })
    expect(audit?.after).toMatchObject({ vatNumber: 'GB424242', companyNumber: '87654321' })
    // The distinct event must NOT also write a MERCHANT_PROFILE_UPDATED row.
    const profileEvt = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_PROFILE_UPDATED' },
    })
    expect(profileEvt).toBeNull()
  })

  it('admin can edit a SUSPENDED merchant identity; edit applies, status stays SUSPENDED', async () => {
    const { merchantId } = await makeMerchant('Suspended Identity Co', 'SUSPENDED')

    await updateMerchantProfileDirectCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'operational identity correction' } },
      { vatNumber: 'GB999000' },
      ctx,
      'MERCHANT_IDENTITY_UPDATED',
    )

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(merchant?.vatNumber).toBe('GB999000')
    expect(merchant?.status).toBe('SUSPENDED')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: merchantId, event: 'MERCHANT_IDENTITY_UPDATED' },
      orderBy: { createdAt: 'desc' },
    })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('operational identity correction')
  })
})
