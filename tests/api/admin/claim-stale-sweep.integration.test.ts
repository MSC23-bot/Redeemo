// Real-DB tests for the WP4 stale-claim sweep. Proves end-to-end against Neon:
// the alert reaches the CLAIMER, lastStaleAlertAt is stamped, a re-run dedups,
// a later claim re-arms, and the window/claimed/status gates exclude the rest.
// Each scenario uses its own claimer so its alert count is isolated; all seeded
// rows are bulk-removed in afterAll (prefix-scoped, mirrors the m5-golive- discipline).

import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { sweepStaleClaims } from '../../../src/api/queues/processors/claimStaleSweep'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const NOW = new Date('2026-06-15T12:00:00.000Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 60 * 60 * 1000)
const PREFIX = `claim-stale-it-${Date.now()}`

const createdAdminIds: string[] = []
const createdApprovalIds: string[] = []

async function seed(opts: {
  claimedAt: Date | null
  lastStaleAlertAt?: Date | null
  status?: 'PENDING' | 'APPROVED'
  claimedNull?: boolean
}): Promise<{ claimerId: string; approvalId: string }> {
  const admin = await prisma.adminUser.create({
    data: {
      email: `${PREFIX}-${createdAdminIds.length}@example.com`,
      passwordHash: 'x',
      firstName: 'Stale',
      lastName: 'Claimer',
      role: 'OPERATIONS',
    },
  })
  createdAdminIds.push(admin.id)
  const approval = await prisma.adminApproval.create({
    data: {
      type: 'MERCHANT_ONBOARDING',
      status: opts.status ?? 'PENDING',
      referenceId: `${PREFIX}-merchant-${createdApprovalIds.length}`,
      referenceType: 'merchant',
      claimedById: opts.claimedNull ? null : admin.id,
      claimedAt: opts.claimedAt,
      lastStaleAlertAt: opts.lastStaleAlertAt ?? null,
    },
  })
  createdApprovalIds.push(approval.id)
  return { claimerId: admin.id, approvalId: approval.id }
}

function countAlerts(claimerId: string): Promise<number> {
  return prisma.notification.count({
    where: { recipientType: 'ADMIN', recipientId: claimerId, type: 'ADMIN_CLAIM_STALE' },
  })
}

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { recipientId: { in: createdAdminIds } } })
  await prisma.adminApproval.deleteMany({ where: { id: { in: createdApprovalIds } } })
  await prisma.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } })
  await prisma.$disconnect()
})

describe('sweepStaleClaims (real DB)', () => {
  it('alerts the claimer once, stamps lastStaleAlertAt, and dedups on re-run', async () => {
    const { claimerId, approvalId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null })
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(1)
    const row = await prisma.adminApproval.findUnique({ where: { id: approvalId }, select: { lastStaleAlertAt: true } })
    expect(row?.lastStaleAlertAt).not.toBeNull()
    // dedup: a second run over the same claim must not add a second alert.
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(1)
  })

  it('re-arms after release + reclaim (a newer claim than the prior alert)', async () => {
    // claimed 25h ago (in window) but the last alert was 48h ago (an older claim
    // cycle), so claimedAt > lastStaleAlertAt and the nudge re-arms.
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: hoursAgo(48) })
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(1)
  })

  it('does NOT alert claims still within the 24h window', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(1), lastStaleAlertAt: null })
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })

  it('does NOT alert unclaimed approvals', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null, claimedNull: true })
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })

  it('does NOT alert non-PENDING approvals (status gate)', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null, status: 'APPROVED' })
    await sweepStaleClaims(prisma, NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })
})
