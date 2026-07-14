// src/api/webhooks/resend.ts
//
// Phase 0 PR-0.4: the Resend bounce/complaint/delivery WEBHOOK. It keeps the
// outbox honest about what the provider actually did with a message:
//   - email.bounced / email.complained → flip the CommunicationLog row to
//     BOUNCED (by the provider's email id = externalId) and add the recipient to
//     a Redis suppression set, so notify() stops sending MARKETING to a
//     dead/complaining address.
//   - email.delivered → informational only, intentionally ignored. It cannot
//     recover the "worker accepted-but-didn't-flip" window: externalId is
//     written ONLY together with the SENT flip, so a still-QUEUED row never has
//     one for a delivered event to match. That window is the reconciler's job.
//
// Gating (locked): the route is registered iff RESEND_WEBHOOK_SECRET is set —
// independently of EMAIL_ENABLED. Bounce/complaint events for already-sent mail
// must still be received even when OUTBOUND sending is later paused.
//
// Verification: Resend signs webhooks with Svix headers (svix-id /
// svix-timestamp / svix-signature). We verify with the `svix` package (already a
// dependency) against the RAW request body — a tampered/forged body throws.
// Duplicate deliveries are safe without a dedup table: the suppression SET is a
// keyed Redis write with a TTL (re-setting is a no-op), and the GAP-6 bounce
// counter is bound to the DB status transition (the conditional updateMany only
// counts on the FIRST flip to BOUNCED), so a retry cannot inflate the ratio.

import type { FastifyInstance } from 'fastify'
import type { Redis } from 'ioredis'
import { Webhook } from 'svix'
import type { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'
import { RedisKey } from '../shared/redis-keys'
import { hashEmail } from '../shared/pwdResetLimiter'
import { recordEmailBounce } from '../shared/emailOps'

/** A hard bounce / spam complaint suppresses the recipient for this long. */
export const SUPPRESSION_TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days

export interface ResendWebhookEvent {
  type: string
  created_at?: string
  data?: {
    /** The Resend email id — equals CommunicationLog.externalId. */
    email_id?: string
    id?: string
    to?: string | string[]
    [k: string]: unknown
  }
}

function recipientsOf(event: ResendWebhookEvent): string[] {
  const to = event.data?.to
  if (!to) return []
  return (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean)
}

/**
 * Apply a verified Resend event to the outbox. Pure (no HTTP / no svix) so it is
 * unit-testable. Idempotent — safe to run on a duplicate delivery.
 */
export async function handleResendWebhookEvent(
  prisma: PrismaClient,
  redis: Redis,
  event: ResendWebhookEvent,
): Promise<void> {
  const emailId = event.data?.email_id ?? event.data?.id

  switch (event.type) {
    case 'email.bounced':
    case 'email.complained': {
      // Idempotency boundary for the GAP-6 bounce counter is the DATABASE status
      // transition, not the webhook delivery. The conditional updateMany flips the
      // matched row only WHERE it is not already BOUNCED, so its count is 1 exactly
      // once: on the FIRST bounced transition. A duplicate delivery (row already
      // BOUNCED), an event with no provider id (no row to flip), or an unmatched
      // externalId all report count 0 and must NOT touch the counter. Otherwise a
      // routine webhook retry would inflate the day's bounce ratio and could falsely
      // trip the auto-pause, killing all transactional mail including admin OTPs.
      let firstBouncedTransition = false
      if (emailId) {
        const { count } = await prisma.communicationLog.updateMany({
          where: { externalId: emailId, status: { not: 'BOUNCED' } },
          data: { status: 'BOUNCED' },
        })
        firstBouncedTransition = count === 1
      }
      // Suppress the recipient(s) so future MARKETING sends are skipped.
      // (Transactional sends are never suppressed; see notify().) This is a Redis
      // SET with a TTL: re-setting on a duplicate delivery is naturally idempotent,
      // so it runs on every delivery regardless of the DB transition above.
      for (const r of recipientsOf(event)) {
        await redis.set(
          RedisKey.emailSuppression(hashEmail(r)),
          event.type,
          'EX',
          SUPPRESSION_TTL_SECONDS,
        )
      }
      // §SEC.1 GAP-6: only a genuine first bounced transition counts toward the
      // day's bounce ratio (and can auto-pause sending once the ratio crosses the
      // threshold). Best-effort: a counter/pause blip must never fail the
      // (idempotent) webhook ack.
      if (firstBouncedTransition) {
        try {
          await recordEmailBounce(prisma, redis)
        } catch (err) {
          console.warn('[resend-webhook] bounce-ratio evaluation failed (non-fatal): ' + (err instanceof Error ? err.message : String(err)))
        }
      }
      break
    }
    // email.delivered + every other event: informational — acknowledge + ignore.
    // (The worker owns QUEUED→SENT; a delivered event can't reach a QUEUED row,
    // see the module note above.)
    default:
      break
  }
}

/**
 * Register the Resend webhook route — ONLY when RESEND_WEBHOOK_SECRET is present.
 * A scoped buffer parser (mirrors the Stripe webhook) gives svix the raw body to
 * verify. An unset secret leaves the route unregistered (a forged POST 404s).
 */
export async function resendWebhookRoutes(app: FastifyInstance): Promise<void> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret || secret.trim() === '') {
    app.log.info('[resend-webhook] RESEND_WEBHOOK_SECRET not set — webhook route NOT registered')
    return
  }

  // Scoped raw-body parser (encapsulated to this plugin, like webhookRoutes).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/api/v1/resend/webhook', async (req, reply) => {
    const raw = (req.body as Buffer).toString('utf8')

    let event: ResendWebhookEvent
    try {
      const wh = new Webhook(secret)
      event = wh.verify(raw, {
        'svix-id': String(req.headers['svix-id'] ?? ''),
        'svix-timestamp': String(req.headers['svix-timestamp'] ?? ''),
        'svix-signature': String(req.headers['svix-signature'] ?? ''),
      }) as ResendWebhookEvent
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID')
    }

    await handleResendWebhookEvent(app.prisma, app.redis, event)
    return reply.send({ received: true })
  })
}
