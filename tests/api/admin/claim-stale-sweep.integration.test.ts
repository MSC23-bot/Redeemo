// Real-DB tests for the WP4 stale-claim sweep — re-pointed at the Neon CU-burn
// PR-B maintenance-floor split. Runs against the strict-loopback integration
// database (tests/integration.setup.ts fail-closes on any non-loopback target).
// Proves end-to-end: the alert reaches the CLAIMER, lastStaleAlertAt is stamped
// with dbNow, a re-run dedups, a later claim re-arms, and the
// window/claimed/status gates exclude the rest. Each scenario uses its own
// claimer so its alert count is isolated; all seeded rows are bulk-removed in
// afterAll (prefix-scoped, mirrors the m5-golive- discipline).

import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  claimStaleDbPhase,
  makeClaimStaleSideEffects,
} from '../../../src/api/queues/processors/claimStaleSweep'
import type { PhaseBBudget } from '../../../src/api/queues/maintenanceSweep'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const NOW = new Date('2026-06-15T12:00:00.000Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 60 * 60 * 1000)
const PREFIX = `claim-stale-it-${Date.now()}`

const PERMISSIVE_BUDGET: PhaseBBudget = {
  maxItems: 500,
  budgetMs: 60_000,
  monotonicNowMs: () => 0,
  isStopping: () => false,
}

/** One floor run: Phase A inside a real transaction (as runBoundedSweep does),
 *  then the unlocked Phase B — the same composition the scheduler drives. */
async function runClaimStaleFloorOnce(now: Date): Promise<void> {
  const phaseA = await prisma.$transaction((tx) => claimStaleDbPhase(tx, now))
  await makeClaimStaleSideEffects(prisma)(phaseA.sideEffects, PERMISSIVE_BUDGET)
}

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

describe('claim-stale floor sweep (real DB)', () => {
  it('alerts the claimer once, stamps lastStaleAlertAt with dbNow, and dedups on re-run', async () => {
    const { claimerId, approvalId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null })
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(1)
    const row = await prisma.adminApproval.findUnique({ where: { id: approvalId }, select: { lastStaleAlertAt: true } })
    expect(row?.lastStaleAlertAt).toEqual(NOW) // stamped with the SAME clock the scan ran against
    // dedup: a second run over the same claim must not add a second alert.
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(1)
  })

  it('re-arms after release + reclaim (a newer claim than the prior alert)', async () => {
    // claimed 25h ago (in window) but the last alert was 48h ago (an older claim
    // cycle), so claimedAt > lastStaleAlertAt and the nudge re-arms.
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: hoursAgo(48) })
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(1)
  })

  it('does NOT alert claims still within the 24h window', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(1), lastStaleAlertAt: null })
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })

  it('does NOT alert unclaimed approvals', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null, claimedNull: true })
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })

  it('does NOT alert non-PENDING approvals (status gate)', async () => {
    const { claimerId } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null, status: 'APPROVED' })
    await runClaimStaleFloorOnce(NOW)
    expect(await countAlerts(claimerId)).toBe(0)
  })

  it('FALSE-BACKLOG / STARVATION (Codex correction 1): 200 stale-but-already-alerted claims produce NO backlog and do NOT starve the eligible claim beyond them', async () => {
    // 200 INELIGIBLE rows: stale (claimed 30h ago) but already alerted AFTER the
    // claim (lastStaleAlertAt > claimedAt) — with a JS-side filter these alone
    // filled the 200-candidate cap, faking full=true every scan (F_active hot
    // loop) and starving anything beyond them.
    const blocker = await prisma.adminUser.create({
      data: {
        email: `${PREFIX}-blocker@example.com`,
        passwordHash: 'x',
        firstName: 'Blocker',
        lastName: 'Claimer',
        role: 'OPERATIONS',
      },
    })
    createdAdminIds.push(blocker.id)
    const ineligible = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        prisma.adminApproval.create({
          data: {
            type: 'MERCHANT_ONBOARDING',
            status: 'PENDING',
            referenceId: `${PREFIX}-blk-${i}`,
            referenceType: 'merchant',
            claimedById: blocker.id,
            // Deterministically OLDER than the eligible claim below, so a raw
            // candidate scan ordered by claimedAt would return ONLY these 200.
            claimedAt: new Date(NOW.getTime() - 30 * 60 * 60 * 1000 - i * 1000),
            lastStaleAlertAt: new Date(NOW.getTime() - 60 * 60 * 1000), // alerted AFTER claim ⇒ ineligible
          },
          select: { id: true },
        }),
      ),
    )
    createdApprovalIds.push(...ineligible.map((r) => r.id))
    // ONE genuinely eligible claim, NEWER than all 200 blockers (it sits beyond
    // them in any claimedAt-ordered candidate scan).
    const { claimerId: eligibleClaimer } = await seed({ claimedAt: hoursAgo(25), lastStaleAlertAt: null })

    // Phase A directly: the eligible claim is selected; the 200 ineligible rows
    // produce NO false full/backlog signal.
    const phaseA = await prisma.$transaction((tx) => claimStaleDbPhase(tx, NOW))
    const eligibleIds = phaseA.sideEffects.rows.map((r) => r.claimedById)
    expect(eligibleIds).toContain(eligibleClaimer) // no starvation behind the cap
    expect(eligibleIds).not.toContain(blocker.id) // ineligible rows excluded IN SQL
    expect(phaseA.full).toBe(false) // eligible count << 200 ⇒ the sweep CANNOT stay on the active cadence

    // End-to-end: the eligible claimer is alerted; the blocker gets nothing new.
    await makeClaimStaleSideEffects(prisma)(phaseA.sideEffects, PERMISSIVE_BUDGET)
    expect(await countAlerts(eligibleClaimer)).toBe(1)
    expect(await countAlerts(blocker.id)).toBe(0)

    // And the NEXT scan is empty for these rows (the alerted eligible claim is
    // now ineligible too) — full stays false; no residual backlog.
    const phaseA2 = await prisma.$transaction((tx) => claimStaleDbPhase(tx, NOW))
    expect(phaseA2.sideEffects.rows.map((r) => r.claimedById)).not.toContain(eligibleClaimer)
    expect(phaseA2.full).toBe(false)
  }, 60_000)
})
