import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'

// Phase 0 PR-0.4: the notify() dispatcher. Pins the §4.1 outbox contract — a
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
import { NotificationType } from '../../../generated/prisma/enums'

function fakeRedis(opts: { suppressed?: boolean; counts?: Record<string, string> } = {}) {
  const store = new Map<string, string>(Object.entries(opts.counts ?? {}))
  return {
    _store: store,
    eval: vi.fn(async (_lua: string, numKeys: number, ...rest: Array<string | number>) =>
      shimEval(store, rest.slice(0, numKeys) as string[], rest.slice(numKeys), { ttlOf: () => 3600 })),
    exists: vi.fn(async (_key: string) => (opts.suppressed ? 1 : 0)),
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

describe('notify — outbox row + enqueue', () => {
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
      // input.userId intentionally OMITTED — the write-path must derive it from recipientType.
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
      userId: 'sneaky-user-id', // a caller mistake — the write-path must ignore it for non-USER rows.
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

describe('notify — §4.1 enqueue-failure leaves the row QUEUED (does NOT throw)', () => {
  it('commits the row, swallows the enqueue error, returns enqueued:false', async () => {
    const { prisma, createLog } = fakePrisma()
    enqueueMock.mockRejectedValueOnce(new Error('redis down'))

    const res = await notify(prisma, fakeRedis(), BASE)

    // row STILL committed as QUEUED — the reconciler will pick it up
    expect(createLog).toHaveBeenCalledTimes(1)
    expect((createLog.mock.calls[0][0] as { data: { status: string } }).data.status).toBe('QUEUED')
    // call did NOT throw + signals the enqueue failure
    expect(res).toEqual({ queued: true, communicationLogId: 'clog-abc-123', enqueued: false })
  })
})

describe('notify — marketing consent', () => {
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

describe('notify — programming-error guard', () => {
  // M2: ADMIN is now a valid in-app recipient (the admin bell). The guard that
  // previously rejected ADMIN+inApp is gone — the set now covers all 4 types.
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
    // SUCCEEDS — no throw, outbox row committed
    expect(res).toMatchObject({ queued: true })
    expect(createLog).toHaveBeenCalledTimes(1)
  })
})

describe('notify — pre-send guards', () => {
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
