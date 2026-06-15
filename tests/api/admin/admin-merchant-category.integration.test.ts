import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { setMerchantCategoryCore, updateMerchantProfile } from '../../../src/api/merchant/profile/service'

// Option B B2.3-core: real-DB proof that the admin category path (via the shared
// setMerchantCategoryCore seam) provisions/changes correctly with actor-attributed
// audit, and that the merchant wrapper still works (non-regression). Route auth /
// capability / strict-body are pinned by admin-merchant-category-routes.test.ts.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `b23-core-it-${Date.now()}`
const ADMIN_ID = `${PREFIX}-admin`
const ctx = { ipAddress: '127.0.0.1', userAgent: 'b23-core-test' }
let seq = 0
let catA = ''
let catB = ''
let catNone = ''

let templateSeq = 0
async function addTemplate(categoryId: string) {
  // RmvTemplate has a unique (categoryId, title), so titles must be distinct.
  await prisma.rmvTemplate.create({
    data: { categoryId, voucherType: 'DISCOUNT_FIXED', title: `T-${templateSeq++}`, description: 'D', allowedFields: [], minimumSaving: 5, isActive: true },
  })
}

async function makeMerchant(name: string, primaryCategoryId: string | null) {
  const m = await prisma.merchant.create({
    data: { businessName: `${PREFIX} ${name}`, status: 'ACTIVE', isTestData: true, primaryCategoryId },
  })
  const admin = await prisma.merchantAdmin.create({
    data: { email: `${PREFIX}-${seq++}@example.com`, firstName: 'O', lastName: 'W' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  return { merchantId: m.id, ownerAdminId: admin.id }
}

async function addRmv(merchantId: string, status: 'DRAFT' | 'ACTIVE') {
  await prisma.voucher.create({
    data: { merchantId, code: `${PREFIX}-${seq++}`, type: 'DISCOUNT_FIXED', title: 'RMV', estimatedSaving: 5, isRmv: true, isMandatory: true, status, isTestData: true },
  })
}

beforeAll(async () => {
  await prisma.adminUser.create({
    data: { id: ADMIN_ID, email: `${PREFIX}-adminuser@example.com`, passwordHash: 'x', firstName: 'B23', lastName: 'Cat', role: 'OPERATIONS' },
  })
  const a = await prisma.category.create({ data: { name: `${PREFIX} CatA`, isActive: true } })
  const b = await prisma.category.create({ data: { name: `${PREFIX} CatB`, isActive: true } })
  const none = await prisma.category.create({ data: { name: `${PREFIX} CatNone`, isActive: true } })
  catA = a.id; catB = b.id; catNone = none.id
  await addTemplate(catA); await addTemplate(catA) // 2 active -> eligible
  await addTemplate(catB); await addTemplate(catB)
  // catNone: no templates
})

afterAll(async () => {
  const merchantIds = (await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })).map((m) => m.id)
  if (merchantIds.length) {
    const branchIds = (await prisma.branch.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((b) => b.id)
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...merchantIds, ...branchIds] } } })
    await prisma.voucher.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  const catIds = (await prisma.category.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })).map((c) => c.id)
  if (catIds.length) {
    await prisma.rmvTemplate.deleteMany({ where: { categoryId: { in: catIds } } })
    await prisma.category.deleteMany({ where: { id: { in: catIds } } })
  }
  await prisma.$disconnect()
}, 60000)

describe('setMerchantCategoryCore (real DB)', () => {
  it('first-set: provisions exactly 2 DRAFT RMVs + RMV_PROVISIONED & MERCHANT_PROFILE_UPDATED audit (actor ADMIN)', async () => {
    const { merchantId } = await makeMerchant('FirstSet', null)
    const result = await setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'onboarding correction' } }, catA, false, ctx)
    expect(result).toEqual({ provisioned: true })

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
    expect(merchant?.primaryCategoryId).toBe(catA)
    const rmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true } })
    expect(rmvs).toHaveLength(2)
    expect(rmvs.every((v) => v.isMandatory && v.status === 'DRAFT')).toBe(true)

    const events = (await prisma.auditLog.findMany({ where: { entityId: merchantId } })).map((a) => ({ event: a.event, actorType: a.actorType, reason: a.reason }))
    expect(events).toContainEqual({ event: 'RMV_PROVISIONED', actorType: 'ADMIN', reason: 'onboarding correction' })
    expect(events).toContainEqual({ event: 'MERCHANT_PROFILE_UPDATED', actorType: 'ADMIN', reason: 'onboarding correction' })
  })

  it('change confirm:false returns requiresConfirmation; nothing written', async () => {
    const { merchantId } = await makeMerchant('PreviewChange', catA)
    await addRmv(merchantId, 'DRAFT')
    const result = await setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'wrong cat' } }, catB, false, ctx)
    expect((result as any).requiresConfirmation).toBe(true)

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
    expect(merchant?.primaryCategoryId).toBe(catA) // unchanged
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'CATEGORY_CHANGED' } })
    expect(audit).toBeNull()
  })

  it('change confirm:true discards DRAFT RMVs, reprovisions, CATEGORY_CHANGED audit (actor ADMIN, before/after)', async () => {
    const { merchantId } = await makeMerchant('ApplyChange', catA)
    await addRmv(merchantId, 'DRAFT')
    const result = await setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'recategorise' } }, catB, true, ctx)
    expect(result).toEqual({ changed: true })

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
    expect(merchant?.primaryCategoryId).toBe(catB)
    const draftRmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true, status: 'DRAFT' } })
    expect(draftRmvs).toHaveLength(2) // the 2 freshly provisioned
    const inactiveRmvs = await prisma.voucher.findMany({ where: { merchantId, isRmv: true, status: 'INACTIVE' } })
    expect(inactiveRmvs.length).toBeGreaterThanOrEqual(1) // the old DRAFT discarded

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'CATEGORY_CHANGED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('recategorise')
    expect(audit?.before).toMatchObject({ primaryCategoryId: catA })
    expect(audit?.after).toMatchObject({ primaryCategoryId: catB })
  })

  it('change is BLOCKED (CATEGORY_CHANGE_BLOCKED) when an RMV is ACTIVE', async () => {
    const { merchantId } = await makeMerchant('LiveBlocked', catA)
    await addRmv(merchantId, 'ACTIVE')
    await expect(
      setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, catB, true, ctx),
    ).rejects.toMatchObject({ code: 'CATEGORY_CHANGE_BLOCKED' })
  })

  it('first-set to a template-less category rejects NO_RMV_TEMPLATE with no partial write', async () => {
    const { merchantId } = await makeMerchant('NoTemplate', null)
    await expect(
      setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, catNone, false, ctx),
    ).rejects.toMatchObject({ code: 'NO_RMV_TEMPLATE' })
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
    expect(merchant?.primaryCategoryId).toBeNull() // rolled back
  })

  it('same category is a no-op (unchanged), no audit', async () => {
    const { merchantId } = await makeMerchant('SameCat', catA)
    const result = await setMerchantCategoryCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, catA, false, ctx)
    expect(result).toEqual({ unchanged: true })
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId } })
    expect(audit).toBeNull()
  })

  it('merchant wrapper path still provisions + audits actorType MERCHANT_ADMIN (non-regression)', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('WrapperFirstSet', null)
    await updateMerchantProfile(prisma, ownerAdminId, { primaryCategoryId: catA }, ctx)

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { primaryCategoryId: true } })
    expect(merchant?.primaryCategoryId).toBe(catA)
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_PROFILE_UPDATED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.actorType).toBe('MERCHANT_ADMIN')
  })
})
