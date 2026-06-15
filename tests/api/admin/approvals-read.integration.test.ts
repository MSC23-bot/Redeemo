import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listApprovals, getApproval } from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
let merchantId = ''
let approvalId = ''
// PR4: a seeded admin claimer so claimedBy.name resolution can be pinned.
let claimerAdminId = ''
const claimerFirstName = 'Jordan'
const claimerLastName = 'Lee'

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: {
      businessName: 'M3 Read Co',
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMITTED',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
      isTestData: true,
    },
  })
  merchantId = m.id
  const admin = await prisma.merchantAdmin.create({
    data: { email: `m3-read-${Date.now()}@example.com`, firstName: 'R', lastName: 'D' },
  })
  await prisma.merchantMembership.create({
    data: { merchantId: m.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })
  // PR4: the admin who claims the approval (AdminUser, distinct from the
  // merchant OWNER). claimedBy.name must resolve to "Jordan Lee".
  const claimer = await prisma.adminUser.create({
    data: {
      email: `m3-claimer-${Date.now()}@example.com`,
      passwordHash: 'x',
      firstName: claimerFirstName,
      lastName: claimerLastName,
      role: 'OPERATIONS',
    },
  })
  claimerAdminId = claimer.id
  const approval = await prisma.adminApproval.create({
    data: {
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      referenceId: m.id,
      referenceType: 'merchant',
      claimedById: claimer.id,
      claimedAt: new Date(),
    },
  })
  approvalId = approval.id
})

afterAll(async () => {
  await prisma.adminApproval.deleteMany({ where: { referenceId: merchantId } })
  const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
  if (claimerAdminId) await prisma.adminUser.delete({ where: { id: claimerAdminId } }).catch(() => {})
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  await prisma.$disconnect()
})

describe('M3 — actioner queue reads (real DB)', () => {
  it('listApprovals filters by type+status and attaches a merchant summary for MERCHANT_ONBOARDING', async () => {
    const result = await listApprovals(prisma, { type: 'MERCHANT_ONBOARDING', status: 'PENDING', pageSize: 100 })
    // every returned row matches the filter
    expect(result.approvals.every((a) => a.type === 'MERCHANT_ONBOARDING' && a.status === 'PENDING')).toBe(true)
    const row = result.approvals.find((a) => a.id === approvalId)
    expect(row).toBeTruthy()
    expect(row!.merchant).toMatchObject({
      id: merchantId,
      businessName: 'M3 Read Co',
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMITTED',
    })
    expect(result.page).toBe(1)
    expect(typeof result.total).toBe('number')
  })

  it('getApproval returns the approval + merchant + checklist + an rmvs array', async () => {
    const r = await getApproval(prisma, approvalId)
    expect(r.id).toBe(approvalId)
    expect(r.merchant?.id).toBe(merchantId)
    // checklist computed for the merchant (contract signed here; no branch/RMVs ⇒ not complete)
    expect(r.checklist).toMatchObject({ contract_signed: true })
    expect(Array.isArray(r.rmvs)).toBe(true)
  })

  it('getApproval on a non-existent id throws APPROVAL_NOT_FOUND', async () => {
    await expect(getApproval(prisma, 'no-such-approval-id')).rejects.toThrow('APPROVAL_NOT_FOUND')
  })
})

describe('PR4: listApprovals claimedBy resolution + referenceId filter (real DB)', () => {
  it('resolves claimedBy { id, name } from the batched AdminUser lookup', async () => {
    const result = await listApprovals(prisma, { referenceId: merchantId, pageSize: 10 })
    const row = result.approvals.find((a) => a.id === approvalId)
    expect(row).toBeTruthy()
    expect(row!.claimedBy).toEqual({
      id: claimerAdminId,
      name: `${claimerFirstName} ${claimerLastName}`,
    })
  })

  it('referenceId filter returns only the matching merchant\'s approval', async () => {
    const result = await listApprovals(prisma, { referenceId: merchantId, pageSize: 50 })
    // Every returned row is for this merchant.
    expect(result.approvals.every((a) => a.referenceId === merchantId)).toBe(true)
    expect(result.approvals.some((a) => a.id === approvalId)).toBe(true)
  })

  it('referenceId filter for an unrelated merchant returns no rows', async () => {
    const result = await listApprovals(prisma, { referenceId: 'no-such-merchant-id', pageSize: 10 })
    expect(result.approvals).toHaveLength(0)
    expect(result.total).toBe(0)
  })
})
