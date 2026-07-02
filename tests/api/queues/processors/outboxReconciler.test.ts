import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma } from '../../../../generated/prisma/client'

// The outbox reconciler — re-pointed at the PR-A Task A3 split (spec §4.2) +
// the PR-C exact-row expiry accounting:
//   Phase A (outboxDbPhase, locked/DB-only): MAX_AGE expiry as ONE atomic
//   UPDATE … RETURNING "type" CTE (force-FAIL + NULL payload + per-type counts
//   from the EXACT transitioned rows — never a separate pre-update groupBy),
//   then the bounded/ordered stale-id scan. Pins preserved from the pre-split
//   reconcileOutbox: stale-recovery jobId = id, the deliverable window, "SENT
//   rows are never re-enqueued" (status=QUEUED filter), the 24h terminal policy.
//   Phase B (outboxSideEffects, unlocked/budgeted): the POST-COMMIT expiry
//   emission through the AlertSink FIRST, then the per-row-isolated re-enqueue
//   under the cooperative budget.
// The queue (enqueue) is MOCKED; the tx is a fake.

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }))
vi.mock('../../../../src/api/queues', () => ({ EMAIL_QUEUE: 'email', enqueue: enqueueMock }))

import {
  outboxDbPhase,
  outboxSideEffects,
  buildOutboxSweep,
  OUTBOX_SWEEP_LOCK_KEY,
  RECONCILE_GRACE_MS,
  RECONCILE_MAX_AGE_MS,
  RECONCILE_BATCH,
  type OutboxSide,
  type ExpiredTypeCount,
} from '../../../../src/api/queues/processors/outboxReconciler'
import type { PhaseBBudget } from '../../../../src/api/queues/maintenanceSweep'

function fakeTx(rows: Array<{ id: string }>, expired: ExpiredTypeCount[] = []) {
  const findMany = vi.fn(async (_args: unknown) => rows)
  const queryRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => expired)
  return {
    tx: {
      communicationLog: { findMany },
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient,
    findMany,
    queryRaw,
  }
}

function side(ids: string[], expired: ExpiredTypeCount[] = []): OutboxSide {
  return { ids, expired }
}

function budget(overrides: Partial<PhaseBBudget> = {}): PhaseBBudget {
  return { maxItems: 200, budgetMs: 60_000, monotonicNowMs: () => 0, isStopping: () => false, ...overrides }
}

const NOW = new Date('2026-06-10T12:00:00.000Z')

beforeEach(() => {
  enqueueMock.mockReset()
  enqueueMock.mockResolvedValue({ id: 'job' })
})

describe('outboxDbPhase — Phase A (locked, DB-only, DB clock)', () => {
  it('scans ONLY status=QUEUED rows in the deliverable window [MAX_AGE, GRACE) off dbNow, oldest-first, bounded', async () => {
    const { tx, findMany } = fakeTx([])
    await outboxDbPhase(tx, NOW)
    const args = findMany.mock.calls[0][0] as {
      where: { status: string; sentAt: { gte: Date; lt: Date } }
      orderBy: { sentAt: string }
      take: number
    }
    expect(args.where.status).toBe('QUEUED') // SENT/FAILED/BOUNCED never re-enqueued
    expect(args.where.sentAt.lt.getTime()).toBe(NOW.getTime() - RECONCILE_GRACE_MS)
    expect(args.where.sentAt.gte.getTime()).toBe(NOW.getTime() - RECONCILE_MAX_AGE_MS) // excludes expired rows
    expect(args.orderBy).toEqual({ sentAt: 'asc' })
    expect(args.take).toBe(RECONCILE_BATCH)
  })

  it('PR-C exact-row expiry: ONE atomic UPDATE … RETURNING "type" CTE — force-FAIL + NULL payload + per-type counts from the SAME statement, parameterized cutoff', async () => {
    const { tx, queryRaw } = fakeTx([], [{ type: 'login_otp', count: 3 }])
    const res = await outboxDbPhase(tx, NOW)
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join('?')
    expect(sql).toContain('WITH expired AS')
    expect(sql).toContain('UPDATE "CommunicationLog"')
    expect(sql).toContain(`SET "status" = 'FAILED', "payload" = NULL`) // terminal + secrets cleared
    expect(sql).toContain(`WHERE "status" = 'QUEUED'`) // only QUEUED rows expire
    expect(sql).toContain('RETURNING "type"')
    expect(sql).toContain('GROUP BY "type"') // breakdown aggregated FROM the returned rows
    expect(sql).not.toMatch(/\$\{|\d{4}-\d{2}-\d{2}/) // no interpolated value in the SQL text
    expect(values).toHaveLength(1)
    expect((values[0] as Date).getTime()).toBe(NOW.getTime() - RECONCILE_MAX_AGE_MS) // parameterized cutoff
    expect(res.sideEffects.expired).toEqual([{ type: 'login_otp', count: 3 }])
  })

  it('expiry runs BEFORE the re-enqueue scan (expired rows are excluded from side-effects)', async () => {
    const { tx, queryRaw, findMany } = fakeTx([{ id: 'live' }], [{ type: 'login_otp', count: 2 }])
    const res = await outboxDbPhase(tx, NOW)
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0])
    expect(res.sideEffects.ids).toEqual(['live'])
  })

  it('returns full=false below the batch cap and full=true (needsRescan) at a full batch', async () => {
    const few = await outboxDbPhase(fakeTx([{ id: 'a' }]).tx, NOW)
    expect(few.full).toBe(false)
    const fullBatch = Array.from({ length: RECONCILE_BATCH }, (_, i) => ({ id: `r${i}` }))
    const res = await outboxDbPhase(fakeTx(fullBatch).tx, NOW)
    expect(res.full).toBe(true) // the sweep stays on F_active until the backlog drains
  })

  it('no stale + nothing expired → empty side-effects, no enqueue touched', async () => {
    const res = await outboxDbPhase(fakeTx([]).tx, NOW)
    expect(res).toEqual({ full: false, sideEffects: { ids: [], expired: [] } })
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})

describe('outboxSideEffects — Phase B (unlocked, idempotent, cooperatively budgeted)', () => {
  it('re-enqueues each id with jobId = id (the §4.1 dedup mechanism; replay-safe by construction)', async () => {
    const res = await outboxSideEffects(side(['a', 'b']), budget())
    expect(res).toEqual({ full: false, failedRows: 0, startedRows: 2 })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'a' }, { jobId: 'a' })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'b' }, { jobId: 'b' })
  })

  it('a failed re-enqueue does not stop later rows and is reported as failedRows (→ sweep FAILURE, degraded backoff)', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis blip')) // 'a' fails
    const res = await outboxSideEffects(side(['a', 'b']), budget())
    expect(enqueueMock).toHaveBeenCalledTimes(2) // per-row isolation: 'b' still ran
    expect(res.failedRows).toBe(1) // classified FAILURE by runBoundedSweep — never SUCCESS/active
    expect(res.full).toBe(false) // the failure is NOT disguised as benign backlog
  })

  it('Redis fully down: every re-enqueue fails, later rows still attempted, ALL reported as failures (no silent hot loop)', async () => {
    enqueueMock.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const res = await outboxSideEffects(side(['a', 'b', 'c']), budget())
    expect(enqueueMock).toHaveBeenCalledTimes(3)
    expect(res.failedRows).toBe(3)
  })

  it('cooperative shutdown: isStopping() flips mid-batch ⇒ NO later re-enqueue starts', async () => {
    let stopping = false
    enqueueMock.mockImplementation(async (_q: string, data: { communicationLogId: string }) => {
      if (data.communicationLogId === 'b') stopping = true // stop requested while b is in flight
      return { id: 'job' }
    })
    const res = await outboxSideEffects(side(['a', 'b', 'c', 'd']), budget({ isStopping: () => stopping }))
    expect(enqueueMock.mock.calls.map((c) => (c[1] as { communicationLogId: string }).communicationLogId)).toEqual([
      'a',
      'b',
    ]) // c and d never started
    expect(res.full).toBe(true)
  })

  it('item cap bounds how many rows are STARTED (benign backlog: full=true, no failures)', async () => {
    const res = await outboxSideEffects(side(['a', 'b', 'c']), budget({ maxItems: 1 }))
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ full: true, failedRows: 0, startedRows: 1 })
  })
})

describe('outboxSideEffects — PR-C post-commit expiry emission', () => {
  it('emits the committed breakdown through the AlertSink FIRST — before any row work, so a budget stop cannot drop it', async () => {
    const order: string[] = []
    const sink = {
      expiredCommunications: vi.fn(() => void order.push('alert')),
    }
    enqueueMock.mockImplementation(async () => {
      order.push('enqueue')
      return { id: 'job' }
    })
    const res = await outboxSideEffects(
      side(['a'], [{ type: 'login_otp', count: 3 }, { type: 'merchant_claim', count: 1 }]),
      budget(),
      sink,
    )
    expect(sink.expiredCommunications).toHaveBeenCalledWith({
      sweep: 'outbox-reconcile',
      total: 4,
      byType: [
        { type: 'login_otp', count: 3 },
        { type: 'merchant_claim', count: 1 },
      ],
    })
    expect(order).toEqual(['alert', 'enqueue']) // emission precedes row work
    expect(res.startedRows).toBe(1)
  })

  it('emits NOTHING when the committed expiry transitioned zero rows', async () => {
    const sink = { expiredCommunications: vi.fn() }
    await outboxSideEffects(side(['a']), budget(), sink)
    expect(sink.expiredCommunications).not.toHaveBeenCalled()
  })

  it('without a sink the committed expiry falls back to a counts-and-labels-only warn (no payload/recipient data)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await outboxSideEffects(side([], [{ type: 'login_otp', count: 2 }]), budget())
      const logged = JSON.stringify(warn.mock.calls)
      expect(logged).toContain('expired 2 QUEUED row(s)')
      expect(logged).toContain('login_otp x2')
      expect(logged).not.toMatch(/@|http/)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('buildOutboxSweep — the BoundedSweepSpec wiring', () => {
  const CFG = {
    mode: 'enabled' as const,
    floorIdleMs: 1_800_000,
    floorActiveMs: 5000,
    phaseBMaxItems: 200,
    phaseBBudgetMs: 10_000,
    statementTimeoutMs: 4000,
    txTimeoutMs: 8000,
    sweepOutboxEnabled: true,
    sweepPendingHoursEnabled: true,
    sweepClaimStaleEnabled: true,
  }

  it('carries the sweep identity + the validated config values', () => {
    const spec = buildOutboxSweep(CFG)
    expect(spec.name).toBe('outbox-reconcile')
    expect(spec.lockKey).toBe(OUTBOX_SWEEP_LOCK_KEY)
    expect(spec.statementTimeoutMs).toBe(4000)
    expect(spec.txTimeoutMs).toBe(8000)
    expect(spec.phaseBMaxItems).toBe(200)
    expect(spec.phaseBBudgetMs).toBe(10_000)
    expect(spec.dbPhase).toBe(outboxDbPhase)
  })

  it('threads the AlertSink through runSideEffects (the post-commit expiry emission path)', async () => {
    const sink = { expiredCommunications: vi.fn() }
    const spec = buildOutboxSweep(CFG, sink)
    await spec.runSideEffects(side([], [{ type: 'login_otp', count: 1 }]), budget())
    expect(sink.expiredCommunications).toHaveBeenCalledWith({
      sweep: 'outbox-reconcile',
      total: 1,
      byType: [{ type: 'login_otp', count: 1 }],
    })
  })
})
