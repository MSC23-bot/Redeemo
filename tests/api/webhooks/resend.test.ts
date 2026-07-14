import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { Webhook } from 'svix'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { Redis } from 'ioredis'

// The webhook binds the GAP-6 bounce counter to the DB status transition. We mock
// recordEmailBounce so the idempotency pins assert the counter's call boundary
// directly (its own counter/pause internals are covered by email-ops.test.ts).
const { recordEmailBounce } = vi.hoisted(() => ({ recordEmailBounce: vi.fn(async () => {}) }))
vi.mock('../../../src/api/shared/emailOps', () => ({ recordEmailBounce }))

import {
  handleResendWebhookEvent,
  resendWebhookRoutes,
  SUPPRESSION_TTL_SECONDS,
  type ResendWebhookEvent,
} from '../../../src/api/webhooks/resend'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { hashEmail } from '../../../src/api/shared/pwdResetLimiter'

/**
 * Faithful fake: models CommunicationLog rows keyed by externalId, each with a
 * status, and applies the handler's conditional updateMany the way the DB would.
 * `seed` pre-loads rows (status SENT) that the FIRST bounce can transition; an
 * externalId not in `seed` is an unmatched event (count 0).
 */
function fakePrisma(seed: string[] = []) {
  const rows = new Map<string, { status: string }>()
  for (const id of seed) rows.set(id, { status: 'SENT' })
  const updateMany = vi.fn(
    async (args: { where: { externalId: string; status?: { not?: string } }; data: { status: string } }) => {
      const row = rows.get(args.where.externalId)
      if (!row) return { count: 0 }
      if (args.where.status?.not === 'BOUNCED' && row.status === 'BOUNCED') return { count: 0 }
      row.status = args.data.status
      return { count: 1 }
    },
  )
  return { prisma: { communicationLog: { updateMany } } as unknown as PrismaClient, updateMany, rows }
}
function fakeRedis() {
  const set = vi.fn(async () => 'OK')
  return { redis: { set } as unknown as Redis, set }
}

beforeEach(() => recordEmailBounce.mockClear())

describe('handleResendWebhookEvent — bounce / complaint', () => {
  it('flips the row to BOUNCED (conditional on not-already-BOUNCED) and suppresses the recipient', async () => {
    const { prisma, updateMany } = fakePrisma(['re_999'])
    const { redis, set } = fakeRedis()
    const event: ResendWebhookEvent = {
      type: 'email.bounced',
      data: { email_id: 're_999', to: 'dead@example.com' },
    }
    await handleResendWebhookEvent(prisma, redis, event)

    // The transition is guarded WHERE status != BOUNCED so a duplicate delivery is a no-op.
    expect(updateMany).toHaveBeenCalledWith({
      where: { externalId: 're_999', status: { not: 'BOUNCED' } },
      data: { status: 'BOUNCED' },
    })
    expect(set).toHaveBeenCalledWith(
      RedisKey.emailSuppression(hashEmail('dead@example.com')),
      'email.bounced',
      'EX',
      SUPPRESSION_TTL_SECONDS,
    )
    // First genuine transition contributes to the pause-ratio path exactly once.
    expect(recordEmailBounce).toHaveBeenCalledTimes(1)
  })

  it('treats a complaint the same way (BOUNCED + suppress + count once), multi-recipient', async () => {
    const { prisma, updateMany } = fakePrisma(['re_1'])
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, {
      type: 'email.complained',
      data: { email_id: 're_1', to: ['a@x.com', 'b@x.com'] },
    })
    expect(updateMany).toHaveBeenCalledWith({
      where: { externalId: 're_1', status: { not: 'BOUNCED' } },
      data: { status: 'BOUNCED' },
    })
    expect(set).toHaveBeenCalledTimes(2)
    expect(recordEmailBounce).toHaveBeenCalledTimes(1)
  })

  it('still suppresses even when the provider omits the email id, but does NOT count (no row to flip)', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.bounced', data: { to: 'x@y.com' } })
    expect(updateMany).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledTimes(1)
    expect(recordEmailBounce).not.toHaveBeenCalled()
  })
})

describe('handleResendWebhookEvent: bounce counter idempotency (GAP-6 auto-pause guard)', () => {
  it('a duplicate bounced delivery increments the counter exactly once', async () => {
    const { prisma, updateMany } = fakePrisma(['re_dup'])
    const { redis } = fakeRedis()
    const event: ResendWebhookEvent = { type: 'email.bounced', data: { email_id: 're_dup', to: 'd@x.com' } }

    await handleResendWebhookEvent(prisma, redis, event) // first delivery: transitions
    await handleResendWebhookEvent(prisma, redis, event) // retry: row already BOUNCED

    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(recordEmailBounce).toHaveBeenCalledTimes(1)
  })

  it('an already-BOUNCED row does not increment the counter', async () => {
    const { prisma } = fakePrisma(['re_pre'])
    const { redis } = fakeRedis()
    const event: ResendWebhookEvent = { type: 'email.bounced', data: { email_id: 're_pre', to: 'p@x.com' } }
    await handleResendWebhookEvent(prisma, redis, event) // pre-bounce
    recordEmailBounce.mockClear()
    await handleResendWebhookEvent(prisma, redis, event) // second: no transition
    expect(recordEmailBounce).not.toHaveBeenCalled()
  })

  it('an unmatched externalId does not increment the counter (and does not crash)', async () => {
    const { prisma, updateMany } = fakePrisma([]) // no rows: nothing matches
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.bounced', data: { email_id: 're_ghost', to: 'g@x.com' } })
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledTimes(1) // suppression still applies
    expect(recordEmailBounce).not.toHaveBeenCalled()
  })

  it('a duplicate complaint delivery also counts exactly once', async () => {
    const { prisma } = fakePrisma(['re_cdup'])
    const { redis } = fakeRedis()
    const event: ResendWebhookEvent = { type: 'email.complained', data: { email_id: 're_cdup', to: 'c@x.com' } }
    await handleResendWebhookEvent(prisma, redis, event)
    await handleResendWebhookEvent(prisma, redis, event)
    expect(recordEmailBounce).toHaveBeenCalledTimes(1)
  })
})

describe('handleResendWebhookEvent — delivered + unknown', () => {
  it('email.delivered is informational — no DB write, no suppression (worker owns QUEUED→SENT)', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.delivered', data: { email_id: 're_2' } })
    expect(updateMany).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('ignores an unrecognised event type (no DB / no suppression)', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.opened', data: { email_id: 're_3' } })
    expect(updateMany).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })
})

describe('Resend webhook — Svix signature verification (real round-trip)', () => {
  const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'

  it('verifies a correctly-signed payload and rejects a tampered one', () => {
    const wh = new Webhook(SECRET)
    const payload = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_x', to: 'a@b.com' } })
    const msgId = 'msg_2kw...test'
    const timestamp = new Date()
    const signature = wh.sign(msgId, timestamp, payload)
    const headers = {
      'svix-id': msgId,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    }
    // good signature verifies + returns the parsed event
    expect(wh.verify(payload, headers)).toMatchObject({ type: 'email.bounced' })
    // tampered body fails
    expect(() => wh.verify(payload + ' ', headers)).toThrow()
    // wrong secret fails
    expect(() => new Webhook('whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').verify(payload, headers)).toThrow()
  })
})

describe('resendWebhookRoutes — gates on RESEND_WEBHOOK_SECRET presence', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.RESEND_WEBHOOK_SECRET
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = saved
  })

  it('does NOT register the route when the secret is unset (forged POST 404s)', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const app = Fastify()
    await app.register(resendWebhookRoutes)
    const res = await app.inject({ method: 'POST', url: '/api/v1/resend/webhook', payload: { type: 'x' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('registers the route when the secret IS set (unsigned POST is rejected, not 404)', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
    const app = Fastify()
    await app.register(resendWebhookRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/resend/webhook',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ type: 'email.bounced' }),
    })
    expect(res.statusCode).not.toBe(404) // route exists; bad/missing signature ⇒ error, not 404
    await app.close()
  })
})
