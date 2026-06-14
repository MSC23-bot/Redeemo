import 'dotenv/config'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getMerchantTimeline } from '../../../../src/api/admin/timeline/service'

// M7 backend integration tests (real DB, serial). The `.integration.test.ts`
// suffix is REQUIRED for the CI project split (vitest.config.ts): the `unit`
// project excludes this suffix; this suite runs only under `test:integration`.
//
// The whole point of M7 is the safety boundary: the merchant timeline is a
// READ that interleaves AuditLog actions and the OWNER's lifecycle emails, and
// it must NEVER leak CommunicationLog.payload (a reset link / branch PIN lives
// there during the QUEUED window) and must NEVER include a branch-recipient /
// PIN-bearing email row. These assertions prove both.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `m7-timeline-${Date.now()}`

// Primary merchant (with an owner) — drives assertions 1-5.
let merchantId = ''
let ownerAdminId = ''
let adminUserId = ''
let branchId = ''

// No-owner merchant — assertion 6.
let noOwnerMerchantId = ''
let noOwnerAdminUserId = ''

// Payload secrets that must NEVER appear in the serialised output.
const OWNER_PAYLOAD_SECRET_PIN = 'FAKE-PIN-9999'
const OWNER_PAYLOAD_SECRET_LINK = 'https://x/reset-SECRET-TOKEN'
const BRANCH_PIN_SECRET = 'BRANCH-PIN-LEAK-8888'

beforeAll(async () => {
  // AdminUser — actor for the merchant AuditLog rows (name resolution target).
  const admin = await prisma.adminUser.create({
    data: {
      email: `${PREFIX}-admin@example.com`,
      passwordHash: 'hash',
      firstName: 'Tilly',
      lastName: 'Timeline',
      role: 'OPERATIONS',
    },
  })
  adminUserId = admin.id

  // Merchant with an ACTIVE OWNER membership.
  const merchant = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX} Co`,
      status: 'PENDING_APPROVAL',
      verificationStatus: 'PENDING',
      onboardingStep: 'SUBMITTED',
      isTestData: true,
    },
  })
  merchantId = merchant.id

  const ownerAdmin = await prisma.merchantAdmin.create({
    data: {
      email: `${PREFIX}-owner@example.com`,
      firstName: 'Olive',
      lastName: 'Owner',
    },
  })
  ownerAdminId = ownerAdmin.id

  await prisma.merchantMembership.create({
    data: { merchantId, merchantAdminId: ownerAdmin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
  })

  // A branch (the branch_pin email targets a branch recipient, NOT the owner).
  const branch = await prisma.branch.create({
    data: {
      merchantId,
      name: `${PREFIX} Main`,
      isMainBranch: true,
      addressLine1: '1 Timeline Way',
      city: 'London',
      postcode: 'EC1A 1BB',
      isActive: true,
    },
  })
  branchId = branch.id

  // ── AuditLog rows (interleaved timestamps with the emails below) ──────────
  // t = 100s ago: an ADMIN action (must resolve actorName = "Tilly Timeline").
  await prisma.auditLog.create({
    data: {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_CLAIMED',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: adminUserId,
      actorType: 'ADMIN',
      reason: 'Picking this up for review',
      createdAt: new Date(Date.now() - 100_000),
    },
  })
  // t = 40s ago: a later ADMIN action (interleaves AFTER the 60s-ago email).
  await prisma.auditLog.create({
    data: {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_CHANGES_REQUESTED',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: adminUserId,
      actorType: 'ADMIN',
      reason: 'Logo is low resolution',
      createdAt: new Date(Date.now() - 40_000),
    },
  })

  // ── Owner CommunicationLog rows (recipientType MERCHANT_ADMIN, owner id) ──
  // t = 90s ago: changes-requested email, SENT, subject set.
  await prisma.communicationLog.create({
    data: {
      recipientType: 'MERCHANT_ADMIN',
      recipientId: ownerAdminId,
      channel: 'EMAIL',
      type: 'merchant_changes_requested',
      subject: 'Action needed on your Redeemo application',
      status: 'SENT',
      sentAt: new Date(Date.now() - 90_000),
      payload: { to: ownerAdmin.email, subject: 'x', html: '<p>safe</p>' },
    },
  })
  // t = 60s ago: a "go-live" email, QUEUED, carrying a fake delivery-sensitive
  // payload (a reset link + a PIN). This is the payload-leak guard target.
  await prisma.communicationLog.create({
    data: {
      recipientType: 'MERCHANT_ADMIN',
      recipientId: ownerAdminId,
      channel: 'EMAIL',
      type: 'merchant_live',
      subject: 'You are live on Redeemo',
      status: 'QUEUED',
      sentAt: new Date(Date.now() - 60_000),
      payload: { pin: OWNER_PAYLOAD_SECRET_PIN, link: OWNER_PAYLOAD_SECRET_LINK },
    },
  })
  // t = 20s ago: a FAILED email (delivery-state must surface).
  await prisma.communicationLog.create({
    data: {
      recipientType: 'MERCHANT_ADMIN',
      recipientId: ownerAdminId,
      channel: 'EMAIL',
      type: 'merchant_claim',
      subject: 'Set up your Redeemo account',
      status: 'FAILED',
      sentAt: new Date(Date.now() - 20_000),
      payload: { to: ownerAdmin.email, subject: 'x', html: '<p>safe</p>' },
    },
  })
  // t = 10s ago: a BOUNCED email (another terminal delivery state).
  await prisma.communicationLog.create({
    data: {
      recipientType: 'MERCHANT_ADMIN',
      recipientId: ownerAdminId,
      channel: 'EMAIL',
      type: 'merchant_rejected',
      subject: 'Update on your Redeemo application',
      status: 'BOUNCED',
      sentAt: new Date(Date.now() - 10_000),
      payload: { to: ownerAdmin.email, subject: 'x', html: '<p>safe</p>' },
    },
  })

  // ── branch_pin row: REAL write shape (recipientType BRANCH_USER, recipientId
  //    = branchId). Carries a PIN secret. Must NEVER appear in the timeline and
  //    its secret must NEVER leak — the owner filter excludes it on BOTH the
  //    recipientType and the recipientId. ──────────────────────────────────
  await prisma.communicationLog.create({
    data: {
      recipientType: 'BRANCH_USER',
      recipientId: branchId,
      channel: 'EMAIL',
      type: 'branch_pin',
      subject: 'Your branch PIN',
      status: 'SENT',
      sentAt: new Date(Date.now() - 5_000),
      payload: { pin: BRANCH_PIN_SECRET },
    },
  })

  // ── No-owner merchant: action present, owner absent. ──────────────────────
  const noOwnerAdmin = await prisma.adminUser.create({
    data: {
      email: `${PREFIX}-noowner-admin@example.com`,
      passwordHash: 'hash',
      firstName: 'Norbert',
      lastName: 'NoOwner',
      role: 'OPERATIONS',
    },
  })
  noOwnerAdminUserId = noOwnerAdmin.id

  const noOwnerMerchant = await prisma.merchant.create({
    data: {
      businessName: `${PREFIX} NoOwner Co`,
      status: 'PENDING_APPROVAL',
      verificationStatus: 'PENDING',
      onboardingStep: 'SUBMITTED',
      isTestData: true,
    },
  })
  noOwnerMerchantId = noOwnerMerchant.id

  await prisma.auditLog.create({
    data: {
      entityId: noOwnerMerchantId,
      entityType: 'merchant',
      event: 'MERCHANT_DRAFT_CREATED',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      actorId: noOwnerAdminUserId,
      actorType: 'ADMIN',
      reason: 'Created on behalf of merchant',
    },
  })
})

afterAll(async () => {
  // FK-safe cleanup, scoped to this run's prefix.
  await prisma.communicationLog.deleteMany({ where: { recipientId: { in: [ownerAdminId, branchId] } } })
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [merchantId, noOwnerMerchantId] } } })
  await prisma.branch.deleteMany({ where: { id: branchId } })
  await prisma.merchantMembership.deleteMany({ where: { merchantId } })
  await prisma.merchantAdmin.deleteMany({ where: { id: ownerAdminId } })
  await prisma.merchant.deleteMany({ where: { id: { in: [merchantId, noOwnerMerchantId] } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: [adminUserId, noOwnerAdminUserId] } } })
  await prisma.$disconnect()
})

// ─── Assertion 1: action rows are actor-resolved ──────────────────────────

describe('M7 timeline — action rows resolve admin actor names', () => {
  it('returns action items with actorName = "First Last" and reason present', async () => {
    const result = await getMerchantTimeline(prisma, merchantId)

    const claimed = result.items.find(
      (i): i is Extract<typeof i, { kind: 'action' }> =>
        i.kind === 'action' && i.event === 'MERCHANT_APPROVAL_CLAIMED',
    )
    expect(claimed).toBeTruthy()
    expect(claimed!.actorType).toBe('ADMIN')
    expect(claimed!.actorName).toBe('Tilly Timeline')
    expect(claimed!.reason).toBe('Picking this up for review')

    // state passthrough
    expect(result.state).not.toBeNull()
    expect(result.state!.status).toBe('PENDING_APPROVAL')
    expect(result.state!.verificationStatus).toBe('PENDING')
    expect(result.state!.onboardingStep).toBe('SUBMITTED')
  })
})

// ─── Assertion 2: owner-resolved email rows with delivery state ────────────

describe('M7 timeline — owner email rows surface delivery state', () => {
  it('returns email items with correct status/subject/type and emailsResolvedViaOwner true', async () => {
    const result = await getMerchantTimeline(prisma, merchantId)

    expect(result.emailsResolvedViaOwner).toBe(true)

    const emails = result.items.filter(
      (i): i is Extract<typeof i, { kind: 'email' }> => i.kind === 'email',
    )
    // 4 owner emails seeded; the branch_pin row must NOT be among them.
    expect(emails.length).toBe(4)

    const byType = new Map(emails.map((e) => [e.type, e]))

    const changes = byType.get('merchant_changes_requested')
    expect(changes).toBeTruthy()
    expect(changes!.status).toBe('SENT')
    expect(changes!.subject).toBe('Action needed on your Redeemo application')
    expect(changes!.channel).toBe('EMAIL')

    expect(byType.get('merchant_live')!.status).toBe('QUEUED')
    expect(byType.get('merchant_claim')!.status).toBe('FAILED')
    expect(byType.get('merchant_rejected')!.status).toBe('BOUNCED')
  })
})

// ─── Assertion 3: payload-leak prevention ─────────────────────────────────

describe('M7 timeline — never leaks CommunicationLog.payload', () => {
  it('no payload value appears in the serialised result and email items carry no payload key', async () => {
    const result = await getMerchantTimeline(prisma, merchantId)

    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain(OWNER_PAYLOAD_SECRET_PIN)
    expect(serialised).not.toContain('SECRET-TOKEN')
    expect(serialised).not.toContain(OWNER_PAYLOAD_SECRET_LINK)

    const emails = result.items.filter(
      (i): i is Extract<typeof i, { kind: 'email' }> => i.kind === 'email',
    )
    for (const e of emails) {
      expect(e).not.toHaveProperty('payload')
      // Also confirm none of the recipient-routing fields leaked.
      expect(e).not.toHaveProperty('recipientId')
      expect(e).not.toHaveProperty('recipientType')
      expect(e).not.toHaveProperty('externalId')
      expect(e).not.toHaveProperty('userId')
    }
  })
})

// ─── Assertion 4: branch-recipient exclusion ──────────────────────────────

describe('M7 timeline — excludes branch-recipient / PIN-bearing rows', () => {
  it('the branch_pin row is absent from items and its secret never leaks', async () => {
    const result = await getMerchantTimeline(prisma, merchantId)

    const emails = result.items.filter(
      (i): i is Extract<typeof i, { kind: 'email' }> => i.kind === 'email',
    )
    expect(emails.find((e) => e.type === 'branch_pin')).toBeUndefined()

    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain(BRANCH_PIN_SECRET)
    expect(serialised).not.toContain('branch_pin')
  })
})

// ─── Assertion 5: merged, strictly time-descending (actions + emails interleave) ─

describe('M7 timeline — merged and sorted by `at` descending', () => {
  it('items interleave actions and emails strictly newest-first', async () => {
    const result = await getMerchantTimeline(prisma, merchantId)

    // Strictly descending across the whole merged array.
    for (let n = 1; n < result.items.length; n++) {
      const prev = new Date(result.items[n - 1].at).getTime()
      const curr = new Date(result.items[n].at).getTime()
      expect(prev).toBeGreaterThanOrEqual(curr)
    }

    // Prove an action and an email actually interleave (not grouped by kind).
    // Seeded timeline newest→oldest (by the row timestamps above):
    //   email  merchant_rejected         (10s)
    //   email  merchant_claim            (20s)
    //   action MERCHANT_CHANGES_REQUESTED (40s)
    //   email  merchant_live             (60s)
    //   email  merchant_changes_requested (90s)
    //   action MERCHANT_APPROVAL_CLAIMED (100s)
    // The action at 40s sits BETWEEN emails on both sides — that is the
    // interleave proof (the list is not grouped action-block / email-block).
    const kinds = result.items.map((i) => i.kind)
    expect(kinds).toEqual(['email', 'email', 'action', 'email', 'email', 'action'])
  })
})

// ─── Assertion 6: no-owner graceful ───────────────────────────────────────

describe('M7 timeline — no owner membership', () => {
  it('returns emailsResolvedViaOwner false, no email items, action items present, no throw', async () => {
    const result = await getMerchantTimeline(prisma, noOwnerMerchantId)

    expect(result.emailsResolvedViaOwner).toBe(false)
    expect(result.items.some((i) => i.kind === 'email')).toBe(false)

    const actions = result.items.filter((i) => i.kind === 'action')
    expect(actions.length).toBe(1)
    expect(actions[0].kind).toBe('action')

    expect(result.state).not.toBeNull()
    expect(result.state!.status).toBe('PENDING_APPROVAL')
  })
})

// ─── Assertion 7: non-existent merchant graceful ──────────────────────────

describe('M7 timeline — non-existent merchant', () => {
  it('returns { items: [], state: null, emailsResolvedViaOwner: false } without throwing', async () => {
    const result = await getMerchantTimeline(prisma, '00000000-0000-0000-0000-000000000000')

    expect(result.items).toEqual([])
    expect(result.state).toBeNull()
    expect(result.emailsResolvedViaOwner).toBe(false)
  })
})
