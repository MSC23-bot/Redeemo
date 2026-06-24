import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { isOpenNow, type Hours } from '../../../../src/api/shared/isOpenNow'

// Branches PR-4 (umbrella D4 §4c): the opening-hours 2-hour cool-off PROMOTION.
//
// A merchant hours edit STAGES a durable BranchOpeningHoursPending row
// (proposedHours + effectiveAt = stage time + 2h) instead of writing the live
// BranchOpeningHours immediately. Promotion is guaranteed by TWO layers on
// MAINTENANCE_QUEUE, both reading the durable row as the source of truth:
//   - a per-record DELAYED nudge (the handler -> promoteOnePendingHours), and
//   - a repeatable durable SWEEP (promotePendingHours, modelled on sweepStaleClaims).
//
// These pins exercise the PURE functions with a fake prisma (no Redis/BullMQ):
//   - the sweep promotes due PENDING rows, skips not-due / cancelled / promoted,
//     is idempotent, re-checks PENDING inside the transaction, and is per-row
//     resilient;
//   - the delayed-job handler promotes a still-due PENDING row and is a clean
//     no-op on a withdrawn / already-promoted / not-yet-due row (never trusts
//     job.data beyond the id);
//   - the customer read (isOpenNow) sees the LIVE rows only — invisible to the
//     staging record until promotion swaps the live rows;
//   - a staged cross-midnight window validates + promotes, and isOpenNow STILL
//     reads it closed (PR-4 does not touch isOpenNow — that fix is PR-8).

import {
  promoteOnePendingHours,
  promotePendingHours,
  PROMOTE_PENDING_HOURS_BATCH,
} from '../../../../src/api/queues/processors/promotePendingHours'

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
 * the live-rows-upsert can all be exercised realistically. `$transaction(fn)`
 * runs `fn` against the SAME fake (a single-process store, so the body sees its
 * own writes — good enough for these unit pins). `onScan` lets a test mutate the
 * store between the sweep's findMany and the per-row promote (the race pin).
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
  const upsertLive = vi.fn(async ({ where, create, update }: any) => {
    const { branchId, dayOfWeek } = where.branchId_dayOfWeek
    const existing = live.find((l) => l.branchId === branchId && l.dayOfWeek === dayOfWeek)
    if (existing) Object.assign(existing, update)
    else live.push({ branchId, dayOfWeek, openTime: null, closeTime: null, isClosed: false, ...create })
    return {}
  })

  const prisma = {
    branchOpeningHoursPending: { findUnique, findMany: findManyPending, update: updatePending },
    branchOpeningHours: { upsert: upsertLive },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  } as unknown as PrismaClient

  return { prisma, pendingStore, live, findUnique, findManyPending, updatePending, upsertLive }
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

describe('promotePendingHours — durable sweep (PR-4 §4c)', () => {
  it('promotes a PENDING row with effectiveAt <= now: live hours upserted + row PROMOTED + promotedAt', async () => {
    const { prisma, pendingStore, live } = fakePrisma([pendingRow()])
    const res = await promotePendingHours(prisma, NOW)

    expect(res).toEqual({ promoted: 1, scanned: 1 })
    const row = pendingStore.get('ph1')!
    expect(row.status).toBe('PROMOTED')
    expect(row.promotedAt).toEqual(NOW)
    // Every proposed day landed in the LIVE BranchOpeningHours.
    expect(live).toHaveLength(goodWeek.length)
    const monday = live.find((l) => l.dayOfWeek === 1)!
    expect(monday).toMatchObject({ branchId: 'b1', openTime: '10:00', closeTime: '20:00', isClosed: false })
    const sunday = live.find((l) => l.dayOfWeek === 0)!
    expect(sunday).toMatchObject({ isClosed: true, openTime: null, closeTime: null })
  })

  it('does NOT promote a row with effectiveAt > now (not yet due)', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow({ effectiveAt: NOT_DUE })])
    const res = await promotePendingHours(prisma, NOW)

    expect(res).toEqual({ promoted: 0, scanned: 0 }) // not even scanned (SQL filters effectiveAt <= now)
    expect(pendingStore.get('ph1')!.status).toBe('PENDING')
    expect(upsertLive).not.toHaveBeenCalled()
  })

  it('does NOT promote a CANCELLED row', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow({ status: 'CANCELLED', cancelledAt: DUE })])
    const res = await promotePendingHours(prisma, NOW)

    expect(res).toEqual({ promoted: 0, scanned: 0 }) // SQL filters status=PENDING
    expect(pendingStore.get('ph1')!.status).toBe('CANCELLED')
    expect(upsertLive).not.toHaveBeenCalled()
  })

  it('does NOT promote an already-PROMOTED row', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow({ status: 'PROMOTED', promotedAt: DUE })])
    const res = await promotePendingHours(prisma, NOW)

    expect(res).toEqual({ promoted: 0, scanned: 0 })
    expect(upsertLive).not.toHaveBeenCalled()
    expect(pendingStore.get('ph1')!.promotedAt).toEqual(DUE) // untouched
  })

  it('is IDEMPOTENT: running the sweep twice does not double-apply or error', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow()])
    const first = await promotePendingHours(prisma, NOW)
    const second = await promotePendingHours(prisma, NOW)

    expect(first).toEqual({ promoted: 1, scanned: 1 })
    // Second run: the row is now PROMOTED, so the SQL scan no longer returns it.
    expect(second).toEqual({ promoted: 0, scanned: 0 })
    expect(pendingStore.get('ph1')!.status).toBe('PROMOTED')
    // The live upsert ran exactly once per day (not twice).
    expect(upsertLive).toHaveBeenCalledTimes(goodWeek.length)
  })

  it('in-transaction re-check skips a row CANCELLED between the scan and the promote', async () => {
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
    const res = await promotePendingHours(fake.prisma, NOW)

    expect(res.scanned).toBe(1) // it WAS scanned (before the cancel)
    expect(res.promoted).toBe(0) // but the in-tx re-check saw CANCELLED ⇒ no-op
    expect(fake.upsertLive).not.toHaveBeenCalled()
    expect(store.get('ph1')!.status).toBe('CANCELLED') // cancel wins
  })

  it('per-row try/catch: one bad row does not abort the batch', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([
      pendingRow({ id: 'bad', branchId: 'b-bad' }),
      pendingRow({ id: 'good', branchId: 'b-good' }),
    ])
    // Make the FIRST promoted row's live upsert throw; the second must still promote.
    upsertLive.mockImplementationOnce(async () => { throw new Error('db blip on first day') })
    const res = await promotePendingHours(prisma, NOW)

    expect(res.scanned).toBe(2)
    expect(res.promoted).toBe(1) // only the good row promoted; the bad row threw + was skipped
    const statuses = [...pendingStore.values()].map((r) => r.status).sort()
    expect(statuses).toEqual(['PENDING', 'PROMOTED']) // bad row stays PENDING (will retry next sweep)
  })

  it('scans index-backed (status=PENDING, effectiveAt<=now), bounded + ordered', async () => {
    const { prisma, findManyPending } = fakePrisma([pendingRow()])
    await promotePendingHours(prisma, NOW)
    const args = findManyPending.mock.calls[0][0] as any
    expect(args.where.status).toBe('PENDING')
    expect(args.where.effectiveAt.lte.getTime()).toBe(NOW.getTime())
    expect(args.take).toBe(PROMOTE_PENDING_HOURS_BATCH)
    expect(args.orderBy).toEqual({ effectiveAt: 'asc' })
  })
})

describe('promoteOnePendingHours — delayed-job handler (PR-4 §4c)', () => {
  it('promotes a still-PENDING due row (live upserted + row PROMOTED)', async () => {
    const { prisma, pendingStore, live } = fakePrisma([pendingRow()])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(true)
    expect(pendingStore.get('ph1')!.status).toBe('PROMOTED')
    expect(live).toHaveLength(goodWeek.length)
  })

  it('is a clean no-op for a withdrawn (CANCELLED) row (never trusts job.data)', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow({ status: 'CANCELLED', cancelledAt: DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(upsertLive).not.toHaveBeenCalled()
    expect(pendingStore.get('ph1')!.status).toBe('CANCELLED')
  })

  it('is a clean no-op for an already-PROMOTED row (idempotent)', async () => {
    const { prisma, upsertLive } = fakePrisma([pendingRow({ status: 'PROMOTED', promotedAt: DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(upsertLive).not.toHaveBeenCalled()
  })

  it('is a clean no-op for a not-yet-due row (effectiveAt > now)', async () => {
    const { prisma, pendingStore, upsertLive } = fakePrisma([pendingRow({ effectiveAt: NOT_DUE })])
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)

    expect(promoted).toBe(false)
    expect(upsertLive).not.toHaveBeenCalled()
    expect(pendingStore.get('ph1')!.status).toBe('PENDING') // untouched, will promote when due
  })

  it('is a clean no-op for a missing row id', async () => {
    const { prisma, upsertLive } = fakePrisma([])
    const promoted = await promoteOnePendingHours(prisma, 'does-not-exist', NOW)

    expect(promoted).toBe(false)
    expect(upsertLive).not.toHaveBeenCalled()
  })

  it('runs the status flip + live upsert inside ONE $transaction (no half-apply)', async () => {
    const { prisma } = fakePrisma([pendingRow()])
    await promoteOnePendingHours(prisma, 'ph1', NOW)
    expect((prisma.$transaction as any)).toHaveBeenCalledTimes(1)
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

describe('cross-midnight — staged overnight window promotes but isOpenNow still reads closed (PR-4 §8, PR-8-deferred)', () => {
  // An overnight Friday window: 22:00 -> 02:00 (close < open). validateOpeningHours
  // ACCEPTS this (overnight is allowed); isOpenNow renders it perpetually closed
  // because it uses a half-open same-day interval + reads only today's row. PR-4
  // does NOT touch isOpenNow — this pins that the deferred-to-PR-8 behaviour is
  // unchanged: an overnight window may stage + promote, and still mis-displays.
  const overnightFriday: ProposedDay[] = [
    { dayOfWeek: 5, openTime: '22:00', closeTime: '02:00', isClosed: false },
  ]
  // Friday 26 June 2026 23:00 UTC = midnight BST is past; pick 23:30 BST inside the
  // intended overnight window. 22:30 UTC = 23:30 BST, Friday, dayOfWeek = 5.
  const FRI_2330_BST = new Date('2026-06-26T22:30:00.000Z')

  it('promotes the overnight window into the live rows', async () => {
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: overnightFriday })], { live: [] })
    const promoted = await promoteOnePendingHours(prisma, 'ph1', NOW)
    expect(promoted).toBe(true)
    expect(live.find((l) => l.dayOfWeek === 5)).toMatchObject({ openTime: '22:00', closeTime: '02:00', isClosed: false })
  })

  it('isOpenNow STILL reads the promoted overnight window as CLOSED (PR-8-deferred, NOT a PR-4 regression)', async () => {
    const { prisma, live } = fakePrisma([pendingRow({ proposedHours: overnightFriday })], { live: [] })
    await promoteOnePendingHours(prisma, 'ph1', NOW)
    const customerHours: Hours[] = live.map((l) => ({ dayOfWeek: l.dayOfWeek, openTime: l.openTime, closeTime: l.closeTime, isClosed: l.isClosed }))
    // 23:30 BST is INSIDE 22:00-02:00 conceptually, but isOpenNow's same-day
    // half-open interval (nowMins >= openMins && nowMins < closeMins) yields false
    // because closeMins (120) < openMins (1320). Documents the deferred bug.
    expect(isOpenNow(customerHours, FRI_2330_BST)).toBe(false)
  })
})
