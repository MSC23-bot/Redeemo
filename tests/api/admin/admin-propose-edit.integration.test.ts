import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { createMerchantEditRequestCore, createMerchantEditRequest } from '../../../src/api/merchant/profile/service'
import { approveEdit } from '../../../src/api/admin/approvals/editApplier'

// Option B B2.5-core: real-DB proof that an admin propose routes into the B1
// pending-edit lane (atomic MerchantPendingEdit + AdminApproval + actor audit),
// and that the EXISTING B1 applier then applies it end-to-end (the headline pin).
// Route auth/capability/strict-body are pinned by admin-propose-edit-routes.test.ts.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const dummyRedis = {} as any

const PREFIX = `b25-core-it-${Date.now()}`
const ADMIN_ID = `${PREFIX}-admin`
const ctx = { ipAddress: '127.0.0.1', userAgent: 'b25-core-test' }
let seq = 0

async function makeMerchant(name: string) {
  const m = await prisma.merchant.create({ data: { businessName: `${PREFIX} ${name}`, status: 'ACTIVE', isTestData: true } })
  const admin = await prisma.merchantAdmin.create({ data: { email: `${PREFIX}-${seq++}@example.com`, firstName: 'O', lastName: 'W' } })
  await prisma.merchantMembership.create({ data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' } })
  return { merchantId: m.id, ownerAdminId: admin.id }
}

beforeAll(async () => {
  await prisma.adminUser.create({ data: { id: ADMIN_ID, email: `${PREFIX}-adminuser@example.com`, passwordHash: 'x', firstName: 'B25', lastName: 'Propose', role: 'OPERATIONS' } })
})

afterAll(async () => {
  const merchantIds = (await prisma.merchant.findMany({ where: { businessName: { startsWith: PREFIX } }, select: { id: true } })).map((m) => m.id)
  // AdminApproval has no FK to the merchant; clear by reference to the pending edits.
  const editIds = (await prisma.merchantPendingEdit.findMany({ where: { merchantId: { in: merchantIds } }, select: { id: true } })).map((e) => e.id)
  if (editIds.length) await prisma.adminApproval.deleteMany({ where: { referenceId: { in: editIds } } })
  if (merchantIds.length) {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: merchantIds } } })
    await prisma.merchantPendingEdit.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchantMembership.deleteMany({ where: { merchantId: { in: merchantIds } } })
    await prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } })
  }
  await prisma.merchantAdmin.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.$disconnect()
}, 60000)

describe('createMerchantEditRequestCore (admin propose, real DB)', () => {
  it('atomically creates a PendingEdit + AdminApproval(admin-comment) + actor ADMIN audit', async () => {
    const { merchantId } = await makeMerchant('ProposeCo')
    const pe = await createMerchantEditRequestCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'companies house rename' } },
      { businessName: `${PREFIX} Rebrand` },
      ctx,
    )
    const edit = await prisma.merchantPendingEdit.findUnique({ where: { id: pe.id } })
    expect(edit?.status).toBe('PENDING')
    expect((edit?.proposedChanges as any).businessName).toBe(`${PREFIX} Rebrand`)

    const approval = await prisma.adminApproval.findFirst({ where: { referenceId: pe.id, type: 'MERCHANT_IDENTITY_EDIT' } })
    expect(approval?.status).toBe('PENDING')
    expect(approval?.comment).toMatch(/Admin-proposed/)
    expect(approval?.comment).toMatch(/companies house rename/)

    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_EDIT_REQUEST_CREATED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.actorType).toBe('ADMIN')
    expect(audit?.reason).toBe('companies house rename')
  })

  it('end-to-end: admin propose -> B1 approveEdit APPLIES the new businessName (round-trip)', async () => {
    const { merchantId } = await makeMerchant('RoundtripCo')
    const newName = `${PREFIX} Applied Name`
    const pe = await createMerchantEditRequestCore(
      prisma,
      { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'rename' } },
      { businessName: newName },
      ctx,
    )
    const approval = await prisma.adminApproval.findFirst({ where: { referenceId: pe.id, type: 'MERCHANT_IDENTITY_EDIT' } })

    // The EXISTING B1 applier (shipped #244) applies the admin-proposed edit unchanged.
    await approveEdit(prisma, dummyRedis, approval!.id, ADMIN_ID, ctx)

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { businessName: true } })
    expect(merchant?.businessName).toBe(newName)
    const after = await prisma.adminApproval.findUnique({ where: { id: approval!.id }, select: { status: true } })
    expect(after?.status).toBe('APPROVED')
  })

  it('PENDING_EDIT_EXISTS: a second propose while one is pending rejects', async () => {
    const { merchantId } = await makeMerchant('DupeCo')
    await createMerchantEditRequestCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, { businessName: `${PREFIX} A` }, ctx)
    await expect(
      createMerchantEditRequestCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'y' } }, { businessName: `${PREFIX} B` }, ctx),
    ).rejects.toMatchObject({ code: 'PENDING_EDIT_EXISTS' })
  })

  it('NO_SENSITIVE_FIELDS: a propose with no sensitive field rejects', async () => {
    const { merchantId } = await makeMerchant('EmptyCo')
    await expect(
      createMerchantEditRequestCore(prisma, { merchantId, actor: { type: 'ADMIN', id: ADMIN_ID, reason: 'x' } }, {}, ctx),
    ).rejects.toMatchObject({ code: 'NO_SENSITIVE_FIELDS' })
  })

  it('merchant wrapper non-regression: createMerchantEditRequest still works + audits MERCHANT_ADMIN', async () => {
    const { merchantId, ownerAdminId } = await makeMerchant('WrapperCo')
    const pe = await createMerchantEditRequest(prisma, ownerAdminId, { tradingName: `${PREFIX} Trade` }, ctx)
    const edit = await prisma.merchantPendingEdit.findUnique({ where: { id: pe.id } })
    expect((edit?.proposedChanges as any).tradingName).toBe(`${PREFIX} Trade`)
    const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_EDIT_REQUEST_CREATED' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.actorType).toBe('MERCHANT_ADMIN')
  })
})
