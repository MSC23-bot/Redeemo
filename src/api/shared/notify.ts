// src/api/shared/notify.ts
//
// Phase 0 PR-0.4: the transactional-notification DISPATCHER. It is the single
// choke point every transactional email goes through, so the outbox guarantee
// (§4.1), the suppression list, and the send rate-limit are enforced in ONE
// place that no calling route can bypass.
//
// Outbox flow (§4.1 — transactional-outbox-lite, deliberately NOT a message bus):
//   1. Pre-checks (suppression / marketing-consent / send rate-limit) decide
//      whether to queue at all — a rejected send writes NO row and NO job.
//   2. Inside a $transaction: commit a CommunicationLog row with status QUEUED
//      (the durable outbox) carrying the rendered email in `payload`, plus an
//      optional in-app Notification row. The COMMITTED row is the single source
//      of truth that "this message must be delivered."
//   3. AFTER commit, best-effort enqueue an EMAIL_QUEUE job with the DETERMINISTIC
//      jobId = CommunicationLog.id (BullMQ dedups by jobId, so a re-enqueue is a
//      no-op while a job exists — that is what makes the reconciler idempotent).
//      If the enqueue throws (Redis blip / crash between commit and enqueue) we
//      log a controlled warning, LEAVE the row QUEUED, and return normally —
//      never throw to the caller, never roll the row back. The reconciler
//      (processors/outboxReconciler.ts) re-enqueues stale QUEUED rows later.
//
// PUSH / SMS via notify are deferred (FCM = Phase 6, SMS already has its own
// path); PR-0.4 dispatches the EMAIL channel only.

import type { Redis } from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'
import { NotificationType, NotificationChannel, NotificationRecipientType } from '../../../generated/prisma/enums'
import { EMAIL_QUEUE, enqueue } from '../queues'
import { RedisKey } from './redis-keys'
import { hashEmail } from './pwdResetLimiter'
import { consume } from './atomicLimiter'

export type NotifyCategory = 'transactional' | 'marketing'
// CommunicationLog.recipientType is a free string, so 'ADMIN' (AdminUser, which
// has no in-app feed) is valid for an email-only send. Only USER/MERCHANT_ADMIN/
// BRANCH_USER are valid Notification.recipientType values — pairing 'ADMIN' with
// `inApp` is a caller error (Prisma rejects the enum at runtime).
export type NotifyRecipientType = 'USER' | 'MERCHANT_ADMIN' | 'BRANCH_USER' | 'ADMIN'

/** The rendered email the delivery worker sends. Persisted in CommunicationLog.payload. */
export interface NotifyEmailContent {
  subject: string
  html: string
  text?: string
  /** D-F sender identity. Default 'default' (noreply@). */
  sender?: 'default' | 'merchant'
  replyTo?: string
}

/** The shape stored in CommunicationLog.payload — what the worker reads to send. */
export interface EmailJobPayload extends NotifyEmailContent {
  to: string
}

export interface NotifyInput {
  /** Recipient email address. */
  to: string
  recipientType: NotifyRecipientType
  /** The recipient's own id (merchant-admin / branch-user / user id). */
  recipientId: string
  /** Customer User FK for CommunicationLog.userId / Notification.userId. Null for non-User recipients. */
  userId?: string | null
  /** CommunicationLog.type — a stable string e.g. 'password_reset', 'branch_pin'. */
  type: string
  /** transactional (always sent) vs marketing (respects newsletterConsent). Default transactional. */
  category?: NotifyCategory
  email: NotifyEmailContent
  /** Write an in-app Notification row too (FCM delivery deferred). Omit for email-only. */
  inApp?: {
    notificationType: NotificationType
    title: string
    body: string
    referenceId?: string
    referenceType?: string
  }
  /** Requester IP for the per-IP send-abuse ceiling. */
  ip?: string | null
}

export type NotifyResult =
  | { queued: true; communicationLogId: string; enqueued: boolean }
  | { queued: false; reason: 'no-consent' | 'rate-limited' | 'suppressed' }

// Send caps (the atomic limiter). A single recipient should not receive more
// than a handful of the SAME transactional email per hour; the per-IP ceiling
// catches an endpoint being used to email-bomb many recipients.
const EMAIL_PER_RECIPIENT_PER_HOUR = { limit: 5, windowSec: 3600 }
const EMAIL_PER_IP_PER_DAY = { limit: 200, windowSec: 86_400 }

/**
 * Dispatch a transactional notification: commit a QUEUED CommunicationLog outbox
 * row (+ optional in-app Notification) then best-effort enqueue delivery. Never
 * throws on a transient enqueue failure — the row is left QUEUED for the
 * reconciler. Returns `{ queued: false }` when a pre-check (suppression /
 * consent / rate-limit) declines the send.
 */
export async function notify(prisma: PrismaClient, redis: Redis, input: NotifyInput): Promise<NotifyResult> {
  const category: NotifyCategory = input.category ?? 'transactional'
  const emailHash = hashEmail(input.to)

  // (a) Suppression — never send to an address the provider hard-bounced / that
  // raised a spam complaint (set by the Resend webhook). Existence ⇒ suppressed.
  if (await redis.exists(RedisKey.emailSuppression(emailHash))) {
    return { queued: false, reason: 'suppressed' }
  }

  // (b) Marketing consent — transactional always sends; marketing requires an
  // opted-in User. (PR-0.4 sends no marketing; this guards future callers.)
  if (category === 'marketing') {
    if (!input.userId) return { queued: false, reason: 'no-consent' }
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { newsletterConsent: true },
    })
    if (!user?.newsletterConsent) return { queued: false, reason: 'no-consent' }
  }

  // (c) Send rate-limit (atomic). victim = per-(type,recipient); abuser = per-IP.
  const limit = await consume(redis, {
    victimKeys: [
      {
        key: RedisKey.rateLimitEmailSend(input.type, emailHash),
        limit: EMAIL_PER_RECIPIENT_PER_HOUR.limit,
        windowSec: EMAIL_PER_RECIPIENT_PER_HOUR.windowSec,
      },
    ],
    abuserKeys: input.ip
      ? [
          {
            key: RedisKey.rateLimitEmailIpDay(input.ip),
            limit: EMAIL_PER_IP_PER_DAY.limit,
            windowSec: EMAIL_PER_IP_PER_DAY.windowSec,
          },
        ]
      : [],
  })
  if (!limit.ok) return { queued: false, reason: 'rate-limited' }

  // Commit the outbox row (+ optional Notification) FIRST, in one transaction.
  const payload: EmailJobPayload = {
    to: input.to,
    subject: input.email.subject,
    html: input.email.html,
    ...(input.email.text ? { text: input.email.text } : {}),
    ...(input.email.sender ? { sender: input.email.sender } : {}),
    ...(input.email.replyTo ? { replyTo: input.email.replyTo } : {}),
  }

  const communicationLogId = await prisma.$transaction(async (tx) => {
    const log = await tx.communicationLog.create({
      data: {
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        channel: 'EMAIL',
        type: input.type,
        subject: input.email.subject,
        status: 'QUEUED',
        userId: input.userId ?? null,
        payload: payload as unknown as object,
      },
      select: { id: true },
    })
    if (input.inApp) {
      await tx.notification.create({
        data: {
          recipientType: input.recipientType as NotificationRecipientType,
          userId: input.userId ?? null,
          title: input.inApp.title,
          body: input.inApp.body,
          type: input.inApp.notificationType,
          channel: NotificationChannel.EMAIL,
          referenceId: input.inApp.referenceId ?? null,
          referenceType: input.inApp.referenceType ?? null,
        },
      })
    }
    return log.id
  })

  // Best-effort enqueue AFTER commit, jobId = row id (deterministic ⇒ dedup-safe).
  // On failure: leave the row QUEUED for the reconciler; never throw, never roll back.
  let enqueued = false
  try {
    await enqueue(EMAIL_QUEUE, { communicationLogId }, { jobId: communicationLogId })
    enqueued = true
  } catch (err) {
    console.warn(
      `[notify] enqueue failed for CommunicationLog ${communicationLogId} — left QUEUED for the reconciler: ` +
        (err instanceof Error ? err.message : String(err)),
    )
  }

  return { queued: true, communicationLogId, enqueued }
}
