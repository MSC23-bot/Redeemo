import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '../../../../generated/prisma/client'

// Phase 0 PR-0.4 (§4.1 rule 4): the outbox reconciler. Pins stale-recovery,
// idempotent re-enqueue (jobId = id), the bounded/ordered scan, and the
// "SENT rows are never re-enqueued" invariant (the query filters status=QUEUED).
// The queue (enqueue) is MOCKED; prisma is a fake.

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }))
vi.mock('../../../../src/api/queues', () => ({ EMAIL_QUEUE: 'email', enqueue: enqueueMock }))

import {
  reconcileOutbox,
  RECONCILE_GRACE_MS,
  RECONCILE_BATCH,
} from '../../../../src/api/queues/processors/outboxReconciler'

function fakePrisma(rows: Array<{ id: string }>) {
  const findMany = vi.fn(async (_args: unknown) => rows)
  return { prisma: { communicationLog: { findMany } } as unknown as PrismaClient, findMany }
}

beforeEach(() => {
  enqueueMock.mockReset()
  enqueueMock.mockResolvedValue({ id: 'job' })
})

describe('reconcileOutbox — stale-QUEUED recovery', () => {
  it('re-enqueues each stale row with jobId = id (the §4.1 dedup mechanism)', async () => {
    const { prisma } = fakePrisma([{ id: 'a' }, { id: 'b' }])
    const n = await reconcileOutbox(prisma)
    expect(n).toBe(2)
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'a' }, { jobId: 'a' })
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'b' }, { jobId: 'b' })
  })

  it('scans ONLY status=QUEUED rows older than GRACE, oldest-first, bounded by BATCH', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z')
    const { prisma, findMany } = fakePrisma([])
    await reconcileOutbox(prisma, now)
    const args = findMany.mock.calls[0][0] as {
      where: { status: string; sentAt: { lt: Date } }
      orderBy: { sentAt: string }
      take: number
    }
    expect(args.where.status).toBe('QUEUED') // SENT/FAILED/BOUNCED never re-enqueued
    expect(args.where.sentAt.lt.getTime()).toBe(now.getTime() - RECONCILE_GRACE_MS)
    expect(args.orderBy).toEqual({ sentAt: 'asc' })
    expect(args.take).toBe(RECONCILE_BATCH)
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
    const n = await reconcileOutbox(prisma)
    expect(n).toBe(1) // only 'b' succeeded
    expect(enqueueMock).toHaveBeenCalledTimes(2)
  })

  it('no stale rows → no enqueue, returns 0', async () => {
    const { prisma } = fakePrisma([])
    expect(await reconcileOutbox(prisma)).toBe(0)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
