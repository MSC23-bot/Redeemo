// src/api/queues/processors/email.ts
//
// Phase 0 PR-0.4: the EMAIL_QUEUE delivery worker. It turns a QUEUED
// CommunicationLog outbox row into a real send and flips it to a terminal state.
//
// §4.1 invariants this enforces:
//   - Idempotency / skip-terminal: if the row is no longer QUEUED (already
//     SENT/FAILED/BOUNCED) it ACKs without resending — a reconciler re-enqueue or
//     a stalled-job re-run must never double-send a delivered row.
//   - Reconstruct-from-row: the email is rebuilt from CommunicationLog.payload
//     (NOT the job data), so a reconciler job that carries only the row id still
//     has everything it needs.
//   - Idempotency-Key = row id: a duplicate send (at-least-once delivery) is a
//     provider-side no-op.
//   - Terminal transitions: provider-accept ⇒ QUEUED→SENT; retries-exhausted ⇒
//     QUEUED→FAILED (so the reconciler stops re-trying). The payload (which may
//     hold a reset link / branch PIN) is NULLED on every terminal transition, so
//     delivery-sensitive content never outlives the brief QUEUED window.

import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type IORedis from 'ioredis'
import { Prisma } from '../../../../generated/prisma/client'
import type { PrismaClient } from '../../../../generated/prisma/client'
import { EMAIL_QUEUE, BULLMQ_PREFIX } from '../index'
import { makeQueueConnection } from '../connection'
import { shouldLog } from '../logThrottle'
import { sendEmail } from '../../shared/email'
import type { EmailJobPayload } from '../../shared/notify'

export interface EmailJobData {
  communicationLogId: string
}

export type EmailJobOutcome =
  | 'sent'
  | 'skipped-disabled' // EMAIL_ENABLED off / sandbox-no-allowlist → recorded FAILED (not delivered)
  | 'skipped-terminal' // row already SENT/FAILED/BOUNCED → ack, no resend
  | 'skipped-missing' // row deleted → ack
  | 'failed-no-payload' // payload gone (can't reconstruct) → FAILED

/** Null the payload on a terminal transition (clears any reset link / PIN). */
async function setTerminal(
  prisma: PrismaClient,
  id: string,
  data: { status: 'SENT' | 'FAILED'; externalId?: string },
): Promise<void> {
  // updateMany WHERE status = QUEUED so a concurrent BOUNCED/SENT is never clobbered.
  await prisma.communicationLog.updateMany({
    where: { id, status: 'QUEUED' },
    data: {
      status: data.status,
      payload: Prisma.DbNull,
      ...(data.externalId ? { externalId: data.externalId, sentAt: new Date() } : {}),
    },
  })
}

/**
 * The pure job handler — load the outbox row, enforce the §4.1 invariants, send,
 * and transition. Exported (no BullMQ) so the worker is fully unit-testable.
 */
export async function processEmailJob(prisma: PrismaClient, data: EmailJobData): Promise<EmailJobOutcome> {
  const row = await prisma.communicationLog.findUnique({
    where: { id: data.communicationLogId },
    select: { id: true, status: true, payload: true },
  })
  if (!row) return 'skipped-missing'
  if (row.status !== 'QUEUED') return 'skipped-terminal' // idempotency: never resend a non-QUEUED row

  const payload = row.payload as EmailJobPayload | null
  if (!payload?.to || !payload?.html) {
    await setTerminal(prisma, row.id, { status: 'FAILED' }) // can't reconstruct — stop reconciling it
    return 'failed-no-payload'
  }

  const result = await sendEmail({
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    ...(payload.text ? { text: payload.text } : {}),
    ...(payload.sender ? { sender: payload.sender } : {}),
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    idempotencyKey: row.id, // §4.1 rule 6 — duplicate send is a provider no-op
  })

  if (result.skipped) {
    // Dark mode (EMAIL_ENABLED off) or sandbox-no-allowlist: intentionally not
    // delivered. Record FAILED so the row doesn't sit QUEUED + get reconciled
    // forever; a production deploy with EMAIL_ENABLED=true sends → SENT instead.
    await setTerminal(prisma, row.id, { status: 'FAILED' })
    return 'skipped-disabled'
  }

  await setTerminal(prisma, row.id, { status: 'SENT', externalId: result.externalId })
  return 'sent'
}

/**
 * Mark a row FAILED once BullMQ has exhausted its retries (the 'failed' event
 * fires on every attempt; only the LAST one is terminal). Idempotent + only
 * touches a still-QUEUED row. Exported for direct testing.
 */
export async function onEmailJobFailed(
  prisma: PrismaClient,
  job: Job<EmailJobData> | undefined,
): Promise<void> {
  if (!job) return
  const maxAttempts = job.opts?.attempts ?? 1
  if (job.attemptsMade < maxAttempts) return // BullMQ will retry — not terminal yet
  try {
    await setTerminal(prisma, job.data.communicationLogId, { status: 'FAILED' })
  } catch (err) {
    console.error('[worker:email] failed to mark FAILED:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Start the EMAIL_QUEUE Worker on its OWN Redis connection (BullMQ workers must
 * not share the producer connection). Wired from src/worker.ts.
 */
export function startEmailWorker(prisma: PrismaClient, connection?: IORedis): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE,
    (job) => processEmailJob(prisma, job.data),
    {
      connection: (connection ?? makeQueueConnection()) as unknown as ConnectionOptions,
      prefix: BULLMQ_PREFIX,
    },
  )
  worker.on('failed', (job) => {
    void onEmailJobFailed(prisma, job)
  })
  worker.on('error', (err) => {
    // Throttle: a persistent Redis fault must not spam the logs.
    if (shouldLog('email-worker-error')) {
      console.error('[worker:email] worker error:', err instanceof Error ? err.message : String(err))
    }
  })
  return worker
}
