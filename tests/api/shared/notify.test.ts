import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'

// Phase 0 PR-0.4: the notify() dispatcher. Pins the §4.1 outbox contract: a
// QUEUED CommunicationLog row is committed FIRST, then a best-effort enqueue
// with jobId = row id; an enqueue failure leaves the row QUEUED and never
// throws. The queue module is MOCKED (no Redis/BullMQ); prisma + redis are fakes.

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }))
vi.mock('../../../src/api/queues', () => ({
  EMAIL_QUEUE: 'email',
  enqueue: enqueueMock,
}))

import { notify } from '../../../src/api/shared/notify'
import { shimEval } from '../../../src/api/shared/atomicLimiter'
import { RedisKey } from '../../../src/api/shared/redis-keys'
import { hashEmail } from '../../../src/api/shared/pwdResetLimiter'
import { utcDateStamp } from '../../../src/api/shared/emailOps'
import { NotificationType } from '../../../generated/prisma/enums'

function fakeRedis(opts: { suppressed?: boolean; counts?: Record<string, string>; paused?: boolean } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  // GAP-6: pre-set the pause flag when a test wants the breaker tripped. isSendPaused
  // reads it via get() (NOT exists()), so this never collides with the suppression fake.
  if (opts.paused) store.set(RedisKey.emailSendPaused(), JSON.stringify({ reason: 'gate-trips', at: '', actor: 'SYSTEM' }))
  return {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), { ttlOf: () => 3600 })),
    exists: vi.fn(async (_key: string) => (opts.suppressed ? 1 : 0)),
    // get MUST return null (not undefined) for a missing key so isSendPaused reads
    // "not paused"; the GAP-7 counters read/write through get/incr/expire.
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    incr: vi.fn(async (key: string) => {
      const v = (parseInt(store.get(key) ?? '0', 10) || 0) + 1
      store.set(key, String(v))
      return v
    }),
    expire: vi.fn(async () => 1),
    set: vi.fn(async (key: string, val: string) => {
      store.set(key, val)
      return 'OK'
    }),
  } as unknown as Redis
}

function fakePrisma(opts: { consent?: boolean } = {}) {
  const createLog = vi.fn(async (_args: unknown) => ({ id: 'clog-abc-123' }))
  const createNotif = vi.fn(async (_args: unknown) => ({ id: 'notif-1' }))
  const findUser = vi.fn(async (_args: unknown) => ({ newsletterConsent: opts.consent ?? true }))
  const tx = {
    communicationLog: { create: createLog },
    notification: { create: createNotif },
  }
  const prisma = {
    user: { findUnique: findUser },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  }
  return { prisma: prisma as unknown as PrismaClient, createLog, createNotif, findUser, $tx: prisma.$transaction }
}

const BASE = {
  to: 'maya@example.com',
  recipientType: 'USER' as const,
  recipientId: 'user-1',
  userId: 'user-1',
  type: 'password_reset',
  email: { subject: 'Reset your password', html: '<a>reset</a>' },
}

beforeEach(() => {
  enqueueMock.mockReset()
  enqueueMock.mockResolvedValue({ id: 'job-1' })
})

describe('notify: outbox row + enqueue', () => {
  it('commits a QUEUED CommunicationLog (channel EMAIL, type, payload) then enqueues with jobId = row id', async () => {
    const { prisma, createLog } = fakePrisma()
    const res = await notify(prisma, fakeRedis(), BASE)

    expect(res).toEqual({ queued: true, communicationLogId: 'clog-abc-123', enqueued: true })
    // the committed row is QUEUED + carries the rendered email in payload
    const data = (createLog.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      channel: 'EMAIL',
      type: 'password_reset',
      status: 'QUEUED',
      subject: 'Reset your password',
      recipientType: 'USER',
      recipientId: 'user-1',
      userId: 'user-1',
    })
    expect(data.payload).toMatchObject({ to: 'maya@example.com', subject: 'Reset your password', html: '<a>reset</a>' })
    // deterministic jobId = the committed row id (§4.1 rule 2)
    expect(enqueueMock).toHaveBeenCalledWith('email', { communicationLogId: 'clog-abc-123' }, { jobId: 'clog-abc-123' })
  })

  it('writes an in-app Notification row only when inApp is provided', async () => {
    const withInApp = fakePrisma()
    await notify(withInApp.prisma, fakeRedis(), {
      ...BASE,
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'Hi', body: 'Body' },
    })
    expect(withInApp.createNotif).toHaveBeenCalledTimes(1)
    expect((withInApp.createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data).toMatchObject({
      title: 'Hi',
      body: 'Body',
      type: NotificationType.MERCHANT_VERIFICATION_UPDATE,
      // M2: in-app bell rows use IN_APP channel, not EMAIL.
      channel: 'IN_APP',
    })

    const emailOnly = fakePrisma()
    await notify(emailOnly.prisma, fakeRedis(), BASE)
    expect(emailOnly.createNotif).not.toHaveBeenCalled()
  })

  it('M2 write-path: MERCHANT_ADMIN inApp sets recipientId + channel IN_APP, userId null', async () => {
    const { prisma, createNotif } = fakePrisma()
    await notify(prisma, fakeRedis(), {
      to: 'admin@merchant.com',
      recipientType: 'MERCHANT_ADMIN',
      recipientId: 'ma-99',
      userId: null,
      type: 'merchant_changes_requested',
      email: { subject: 'Changes needed', html: '<p>Update</p>' },
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'Changes', body: 'Please update' },
    })
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      recipientType: 'MERCHANT_ADMIN',
      recipientId: 'ma-99',
      channel: 'IN_APP',
      userId: null,
    })
  })

  it('M2 write-path: BRANCH_USER inApp sets recipientId + channel IN_APP, userId null', async () => {
    const { prisma, createNotif } = fakePrisma()
    await notify(prisma, fakeRedis(), {
      to: 'staff@branch.com',
      recipientType: 'BRANCH_USER',
      recipientId: 'bu-7',
      userId: null,
      type: 'branch_pin',
      email: { subject: 'Branch PIN', html: '<p>PIN</p>' },
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'PIN', body: 'Your branch PIN' },
    })
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      recipientType: 'BRANCH_USER',
      recipientId: 'bu-7',
      channel: 'IN_APP',
      userId: null,
    })
  })

  it('M2 write-path: USER inApp sets recipientId AND userId (both equal, both set)', async () => {
    const { prisma, createNotif } = fakePrisma()
    await notify(prisma, fakeRedis(), {
      ...BASE,
      recipientType: 'USER',
      recipientId: 'user-1',
      userId: 'user-1',
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'Hi', body: 'Body' },
    })
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      recipientType: 'USER',
      recipientId: 'user-1',
      userId: 'user-1',
      channel: 'IN_APP',
    })
  })

  it('M2 invariant: USER inApp DERIVES userId from recipientId even when the caller omits input.userId', async () => {
    const { prisma, createNotif } = fakePrisma()
    await notify(prisma, fakeRedis(), {
      to: 'user@example.com',
      recipientType: 'USER',
      recipientId: 'user-77',
      // input.userId intentionally OMITTED: the write-path must derive it from recipientType.
      type: 'some_user_notification',
      email: { subject: 'Hi', html: '<p>Hi</p>' },
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'Hi', body: 'Body' },
    })
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      recipientType: 'USER',
      recipientId: 'user-77',
      // derived (recipientType === USER ⇒ userId === recipientId), NOT taken from input.
      userId: 'user-77',
      channel: 'IN_APP',
    })
  })

  it('M2 invariant: a non-USER inApp FORCES Notification.userId null even if a caller wrongly passes one', async () => {
    const { prisma, createNotif } = fakePrisma()
    await notify(prisma, fakeRedis(), {
      to: 'admin@merchant.com',
      recipientType: 'MERCHANT_ADMIN',
      recipientId: 'ma-1',
      userId: 'sneaky-user-id', // a caller mistake: the write-path must ignore it for non-USER rows.
      type: 'merchant_changes_requested',
      email: { subject: 'x', html: '<p>x</p>' },
      inApp: { notificationType: NotificationType.MERCHANT_VERIFICATION_UPDATE, title: 'x', body: 'y' },
    })
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.userId).toBeNull()
    expect(data).toMatchObject({ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma-1', channel: 'IN_APP' })
  })

  it('M2 write-path: ADMIN inApp SUCCEEDS and writes recipientType ADMIN + recipientId + channel IN_APP + userId null', async () => {
    const { prisma, createNotif, createLog } = fakePrisma()
    const res = await notify(prisma, fakeRedis(), {
      to: 'admin@redeemo.com',
      recipientType: 'ADMIN',
      recipientId: 'admin-42',
      userId: null,
      type: 'admin_notification',
      email: { subject: 'Admin alert', html: '<p>Alert</p>' },
      inApp: { notificationType: NotificationType.ADMIN_MERCHANT_SUBMITTED, title: 'New submission', body: 'Review it' },
    })
    // Did NOT throw; outbox row committed
    expect(res).toMatchObject({ queued: true })
    expect(createLog).toHaveBeenCalledTimes(1)
    // In-app row written
    expect(createNotif).toHaveBeenCalledTimes(1)
    const data = (createNotif.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({
      recipientType: 'ADMIN',
      recipientId: 'admin-42',
      channel: 'IN_APP',
      userId: null,
    })
  })
})

describe('notify: §4.1 enqueue-failure leaves the row QUEUED (does NOT throw)', () => {
  it('commits the row, swallows the enqueue error, returns enqueued:false', async () => {
    const { prisma, createLog } = fakePrisma()
    enqueueMock.mockRejectedValueOnce(new Error('redis down'))

    const res = await notify(prisma, fakeRedis(), BASE)

    // row STILL committed as QUEUED: the reconciler will pick it up
    expect(createLog).toHaveBeenCalledTimes(1)
    expect((createLog.mock.calls[0][0] as { data: { status: string } }).data.status).toBe('QUEUED')
    // call did NOT throw + signals the enqueue failure
    expect(res).toEqual({ queued: true, communicationLogId: 'clog-abc-123', enqueued: false })
  })
})

describe('notify: marketing consent', () => {
  it('skips a marketing send when the user has not consented (no row, no enqueue)', async () => {
    const { prisma, createLog } = fakePrisma({ consent: false })
    const res = await notify(prisma, fakeRedis(), { ...BASE, category: 'marketing' })
    expect(res).toEqual({ queued: false, reason: 'no-consent' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('sends a marketing email when the user HAS consented', async () => {
    const { prisma } = fakePrisma({ consent: true })
    const res = await notify(prisma, fakeRedis(), { ...BASE, category: 'marketing' })
    expect(res).toMatchObject({ queued: true })
  })

  it('a transactional send NEVER checks consent (always queues)', async () => {
    const { prisma, findUser } = fakePrisma({ consent: false })
    const res = await notify(prisma, fakeRedis(), { ...BASE, category: 'transactional' })
    expect(res).toMatchObject({ queued: true })
    expect(findUser).not.toHaveBeenCalled()
  })
})

describe('notify: programming-error guard', () => {
  // M2: ADMIN is now a valid in-app recipient (the admin bell). The guard that
  // previously rejected ADMIN+inApp is gone: the set now covers all 4 types.
  // This test documents that combining ADMIN with inApp NO LONGER throws.
  it('M2: ADMIN + inApp does NOT throw (admin bell is supported)', async () => {
    const { prisma, createLog } = fakePrisma()
    const res = await notify(prisma, fakeRedis(), {
      ...BASE,
      recipientType: 'ADMIN',
      recipientId: 'admin-1',
      userId: null,
      inApp: { notificationType: NotificationType.ADMIN_MERCHANT_SUBMITTED, title: 'x', body: 'y' },
    })
    // SUCCEEDS: no throw, outbox row committed
    expect(res).toMatchObject({ queued: true })
    expect(createLog).toHaveBeenCalledTimes(1)
  })
})

describe('notify: pre-send guards', () => {
  it('declines a MARKETING send to a suppressed (bounced/complained) recipient', async () => {
    const { prisma, createLog } = fakePrisma({ consent: true })
    const res = await notify(prisma, fakeRedis({ suppressed: true }), { ...BASE, category: 'marketing' })
    expect(res).toEqual({ queued: false, reason: 'suppressed' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('STILL sends TRANSACTIONAL email to a suppressed recipient (account recovery is never denied)', async () => {
    const { prisma } = fakePrisma()
    const res = await notify(prisma, fakeRedis({ suppressed: true }), BASE) // BASE is transactional
    expect(res).toMatchObject({ queued: true })
  })

  it('declines + writes nothing when the send rate-limit is exhausted', async () => {
    const { prisma, createLog } = fakePrisma()
    const key = RedisKey.rateLimitEmailSend('password_reset', hashEmail(BASE.to))
    const res = await notify(prisma, fakeRedis({ counts: { [key]: '99' } }), { ...BASE, ip: '1.2.3.4' })
    expect(res).toEqual({ queued: false, reason: 'rate-limited' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})

describe('notify: §SEC.1 limiter wiring (consumeEmailSend ctx)', () => {
  // The rate-limit block is now emailLimiter.consumeEmailSend (GAP-1..GAP-4).
  // These pins prove notify passes the RIGHT ctx: the limiter keys observed in
  // the store are derived from hashEmail(input.to), input.type,
  // input.recipientType/recipientId, and input.ip.

  it('an allowed send counts every tier, keyed by hashEmail(to) / type / recipient identity / ip', async () => {
    const { prisma } = fakePrisma()
    const redis = fakeRedis()
    const res = await notify(prisma, redis, { ...BASE, ip: '9.8.7.6' })
    expect(res).toMatchObject({ queued: true })
    const store = (redis as unknown as { _store: Map<string, string> })._store
    const eh = hashEmail(BASE.to)
    expect(store.get(RedisKey.rateLimitEmailGlobalDay())).toBe('1') // GAP-1 gate
    expect(store.get(RedisKey.rateLimitEmailSend('password_reset', eh))).toBe('1') // per-(type,addr): input.type
    expect(store.get(RedisKey.rateLimitEmailAddrHour(eh))).toBe('1') // GAP-2
    expect(store.get(RedisKey.rateLimitEmailAddrDay(eh))).toBe('1') // GAP-2
    expect(store.get(RedisKey.rateLimitEmailAcctDay('USER', 'user-1'))).toBe('1') // GAP-3: recipientType/Id
    expect(store.get(RedisKey.rateLimitEmailIpHour('9.8.7.6'))).toBe('1') // GAP-4: input.ip
    expect(store.get(RedisKey.rateLimitEmailIpDay('9.8.7.6'))).toBe('1')
    // The raw address never appears in any key (hash only).
    for (const key of store.keys()) expect(key).not.toContain('maya@example.com')
  })

  it('declines with the SAME rate-limited shape when the aggregate per-address cap blocks (type-cycling closed)', async () => {
    const { prisma, createLog } = fakePrisma()
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAddrHour(hashEmail(BASE.to))]: '10' } })
    // A FRESH type: the per-type key is empty, so only the aggregate cap can block.
    const res = await notify(prisma, redis, { ...BASE, type: 'admin_otp', ip: '1.2.3.4' })
    expect(res).toEqual({ queued: false, reason: 'rate-limited' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('declines with the SAME rate-limited shape when the global daily gate blocks', async () => {
    const { prisma, createLog } = fakePrisma()
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailGlobalDay()]: '2000' } })
    const res = await notify(prisma, redis, { ...BASE, ip: '1.2.3.4' })
    expect(res).toEqual({ queued: false, reason: 'rate-limited' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('declines when the per-account daily cap blocks, even for a fresh address + fresh type', async () => {
    const { prisma, createLog } = fakePrisma()
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailAcctDay('USER', 'user-1')]: '20' } })
    const res = await notify(prisma, redis, { ...BASE, to: 'fresh-alias@example.com', type: 'fresh_type', ip: '1.2.3.4' })
    expect(res).toEqual({ queued: false, reason: 'rate-limited' })
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})

describe('notify: GAP-6 auto send-pause (fail-closed, distinct reason)', () => {
  it('declines with reason send-paused (NO row, NO enqueue, NO limiter budget) when the pause flag is set', async () => {
    const { prisma, createLog, findUser } = fakePrisma()
    const redis = fakeRedis({ paused: true })
    const res = await notify(prisma, redis, { ...BASE, ip: '1.2.3.4' })
    expect(res).toEqual({ queued: false, reason: 'send-paused' })
    // No outbox row, no enqueue: a truly fail-closed stop at the choke point.
    expect(createLog).not.toHaveBeenCalled()
    expect(enqueueMock).not.toHaveBeenCalled()
    // Checked BEFORE the limiter: the global gate counter was never touched.
    const store = (redis as unknown as { _store: Map<string, string> })._store
    expect(store.get(RedisKey.rateLimitEmailGlobalDay())).toBeUndefined()
  })

  it('a TRANSACTIONAL send is also paused (defence in depth applies to admin OTP etc.)', async () => {
    const { prisma, createLog } = fakePrisma()
    const res = await notify(prisma, fakeRedis({ paused: true }), { ...BASE, type: 'admin_otp', category: 'transactional' })
    expect(res).toEqual({ queued: false, reason: 'send-paused' })
    expect(createLog).not.toHaveBeenCalled()
  })

  it('NOT paused by default: send-paused never fires on a normal send', async () => {
    const { prisma } = fakePrisma()
    const res = await notify(prisma, fakeRedis(), { ...BASE, ip: '1.2.3.4' })
    expect(res).toMatchObject({ queued: true })
  })
})

describe('notify: GAP-7 send-volume counters (per-type + total, beside the limiter)', () => {
  it('an ALLOWED send increments the per-type/day AND all/day counters', async () => {
    const { prisma } = fakePrisma()
    const redis = fakeRedis()
    const day = utcDateStamp()
    const res = await notify(prisma, redis, { ...BASE, type: 'branch_pin', ip: '5.5.5.5' })
    expect(res).toMatchObject({ queued: true })
    const store = (redis as unknown as { _store: Map<string, string> })._store
    expect(store.get(RedisKey.emailSentCountType('branch_pin', day))).toBe('1')
    expect(store.get(RedisKey.emailSentCountAll(day))).toBe('1')
  })

  it('a BLOCKED send does NOT increment the send counters', async () => {
    const { prisma } = fakePrisma()
    const redis = fakeRedis({ counts: { [RedisKey.rateLimitEmailGlobalDay()]: '2000' } })
    const day = utcDateStamp()
    const res = await notify(prisma, redis, { ...BASE, type: 'branch_pin', ip: '5.5.5.5' })
    expect(res).toEqual({ queued: false, reason: 'rate-limited' })
    const store = (redis as unknown as { _store: Map<string, string> })._store
    expect(store.get(RedisKey.emailSentCountType('branch_pin', day))).toBeUndefined()
    expect(store.get(RedisKey.emailSentCountAll(day))).toBeUndefined()
    // The gate block DID count a gate-trip (GAP-6 repeated-trip trigger input).
    expect(store.get(RedisKey.emailGateTripDay(day))).toBe('1')
  })
})
