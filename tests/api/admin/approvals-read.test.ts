import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listApprovals, getApproval } from '../../../src/api/admin/approvals/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
let merchantId = ''
let approvalId = ''

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
  const approval = await prisma.adminApproval.create({
    data: { type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: m.id, referenceType: 'merchant' },
  })
  approvalId = approval.id
})

afterAll(async () => {
  await prisma.adminApproval.deleteMany({ where: { referenceId: merchantId } })
  const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
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
