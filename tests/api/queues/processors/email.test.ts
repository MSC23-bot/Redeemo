import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '../../../../generated/prisma/client'
import type { Job } from 'bullmq'

// Phase 0 PR-0.4: the EMAIL_QUEUE delivery worker. Pins the §4.1 worker
// invariants — skip-terminal idempotency, reconstruct-from-payload,
// idempotencyKey = row id, QUEUED→SENT/FAILED transitions + payload nulling.
// sendEmail is MOCKED (no Resend/network); prisma is a fake.

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }))
vi.mock('../../../../src/api/shared/email', () => ({ sendEmail: sendEmailMock }))

import { processEmailJob, onEmailJobFailed, type EmailJobData } from '../../../../src/api/queues/processors/email'

function fakePrisma(row: { id: string; status: string; payload: unknown } | null) {
  const findUnique = vi.fn(async (_args: unknown) => row)
  const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
  return {
    prisma: { communicationLog: { findUnique, updateMany } } as unknown as PrismaClient,
    findUnique,
    updateMany,
  }
}

const PAYLOAD = { to: 'maya@example.com', subject: 'Reset', html: '<a>reset</a>' }

beforeEach(() => {
  sendEmailMock.mockReset()
  sendEmailMock.mockResolvedValue({ skipped: false, externalId: 're_123', status: 'sent' })
})

describe('processEmailJob — happy path', () => {
  it('sends with idempotencyKey = row id, then flips QUEUED→SENT + nulls payload + records externalId', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: PAYLOAD })
    const outcome = await processEmailJob(prisma, { communicationLogId: 'clog-1' })

    expect(outcome).toBe('sent')
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'maya@example.com', idempotencyKey: 'clog-1' }))
    const call = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(call.where).toMatchObject({ id: 'clog-1', status: 'QUEUED' }) // race-safe: only flip a still-QUEUED row
    expect(call.data.status).toBe('SENT')
    expect(call.data.externalId).toBe('re_123')
    expect('payload' in call.data).toBe(true) // payload nulled on terminal
  })
})

describe('processEmailJob — §4.1 skip-terminal idempotency', () => {
  it('does NOT resend a row that is already terminal (SENT) — acks', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'SENT', payload: PAYLOAD })
    const outcome = await processEmailJob(prisma, { communicationLogId: 'clog-1' })
    expect(outcome).toBe('skipped-terminal')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('does NOT resend a BOUNCED row', async () => {
    const { prisma } = fakePrisma({ id: 'clog-1', status: 'BOUNCED', payload: PAYLOAD })
    expect(await processEmailJob(prisma, { communicationLogId: 'clog-1' })).toBe('skipped-terminal')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('acks a deleted row (no resend)', async () => {
    const { prisma } = fakePrisma(null)
    expect(await processEmailJob(prisma, { communicationLogId: 'gone' })).toBe('skipped-missing')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('processEmailJob — terminal-on-non-delivery', () => {
  it('marks FAILED (cannot reconstruct) when payload is missing', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: null })
    const outcome = await processEmailJob(prisma, { communicationLogId: 'clog-1' })
    expect(outcome).toBe('failed-no-payload')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect((updateMany.mock.calls[0][0] as { data: { status: string } }).data.status).toBe('FAILED')
  })

  it('marks FAILED when sendEmail is skipped (EMAIL_ENABLED off / dark mode)', async () => {
    sendEmailMock.mockResolvedValueOnce({ skipped: true, reason: 'disabled' })
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: PAYLOAD })
    const outcome = await processEmailJob(prisma, { communicationLogId: 'clog-1' })
    expect(outcome).toBe('skipped-disabled')
    expect((updateMany.mock.calls[0][0] as { data: { status: string } }).data.status).toBe('FAILED')
  })
})

describe('onEmailJobFailed — retries-exhausted ⇒ QUEUED→FAILED', () => {
  function fakeJob(attemptsMade: number, attempts: number): Job<EmailJobData> {
    return { data: { communicationLogId: 'clog-1' }, attemptsMade, opts: { attempts } } as unknown as Job<EmailJobData>
  }

  it('does NOT flip while retries remain', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: PAYLOAD })
    await onEmailJobFailed(prisma, fakeJob(1, 3))
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('flips QUEUED→FAILED on the final attempt (so the reconciler stops retrying)', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: PAYLOAD })
    await onEmailJobFailed(prisma, fakeJob(3, 3))
    const call = updateMany.mock.calls[0][0] as { where: Record<string, unknown>; data: { status: string } }
    expect(call.where).toMatchObject({ id: 'clog-1', status: 'QUEUED' })
    expect(call.data.status).toBe('FAILED')
  })

  it('is a no-op for an undefined job', async () => {
    const { prisma, updateMany } = fakePrisma({ id: 'clog-1', status: 'QUEUED', payload: PAYLOAD })
    await onEmailJobFailed(prisma, undefined)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
