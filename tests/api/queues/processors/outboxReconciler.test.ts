import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '../../../../generated/prisma/client'

// The outbox reconciler — re-pointed at the PR-A Task A3 split (spec §4.2):
//   Phase A (outboxDbPhase, locked/DB-only): MAX_AGE expiry (force-FAIL + NULL
//   payload) then the bounded/ordered stale-id scan. Pins preserved from the
//   pre-split reconcileOutbox: stale-recovery jobId = id, the deliverable
//   window, "SENT rows are never re-enqueued" (status=QUEUED filter), and the
//   24h terminal policy.
//   Phase B (outboxSideEffects, unlocked/budgeted): per-row-isolated
//   re-enqueue under the cooperative budget (item cap / monotonic time /
//   terminal isStopping shutdown predicate).
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
} from '../../../../src/api/queues/processors/outboxReconciler'
import type { PhaseBBudget } from '../../../../src/api/queues/maintenanceSweep'

function fakeTx(rows: Array<{ id: string }>, expiredCount = 0) {
  const findMany = vi.fn(async (_args: unknown) => rows)
  const updateMany = vi.fn(async (_args: unknown) => ({ count: expiredCount }))
  return {
    tx: { communicationLog: { findMany, updateMany } } as unknown as Prisma.TransactionClient,
    findMany,
    updateMany,
  }
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

  it('force-FAILs + NULLs payload on rows older than MAX_AGE (one bulk updateMany, 24h terminal policy preserved)', async () => {
    const { tx, updateMany } = fakeTx([], 3)
    await outboxDbPhase(tx, NOW)
    const args = updateMany.mock.calls[0][0] as {
      where: { status: string; sentAt: { lt: Date } }
      data: { status: string; payload: unknown }
    }
    expect(args.where.status).toBe('QUEUED')
    expect(args.where.sentAt.lt.getTime()).toBe(NOW.getTime() - RECONCILE_MAX_AGE_MS)
    expect(args.data.status).toBe('FAILED') // terminal ⇒ no longer re-enqueued
    expect(args.data.payload).toBe(Prisma.DbNull) // payload nulled ⇒ secrets cleared
  })

  it('expiry runs BEFORE the re-enqueue scan (expired rows are excluded from side-effects)', async () => {
    const { tx, updateMany, findMany } = fakeTx([{ id: 'live' }], 2)
    const res = await outboxDbPhase(tx, NOW)
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0])
    expect(res.sideEffects).toEqual(['live'])
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
    expect(res).toEqual({ full: false, sideEffects: [] })
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})

describe('outboxSideEffects — Phase B (unlocked, idempotent, cooperatively budgeted)', () => {
  it('re-enqueues each id with jobId = id (the §4.1 dedup mechanism; replay-safe by construction)', async () => {
    const res = await outboxSideEffects(['a', 'b'], budget())
    expect(res.full).toBe(false)
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'a' }, { jobId: 'a' })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'b' }, { jobId: 'b' })
  })

  it('a failed re-enqueue is skipped, the rest still go through, and the sweep reports needsRescan', async () => {
    enqueueMock.mockRejectedValueOnce(new Error('redis blip')) // 'a' fails
    const res = await outboxSideEffects(['a', 'b'], budget())
    expect(enqueueMock).toHaveBeenCalledTimes(2) // per-row isolation: 'b' still ran
    expect(res.full).toBe(true) // the failed durable row is re-selected next scan
  })

  it('cooperative shutdown: isStopping() flips mid-batch ⇒ NO later re-enqueue starts', async () => {
    let stopping = false
    enqueueMock.mockImplementation(async (_q: string, data: { communicationLogId: string }) => {
      if (data.communicationLogId === 'b') stopping = true // stop requested while b is in flight
      return { id: 'job' }
    })
    const res = await outboxSideEffects(['a', 'b', 'c', 'd'], budget({ isStopping: () => stopping }))
    expect(enqueueMock.mock.calls.map((c) => (c[1] as { communicationLogId: string }).communicationLogId)).toEqual([
      'a',
      'b',
    ]) // c and d never started
    expect(res.full).toBe(true)
  })

  it('item cap bounds how many rows are STARTED', async () => {
    const res = await outboxSideEffects(['a', 'b', 'c'], budget({ maxItems: 1 }))
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    expect(res.full).toBe(true)
  })
})

describe('buildOutboxSweep — the BoundedSweepSpec wiring', () => {
  it('carries the sweep identity + the validated config values', () => {
    const spec = buildOutboxSweep({
      mode: 'enabled',
      floorIdleMs: 1_800_000,
      floorActiveMs: 5000,
      phaseBMaxItems: 200,
      phaseBBudgetMs: 10_000,
      statementTimeoutMs: 4000,
      txTimeoutMs: 8000,
      sweepOutboxEnabled: true,
    })
    expect(spec.name).toBe('outbox-reconcile')
    expect(spec.lockKey).toBe(OUTBOX_SWEEP_LOCK_KEY)
    expect(spec.statementTimeoutMs).toBe(4000)
    expect(spec.txTimeoutMs).toBe(8000)
    expect(spec.phaseBMaxItems).toBe(200)
    expect(spec.phaseBBudgetMs).toBe(10_000)
    expect(spec.dbPhase).toBe(outboxDbPhase)
    expect(spec.runSideEffects).toBe(outboxSideEffects)
  })
})
