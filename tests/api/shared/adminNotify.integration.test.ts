import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Mock the email dispatcher so the email-only alert path is observable + does NOT
// enqueue real BullMQ jobs. Default impl writes a CommunicationLog row through the
// REAL prisma so we can assert "an email row was queued / none was" against the DB,
// mirroring what notify() commits in production (the bell rows are real either way).
const { notifyMock } = vi.hoisted(() => ({ notifyMock: vi.fn() }))
vi.mock('../../../src/api/shared/notify', () => ({ notify: notifyMock }))

import {
  adminNotify,
  emitMerchantSubmittedAlert,
  emitMerchantResubmittedAlert,
} from '../../../src/api/shared/adminNotify'
import { submitForApproval } from '../../../src/api/merchant/onboarding/service'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const dummyRedis = {} as any
const ctx = { ipAddress: '127.0.0.1', userAgent: 'm8-test' }
const PREFIX = `m8-${Date.now()}`

// Seeded admins (created once): active OPS, active SUPER_ADMIN, inactive OPS,
// active FINANCE. Only the two active alertable roles should receive a SUBMITTED
// bell row.
let opsId = ''
let superId = ''
let inactiveOpsId = ''
let financeId = ''
const createdAdminIds: string[] = []
const createdMerchantIds: string[] = []
let seq = 0

/** Real CommunicationLog write so DB-count assertions reflect notify()'s behaviour. */
async function notifyWritesCommLog(_p: any, _r: any, input: any) {
  const log = await prisma.communicationLog.create({
    data: {
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      channel: 'EMAIL',
      type: input.type,
      subject: input.email?.subject ?? null,
      status: 'QUEUED',
      userId: input.userId ?? null,
    },
    select: { id: true },
  })
  return { queued: true, communicationLogId: log.id, enqueued: true }
}

async function makeMerchant(name: string) {
  const m = await prisma.merchant.create({
    data: { businessName: name, status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING', isTestData: true },
  })
  createdMerchantIds.push(m.id)
  return m
}

beforeAll(async () => {
  const mk = async (role: any, isActive: boolean) => {
    const a = await prisma.adminUser.create({
      data: { email: `${PREFIX}-${role}-${seq++}@example.com`, passwordHash: 'x', firstName: 'M8', lastName: role, role, isActive },
    })
    createdAdminIds.push(a.id)
    return a.id
  }
  opsId = await mk('OPERATIONS', true)
  superId = await mk('SUPER_ADMIN', true)
  inactiveOpsId = await mk('OPERATIONS', false)
  financeId = await mk('FINANCE', true)
})

beforeEach(() => {
  notifyMock.mockReset()
  notifyMock.mockImplementation(notifyWritesCommLog)
  delete process.env.ADMIN_OPS_ALERT_EMAIL
})

afterEach(() => {
  delete process.env.ADMIN_OPS_ALERT_EMAIL
})

afterAll(async () => {
  await Promise.all(createdMerchantIds.map(async (merchantId) => {
    await prisma.notification.deleteMany({ where: { referenceId: merchantId } })
    await prisma.communicationLog.deleteMany({ where: { recipientId: merchantId } })
    await prisma.auditLog.deleteMany({ where: { entityId: merchantId } })
    await prisma.adminApproval.deleteMany({ where: { referenceId: merchantId } })
    const adminIds = (await prisma.merchantMembership.findMany({ where: { merchantId }, select: { merchantAdminId: true } })).map((r) => r.merchantAdminId)
    await prisma.merchantMembership.deleteMany({ where: { merchantId } })
    await prisma.voucher.deleteMany({ where: { merchantId } })
    await prisma.branch.deleteMany({ where: { merchantId } })
    await prisma.merchantContract.deleteMany({ where: { merchantId } })
    await prisma.merchantAdmin.deleteMany({ where: { id: { in: adminIds } } })
    await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => {})
  }))
  // Notifications addressed to the seeded admins (recipientId = adminId).
  await prisma.notification.deleteMany({ where: { recipientId: { in: createdAdminIds } } })
  await prisma.communicationLog.deleteMany({ where: { recipientId: { in: createdAdminIds } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } })
  await prisma.$disconnect()
}, 30_000) // real-DB cascade cleanup across several seeded merchants on Neon.

describe('M8 adminNotify — in-app-only writer (real DB)', () => {
  it('writes a correct IN_APP ADMIN Notification AND no CommunicationLog row', async () => {
    const m = await makeMerchant(`${PREFIX} InAppCo`)
    const commBefore = await prisma.communicationLog.count()

    await adminNotify(prisma, {
      adminUserId: opsId,
      type: 'ADMIN_MERCHANT_SUBMITTED',
      title: 'New merchant submitted for approval',
      body: 'InAppCo has submitted.',
      referenceId: m.id,
      referenceType: 'merchant',
    })

    const rows = await prisma.notification.findMany({ where: { referenceId: m.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recipientType: 'ADMIN',
      recipientId: opsId,
      userId: null,
      channel: 'IN_APP',
      type: 'ADMIN_MERCHANT_SUBMITTED',
      referenceType: 'merchant',
    })
    // The in-app writer must NOT touch CommunicationLog.
    expect(await prisma.communicationLog.count()).toBe(commBefore)
  })
})

describe('M8 emitMerchantSubmittedAlert — fan-out + ops email (real DB)', () => {
  it('writes a bell row to EACH active OPERATIONS + SUPER_ADMIN admin only (skips inactive + FINANCE)', async () => {
    const m = await makeMerchant(`${PREFIX} FanOutCo`)
    await emitMerchantSubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName })

    // The shared dev DB may contain OTHER active alertable admins, so assert
    // MEMBERSHIP, not an exact set: the two seeded active alertable admins are
    // present; the inactive + FINANCE seeds are absent.
    const rows = await prisma.notification.findMany({ where: { referenceId: m.id } })
    const recipients = rows.map((r) => r.recipientId)
    expect(recipients).toContain(opsId)
    expect(recipients).toContain(superId)
    expect(recipients).not.toContain(inactiveOpsId)
    expect(recipients).not.toContain(financeId)
    for (const r of rows) expect(r.type).toBe('ADMIN_MERCHANT_SUBMITTED')
  })

  it('with ADMIN_OPS_ALERT_EMAIL set: queues exactly one email CommunicationLog row to it; bell rows still written', async () => {
    process.env.ADMIN_OPS_ALERT_EMAIL = `${PREFIX}-ops-inbox@example.com`
    const m = await makeMerchant(`${PREFIX} EmailOnCo`)
    const commBefore = await prisma.communicationLog.count()

    await emitMerchantSubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName })

    expect(await prisma.communicationLog.count()).toBe(commBefore + 1)
    const emailRow = await prisma.communicationLog.findFirst({ where: { recipientId: m.id, type: 'admin_merchant_submitted' } })
    expect(emailRow).toBeTruthy()
    expect(emailRow?.channel).toBe('EMAIL')
    // Bell fan-out still happened (seeded active alertable admins present).
    const recipients = (await prisma.notification.findMany({ where: { referenceId: m.id } })).map((r) => r.recipientId)
    expect(recipients).toContain(opsId)
    expect(recipients).toContain(superId)
  })

  it('with ADMIN_OPS_ALERT_EMAIL unset: NO email row created, bell rows still written', async () => {
    delete process.env.ADMIN_OPS_ALERT_EMAIL
    const m = await makeMerchant(`${PREFIX} EmailOffCo`)
    const commBefore = await prisma.communicationLog.count()

    await emitMerchantSubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName })

    expect(await prisma.communicationLog.count()).toBe(commBefore)
    expect(notifyMock).not.toHaveBeenCalled()
    const recipients = (await prisma.notification.findMany({ where: { referenceId: m.id } })).map((r) => r.recipientId)
    expect(recipients).toContain(opsId)
    expect(recipients).toContain(superId)
  })

  it('anti-storm: emitting SUBMITTED queues the dark ops email but creates NO recursive Notification', async () => {
    process.env.ADMIN_OPS_ALERT_EMAIL = `${PREFIX}-ops-inbox@example.com`
    const m = await makeMerchant(`${PREFIX} StormCo`)

    await emitMerchantSubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName })

    // Anti-storm: every bell row is the SUBMITTED fan-out itself — there is no
    // extra/recursive Notification from the queued (dark, will-be-FAILED) ops
    // email, because M8 wires no DELIVERY_FAILED path. (Row COUNT is not pinned
    // to 2 because the shared dev DB may hold other active alertable admins; the
    // invariant is "no row of a type other than the fan-out", + one email call.)
    const rows = await prisma.notification.findMany({ where: { referenceId: m.id } })
    for (const r of rows) expect(r.type).toBe('ADMIN_MERCHANT_SUBMITTED')
    expect(rows.map((r) => r.recipientId)).toContain(opsId)
    expect(notifyMock).toHaveBeenCalledTimes(1)
  })
})

describe('M8 emitMerchantResubmittedAlert — reviewer targeting (real DB)', () => {
  it('resolvable active reviewer: exactly that reviewer gets a bell row + an email row', async () => {
    process.env.ADMIN_OPS_ALERT_EMAIL = `${PREFIX}-ignored@example.com` // resubmit emails the REVIEWER, not this.
    const m = await makeMerchant(`${PREFIX} ResubOkCo`)
    const commBefore = await prisma.communicationLog.count()

    await emitMerchantResubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName }, opsId)

    const bell = await prisma.notification.findMany({ where: { referenceId: m.id } })
    expect(bell).toHaveLength(1)
    expect(bell[0].recipientId).toBe(opsId)
    expect(bell[0].type).toBe('ADMIN_MERCHANT_RESUBMITTED')
    expect(await prisma.communicationLog.count()).toBe(commBefore + 1)
    const emailRow = await prisma.communicationLog.findFirst({ where: { recipientId: m.id, type: 'admin_merchant_resubmitted' } })
    expect(emailRow).toBeTruthy()
  })

  it('unresolvable/inactive reviewer: NO bell row and NO email row', async () => {
    const m = await makeMerchant(`${PREFIX} ResubSkipCo`)
    const commBefore = await prisma.communicationLog.count()

    // inactive reviewer
    await emitMerchantResubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName }, inactiveOpsId)
    // null reviewer
    await emitMerchantResubmittedAlert(prisma, dummyRedis, { id: m.id, businessName: m.businessName }, null)

    expect(await prisma.notification.count({ where: { referenceId: m.id } })).toBe(0)
    expect(await prisma.communicationLog.count()).toBe(commBefore)
  })
})

describe('M8 submitForApproval end-to-end (real DB)', () => {
  /** Seed a REGISTERED merchant that passes all onboarding gates + has an OWNER. */
  async function makeSubmittableMerchant(name: string) {
    const m = await prisma.merchant.create({
      data: { businessName: name, status: 'REGISTERED', onboardingStep: 'REGISTERED', verificationStatus: 'NOT_SUBMITTED', contractStatus: 'SIGNED', isTestData: true },
    })
    createdMerchantIds.push(m.id)
    const owner = await prisma.merchantAdmin.create({ data: { email: `${PREFIX}-owner-${seq++}@example.com`, firstName: 'O', lastName: 'W' } })
    await prisma.merchantMembership.create({ data: { merchantId: m.id, merchantAdminId: owner.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' } })
    await prisma.branch.create({ data: { merchantId: m.id, name: 'Main', addressLine1: '1 St', city: 'Town', postcode: 'AB1 2CD', isMainBranch: true } })
    await prisma.voucher.create({ data: { merchantId: m.id, code: `${PREFIX}-RMV-A-${seq++}`, title: 'RMV A', type: 'DISCOUNT_FIXED', estimatedSaving: 5, isRmv: true, status: 'PENDING_APPROVAL' } })
    await prisma.voucher.create({ data: { merchantId: m.id, code: `${PREFIX}-RMV-B-${seq++}`, title: 'RMV B', type: 'DISCOUNT_FIXED', estimatedSaving: 5, isRmv: true, status: 'PENDING_APPROVAL' } })
    return { merchantId: m.id, ownerId: owner.id }
  }

  it('first submit fans out the SUBMITTED bell to active OPS+SUPER_ADMIN and returns the merchant', async () => {
    const { merchantId, ownerId } = await makeSubmittableMerchant(`${PREFIX} E2ESubmitCo`)
    const result = await submitForApproval(prisma, dummyRedis, ownerId, ctx)

    expect(result.id).toBe(merchantId)
    expect(result.status).toBe('PENDING_APPROVAL')
    const recipients = (await prisma.notification.findMany({ where: { referenceId: merchantId, type: 'ADMIN_MERCHANT_SUBMITTED' } })).map((r) => r.recipientId)
    expect(recipients).toContain(opsId)
    expect(recipients).toContain(superId)
    expect(recipients).not.toContain(inactiveOpsId)
    expect(recipients).not.toContain(financeId)
  }, 20_000) // real-DB: multi-row seed + full submit tx + wide bell fan-out.

  it('best-effort: a throwing alert path does NOT fail submit (merchant is still submitted)', async () => {
    notifyMock.mockRejectedValue(new Error('email infra down'))
    process.env.ADMIN_OPS_ALERT_EMAIL = `${PREFIX}-throw@example.com`
    const { merchantId, ownerId } = await makeSubmittableMerchant(`${PREFIX} E2EBestEffortCo`)

    const result = await submitForApproval(prisma, dummyRedis, ownerId, ctx)

    // Submit succeeded despite the email throw.
    expect(result.status).toBe('PENDING_APPROVAL')
    const m = await prisma.merchant.findUnique({ where: { id: merchantId } })
    expect(m?.onboardingStep).toBe('SUBMITTED')
    expect(m?.verificationStatus).toBe('PENDING')
  }, 20_000) // real-DB: multi-row seed + full submit tx.
})
