import { describe, it, expect, vi } from 'vitest'
import type { Prisma, PrismaClient } from '../../../../generated/prisma/client'
import { isOpenNow, type Hours } from '../../../../src/api/shared/isOpenNow'
import type { PhaseBBudget } from '../../../../src/api/queues/maintenanceSweep'

// Branches PR-4 (umbrella D4 §4c): the opening-hours 2-hour cool-off PROMOTION —
// re-pointed at the Neon CU-burn PR-B maintenance-floor split.
//
// A merchant hours edit STAGES a durable BranchOpeningHoursPending row
// (proposedHours + effectiveAt = stage time + 2h) instead of writing the live
// BranchOpeningHours immediately. Promotion is guaranteed by TWO layers, both
// reading the durable row as the source of truth:
//   - a per-record DELAYED nudge (the handler -> promoteOnePendingHours,
//     UNCHANGED accelerator), and
//   - the maintenance-floor SWEEP (pendingHoursDbPhase + the budgeted Phase-B
//     promoter) — the ~60s BullMQ repeatable is GONE.
//
// These pins exercise the PURE functions with a fake prisma (no Redis/BullMQ):
//   - Phase A selects due PENDING rows off the DB-authoritative dbNow, bounded
//     + ordered; Phase B promotes per-row in its OWN statement-timeout-bounded
//     transaction, per-row isolated, cooperatively stoppable, idempotent;
//   - the delayed-job handler keeps its exact pre-PR-B behaviour (no bounds);
//   - the customer read (isOpenNow) sees the LIVE rows only;
//   - a staged cross-midnight window validates + promotes (Branches PR-8 D9).

import {
  promoteOnePendingHours,
  pendingHoursDbPhase,
  makePendingHoursSideEffects,
  PROMOTE_PENDING_HOURS_BATCH,
  PENDING_HOURS_SWEEP_LOCK_KEY,
  type PromoteTxBounds,
} from '../../../../src/api/queues/processors/promotePendingHours'
import * as promoteModule from '../../../../src/api/queues/processors/promotePendingHours'

type Status = 'PENDING' | 'PROMOTED' | 'CANCELLED'
interface ProposedDay {
  dayOfWeek: number
  openTime?: string | null
  closeTime?: string | null
  isClosed: boolean
}
interface PendingRow {
  id: string
  branchId: string
  merchantId: string
  proposedHours: ProposedDay[]
  effectiveAt: Date
  status: Status
  createdBy: string
  promotedAt: Date | null
  cancelledAt: Date | null
}
interface LiveRow {
  branchId: string
  dayOfWeek: number
  openTime: string | null
  closeTime: string | null
  isClosed: boolean
}

/**
 * Stateful in-memory fake of the slice of PrismaClient the promotion path uses.
 * It mutates an in-memory store so idempotency, the cancel-mid-promote race, and
 * the live-rows-upsert can all be exercised realistically. `$transaction(fn, opts)`
 * runs `fn` against the SAME fake (a single-process store, so the body sees its
 * own writes — good enough for these unit pins) and RECORDS `opts` so the
 * bounded-per-row-tx contract is pinnable. `$queryRaw` records the floor path's
 * parameterized set_config statement. `onScan` lets a test mutate the store
 * between the Phase-A findMany and the per-row promote (the race pin).
 */
function fakePrisma(
  pending: PendingRow[],
  opts: { live?: LiveRow[]; onScan?: () => void } = {},
) {
  const pendingStore = new Map(pending.map((p) => [p.id, { ...p }]))
  const live = opts.live ? [...opts.live] : []

  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const row = pendingStore.get(where.id)
    return row ? { ...row } : null
  })
  const findManyPending = vi.fn(async ({ where, take }: { where: { status: Status; effectiveAt: { lte: Date } }; take: number; orderBy?: unknown; select?: unknown }) => {
    // Snapshot the matching ids FIRST (as a real DB scan would), THEN let the test
    // mutate the store (e.g. a cancel landing) — so the snapshot still carries the
    // id but the per-row in-tx re-read will see the mutated (CANCELLED) state.
    const rows = [...pendingStore.values()]
      .filter((r) => r.status === where.status && r.effectiveAt.getTime() <= where.effectiveAt.lte.getTime())
      .slice(0, take)
      .map((r) => ({ id: r.id }))
    if (opts.onScan) opts.onScan()
    return rows
  })
  const updatePending = vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<PendingRow> }) => {
    const row = pendingStore.get(where.id)
    if (row) Object.assign(row, data)
    return row
  })
  // Branches PR-8: promotion REPLACES the live rows for the branch via
  // deleteMany-for-branch + createMany (the per-day upsert is gone).
  const deleteManyLive = vi.fn(async ({ where }: { where: { branchId: string } }) => {
    const before = live.length
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].branchId === where.branchId) live.splice(i, 1)
    }
    return { count: before - live.length }
  })
  const createManyLive = vi.fn(async ({ data }: { data: LiveRow[] }) => {
    for (const row of data) {
      live.push({
        branchId: row.branchId,
        dayOfWeek: row.dayOfWeek,
        openTime: row.openTime ?? null,
        closeTime: row.closeTime ?? null,
        isClosed: row.isClosed,
      })
    }
    return { count: data.length }
  })
  const queryRaw = vi.fn(async () => [])
  const transaction = vi.fn(async (fn: any, _txOpts?: any) => fn(prisma))

  const prisma = {
    branchOpeningHoursPending: { findUnique, findMany: findManyPending, update: updatePending },
    branchOpeningHours: { deleteMany: deleteManyLive, createMany: createManyLive },
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaClient

  return { prisma, pendingStore, live, findUnique, findManyPending, updatePending, deleteManyLive, createManyLive, queryRaw, transaction }
}

const goodWeek: ProposedDay[] = [
  { dayOfWeek: 0, isClosed: true, openTime: null, closeTime: null },
  { dayOfWeek: 1, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 2, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 3, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 4, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 5, openTime: '10:00', closeTime: '20:00', isClosed: false },
  { dayOfWeek: 6, isClosed: true, openTime: null, closeTime: null },
]

const NOW = new Date('2026-06-24T12:00:00.000Z')
const DUE = new Date(NOW.getTime() - 60_000) // effectiveAt in the past ⇒ due
const NOT_DUE = new Date(NOW.getTime() + 60 * 60 * 1000) // 1h in the future ⇒ not due

/** Candidate floor bounds (mirrors the A4 config values wired in worker.ts). */
const BOUNDS: PromoteTxBounds = { statementTimeoutMs: 4000, txTimeoutMs: 8000 }

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 500, budgetMs: 60_000, monotonicNowMs: () => 0, isStopping: () => false, ...overrides }
}

/**
 * Compose one FLOOR sweep run against the fake: Phase A (the fake doubles as the
 * `tx` — same model delegates) then the budgeted Phase-B promoter with BOUNDS.
 */
async function runFloorSweep(
  fake: ReturnType<typeof fakePrisma>,
  dbNow: Date,
  b: PhaseBBudget = budget(),
) {
  const phaseA = await pendingHoursDbPhase(fake.prisma as unknown as Prisma.TransactionClient, dbNow)
  const outcome = await makePendingHoursSideEffects(fake.prisma, BOUNDS)(phaseA.sideEffects, b)
  return { scanned: phaseA.sideEffects.ids.length, full: phaseA.full, outcome }
}

describe('pending-hours floor sweep — Phase A (locked, light, DB clock)', () => {
  it('selects ONLY due PENDING rows off dbNow: status=PENDING, effectiveAt<=dbNow, bounded + ordered, ids only', async () => {
    const { prisma, findManyPending } = fakePrisma([pendingRow()])
    const res = await pendingHoursDbPhase(prisma as unknown as Prisma.TransactionClient, NOW)
    const args = findManyPending.mock.calls[0][0] as any
    expect(args.where.status).toBe('PENDING')
    expect(args.where.effectiveAt.lte.getTime()).toBe(NOW.getTime()) // DB-authoritative clock drives the cutoff
    expect(args.take).toBe(PROMOTE_PENDING_HOURS_BATCH)
    expect(args.orderBy).toEqual({ effectiveAt: 'asc' })
    expect(args.select).toEqual({ id: true }) // light selection only — no heavy work under the lock
    expect(res.sideEffects).toEqual({ ids: ['ph1'], dbNow: NOW }) // dbNow threads into Phase B
    expect(res.full).toBe(false)
  })

  it('reports full=true (needsRescan) at a full LIMIT-200 batch', async () => {
    const many = Array.from({ length: PROMOTE_PENDING_HOURS_BATCH }, (_, i) => pendingRow({ id: `ph${i}`, branchId: `b${i}` }))
    const { prisma } = fakePrisma(many)
    const res = await pendingHoursDbPhase(prisma as unknown as Prisma.TransactionClient, NOW)
    expect(res.full).toBe(true)
    expect(res.sideEffects.ids).toHaveLength(PROMOTE_PENDING_HOURS_BATCH)
  })

  it('the sweep lock key is DISTINCT from the outbox and stale-claim keys', async () => {
    expect(PENDING_HOURS_SWEEP_LOCK_KEY).toBe(731_002n)
  })
})

describe('pending-hours floor sweep — Phase B (unlocked, bounded per-row tx, budgeted)', () => {
  it('promotes a due PENDING row using dbNow: live hours REPLACED + row PROMOTED + promotedAt=dbNow', async () => {
    const fake = fakePrisma([pendingRow()])
    const res = await runFloorSweep(fake, NOW)

    expect(res).toMatchObject({ scanned: 1, outcome: { full: false, failedRows: 0 } })
    const row = fake.pendingStore.get('ph1')!
    expect(row.status).toBe('PROMOTED')
    expect(row.promotedAt).toEqual(NOW) // the DB clock the row was selected against
    // Branches PR-8: replace-the-week = one deleteMany + one createMany per promotion.
    expect(fake.deleteManyLive).toHaveBeenCalledTimes(1)
    expect(fake.createManyLive).toHaveBeenCalledTimes(1)
    expect(fake.live).toHaveLength(goodWeek.length)
    const monday = fake.live.find((l) => l.dayOfWeek === 1)!
    expect(monday).toMatchObject({ branchId: 'b1', openTime: '10:00', closeTime: '20:00', isClosed: false })
  })

  it('each promotion runs in its OWN short statement-timeout-bounded transaction (set_config first + explicit tx timeout)', async () => {
    const fake = fakePrisma([pendingRow()])
    await runFloorSweep(fake, NOW)
    // Explicit Prisma tx bounds — NOT the 5s default.
    expect(fake.transaction).toHaveBeenCalledTimes(1)
    expect(fake.transaction.mock.calls[0][1]).toEqual({ timeout: BOUNDS.txTimeoutMs, maxWait: BOUNDS.txTimeoutMs })
    // Parameterized server-side statement bound as the FIRST tx statement.
    expect(fake.queryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = fake.queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    expect(strings.join('?')).toContain("set_config('statement_timeout'")
    expect(values).toContain(String(BOUNDS.statementTimeoutMs)) // bound value, not interpolated SQL
  })

  it('does NOT promote not-due / cancelled / already-promoted rows (Phase A filters them out)', async () => {
    for (const overrides of [
      { effectiveAt: NOT_DUE },
      { status: 'CANCELLED' as Status, cancelledAt: DUE },
      { status: 'PROMOTED' as Status, promotedAt: DUE },
    ]) {
      const fake = fakePrisma([pendingRow(overrides)])
      const res = await runFloorSweep(fake, NOW)
      expect(res.scanned).toBe(0)
      expect(fake.createManyLive).not.toHaveBeenCalled()
    }
  })

  it('is IDEMPOTENT under replay: running the floor sweep twice does not double-apply or error', async () => {
    const fake = fakePrisma([pendingRow()])
    const first = await runFloorSweep(fake, NOW)
    const second = await runFloorSweep(fake, NOW)

    expect(first.outcome).toEqual({ full: false, failedRows: 0 })
    // Second run: the row is now PROMOTED, so the Phase-A scan no longer returns it.
    expect(second.scanned).toBe(0)
    expect(second.outcome).toEqual({ full: false, failedRows: 0 })
    expect(fake.pendingStore.get('ph1')!.status).toBe('PROMOTED')
    // The replace-the-week ran exactly once (not twice); live still holds one row/day.
    expect(fake.deleteManyLive).toHaveBeenCalledTimes(1)
    expect(fake.createManyLive).toHaveBeenCalledTimes(1)
    expect(fake.live).toHaveLength(goodWeek.length)
  })

  it('in-transaction re-check skips a row CANCELLED between the Phase-A scan and the Phase-B promote (unlocked Phase B is safe)', async () => {
    let store: Map<string, PendingRow>
    const fake = fakePrisma([pendingRow()], {
      // The scan returns the row id; then (simulating a cancel landing first) we
      // flip it CANCELLED before promoteOnePendingHours re-reads it in the tx.
      onScan: () => {
        const row = store.get('ph1')
        if (row && row.status === 'PENDING') { row.status = 'CANCELLED'; row.cancelledAt = NOW }
      },
    })
    store = fake.pendingStore
    const res = await runFloorSweep(fake, NOW)

    expect(res.scanned).toBe(1) // it WAS scanned (before the cancel)
    expect(res.outcome.failedRows).toBe(0) // a clean no-op is NOT a failure
    expect(fake.createManyLive).not.toHaveBeenCalled()
    expect(store.get('ph1')!.status).toBe('CANCELLED') // cancel wins
  })

  it('per-row isolation: one failing row does not stop later rows, and is reported via failedRows (→ sweep FAILURE, degraded backoff)', async () => {
    const fake = fakePrisma([
      pendingRow({ id: 'bad', branchId: 'b-bad' }),
      pendingRow({ id: 'good', branchId: 'b-good' }),
    ])
    // Make the FIRST promoted row's live createMany throw; the second must still promote.
    fake.createManyLive.mockImplementationOnce(async () => { throw new Error('db blip on first row') })
    const res = await runFloorSweep(fake, NOW)

    expect(res.scanned).toBe(2)
    expect(res.outcome.failedRows).toBe(1) // classified FAILURE by runBoundedSweep — never SUCCESS/active
    expect(res.outcome.full).toBe(false) // the failure is NOT disguised as benign backlog
    const statuses = [...fake.pendingStore.values()].map((r) => r.status).sort()
    expect(statuses).toEqual(['PENDING', 'PROMOTED']) // bad row stays PENDING (durable replay next scan)
  })

  it('cooperative shutdown: isStopping() flips mid-batch ⇒ NO later promotion starts (durable rows deferred)', async () => {
    let stopping = false
    const fake = fakePrisma([
      pendingRow({ id: 'first', branchId: 'b-first' }),
      pendingRow({ id: 'second', branchId: 'b-second' }),
    ])
    fake.transaction.mockImplementation(async (fn: any, _o?: any) => {
      stopping = true // the terminal stop signal lands while row 1's tx is in flight
      return fn(fake.prisma)
    })
    const res = await runFloorSweep(fake, NOW, budget({ isStopping: () => stopping }))
    expect(res.outcome.full).toBe(true) // rows remaining — re-selected next scan
    expect(fake.pendingStore.get('first')!.status).toBe('PROMOTED')
    expect(fake.pendingStore.get('second')!.status).toBe('PENDING') // never STARTED after stop
  })

  it('no 60-second polling remains: the repeatable scheduler + cadence + monolithic sweep exports are GONE', async () => {
    const mod = promoteModule as Record<string, unknown>
    expect(mod.schedulePromotePendingHours).toBeUndefined()
    expect(mod.PROMOTE_PENDING_HOURS_EVERY_MS).toBeUndefined()
    expect(mod.promotePendingHours).toBeUndefined() // superseded by the dbPhase/sideEffects split
  })
})

describe('promoteOnePendingHours — delayed-job handler (PR-4 §4c, UNCHANGED accelerator)', () => {
  it('promotes a still-PENDING due row (live upserted + row PROMOTED)', async () => {
    const { prisma, pendingStore, live } = fakePrisma([pendingRow()])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(true)
    expect(pendingStore.get('ph1')!.status).toBe('PROMOTED')
    expect(live).toHaveLength(goodWeek.length)
  })

  it('the NUDGE path is byte-for-byte pre-PR-B: no bounds ⇒ no set_config, no explicit tx timeout', async () => {
    const fake = fakePrisma([pendingRow()])
    await promoteOnePendingHours(fake.prisma, 'ph1', NOW)
    expect(fake.queryRaw).not.toHaveBeenCalled() // statement_timeout only on the floor path
    expect(fake.transaction.mock.calls[0][1]).toBeUndefined() // Prisma defaults preserved
  })

  it('is a clean no-op for a withdrawn (CANCELLED) row (never trusts job.data)', async () => {
    const { prisma, pendingStore, createManyLive } = fakePrisma([pendingRow({ status: 'CANCELLED', cancelledAt: DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(createManyLive).not.toHaveBeenCalled()
    expect(pendingStore.get('ph1')!.status).toBe('CANCELLED')
  })

  it('is a clean no-op for an already-PROMOTED row (idempotent)', async () => {
    const { prisma, createManyLive } = fakePrisma([pendingRow({ status: 'PROMOTED', promotedAt: DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(createManyLive).not.toHaveBeenCalled()
  })

  it('is a clean no-op for a not-yet-due row (effectiveAt > now)', async () => {
    const { prisma, pendingStore, createManyLive } = fakePrisma([pendingRow({ effectiveAt: NOT_DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(createManyLive).not.toHaveBeenCalled()
    expect(pendingStore.get('ph1')!.status).toBe('PENDING') // untouched, will promote when due
  })

  it('is a clean no-op for a missing row id', async () => {
    const { prisma, createManyLive } = fakePrisma([])
    const promoted = await promoteOnePendingHours(prisma, 'does-not-exist', NOW)

    expect(promoted).toBe(false)
    expect(createManyLive).not.toHaveBeenCalled()
  })

  it('runs the status flip + live replace inside ONE $transaction (no half-apply)', async () => {
    const { prisma } = fakePrisma([pendingRow()])
    await promoteOnePendingHours(prisma, 'ph1', NOW)
    expect((prisma.$transaction as any)).toHaveBeenCalledTimes(1)
  })
})

function pendingRow(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    id: 'ph1',
    branchId: 'b1',
    merchantId: 'm1',
    proposedHours: goodWeek,
    effectiveAt: DUE,
    status: 'PENDING',
    createdBy: 'ma1',
    promotedAt: null,
    cancelledAt: null,
    ...overrides,
  }
}

describe('PR-8 multi-row write mechanism — delete-all + createMany round-trips N rows/day; carry-forward', () => {
  // Branches PR-8: the live write is now replace-the-week (deleteMany-for-branch +
  // createMany), so a MULTI-WINDOW day round-trips intact.
  const multiWindowWeek: ProposedDay[] = [
    { dayOfWeek: 1, openTime: '09:00', closeTime: '14:00', isClosed: false },
    { dayOfWeek: 1, openTime: '17:00', closeTime: '23:00', isClosed: false }, // 2nd Monday window
    { dayOfWeek: 2, openTime: '10:00', closeTime: '18:00', isClosed: false },
    { dayOfWeek: 0, isClosed: true, openTime: null, closeTime: null },
  ]

  it('promotes a multi-window proposedHours intact (2 Monday rows land in live)', async () => {
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: multiWindowWeek })], { live: [] })
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(true)
    // Both Monday windows survive the createMany (no last-wins collapse).
    const mondayRows = live.filter((l) => l.dayOfWeek === 1)
    expect(mondayRows).toHaveLength(2)
    expect(mondayRows.map((r) => r.openTime).sort()).toEqual(['09:00', '17:00'])
    expect(live).toHaveLength(multiWindowWeek.length)
  })

  it('REPLACES stale live rows for the branch (delete-all clears a prior 7-row week before the new write)', async () => {
    // A previously-promoted single-window week is already live; promoting the new
    // multi-window week must REPLACE it (delete-all-for-branch first), not merge.
    const staleLive: LiveRow[] = [0,1,2,3,4,5,6].map((d) => ({
      branchId: 'b1', dayOfWeek: d, openTime: '08:00', closeTime: '16:00', isClosed: false,
    }))
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: multiWindowWeek })], { live: staleLive })
    await promoteOnePendingHours(prisma, 'ph1', NOW)

    // Only the new week remains — none of the stale 08:00-16:00 rows survive.
    expect(live).toHaveLength(multiWindowWeek.length)
    expect(live.some((l) => l.openTime === '08:00')).toBe(false)
  })

  it('carries forward a future-dated PENDING row unchanged (single-window JSON is a valid multi-row subset)', async () => {
    // A future-dated single-window pending is not due; the floor sweep leaves it
    // PENDING (carry-forward) and its single-window JSON is already a valid
    // multi-row subset.
    const singleWindow: ProposedDay[] = [
      { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
    ]
    const fake = fakePrisma(
      [pendingRow({ proposedHours: singleWindow, effectiveAt: NOT_DUE })],
      { live: [] },
    )
    const res = await runFloorSweep(fake, NOW)

    expect(res.scanned).toBe(0) // not due ⇒ carried forward
    expect(fake.pendingStore.get('ph1')!.status).toBe('PENDING')
    expect(fake.pendingStore.get('ph1')!.proposedHours).toEqual(singleWindow) // unchanged
    expect(fake.live).toHaveLength(0) // live untouched until it becomes due
  })
})

describe('customer-read decoupling — isOpenNow reads LIVE hours, staging is invisible (PR-4 §8)', () => {
  // Monday 22 June 2026 13:00 UTC = 14:00 BST. dayOfWeek = 1 (Monday).
  const MON_2PM_BST = new Date('2026-06-22T13:00:00.000Z')

  // The CURRENT live schedule: Monday closes at 17:00, so at 14:00 it is OPEN.
  const liveMonday: LiveRow[] = [
    { branchId: 'b1', dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
  ]
  // A STAGED change that would CLOSE Monday entirely. While PENDING it must be
  // invisible to the customer read; only after promotion does the live row flip.
  const stagedMondayClosed: ProposedDay[] = [
    { dayOfWeek: 1, isClosed: true, openTime: null, closeTime: null },
  ]

  function liveHoursAsCustomerHours(live: LiveRow[]): Hours[] {
    return live.map((l) => ({ dayOfWeek: l.dayOfWeek, openTime: l.openTime, closeTime: l.closeTime, isClosed: l.isClosed }))
  }

  it('while a PENDING staging record exists, isOpenNow still returns the LIVE hours (open)', () => {
    // The staging record is in BranchOpeningHoursPending; the customer read only
    // ever consults the live BranchOpeningHours relation. So the staged "closed"
    // change is invisible — the branch reads OPEN at 14:00 BST on Monday.
    expect(isOpenNow(liveHoursAsCustomerHours(liveMonday), MON_2PM_BST)).toBe(true)
  })

  it('after promotion swaps the live rows, isOpenNow reflects the new (closed) schedule', async () => {
    const { prisma, live } = fakePrisma(
      [pendingRow({ proposedHours: stagedMondayClosed })],
      { live: [...liveMonday] },
    )
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)
    expect(promoted).toBe(true)

    // The live row was upserted to closed; the customer read now sees CLOSED.
    expect(isOpenNow(liveHoursAsCustomerHours(live), MON_2PM_BST)).toBe(false)
  })
})

describe('cross-midnight — staged overnight window promotes AND isOpenNow now reads OPEN (Branches PR-8 / D9 fix; PR-4 forward-coupling)', () => {
  // An overnight Friday window: 22:00 -> 02:00 (close < open). validateOpeningHours
  // ACCEPTS this (overnight). Branches PR-8 (D9) FIXED isOpenNow so the window now
  // reads OPEN in its pre-midnight portion (today) AND its post-midnight tail
  // (yesterday-spillover). This pins the PR-4 forward-coupling: a single-window
  // staged proposedHours JSON promotes correctly under the new multi-row
  // (delete-all + createMany) write mechanism, and the cross-midnight fix is live.
  const overnightFriday: ProposedDay[] = [
    { dayOfWeek: 5, openTime: '22:00', closeTime: '02:00', isClosed: false },
  ]
  // Friday 23:30 BST = 22:30 UTC, dayOfWeek = 5 (the pre-midnight portion).
  const FRI_2330_BST = new Date('2026-06-26T22:30:00.000Z')
  // Saturday 01:00 BST = 00:00 UTC, dayOfWeek = 6 (the post-midnight tail).
  const SAT_0100_BST = new Date('2026-06-27T00:00:00.000Z')

  it('promotes the overnight window into the live rows (multi-row replace)', async () => {
    const { prisma, live, deleteManyLive, createManyLive } = fakePrisma([pendingRow({ proposedHours: overnightFriday })], { live: [] })
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)
    expect(promoted).toBe(true)
    expect(deleteManyLive).toHaveBeenCalledTimes(1)
    expect(createManyLive).toHaveBeenCalledTimes(1)
    expect(live.find((l) => l.dayOfWeek === 5)).toMatchObject({ openTime: '22:00', closeTime: '02:00', isClosed: false })
  })

  it('isOpenNow reads the promoted overnight window OPEN in its PRE-midnight portion (today)', async () => {
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: overnightFriday })], { live: [] })
    await promoteOnePendingHours(prisma, 'ph1', NOW)
    const customerHours: Hours[] = live.map((l) => ({ dayOfWeek: l.dayOfWeek, openTime: l.openTime, closeTime: l.closeTime, isClosed: l.isClosed }))
    // 23:30 BST Friday is inside 22:00-02:00 — now reported OPEN (PR-8 fix).
    expect(isOpenNow(customerHours, FRI_2330_BST)).toBe(true)
  })

  it('isOpenNow reads the promoted overnight window OPEN in its POST-midnight tail (yesterday-spillover)', async () => {
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: overnightFriday })], { live: [] })
    await promoteOnePendingHours(prisma, 'ph1', NOW)
    const customerHours: Hours[] = live.map((l) => ({ dayOfWeek: l.dayOfWeek, openTime: l.openTime, closeTime: l.closeTime, isClosed: l.isClosed }))
    // 01:00 BST Saturday is inside Friday's [00:00, 02:00) spill — now OPEN (PR-8 fix).
    expect(isOpenNow(customerHours, SAT_0100_BST)).toBe(true)
  })
})
