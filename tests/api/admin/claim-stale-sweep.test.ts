// Unit tests for the WP4 stale-claim sweep — re-pointed at the Neon CU-burn PR-B
// maintenance-floor split (mock prisma, injected dbNow, no DB). Proves: the
// Phase-A candidate scan window/status/claimed filter + LIMIT-200 cap + the
// eligibility/dedup/re-arm filter, and the Phase-B alert + dbNow stamp with
// per-row isolation (failedRows), the BETWEEN-OPS cooperative stop (no stamp
// update starts after the stop signal — the honest duplicate-bell edge), and
// the removal of every 60-second/hourly polling export.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma, PrismaClient } from '../../../generated/prisma/client'
import type { PhaseBBudget } from '../../../src/api/queues/maintenanceSweep'

vi.mock('../../../src/api/shared/adminNotify', () => ({
  adminNotify: vi.fn().mockResolvedValue(undefined),
}))

import {
  claimStaleDbPhase,
  makeClaimStaleSideEffects,
  CLAIM_STALE_AGE_MS,
  CLAIM_STALE_BATCH,
  CLAIM_STALE_SWEEP_LOCK_KEY,
  type ClaimStaleSide,
} from '../../../src/api/queues/processors/claimStaleSweep'
import * as claimStaleModule from '../../../src/api/queues/processors/claimStaleSweep'
import { adminNotify } from '../../../src/api/shared/adminNotify'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 60 * 60 * 1000)

interface Row {
  id: string
  claimedById: string | null
  claimedAt: Date | null
  referenceId: string
  referenceType: string
  lastStaleAlertAt: Date | null
}

function makePrisma(rows: Row[]) {
  return {
    adminApproval: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any
}

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 500, budgetMs: 60_000, monotonicNowMs: () => 0, isStopping: () => false, ...overrides }
}

/** Compose one floor run: Phase A (the fake doubles as `tx`) then Phase B. */
async function runFloorSweep(prisma: any, dbNow: Date, b: PhaseBBudget = budget()) {
  const phaseA = await claimStaleDbPhase(prisma as Prisma.TransactionClient, dbNow)
  const outcome = await makeClaimStaleSideEffects(prisma as PrismaClient)(phaseA.sideEffects, b)
  return { ...phaseA, outcome }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(adminNotify as any).mockResolvedValue(undefined)
})

describe('claimStaleDbPhase: candidate scan (Phase A, locked, DB clock)', () => {
  it('scans only PENDING, claimed, and claimed-over-24h-ago rows off dbNow, capped at 200', async () => {
    const prisma = makePrisma([])
    await claimStaleDbPhase(prisma, NOW)
    const arg = prisma.adminApproval.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({
      status: 'PENDING',
      claimedById: { not: null },
      claimedAt: { lt: new Date(NOW.getTime() - CLAIM_STALE_AGE_MS) }, // cutoff derives from the DB clock
    })
    expect(arg.take).toBe(CLAIM_STALE_BATCH)
    expect(CLAIM_STALE_BATCH).toBe(200)
  })

  it('filters eligibility in Phase A and threads dbNow into the side-effects payload', async () => {
    const claimedAt = hoursAgo(25)
    const prisma = makePrisma([
      { id: 'fresh', claimedById: 'admin-1', claimedAt, referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
      { id: 'already-alerted', claimedById: 'admin-2', claimedAt, referenceId: 'm2', referenceType: 'merchant', lastStaleAlertAt: new Date(claimedAt.getTime() + 1000) },
    ])
    const res = await claimStaleDbPhase(prisma, NOW)
    expect(res.sideEffects.rows.map((r) => r.id)).toEqual(['fresh']) // dedup filtered in Phase A
    expect(res.sideEffects.dbNow).toEqual(NOW)
    expect(res.full).toBe(false)
  })

  it('reports full=true (needsRescan) at a full LIMIT-200 candidate batch', async () => {
    const many: Row[] = Array.from({ length: CLAIM_STALE_BATCH }, (_, i) => ({
      id: `a${i}`, claimedById: `admin-${i}`, claimedAt: hoursAgo(25), referenceId: `m${i}`, referenceType: 'merchant', lastStaleAlertAt: null,
    }))
    const res = await claimStaleDbPhase(makePrisma(many), NOW)
    expect(res.full).toBe(true)
  })

  it('the sweep lock key is DISTINCT from the outbox and pending-hours keys', () => {
    expect(CLAIM_STALE_SWEEP_LOCK_KEY).toBe(731_003n)
  })
})

describe('claim-stale Phase B: alert + stamp (recipient behaviour preserved)', () => {
  it('alerts the CLAIMER with the exact WP4 payload and stamps lastStaleAlertAt with dbNow', async () => {
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    const res = await runFloorSweep(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        adminUserId: 'admin-1', // the claimer, nobody else
        type: 'ADMIN_CLAIM_STALE',
        referenceId: 'm1',
        referenceType: 'merchant',
      }),
    )
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { lastStaleAlertAt: NOW }, // stamped with the SAME dbNow the scan ran against
    })
    expect(res.outcome).toEqual({ full: false, failedRows: 0 })
  })
})

describe('claim-stale: dedup + re-arm (rules preserved on the floor)', () => {
  it('does NOT re-alert a claim already alerted (lastStaleAlertAt after claimedAt)', async () => {
    const claimedAt = hoursAgo(25)
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt, referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: new Date(claimedAt.getTime() + 1000) },
    ])
    const res = await runFloorSweep(prisma, NOW)
    expect(adminNotify).not.toHaveBeenCalled()
    expect(prisma.adminApproval.update).not.toHaveBeenCalled()
    expect(res.sideEffects.rows).toHaveLength(0)
  })

  it('re-arms after release + reclaim (a newer claimedAt than the prior alert)', async () => {
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-2', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: hoursAgo(48) },
    ])
    await runFloorSweep(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(prisma, expect.objectContaining({ adminUserId: 'admin-2' }))
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { lastStaleAlertAt: NOW } })
  })
})

describe('claim-stale: per-row isolation + degraded classification', () => {
  it('one failing alert does not stop later rows, and is reported via failedRows (→ sweep FAILURE, degraded backoff)', async () => {
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
      { id: 'a2', claimedById: 'admin-2', claimedAt: hoursAgo(30), referenceId: 'm2', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    ;(adminNotify as any).mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(undefined)
    const res = await runFloorSweep(prisma, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(2) // a2 still ran after a1 failed
    // a1 failed (no stamp — stays eligible, replays after recovery); a2 stamped.
    expect(prisma.adminApproval.update).toHaveBeenCalledTimes(1)
    expect(prisma.adminApproval.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { lastStaleAlertAt: NOW } })
    expect(res.outcome.failedRows).toBe(1) // classified FAILURE — never SUCCESS/active cadence
    expect(res.outcome.full).toBe(false)
  })
})

describe('claim-stale: cooperative terminal shutdown (spec §4.6)', () => {
  it('BETWEEN-OPS: stop landing while adminNotify is in flight ⇒ the lastStaleAlertAt update NEVER starts (honest duplicate-bell edge)', async () => {
    let stopping = false
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    ;(adminNotify as any).mockImplementation(async () => {
      stopping = true // the terminal stop signal lands WHILE the bell is in flight
    })
    const res = await runFloorSweep(prisma, NOW, budget({ isStopping: () => stopping }))
    expect(adminNotify).toHaveBeenCalledTimes(1) // the bell went out (never claimed cancelled)
    expect(prisma.adminApproval.update).not.toHaveBeenCalled() // the stamp NEVER started
    expect(res.outcome.failedRows).toBe(0) // a cooperative skip is not a failure
    // The row stays eligible ⇒ one benign duplicate bell may follow after restart.
  })

  it('BEFORE-ROW: stop before a later row ⇒ that row starts NO operation at all', async () => {
    let stopping = false
    const prisma = makePrisma([
      { id: 'a1', claimedById: 'admin-1', claimedAt: hoursAgo(25), referenceId: 'm1', referenceType: 'merchant', lastStaleAlertAt: null },
      { id: 'a2', claimedById: 'admin-2', claimedAt: hoursAgo(30), referenceId: 'm2', referenceType: 'merchant', lastStaleAlertAt: null },
    ])
    ;(adminNotify as any).mockImplementation(async () => {
      stopping = true
    })
    const res = await runFloorSweep(prisma, NOW, budget({ isStopping: () => stopping }))
    expect(adminNotify).toHaveBeenCalledTimes(1) // a2's bell never fired
    expect(prisma.adminApproval.update).not.toHaveBeenCalled() // and neither op of a2 started
    expect(res.outcome.full).toBe(true) // rows remaining — re-selected next scan
  })
})

describe('claim-stale: no hourly polling remains', () => {
  it('the repeatable scheduler + cadence + job-name + monolithic sweep exports are GONE', () => {
    const mod = claimStaleModule as Record<string, unknown>
    expect(mod.scheduleClaimStaleSweep).toBeUndefined()
    expect(mod.CLAIM_STALE_EVERY_MS).toBeUndefined()
    expect(mod.CLAIM_STALE_JOB).toBeUndefined()
    expect(mod.sweepStaleClaims).toBeUndefined() // superseded by the dbPhase/sideEffects split
  })
})
