import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { Webhook } from 'svix'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import {
  handleResendWebhookEvent,
  resendWebhookRoutes,
  SUPPRESSION_TTL_SECONDS,
  type ResendWebhookEvent,
} from '../../../src/api/webhooks/resend'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { hashEmail } from '../../../src/api/shared/pwdResetLimiter'

function fakePrisma() {
  const updateMany = vi.fn(async () => ({ count: 1 }))
  return { prisma: { communicationLog: { updateMany } } as unknown as PrismaClient, updateMany }
}
function fakeRedis() {
  const set = vi.fn(async () => 'OK')
  return { redis: { set } as unknown as Redis, set }
}

describe('handleResendWebhookEvent — bounce / complaint', () => {
  it('flips the row to BOUNCED (by externalId) and suppresses the recipient', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    const event: ResendWebhookEvent = {
      type: 'email.bounced',
      data: { email_id: 're_999', to: 'dead@example.com' },
    }
    await handleResendWebhookEvent(prisma, redis, event)

    expect(updateMany).toHaveBeenCalledWith({ where: { externalId: 're_999' }, data: { status: 'BOUNCED' } })
    expect(set).toHaveBeenCalledWith(
      RedisKey.emailSuppression(hashEmail('dead@example.com')),
      'email.bounced',
      'EX',
      SUPPRESSION_TTL_SECONDS,
    )
  })

  it('treats a complaint the same way (BOUNCED + suppress), multi-recipient', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, {
      type: 'email.complained',
      data: { email_id: 're_1', to: ['a@x.com', 'b@x.com'] },
    })
    expect(updateMany).toHaveBeenCalledWith({ where: { externalId: 're_1' }, data: { status: 'BOUNCED' } })
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('still suppresses even when the provider omits the email id (no row to flip)', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.bounced', data: { to: 'x@y.com' } })
    expect(updateMany).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledTimes(1)
  })
})

describe('handleResendWebhookEvent — delivered + unknown', () => {
  it('email.delivered confirms a still-QUEUED row as SENT (backstop)', async () => {
    const { prisma, updateMany } = fakePrisma()
    const { redis, set } = fakeRedis()
    await handleResendWebhookEvent(prisma, redis, { type: 'email.delivered', data: { email_id: 're_2' } })
    expect(updateMany).toHaveBeenCalledWith({
      where: { externalId: 're_2', status: 'QUEUED' },
      data: { status: 'SENT' },
    })
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
