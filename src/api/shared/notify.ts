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
import { consumeEmailSend } from './emailLimiter'
import { isSendPaused, recordEmailSendCounters, recordGlobalGateTrip, logEmailSendAnomaly } from './emailOps'

export type NotifyCategory = 'transactional' | 'marketing'
// CommunicationLog.recipientType is a free string; all four values are valid
// for an email-only send. ADMIN now also carries an in-app Notification (the
// admin bell) — pairing 'ADMIN' with `inApp` is fully supported. USER/
// MERCHANT_ADMIN/BRANCH_USER were already valid Notification.recipientType
// values; ADMIN was added in M2.
// `recipientId` is the canonical recipient pointer written to Notification for
// ALL recipient types. `userId` remains the legacy USER-only FK — populated
// only when recipientType is USER (where it equals recipientId); null otherwise.
// CommunicationLog (email/SMS delivery) and Notification (in-app bell/feed) are
// SEPARATE concerns — do not conflate them.
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
  // 'send-paused' (GAP-6): the global auto-pause circuit-breaker is set; a
  // distinct reason from 'rate-limited' so a paused platform is unambiguous.
  | { queued: false; reason: 'no-consent' | 'rate-limited' | 'suppressed' | 'send-paused' }

// Send caps live in emailLimiter.ts (§SEC.1 closure): the per-(type,recipient)
// 5/hr and per-IP 200/day controls moved there unchanged, joined by the global
// daily gate, the aggregate per-address hour/day caps, the per-account/day cap,
// and the per-IP hourly cap (GAP-1..GAP-4).

// The recipient types that map to a valid NotificationRecipientType (i.e. can
// carry an in-app Notification). ADMIN now carries the admin bell (added in M2);
// the full set matches the NotificationRecipientType enum.
const NOTIFICATION_RECIPIENT_TYPES: readonly NotifyRecipientType[] = ['USER', 'MERCHANT_ADMIN', 'BRANCH_USER', 'ADMIN']

/**
 * Dispatch a transactional notification: commit a QUEUED CommunicationLog outbox
 * row (+ optional in-app Notification) then best-effort enqueue delivery. Never
 * throws on a transient enqueue failure — the row is left QUEUED for the
 * reconciler. Returns `{ queued: false }` when a pre-check (suppression /
 * consent / rate-limit) declines the send.
 */
export async function notify(prisma: PrismaClient, redis: Redis, input: NotifyInput): Promise<NotifyResult> {
  // Programming-error guard (fail fast, BEFORE any side effect — no quota burned,
  // no half-written transaction): an in-app Notification requires a recipientType
  // that exists in NotificationRecipientType. Catch a misuse here with a clear
  // message instead of a confusing Prisma enum failure mid-$transaction.
  if (input.inApp && !NOTIFICATION_RECIPIENT_TYPES.includes(input.recipientType)) {
    throw new Error(
      `[notify] inApp notification is not supported for recipientType '${input.recipientType}' ` +
        `(valid: ${NOTIFICATION_RECIPIENT_TYPES.join(', ')})`,
    )
  }

  // (0) GAP-6 auto send-pause: the global circuit-breaker is checked FIRST, BEFORE
  // any limiter budget is consumed and before any DB lookup. When set (by the
  // bounce-ratio / repeated-gate-trip triggers), decline every send with a
  // DISTINCT reason and write NO outbox row; a truly fail-closed stop at the one
  // choke point (the worker does not read this flag, so a QUEUED-and-sent leak is
  // impossible). Cleared only by a SUPER_ADMIN via the email-ops route.
  if (await isSendPaused(redis)) return { queued: false, reason: 'send-paused' }

  const category: NotifyCategory = input.category ?? 'transactional'
  const emailHash = hashEmail(input.to)

  // Marketing-only gates: consent + suppression. Transactional email (password
  // reset, branch PIN) is user-requested AND account-critical, so it is NEVER
  // suppressed — a spam complaint or a transient bounce must not deny account
  // recovery. Suppression (set by the Resend webhook) protects only MARKETING
  // from being sent to a complainer / a known-bad address. (PR-0.4 sends no
  // marketing; these guards are for future callers + the populated set.)
  if (category === 'marketing') {
    if (!input.userId) return { queued: false, reason: 'no-consent' }
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { newsletterConsent: true },
    })
    if (!user?.newsletterConsent) return { queued: false, reason: 'no-consent' }
    if (await redis.exists(RedisKey.emailSuppression(emailHash))) {
      return { queued: false, reason: 'suppressed' }
    }
  }

  // (c) Send rate-limit (atomic; §SEC.1 closure GAP-1..GAP-4 in emailLimiter.ts).
  // gate = global daily cap; abuser = per-IP hour + day; victim = per-(type,addr),
  // aggregate per-address hour/day, per-account/day. Any blocking tier maps to the
  // same 'rate-limited' result: the caller-facing contract is unchanged.
  const limit = await consumeEmailSend(redis, {
    emailHash,
    type: input.type,
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    ip: input.ip,
  })
  if (!limit.ok) {
    // GAP-7 anomaly + GAP-6 gate-trip trigger. A GLOBAL-gate block or a per-address
    // cap block is the ops-visible anomaly: emit a structured line (the blocked key
    // is a static tier or a hashEmail, never a raw address). When the global COST
    // gate blocked, count the trip so repeated trips auto-pause. Best-effort: never
    // let telemetry throw the dispatcher; the caller contract is unchanged.
    const isAddrBlock = limit.blockedKey.startsWith('rl:email:addr:')
    if (limit.scope === 'gate' || isAddrBlock) {
      logEmailSendAnomaly({ scope: limit.scope, blockedKey: limit.blockedKey, type: input.type })
    }
    if (limit.scope === 'gate') {
      try {
        await recordGlobalGateTrip(prisma, redis)
      } catch (err) {
        console.warn('[email] gate-trip record failed (non-fatal): ' + (err instanceof Error ? err.message : String(err)))
      }
    }
    return { queued: false, reason: 'rate-limited' }
  }

  // GAP-7: count this ALLOWED send (per-type + total, per UTC day) beside the
  // limiter consumption. Best-effort inside the helper (never blocks the outbox).
  await recordEmailSendCounters(redis, input.type)

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
          // recipientId is the canonical recipient pointer for all types (M2).
          recipientId: input.recipientId,
          // userId is the legacy USER-only FK, DERIVED from recipientType so the
          // invariant cannot be violated by a caller: a USER row always has
          // userId === recipientId; every non-USER row (MERCHANT_ADMIN/BRANCH_USER/
          // ADMIN) has userId null — independent of whatever input.userId carries.
          userId: input.recipientType === 'USER' ? input.recipientId : null,
          title: input.inApp.title,
          body: input.inApp.body,
          type: input.inApp.notificationType,
          // These are in-app bell rows; email delivery is tracked in CommunicationLog.
          channel: NotificationChannel.IN_APP,
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
