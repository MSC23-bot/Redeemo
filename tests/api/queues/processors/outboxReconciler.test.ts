import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '../../../../generated/prisma/client'

// Phase 0 PR-0.4 (§4.1 rule 4 + the MAX_AGE backstop): the outbox reconciler.
// Pins: stale-recovery re-enqueue (jobId = id), the bounded/ordered scan, the
// "SENT rows are never re-enqueued" invariant (query filters status=QUEUED), and
// the MAX_AGE expiry that force-FAILs + nulls payload on rows that never reached
// terminal (bounds both payload retention AND endless re-enqueue).
// The queue (enqueue) is MOCKED; prisma is a fake.

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }))
vi.mock('../../../../src/api/queues', () => ({ EMAIL_QUEUE: 'email', enqueue: enqueueMock }))

import {
  reconcileOutbox,
  RECONCILE_GRACE_MS,
  RECONCILE_MAX_AGE_MS,
  RECONCILE_BATCH,
} from '../../../../src/api/queues/processors/outboxReconciler'

function fakePrisma(rows: Array<{ id: string }>, expiredCount = 0) {
  const findMany = vi.fn(async (_args: unknown) => rows)
  const updateMany = vi.fn(async (_args: unknown) => ({ count: expiredCount }))
  return {
    prisma: { communicationLog: { findMany, updateMany } } as unknown as PrismaClient,
    findMany,
    updateMany,
  }
}

beforeEach(() => {
  enqueueMock.mockReset()
  enqueueMock.mockResolvedValue({ id: 'job' })
})

describe('reconcileOutbox — stale-QUEUED recovery', () => {
  it('re-enqueues each stale row with jobId = id (the §4.1 dedup mechanism)', async () => {
    const { prisma } = fakePrisma([{ id: 'a' }, { id: 'b' }])
    const res = await reconcileOutbox(prisma)
    expect(res).toEqual({ reEnqueued: 2, expired: 0 })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'a' }, { jobId: 'a' })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'b' }, { jobId: 'b' })
  })

  it('re-enqueues ONLY status=QUEUED rows in the deliverable window [MAX_AGE, GRACE), oldest-first, bounded', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z')
    const { prisma, findMany } = fakePrisma([])
    await reconcileOutbox(prisma, now)
    const args = findMany.mock.calls[0][0] as {
      where: { status: string; sentAt: { gte: Date; lt: Date } }
      orderBy: { sentAt: string }
      take: number
    }
    expect(args.where.status).toBe('QUEUED') // SENT/FAILED/BOUNCED never re-enqueued
    expect(args.where.sentAt.lt.getTime()).toBe(now.getTime() - RECONCILE_GRACE_MS)
    expect(args.where.sentAt.gte.getTime()).toBe(now.getTime() - RECONCILE_MAX_AGE_MS) // excludes expired rows
    expect(args.orderBy).toEqual({ sentAt: 'asc' })
    expect(args.take).toBe(RECONCILE_BATCH)
  })
})

describe('reconcileOutbox — MAX_AGE expiry (bounds payload retention + re-enqueue)', () => {
  it('force-FAILs + NULLs payload on rows older than MAX_AGE (one bulk updateMany)', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z')
    const { prisma, updateMany } = fakePrisma([], 3) // 3 rows expired
    const res = await reconcileOutbox(prisma, now)
    expect(res.expired).toBe(3)
    const args = updateMany.mock.calls[0][0] as {
      where: { status: string; sentAt: { lt: Date } }
      data: { status: string; payload: unknown }
    }
    expect(args.where.status).toBe('QUEUED')
    expect(args.where.sentAt.lt.getTime()).toBe(now.getTime() - RECONCILE_MAX_AGE_MS)
    expect(args.data.status).toBe('FAILED') // terminal ⇒ no longer re-enqueued
    expect('payload' in args.data).toBe(true) // payload nulled ⇒ secrets cleared
  })

  it('expiry runs BEFORE re-enqueue (expired rows are excluded from the re-enqueue scan)', async () => {
    const { prisma, updateMany, findMany } = fakePrisma([{ id: 'live' }], 2)
    const res = await reconcileOutbox(prisma)
    // both ran; expired counted; only the in-window row re-enqueued
    expect(res).toEqual({ reEnqueued: 1, expired: 2 })
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'live' }, { jobId: 'live' })
  })
})

describe('reconcileOutbox — idempotent + resilient', () => {
  it('running twice always re-enqueues by the SAME deterministic jobId (BullMQ dedups the overlap)', async () => {
    const { prisma } = fakePrisma([{ id: 'a' }])
    await reconcileOutbox(prisma)
    await reconcileOutbox(prisma)
    expect(enqueueMock).toHaveBeenNthCalledWith(1, 'email', { communicationLogId: 'a' }, { jobId: 'a' })
    expect(enqueueMock).toHaveBeenNthCalledWith(2, 'email', { communicationLogId: 'a' }, { jobId: 'a' })
  })

  it('a failed re-enqueue is logged + skipped; the rest still go through', async () => {
    const { prisma } = fakePrisma([{ id: 'a' }, { id: 'b' }])
    enqueueMock.mockRejectedValueOnce(new Error('redis blip')) // 'a' fails
    const res = await reconcileOutbox(prisma)
    expect(res.reEnqueued).toBe(1) // only 'b' succeeded
    expect(enqueueMock).toHaveBeenCalledTimes(2)
  })

  it('no stale + nothing expired → no enqueue, zero counts', async () => {
    const { prisma } = fakePrisma([])
    expect(await reconcileOutbox(prisma)).toEqual({ reEnqueued: 0, expired: 0 })
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
