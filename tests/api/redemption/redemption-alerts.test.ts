import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { verifyRedemption } from '../../../src/api/redemption/service'
import { resolveRedemptionAlertRecipients } from '../../../src/api/shared/merchantNotify'

// Branches PR-7 (§8): the redemption-alert producer fires ONLY inside
// verifyRedemption (isValidated:true — the in-store staff-verified event), AFTER
// the validation flip + the VOUCHER_VERIFIED audit, BEST-EFFORT, GATED on the
// per-branch redemptionAlertsEnabled toggle, IN-APP ONLY (no CommunicationLog /
// no email job). The forbidden site is createRedemption / isValidated:false.

const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

// A mock prisma sufficient for verifyRedemption + the producer:
//  - voucherRedemption.findUnique / update (the core validation)
//  - auditLog.create (the VOUCHER_VERIFIED audit)
//  - merchantMembership.findMany (the recipient fan-out)
//  - notification.create (the in-app-only merchantNotify writer)
//  - communicationLog.create (the email-dark pin — asserted NEVER called)
function mockPrisma(opts?: { memberships?: any[] }) {
  return {
    voucherRedemption: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    merchantMembership: { findMany: vi.fn().mockResolvedValue(opts?.memberships ?? []) },
    notification: { create: vi.fn().mockResolvedValue({}) },
    communicationLog: { create: vi.fn().mockResolvedValue({}) },
  } as any
}

// validatedAt is read by the producer copy; update must return it.
function validatedRow(method: 'QR_SCAN' | 'MANUAL' = 'QR_SCAN') {
  return { id: 'r1', isValidated: true, validatedAt: new Date('2026-06-24T10:00:00Z'), validationMethod: method }
}

function activeRedemption(opts?: {
  branchId?: string
  merchantId?: string
  alertsEnabled?: boolean
}) {
  const branchId = opts?.branchId ?? 'b1'
  const merchantId = opts?.merchantId ?? 'm1'
  return {
    id: 'r1', userId: 'u1', isValidated: false, branchId,
    voucher: { merchantId, title: '2-for-1 Mains', merchant: { status: 'ACTIVE' } },
    branch: {
      isActive: true,
      redemptionAlertsEnabled: opts?.alertsEnabled ?? true,
      merchantId,
      name: 'Old Foundry',
    },
    user: { firstName: 'Jane', lastName: 'Doe' },
  }
}

// Membership rows as merchantMembership.findMany returns them (the producer's
// fan-out select: merchantAdminId / role / allBranches / branches[branchId]).
function member(merchantAdminId: string, role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF', allBranches: boolean, branchIds: string[] = []) {
  return { merchantAdminId, role, allBranches, branches: branchIds.map((branchId) => ({ branchId })) }
}

const ownerCtx = (id = 'ma1') => ({ adminId: id, merchantId: 'm1', role: 'OWNER' as const, allBranches: true, allowedBranchIds: [] as string[], canManageVouchers: true })

describe('PR-7 redemption-alert producer — fires on verifyRedemption when ON', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('writes one IN_APP VOUCHER_REDEEMED MERCHANT_ADMIN Notification per recipient + NO CommunicationLog (email-dark pin)', async () => {
    // findMany is called once for the fan-out (the producer query is the ONLY
    // merchantMembership query in verifyRedemption), returning one OWNER.
    const prisma = mockPrisma({ memberships: [member('owner1', 'OWNER', true)] })
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: true }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('QR_SCAN'))

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx,
    )

    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    const arg = prisma.notification.create.mock.calls[0][0]
    expect(arg.data.recipientType).toBe('MERCHANT_ADMIN')
    expect(arg.data.recipientId).toBe('owner1')
    expect(arg.data.channel).toBe('IN_APP')
    expect(arg.data.type).toBe('VOUCHER_REDEEMED')
    expect(arg.data.userId).toBeNull()
    expect(arg.data.referenceType).toBe('redemption')
    expect(arg.data.referenceId).toBe('r1')
    // Email-dark: NO CommunicationLog / NO email outbox row for this event.
    expect(prisma.communicationLog.create).not.toHaveBeenCalled()
  })

  it('copy carries the voucher + branch + validation time, NEVER the customer name or the redemption code', async () => {
    const prisma = mockPrisma({ memberships: [member('owner1', 'OWNER', true)] })
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: true }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('MANUAL'))

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'someoneElse' },
      baseCtx, ownerCtx('someoneElse'),
    )

    const arg = prisma.notification.create.mock.calls[0][0]
    const blob = `${arg.data.title} ${arg.data.body}`
    expect(arg.data.title).toContain('Old Foundry')
    expect(arg.data.body).toContain('2-for-1 Mains')
    expect(arg.data.body).toContain('Old Foundry')
    // never the customer's personal details, never the redemption code.
    expect(blob).not.toContain('Jane')
    expect(blob).not.toContain('Doe')
    expect(blob).not.toContain('A7K2P9X4')
  })
})

describe('PR-7 redemption-alert producer — does NOT fire when OFF', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('toggle OFF: validation still succeeds, NO Notification, NO membership query', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: false }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('QR_SCAN'))

    const result = await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx,
    )

    expect(result.isValidated).toBe(true)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(prisma.merchantMembership.findMany).not.toHaveBeenCalled()
  })
})

describe('PR-7 redemption-alert producer — best-effort (a notify failure NEVER fails the validation)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('merchantNotify (notification.create) throws -> validation still succeeds, returns normally', async () => {
    const prisma = mockPrisma({ memberships: [member('owner1', 'OWNER', true)] })
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: true }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('QR_SCAN'))
    // The in-app writer throws — the producer must swallow it.
    prisma.notification.create.mockRejectedValue(new Error('db down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx,
    )

    // The redemption is validated by the isValidated:true update regardless.
    expect(result.isValidated).toBe(true)
    expect(prisma.voucherRedemption.update).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})

// The forbidden-site pin: createRedemption writes the isValidated:false
// VOUCHER_REDEEMED *AuditLog* string (customer code generation). It must NEVER
// produce a VOUCHER_REDEEMED *Notification*. We assert by source-of-truth: the
// only Notification-producing call lives in verifyRedemption (proven above), and
// createRedemption never touches prisma.notification.
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

describe('PR-7 forbidden-site pin — createRedemption must NOT produce a Notification', () => {
  it('the createRedemption function body contains no notification / merchantNotify producer', () => {
    const src = readFileSync(
      resolvePath(__dirname, '../../../src/api/redemption/service.ts'),
      'utf8',
    )
    // Slice the createRedemption function body (start of its declaration up to the
    // verifyRedemption declaration that follows it).
    const start = src.indexOf('export async function createRedemption')
    const end = src.indexOf('export async function verifyRedemption')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const createBody = src.slice(start, end)
    // createRedemption must NOT call the in-app writer / the fan-out / notification.create.
    expect(createBody).not.toMatch(/merchantNotify/)
    expect(createBody).not.toMatch(/resolveRedemptionAlertRecipients/)
    expect(createBody).not.toMatch(/notification\.create/)
    // It DOES still write the (unrelated) VOUCHER_REDEEMED AuditLog string — confirm
    // the slice is the right region and the shared string is present here as audit.
    expect(createBody).toMatch(/event: 'VOUCHER_REDEEMED'/)
  })
})

describe('PR-7 recipient fan-out — resolveRedemptionAlertRecipients', () => {
  beforeEach(() => { vi.clearAllMocks() })

  function fanoutPrisma(memberships: any[]) {
    return { merchantMembership: { findMany: vi.fn().mockResolvedValue(memberships) } } as any
  }

  it('STAFF is excluded; the active OWNER + an allBranches BM are included', async () => {
    // The query filters role IN [OWNER, BRANCH_MANAGER] at the DB layer, so a STAFF
    // row never returns. We still pass one in to prove the helper never selects it
    // even if the query somehow returned it (defence-in-depth on the role check).
    const prisma = fanoutPrisma([
      member('owner1', 'OWNER', true),
      member('bmAll', 'BRANCH_MANAGER', true),
      member('staff1', 'STAFF', false, ['b1']),
    ])
    const ids = await resolveRedemptionAlertRecipients(prisma, { merchantId: 'm1', branchId: 'b1' })
    expect(ids.sort()).toEqual(['bmAll', 'owner1'])
    expect(ids).not.toContain('staff1')
    // The query must scope to ACTIVE + role IN [OWNER, BRANCH_MANAGER].
    const where = prisma.merchantMembership.findMany.mock.calls[0][0].where
    expect(where.merchantId).toBe('m1')
    expect(where.status).toBe('ACTIVE')
    expect(where.role).toEqual({ in: ['OWNER', 'BRANCH_MANAGER'] })
  })

  it('a BM whose scope does NOT cover the branch is excluded; a scope-covering BM is included', async () => {
    const prisma = fanoutPrisma([
      member('owner1', 'OWNER', true),
      member('bmCovers', 'BRANCH_MANAGER', false, ['b1']),
      member('bmOther', 'BRANCH_MANAGER', false, ['b2']),
    ])
    const ids = await resolveRedemptionAlertRecipients(prisma, { merchantId: 'm1', branchId: 'b1' })
    expect(ids.sort()).toEqual(['bmCovers', 'owner1'])
    expect(ids).not.toContain('bmOther')
  })

  it('multiple active OWNERs are ALL notified (multi-owner is supported)', async () => {
    const prisma = fanoutPrisma([
      member('owner1', 'OWNER', true),
      member('owner2', 'OWNER', true),
    ])
    const ids = await resolveRedemptionAlertRecipients(prisma, { merchantId: 'm1', branchId: 'b1' })
    expect(ids.sort()).toEqual(['owner1', 'owner2'])
  })

  it('self-action silence: a merchant-actor excludeMerchantAdminId drops the validating owner', async () => {
    const prisma = fanoutPrisma([
      member('owner1', 'OWNER', true),
      member('owner2', 'OWNER', true),
    ])
    const ids = await resolveRedemptionAlertRecipients(prisma, {
      merchantId: 'm1', branchId: 'b1', excludeMerchantAdminId: 'owner1',
    })
    expect(ids).toEqual(['owner2'])
    expect(ids).not.toContain('owner1')
  })
})

describe('PR-7 schema — Branch.redemptionAlertsEnabled defaults false (opt-in)', () => {
  it('the prisma schema declares the column with @default(false)', () => {
    const schema = readFileSync(
      resolvePath(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    )
    expect(schema).toMatch(/redemptionAlertsEnabled\s+Boolean\s+@default\(false\)/)
  })

  it('the migration is purely additive with a false backfill default', () => {
    const dir = resolvePath(__dirname, '../../../prisma/migrations/20260624183015_branch_redemption_alerts_enabled/migration.sql')
    const sql = readFileSync(dir, 'utf8')
    expect(sql).toMatch(/ALTER TABLE "Branch" ADD COLUMN\s+"redemptionAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;/)
  })
})

describe('PR-7 producer self-silence + branch-actor no-exclusion (end-to-end via verifyRedemption)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('merchant actor: the validating MerchantAdmin is self-silenced (excludeMerchantAdminId = actor.actorId)', async () => {
    const prisma = mockPrisma({ memberships: [member('owner1', 'OWNER', true), member('owner2', 'OWNER', true)] })
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: true }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('MANUAL'))

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'owner1' },
      baseCtx, ownerCtx('owner1'),
    )

    // Only owner2 is notified — owner1 (the validating actor) is silenced.
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(prisma.notification.create.mock.calls[0][0].data.recipientId).toBe('owner2')
  })

  it('branch actor: no self-exclusion — all eligible members are notified (a BranchUser is never a recipient)', async () => {
    const prisma = mockPrisma({ memberships: [member('owner1', 'OWNER', true), member('bmAll', 'BRANCH_MANAGER', true)] })
    prisma.voucherRedemption.findUnique.mockResolvedValue(activeRedemption({ alertsEnabled: true }))
    prisma.voucherRedemption.update.mockResolvedValue(validatedRow('QR_SCAN'))

    await verifyRedemption(
      prisma, 'A7K2P9X4', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx,
    )

    // The fan-out must be called with NO exclusion for a branch actor.
    const fanoutArgs = prisma.merchantMembership.findMany.mock.calls[0][0]
    expect(fanoutArgs.where.merchantId).toBe('m1')
    const recipientIds = prisma.notification.create.mock.calls.map((c: any) => c[0].data.recipientId).sort()
    expect(recipientIds).toEqual(['bmAll', 'owner1'])
  })
})
