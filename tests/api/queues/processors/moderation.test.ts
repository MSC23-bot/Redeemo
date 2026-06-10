import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '../../../../generated/prisma/client'

// Phase 0 PR-0.6: the MODERATION_QUEUE scan worker. Pins the status transitions
// (CLEAN→APPROVED, FLAGGED→FLAGGED, UNAVAILABLE→leave PENDING), the PENDING-only
// guard (never override a resolved/admin decision), and the dedup-safe enqueue.
// scanImage + the queue are MOCKED; prisma is a fake.

const { scanImageMock } = vi.hoisted(() => ({ scanImageMock: vi.fn() }))
vi.mock('../../../../src/api/shared/moderation', () => ({ scanImage: scanImageMock }))

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }))
vi.mock('../../../../src/api/queues', () => ({
  MODERATION_QUEUE: 'moderation',
  BULLMQ_PREFIX: 'redeemo',
  enqueue: enqueueMock,
}))

import {
  processModerationJob,
  enqueuePhotoModeration,
} from '../../../../src/api/queues/processors/moderation'

function fakePrisma(photo: { id: string; url: string; moderationStatus: string } | null) {
  const findUnique = vi.fn(async (_args: unknown) => photo)
  const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
  return {
    prisma: { branchPhoto: { findUnique, updateMany } } as unknown as PrismaClient,
    findUnique,
    updateMany,
  }
}

beforeEach(() => {
  scanImageMock.mockReset()
  enqueueMock.mockReset()
  enqueueMock.mockResolvedValue({ id: 'job' })
})

describe('processModerationJob — status transitions (PENDING only)', () => {
  it('CLEAN → APPROVED + sets moderationCheckedAt + no detail', async () => {
    scanImageMock.mockResolvedValue('CLEAN')
    const { prisma, updateMany } = fakePrisma({ id: 'p1', url: 'u', moderationStatus: 'PENDING' })
    expect(await processModerationJob(prisma, { branchPhotoId: 'p1' })).toBe('approved')
    const call = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(call.where).toMatchObject({ id: 'p1', moderationStatus: 'PENDING' }) // race-safe
    expect(call.data.moderationStatus).toBe('APPROVED')
    expect(call.data.moderationCheckedAt).toBeInstanceOf(Date)
    expect(call.data.moderationDetail).toBeNull()
  })

  it('FLAGGED → FLAGGED + records a detail', async () => {
    scanImageMock.mockResolvedValue('FLAGGED')
    const { prisma, updateMany } = fakePrisma({ id: 'p1', url: 'u', moderationStatus: 'PENDING' })
    expect(await processModerationJob(prisma, { branchPhotoId: 'p1' })).toBe('flagged')
    const call = updateMany.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.moderationStatus).toBe('FLAGGED')
    expect(call.data.moderationDetail).toBeTruthy()
  })

  it('UNAVAILABLE → leaves the photo PENDING (NO db write, admin review)', async () => {
    scanImageMock.mockResolvedValue('UNAVAILABLE')
    const { prisma, updateMany } = fakePrisma({ id: 'p1', url: 'u', moderationStatus: 'PENDING' })
    expect(await processModerationJob(prisma, { branchPhotoId: 'p1' })).toBe('unavailable')
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('reports skipped-terminal when the race-safe write matches 0 rows (admin flipped it concurrently)', async () => {
    scanImageMock.mockResolvedValue('FLAGGED')
    const { prisma, updateMany } = fakePrisma({ id: 'p1', url: 'u', moderationStatus: 'PENDING' })
    updateMany.mockResolvedValueOnce({ count: 0 }) // row left PENDING-state between read + write
    // outcome reflects that the scan did NOT apply (admin decision preserved), not the stale verdict
    expect(await processModerationJob(prisma, { branchPhotoId: 'p1' })).toBe('skipped-terminal')
  })
})

describe('processModerationJob — guards', () => {
  it('skips a non-PENDING photo without scanning (never overrides an admin/earlier decision)', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'p1', url: 'u', moderationStatus: 'APPROVED' })
    expect(await processModerationJob(prisma, { branchPhotoId: 'p1' })).toBe('skipped-terminal')
    expect(scanImageMock).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('acks a missing photo row', async () => {
    const { prisma } = fakePrisma(null)
    expect(await processModerationJob(prisma, { branchPhotoId: 'gone' })).toBe('skipped-missing')
    expect(scanImageMock).not.toHaveBeenCalled()
  })
})

describe('enqueuePhotoModeration', () => {
  it('enqueues to MODERATION_QUEUE with jobId = photo id (dedup-safe)', async () => {
    await enqueuePhotoModeration('p1')
    expect(enqueueMock).toHaveBeenCalledWith('moderation', { branchPhotoId: 'p1' }, { jobId: 'p1' })
  })
})
