// Unit tests for the WP4 stale-claim sweep — re-pointed at the Neon CU-burn PR-B
// maintenance-floor split (mock prisma, injected dbNow, no DB). Proves: the
// Phase-A ELIGIBLE scan is a parameterized raw query carrying every predicate
// (status/claimed/window + the cross-column dedup/re-arm rule) IN SQL with
// deterministic ordering + LIMIT 200 and `full` derived from the ELIGIBLE count
// (ineligible rows can neither fake a backlog nor starve eligible claims — the
// real-DB proof lives in the integration suite); and the Phase-B alert + dbNow
// stamp with per-row isolation (failedRows), the BETWEEN-OPS cooperative stop
// (no stamp update starts after the stop signal — the honest duplicate-bell
// edge), and the removal of every 60-second/hourly polling export.

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
} from '../../../src/api/queues/processors/claimStaleSweep'
import * as claimStaleModule from '../../../src/api/queues/processors/claimStaleSweep'
import { adminNotify } from '../../../src/api/shared/adminNotify'

const NOW = new Date('2026-06-15T12:00:00.000Z')

/** The shape the DB-level eligible scan returns (Phase A output rows). */
interface EligibleRow {
  id: string
  claimedById: string
  referenceId: string
  referenceType: string
}

/** Phase A is a parameterized raw query now, so the fake serves `$queryRaw`
 *  with the (already DB-filtered) ELIGIBLE rows. */
function makePrisma(eligibleRows: EligibleRow[]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(eligibleRows),
    adminApproval: {
      update: vi.fn().mockResolvedValue({}),
    },
  } as any
}

function eligible(overrides: Partial<EligibleRow> = {}): EligibleRow {
  return { id: 'a1', claimedById: 'admin-1', referenceId: 'm1', referenceType: 'merchant', ...overrides }
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

describe('claimStaleDbPhase: DB-level eligible scan (Phase A, locked, DB clock)', () => {
  it('carries EVERY predicate in parameterized SQL: status/claimed/window + the cross-column dedup/re-arm rule, deterministic order, LIMIT param', async () => {
    const prisma = makePrisma([])
    await claimStaleDbPhase(prisma, NOW)
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join('¶')
    expect(sql).toContain(`"status" = 'PENDING'`)
    expect(sql).toContain('"claimedById" IS NOT NULL')
    expect(sql).toContain('"claimedAt" <') // window cutoff (bound param)
    // The load-bearing cross-column eligibility — dedup + re-arm IN SQL, so
    // ineligible rows are excluded BEFORE the LIMIT (no starvation, no false full).
    expect(sql).toContain('("lastStaleAlertAt" IS NULL OR "lastStaleAlertAt" < "claimedAt")')
    expect(sql).toContain('ORDER BY "claimedAt" ASC, "id" ASC') // deterministic: oldest eligible first
    expect(sql).toContain('LIMIT')
    // PARAMETERIZED, never interpolated: the cutoff Date + the batch cap are
    // bound values; the SQL text itself contains neither.
    expect(values).toEqual([new Date(NOW.getTime() - CLAIM_STALE_AGE_MS), CLAIM_STALE_BATCH])
    expect(sql).not.toContain('2026-') // no interpolated timestamp
    expect(sql).not.toMatch(/LIMIT\s+\d/) // no interpolated limit
    expect(CLAIM_STALE_BATCH).toBe(200)
    // Fields limited to what Phase B requires.
    expect(sql).toContain('SELECT "id", "claimedById", "referenceId", "referenceType"')
  })

  it('threads dbNow into the side-effects payload alongside the eligible rows', async () => {
    const prisma = makePrisma([eligible()])
    const res = await claimStaleDbPhase(prisma, NOW)
    expect(res.sideEffects.rows.map((r) => r.id)).toEqual(['a1'])
    expect(res.sideEffects.dbNow).toEqual(NOW)
    expect(res.full).toBe(false)
  })

  it('full derives from the ELIGIBLE count only: 199 eligible ⇒ false, 200 eligible ⇒ true (ineligible rows cannot fake backlog)', async () => {
    const many = (n: number): EligibleRow[] =>
      Array.from({ length: n }, (_, i) => eligible({ id: `a${i}`, claimedById: `admin-${i}` }))
    expect((await claimStaleDbPhase(makePrisma(many(CLAIM_STALE_BATCH - 1)), NOW)).full).toBe(false)
    expect((await claimStaleDbPhase(makePrisma(many(CLAIM_STALE_BATCH)), NOW)).full).toBe(true)
  })

  it('the sweep lock key is DISTINCT from the outbox and pending-hours keys', () => {
    expect(CLAIM_STALE_SWEEP_LOCK_KEY).toBe(731_003n)
  })
})

describe('claim-stale Phase B: alert + stamp (recipient behaviour preserved)', () => {
  it('alerts the CLAIMER with the exact WP4 payload and stamps lastStaleAlertAt with dbNow', async () => {
    const prisma = makePrisma([eligible()])
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
    expect(res.outcome).toEqual({ full: false, failedRows: 0, startedRows: 1 })
  })
})

// NOTE: dedup ("already alerted") + re-arm ("newer claimedAt") now live INSIDE
// the SQL predicate (pinned above) and are proven end-to-end against real
// Postgres in claim-stale-sweep.integration.test.ts — a unit fake feeding rows
// AROUND the DB filter would prove nothing.

describe('claim-stale: per-row isolation + degraded classification', () => {
  it('one failing alert does not stop later rows, and is reported via failedRows (→ sweep FAILURE, degraded backoff)', async () => {
    const prisma = makePrisma([
      eligible({ id: 'a1', claimedById: 'admin-1' }),
      eligible({ id: 'a2', claimedById: 'admin-2', referenceId: 'm2' }),
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
    const prisma = makePrisma([eligible()])
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
      eligible({ id: 'a1', claimedById: 'admin-1' }),
      eligible({ id: 'a2', claimedById: 'admin-2', referenceId: 'm2' }),
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
