// Unit tests for the WP4 stale-claim sweep — re-pointed at the ATOMIC Phase-B
// row (owner-approved Option C). Proves: the Phase-A ELIGIBLE scan is a
// parameterized raw query carrying every predicate (status/claimed/window +
// the cross-column dedup/re-arm rule) IN SQL with deterministic ordering +
// LIMIT 200, `full` derived from the ELIGIBLE count, and the FULL ownership
// snapshot (claimedById, claimedAt, lastStaleAlertAt) selected for the CAS;
// and the Phase-B ATOMIC row — one bounded transaction per row whose
// conditional CAS (exact snapshot match) must WIN before the bell is written
// inside the SAME transaction. CAS loss = safe skip (no bell, not a failure);
// a transaction failure = failedRows with later rows continuing; the
// cooperative stop is honoured BEFORE each row and never splits a started
// transaction. The real-DB atomicity/race/rollback proof lives in
// claim-stale-sweep.integration.test.ts.

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
  type StaleClaimRow,
  type ClaimStaleTxBounds,
} from '../../../src/api/queues/processors/claimStaleSweep'
import * as claimStaleModule from '../../../src/api/queues/processors/claimStaleSweep'
import { adminNotify } from '../../../src/api/shared/adminNotify'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const CLAIMED_AT = new Date('2026-06-13T09:00:00.000Z')
const BOUNDS: ClaimStaleTxBounds = { statementTimeoutMs: 4000, txTimeoutMs: 8000 }

/** Fake prisma: Phase A serves `$queryRaw`; Phase B serves `$transaction`,
 *  whose callback receives a per-transaction `tx` fake exposing the
 *  parameterized set_config `$queryRaw` and the CAS `updateMany`. The recorded
 *  tx handles let tests assert the bell was written on the SAME tx client. */
function makePrisma(eligibleRows: StaleClaimRow[], casCounts: number[] = []) {
  const txs: Array<{ tx: any; casCalls: any[]; setConfigCalls: any[] }> = []
  const txOptions: any[] = []
  let casIdx = 0
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue(eligibleRows), // Phase A only
    $transaction: vi.fn(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts?: unknown) => {
      const record = { casCalls: [] as any[], setConfigCalls: [] as any[], tx: null as any }
      const tx = {
        $queryRaw: vi.fn(async (...args: unknown[]) => {
          record.setConfigCalls.push(args)
          return []
        }),
        adminApproval: {
          updateMany: vi.fn(async (args: unknown) => {
            record.casCalls.push(args)
            const count = casCounts[casIdx] ?? 1
            casIdx++
            return { count }
          }),
        },
      }
      record.tx = tx
      txs.push(record)
      txOptions.push(opts)
      return fn(tx as unknown as Prisma.TransactionClient)
    }),
  }
  return { prisma: prisma as unknown as PrismaClient, raw: prisma, txs, txOptions }
}

function eligible(overrides: Partial<StaleClaimRow> = {}): StaleClaimRow {
  return {
    id: 'a1',
    claimedById: 'admin-1',
    claimedAt: CLAIMED_AT,
    lastStaleAlertAt: null,
    referenceId: 'm1',
    referenceType: 'merchant',
    ...overrides,
  }
}

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 500, budgetMs: 60_000, monotonicNowMs: () => 0, isStopping: () => false, ...overrides }
}

/** Compose one floor run: Phase A (the fake doubles as `tx`) then Phase B. */
async function runFloorSweep(fake: ReturnType<typeof makePrisma>, dbNow: Date, b: PhaseBBudget = budget()) {
  const phaseA = await claimStaleDbPhase(fake.raw as unknown as Prisma.TransactionClient, dbNow)
  const outcome = await makeClaimStaleSideEffects(fake.prisma, BOUNDS)(phaseA.sideEffects, b)
  return { ...phaseA, outcome }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(adminNotify as any).mockResolvedValue(undefined)
})

describe('claimStaleDbPhase: DB-level eligible scan (Phase A, locked, DB clock)', () => {
  it('carries EVERY predicate in parameterized SQL + selects the FULL ownership snapshot for the CAS', async () => {
    const fake = makePrisma([])
    await claimStaleDbPhase(fake.raw as unknown as Prisma.TransactionClient, NOW)
    const [strings, ...values] = fake.raw.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
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
    // Option C: the CAS snapshot columns MUST be selected — dropping claimedAt
    // or lastStaleAlertAt from the SELECT breaks the exact-snapshot compare.
    expect(sql).toContain(
      'SELECT "id", "claimedById", "claimedAt", "lastStaleAlertAt", "referenceId", "referenceType"',
    )
  })

  it('threads dbNow into the side-effects payload alongside the eligible rows', async () => {
    const fake = makePrisma([eligible()])
    const res = await claimStaleDbPhase(fake.raw as unknown as Prisma.TransactionClient, NOW)
    expect(res.sideEffects.rows.map((r) => r.id)).toEqual(['a1'])
    expect(res.sideEffects.dbNow).toEqual(NOW)
    expect(res.full).toBe(false)
  })

  it('full derives from the ELIGIBLE count only: 199 eligible ⇒ false, 200 eligible ⇒ true (ineligible rows cannot fake backlog)', async () => {
    const many = (n: number): StaleClaimRow[] =>
      Array.from({ length: n }, (_, i) => eligible({ id: `a${i}`, claimedById: `admin-${i}` }))
    expect(
      (await claimStaleDbPhase(makePrisma(many(CLAIM_STALE_BATCH - 1)).raw as any, NOW)).full,
    ).toBe(false)
    expect((await claimStaleDbPhase(makePrisma(many(CLAIM_STALE_BATCH)).raw as any, NOW)).full).toBe(true)
  })

  it('the sweep lock key is DISTINCT from the outbox and pending-hours keys', () => {
    expect(CLAIM_STALE_SWEEP_LOCK_KEY).toBe(731_003n)
  })
})

describe('claim-stale Phase B: ONE atomic CAS + bell transaction per row (Option C)', () => {
  it('CAS WINNER: exactly one bounded transaction — snapshot-conditional stamp FIRST, then the bell on the SAME tx client', async () => {
    const fake = makePrisma([eligible()], [1])
    const res = await runFloorSweep(fake, NOW)

    // One transaction, carrying the validated bounds (never the 5s default).
    expect(fake.raw.$transaction).toHaveBeenCalledTimes(1)
    expect(fake.txOptions[0]).toEqual({ timeout: BOUNDS.txTimeoutMs, maxWait: BOUNDS.txTimeoutMs })

    // Parameterized statement_timeout as the first tx statement (bound value).
    const [cfgStrings, cfgValue] = fake.txs[0].setConfigCalls[0] as [TemplateStringsArray, string]
    expect(cfgStrings.join('¶')).toContain("set_config('statement_timeout'")
    expect(cfgValue).toBe(String(BOUNDS.statementTimeoutMs))

    // The CAS carries the EXACT Phase-A snapshot — mutating it to a bare
    // `where: { id }` (or dropping any snapshot field) fails this pin.
    expect(fake.txs[0].casCalls[0]).toEqual({
      where: {
        id: 'a1',
        status: 'PENDING',
        claimedById: 'admin-1',
        claimedAt: CLAIMED_AT,
        lastStaleAlertAt: null,
      },
      data: { lastStaleAlertAt: NOW }, // stamped with the SAME dbNow the scan ran against
    })

    // The bell is written by the winner, ON THE TRANSACTION CLIENT (not the
    // root prisma) — moving it outside the tx fails this identity pin.
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(
      fake.txs[0].tx,
      expect.objectContaining({
        adminUserId: 'admin-1', // the claimer, nobody else
        type: 'ADMIN_CLAIM_STALE',
        referenceId: 'm1',
        referenceType: 'merchant',
      }),
    )
    expect(res.outcome).toEqual({ full: false, failedRows: 0, startedRows: 1 })
  })

  it('CAS LOSER (ownership/state changed since Phase A): NO bell, NOT a failure, later rows continue', async () => {
    const fake = makePrisma(
      [eligible({ id: 'a1' }), eligible({ id: 'a2', claimedById: 'admin-2', referenceId: 'm2' })],
      [0, 1], // a1 loses the CAS (released/reassigned/actioned/deleted meanwhile); a2 wins
    )
    const res = await runFloorSweep(fake, NOW)
    // a1: CAS returned 0 → the bell was NEVER attempted for it.
    expect(adminNotify).toHaveBeenCalledTimes(1)
    expect(adminNotify).toHaveBeenCalledWith(fake.txs[1].tx, expect.objectContaining({ adminUserId: 'admin-2' }))
    // A safe skip is not a failure and does not fake backlog.
    expect(res.outcome).toEqual({ full: false, failedRows: 0, startedRows: 2 })
  })

  it('bell-write failure REJECTS the transaction (stamp rolls back with it) → failedRows; later rows still run', async () => {
    const fake = makePrisma(
      [eligible({ id: 'a1' }), eligible({ id: 'a2', claimedById: 'admin-2', referenceId: 'm2' })],
      [1, 1],
    )
    ;(adminNotify as any).mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce(undefined)
    const res = await runFloorSweep(fake, NOW)
    expect(adminNotify).toHaveBeenCalledTimes(2) // a2 still ran after a1's tx failed
    // a1's throw escaped the $transaction callback (⇒ rollback on a real DB —
    // proven in the integration suite); classified via failedRows.
    expect(res.outcome.failedRows).toBe(1)
    expect(res.outcome.full).toBe(false)
  })
})

describe('claim-stale: cooperative terminal shutdown (spec §4.6 — atomic row)', () => {
  it('BEFORE-ROW stop: once the stop signal lands, NO further row transaction starts (remaining rows stay durable)', async () => {
    let stopping = false
    const fake = makePrisma(
      [eligible({ id: 'a1' }), eligible({ id: 'a2', claimedById: 'admin-2', referenceId: 'm2' })],
      [1, 1],
    )
    ;(adminNotify as any).mockImplementation(async () => {
      stopping = true // stop lands while a1's transaction is in flight
    })
    const res = await runFloorSweep(fake, NOW, budget({ isStopping: () => stopping }))
    // a1's transaction ran to COMPLETION as one awaited atomic op — the stop
    // signal does NOT split a started transaction (owner requirement 8):
    // its CAS stamped AND its bell fired.
    expect(fake.raw.$transaction).toHaveBeenCalledTimes(1)
    expect(fake.txs[0].casCalls).toHaveLength(1)
    expect(adminNotify).toHaveBeenCalledTimes(1)
    // a2 never started any operation.
    expect(res.outcome.full).toBe(true) // rows remaining — re-selected next scan
    expect(res.outcome.failedRows).toBe(0)
    expect(res.outcome.startedRows).toBe(1)
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
